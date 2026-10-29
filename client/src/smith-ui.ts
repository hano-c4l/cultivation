import { iconFor } from "./icons";
import {
  ENHANCE_MAX,
  EQUIP_SLOTS,
  KEEP_LEVEL_ITEM,
  canRefine,
  equipmentInfo,
  getItemDef,
  planRepair,
  refineCost,
  refineLevelOf,
  repairCost,
  setEnhanceTable,
  smithOreFor,
  smithRealmOf,
  STAGES_PER_REALM,
  upgradeCost,
  type BagItem,
  type CharacterSheet,
  type ClientMessage,
  type EnhanceLevelDef,
  type EquipSlot,
  type EquippedItem,
  type NpcView,
  type SortMode,
} from "@game/shared";
import { elementDot, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { sortControls, sortItemsBy } from "./item-sort";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface SmithUi {
  /** Opens the window for the blacksmith `npc` (the server answers with the rules and the bonus chance of each piece). */
  open(npc: string): void;
  close(): void;
  setSheet(sheet: CharacterSheet): void;
  setEquipped(items: EquippedItem[]): void;
  /** The rules and the extra chance each piece has built up. */
  setRules(npc: string, levels: EnhanceLevelDef[], pity: Record<string, number>, tabs: NpcView[]): void;
  /** The extra chance one piece has after an upgrade attempt. */
  setPity(itemId: string, pity: number): void;
  /** The outcome of an upgrade or a refining: shown as a line at the top of the window. */
  notify(text: string, ok: boolean): void;
  /** The bag changed. */
  refresh(): void;
  ban(text: string): void;
  isOpen(): boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The slots of the pháp bảo tab (the others are ordinary gear). */
const ARTIFACT_SLOTS: ReadonlySet<EquipSlot> = new Set<EquipSlot>(["bonded", "flight", "charm1", "charm2", "charm3", "charm4"]);
type Tab = "gear" | "artifact" | "bag";
type Mode = "enhance" | "refine" | "repair";

/**
 * The blacksmith's window. Three tabs say which pieces are listed (worn gear, worn pháp bảo, the bag); two radio buttons say what is done to
 * them: "Cường hoá" (upgrade +1 to +10) or "Tinh luyện" (raise stats towards their maximum). It also repairs worn-down durability. It only sends
 * the piece and the choice; the server prices and decides.
 */
export function initSmith(send: (msg: ClientMessage) => void, getBag: () => BagItem[], getWallet: () => { linh_thach: number }, switchView: (npc: string, view: NpcView) => void): SmithUi {
  const panel = el("div");
  panel.id = "smith-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("smith", panel, 5);

  let npc = "";
  let npcTabs: NpcView[] = [];
  let worn: EquippedItem[] = [];
  let pity: Record<string, number> = {};
  let protect = false;
  let tab: Tab = "gear";
  let mode: Mode = "enhance";
  let sortPicked: SortMode = "name";
  let sortApplied: SortMode = "name";
  let flash: { text: string; ok: boolean } | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let banned = "";

  const countOf = (type: string) => getBag().filter((i) => i.type === type).reduce((n, i) => n + i.qty, 0);
  const nameOf = (type: string) => getItemDef(type)?.nameVi ?? type;

  function header(): HTMLElement {
    const head = el("div", "eq-head");
    head.append(el("b", undefined, vi.smith.title));
    const close = el("button", "eq-small", "×");
    close.onclick = () => ui.close();
    head.append(close);
    return head;
  }

  type Piece = { id: string; type: string; dur?: number; max?: number; en?: number; lv?: number; rs?: BagItem["rs"] };

  function pieceRow(piece: Piece, where: { slot: EquipSlot } | { tab: number; cell: number }): HTMLElement | null {
    const info = equipmentInfo(piece.type);
    if (!info) return null;
    const level = piece.en ?? 0;
    const row = el("div", "shop-row");
    const main = el("div");
    const name = el("div", "shop-name", `${nameOf(piece.type)}${level > 0 ? ` +${level}` : ""}`);
    const dot = elementDot(piece.type);
    if (dot) name.prepend(dot);
    name.prepend(iconFor(piece.type));
    const tag = itemTierTag(piece.type, piece.lv);
    if (tag) name.prepend(el("span", `eq-tier ${realmClass(itemTierRealm(piece.type, piece.lv))}`, tag));
    main.append(name);

    const lines: string[] = [];
    const side = el("div", "shop-side");
    // The bonded artifact counts in the realm it has trained to.
    const realm = smithRealmOf(info, info.kind === "bonded" ? refineLevelOf(info, piece.lv) : undefined, STAGES_PER_REALM);
    if (mode === "repair") {
      // Only the repair button (worn pieces with some durability lost); the durability line is added below.
    } else if (mode === "enhance") {
      const cost = upgradeCost(realm, level, pity[piece.id] ?? 0);
      const ore = smithOreFor(realm);
      if (cost && ore) {
        lines.push(vi.smith.next(level + 1, Math.round(cost.chancePct * 10) / 10, cost.materials, nameOf(ore), countOf(ore), cost.linhThach.toLocaleString("vi-VN")));
        if (cost.step.dropOnFail) lines.push(vi.smith.risk);
        const ok = countOf(ore) >= cost.materials && getWallet().linh_thach >= cost.linhThach;
        const up = el("button", "eq-small", vi.smith.upgrade);
        up.disabled = !ok;
        up.onclick = () => send({ t: "smith_upgrade", npc, ...where, protect });
        side.append(up);
      } else {
        lines.push(vi.smith.maxed(ENHANCE_MAX));
      }
    } else {
      const cost = info.kind === "bonded" || piece.type.startsWith("eqs.") ? undefined : refineCost(realm);
      if (!cost) {
        lines.push(vi.smith.cannotRefine);
      } else if (!canRefine(piece.type, piece.rs)) {
        lines.push(vi.smith.refineMaxed);
      } else {
        lines.push(vi.smith.refineCost(cost.materials, nameOf(cost.ore), countOf(cost.ore), cost.linhThach.toLocaleString("vi-VN")));
        const ok = countOf(cost.ore) >= cost.materials && getWallet().linh_thach >= cost.linhThach;
        const refine = el("button", "eq-small", vi.smith.refine);
        refine.disabled = !ok;
        refine.onclick = () => send({ t: "smith_refine", npc, ...where });
        side.append(refine);
      }
    }
    if (piece.dur !== undefined && piece.max !== undefined) lines.push(vi.equip.durability(piece.dur, piece.max));
    main.append(el("div", "muted", lines.join(" · ")));
    row.append(main);

    if (mode === "repair" && piece.dur !== undefined && piece.max !== undefined && piece.dur < piece.max && "slot" in where) {
      const fee = repairCost(info.grade, piece.max - piece.dur);
      const fix = el("button", "eq-small", vi.smith.repairShort(fee));
      fix.title = vi.smith.repair(fee);
      fix.onclick = () => send({ t: "smith_repair", npc, slot: where.slot });
      side.append(fix);
    }
    row.append(side);
    return row;
  }

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren(header());
    if (banned) {
      panel.append(el("div", "muted", banned));
      return;
    }
    // A blacksmith that also trades has a second tab: its goods (another window).
    if (npcTabs.includes("shop")) {
      const row = el("div", "eq-tabs");
      row.append(el("button", "active", vi.npcTabs.smith));
      const trade = el("button", undefined, vi.npcTabs.shop);
      trade.onclick = () => switchView(npc, "shop");
      row.append(trade);
      panel.append(row);
    }
    if (flash) panel.append(el("div", flash.ok ? "shop-flash" : "shop-flash smith-bad", flash.text));

    // What is done: one of three radio buttons (choosing one clears the other).
    const modes = el("div", "smith-modes");
    for (const m of ["enhance", "refine", "repair"] as const) {
      const label = el("label");
      const radio = el("input") as HTMLInputElement;
      radio.type = "radio";
      radio.name = "smith-mode";
      radio.checked = mode === m;
      radio.onchange = () => {
        if (!radio.checked) return;
        mode = m;
        render();
      };
      label.append(radio, document.createTextNode(` ${vi.smith.modes[m]}`));
      modes.append(label);
    }
    panel.append(modes);

    // The scroll only matters when upgrading; with none in the bag the box is unticked and cannot be ticked. Repairing has its own button here.
    if (mode === "enhance") {
      const scrolls = countOf(KEEP_LEVEL_ITEM);
      if (scrolls === 0) protect = false;
      const keep = el("label", "smith-keep");
      const box = el("input") as HTMLInputElement;
      box.type = "checkbox";
      box.checked = protect;
      box.disabled = scrolls === 0;
      box.onchange = () => {
        protect = box.checked;
      };
      keep.append(box, document.createTextNode(` ${vi.smith.keep(scrolls)}`));
      panel.append(keep);
    } else if (mode === "repair") {
      const all = planRepair({ items: [], equipped: worn }, "all");
      const repairAll = el("button", "eq-wide", all.ok ? vi.smith.repairAll(all.cost) : vi.equip.nothingToRepair);
      repairAll.disabled = !all.ok;
      repairAll.onclick = () => send({ t: "smith_repair", npc, slot: "all" });
      panel.append(repairAll);
    }

    const tabs = el("div", "eq-tabs");
    for (const t of ["gear", "artifact", "bag"] as const) {
      const b = el("button", t === tab ? "active" : undefined, vi.smith.tabs[t]);
      b.onclick = () => {
        tab = t;
        render();
      };
      tabs.append(b);
    }
    if (tab === "bag") {
      tabs.append(
        sortControls(
          "shop-sort",
          sortPicked,
          (m) => {
            sortPicked = m;
          },
          () => {
            sortApplied = sortPicked;
            render();
          },
        ),
      );
    }
    panel.append(tabs);

    const list = el("div");
    if (tab === "bag") {
      const items = sortItemsBy(
        getBag().filter((i) => equipmentInfo(i.type)),
        sortApplied,
        (i) => i.type,
        (i) => i.lv,
      );
      for (const it of items) {
        const row = pieceRow(it, { tab: it.tab, cell: it.cell });
        if (row) list.append(row);
      }
    } else {
      for (const w of worn.filter((p) => ARTIFACT_SLOTS.has(p.slot) === (tab === "artifact")).sort((a, b) => EQUIP_SLOTS.indexOf(a.slot) - EQUIP_SLOTS.indexOf(b.slot))) {
        const row = pieceRow(w, { slot: w.slot });
        if (row) list.append(row);
      }
    }
    if (!list.hasChildNodes()) list.append(el("div", "muted", vi.smith.nothing));
    panel.append(list, el("div", "muted", mode === "enhance" ? vi.smith.note : mode === "refine" ? vi.smith.refineNote : vi.smith.repairNote));
  }

  const ui: SmithUi = {
    open(id) {
      npc = id;
      npcTabs = [];
      flash = null;
      banned = "";
      panel.hidden = false;
      send({ t: "npc_open", npc: id, view: "smith" });
      render();
    },
    close() {
      panel.hidden = true;
    },
    setSheet() {
      render();
    },
    setEquipped(items) {
      worn = items;
      render();
    },
    setRules(id, levels, p, tabs) {
      if (id !== npc) return;
      setEnhanceTable(levels);
      pity = p;
      npcTabs = tabs;
      render();
    },
    setPity(itemId, value) {
      if (value > 0) pity[itemId] = value;
      else delete pity[itemId];
      render();
    },
    notify(text, ok) {
      flash = { text, ok };
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flash = null;
        render();
      }, 5000);
      render();
    },
    ban(text) {
      banned = text;
      render();
    },
    refresh: render,
    isOpen: () => !panel.hidden,
  };
  return ui;
}

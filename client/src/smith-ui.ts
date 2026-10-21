import {
  ENHANCE_MAX,
  KEEP_LEVEL_ITEM,
  equipmentInfo,
  getItemDef,
  planRepair,
  refineLevelOf,
  smithRealmOf,
  STAGES_PER_REALM,
  repairCost,
  setEnhanceTable,
  smithOreFor,
  upgradeCost,
  type BagItem,
  type CharacterSheet,
  type ClientMessage,
  type EnhanceLevelDef,
  type EquipSlot,
  type EquippedItem,
} from "@game/shared";
import { elementDot, itemTierRealm, itemTierTag, realmClass } from "./equip-text";
import { vi } from "./locales/vi";
import { registerWindow } from "./window-manager";

export interface SmithUi {
  /** Opens the window for the blacksmith `npc` (the server answers with the rules and the bonus chance of each piece). */
  open(npc: string): void;
  close(): void;
  setSheet(sheet: CharacterSheet): void;
  setEquipped(items: EquippedItem[]): void;
  /** The rules and the extra chance each piece has built up. */
  setRules(npc: string, levels: EnhanceLevelDef[], pity: Record<string, number>): void;
  /** The extra chance one piece has after an upgrade attempt. */
  setPity(itemId: string, pity: number): void;
  /** The outcome of an upgrade: shown as a line at the top of the window. */
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

/**
 * The blacksmith's window: every piece of gear and pháp bảo you own (worn first), with its upgrade level, the chance and cost of the next
 * step, and the repair of worn-down durability. It only sends the piece and whether to protect it; the server prices and decides.
 */
export function initSmith(send: (msg: ClientMessage) => void, getBag: () => BagItem[], getWallet: () => { linh_thach: number }): SmithUi {
  const panel = el("div");
  panel.id = "smith-panel";
  panel.hidden = true;
  document.body.append(panel);
  registerWindow("smith", panel, 5);

  let npc = "";
  let sheet: CharacterSheet | null = null;
  let worn: EquippedItem[] = [];
  let pity: Record<string, number> = {};
  let protect = false;
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

  function pieceRow(piece: { id: string; type: string; dur?: number; max?: number; en?: number; lv?: number }, where: { slot: EquipSlot } | { tab: number; cell: number }): HTMLElement | null {
    const info = equipmentInfo(piece.type);
    if (!info) return null;
    const level = piece.en ?? 0;
    const row = el("div", "shop-row");
    const main = el("div");
    const name = el("div", "shop-name", `${nameOf(piece.type)}${level > 0 ? ` +${level}` : ""}`);
    const dot = elementDot(piece.type);
    if (dot) name.prepend(dot);
    const tag = itemTierTag(piece.type, piece.lv);
    if (tag) name.prepend(el("span", `eq-tier ${realmClass(itemTierRealm(piece.type, piece.lv))}`, tag));
    main.append(name);

    const lines: string[] = [];
    const realm = smithRealmOf(info, info.kind === "bonded" ? refineLevelOf(info, piece.lv) : undefined, STAGES_PER_REALM);
    const cost = upgradeCost(realm, level, pity[piece.id] ?? 0);
    const ore = smithOreFor(realm);
    if (cost && ore) {
      const have = countOf(ore);
      lines.push(vi.smith.next(level + 1, Math.round(cost.chancePct * 10) / 10, cost.materials, nameOf(ore), have, cost.linhThach.toLocaleString("vi-VN")));
      if (cost.step.dropOnFail) lines.push(vi.smith.risk);
    } else {
      lines.push(vi.smith.maxed(ENHANCE_MAX));
    }
    if (piece.dur !== undefined && piece.max !== undefined) lines.push(vi.equip.durability(piece.dur, piece.max));
    main.append(el("div", "muted", lines.join(" · ")));
    row.append(main);

    const side = el("div", "shop-side");
    if (cost && ore) {
      const ok = countOf(ore) >= cost.materials && getWallet().linh_thach >= cost.linhThach;
      const up = el("button", "eq-small", vi.smith.upgrade);
      up.disabled = !ok;
      up.onclick = () => send({ t: "smith_upgrade", npc, ...where, protect });
      side.append(up);
    }
    if (piece.dur !== undefined && piece.max !== undefined && piece.dur < piece.max && "slot" in where) {
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
    if (flash) panel.append(el("div", flash.ok ? "shop-flash" : "shop-flash smith-bad", flash.text));
    if (!sheet) return;

    const all = planRepair({ items: [], equipped: worn }, "all");
    const repairAll = el("button", "eq-wide", all.ok ? vi.smith.repairAll(all.cost) : vi.equip.nothingToRepair);
    repairAll.disabled = !all.ok;
    repairAll.onclick = () => send({ t: "smith_repair", npc, slot: "all" });
    panel.append(repairAll);

    const scrolls = countOf(KEEP_LEVEL_ITEM);
    const keep = el("label", "smith-keep");
    const box = el("input") as HTMLInputElement;
    box.type = "checkbox";
    box.checked = protect;
    box.onchange = () => {
      protect = box.checked;
    };
    keep.append(box, document.createTextNode(` ${vi.smith.keep(scrolls)}`));
    panel.append(keep);

    panel.append(el("div", "muted", vi.smith.wornTitle));
    const wornList = el("div");
    for (const w of worn) {
      const row = pieceRow(w, { slot: w.slot });
      if (row) wornList.append(row);
    }
    if (!wornList.hasChildNodes()) wornList.append(el("div", "muted", vi.smith.nothing));
    panel.append(wornList);

    panel.append(el("div", "muted", vi.smith.bagTitle));
    const bagList = el("div");
    for (const it of getBag()) {
      const row = equipmentInfo(it.type) ? pieceRow(it, { tab: it.tab, cell: it.cell }) : null;
      if (row) bagList.append(row);
    }
    if (!bagList.hasChildNodes()) bagList.append(el("div", "muted", vi.smith.nothing));
    panel.append(bagList, el("div", "muted", vi.smith.note));
  }

  const ui: SmithUi = {
    open(id) {
      npc = id;
      flash = null;
      banned = "";
      panel.hidden = false;
      send({ t: "npc_open", npc: id });
      render();
    },
    close() {
      panel.hidden = true;
    },
    setSheet(s) {
      sheet = s;
      render();
    },
    setEquipped(items) {
      worn = items;
      render();
    },
    setRules(id, levels, p) {
      if (id !== npc) return;
      setEnhanceTable(levels);
      pity = p;
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

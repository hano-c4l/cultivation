import {
  EQUIP_SLOTS,
  equipBlock,
  equipmentBonus,
  equipmentInfo,
  getItemDef,
  planRepair,
  repairCost,
  slotKind,
  type BagItem,
  type CharacterSheet,
  type ClientMessage,
  type EquipSlot,
  type EquippedItem,
  type WearerCtx,
} from "@game/shared";
import { describeItem, durabilityShort, durabilityText, elementDot, equipLines, itemTierRealm, itemTierTag, realmClass, statText } from "./equip-text";
import { vi } from "./locales/vi";
import { wearerOfSheet } from "./wearer";
import { registerWindow } from "./window-manager";

export interface EquipmentUi {
  setSheet(sheet: CharacterSheet): void;
  setEquipped(items: EquippedItem[]): void;
  /** The bag changed: the list of pieces that can be worn may have too. */
  refresh(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The slots of the pháp bảo tab: the bonded one, the flight one and the four ordinary pháp bảo. */
const ARTIFACT_SLOTS: ReadonlySet<EquipSlot> = new Set<EquipSlot>(["bonded", "flight", "charm1", "charm2", "charm3", "charm4"]);

/**
 * Equipment overlay (button or the E key): one row per slot. A worn piece can be taken off or repaired; any slot can
 * open a chooser with the bag pieces that fit it. The server decides everything (who may wear what, the price), the
 * checks here only grey out what it would refuse and say why.
 */
export function initEquipment(send: (msg: ClientMessage) => void, getBag: () => BagItem[], isAdmin = false): EquipmentUi {
  const toggle = el("button", undefined, vi.equip.button);
  toggle.id = "eq-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "eq-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);
  registerWindow("equipment", panel, 1);

  let sheet: CharacterSheet | null = null;
  let worn: EquippedItem[] = [];
  /** Two tabs: ordinary gear, and the pháp bảo (the bonded one, the flight one and the four others). */
  let tab: "gear" | "artifact" = "gear";
  let choosing: EquipSlot | null = null;
  /** The worn piece whose details are open. */
  let inspecting: EquipSlot | null = null;

  const wearer = (): WearerCtx | null => (sheet ? wearerOfSheet(sheet) : null);
  const nameOf = (type: string) => getItemDef(type)?.nameVi ?? type;
  /** The small realm/bậc label ("LK3") in the top left corner of a row. */
  const tagOf = (type: string, lv?: number): HTMLElement => el("span", `eq-tag ${realmClass(itemTierRealm(type, lv))}`, itemTierTag(type, lv) ?? "");

  function renderChooser(slot: EquipSlot, w: WearerCtx): HTMLElement {
    const box = el("div", "eq-choose");
    box.append(el("b", undefined, `${vi.equip.choose} · ${vi.equip.slots[slot]}`));
    const kind = slotKind(slot);
    // Only pieces this character can actually wear here: right slot kind, gender style, level and stats, not broken.
    const options = getBag().filter((i) => {
      const info = equipmentInfo(i.type);
      return info?.kind === kind && equipBlock(info, slot, i.dur, w) === null;
    });
    if (options.length === 0) box.append(el("div", "muted", vi.equip.noCandidates));
    for (const item of options) {
      const row = el("div", `eq-opt rar-${getItemDef(item.type)?.rarity ?? "common"}`);
      const text = el("div", "eq-text");
      const optDot = elementDot(item.type);
      const optName = el("div", undefined, nameOf(item.type));
      if (optDot) optName.prepend(optDot);
      text.append(tagOf(item.type, item.lv), optName, el("div", "muted", equipLines(item.type, item.dur, item.max, item.lv, item.rs, item.en).join(" · ")));
      const btn = el("button", undefined, vi.inventory.wear);
      btn.onclick = () => {
        send({ t: "eq_equip", tab: item.tab, cell: item.cell, slot });
        choosing = null;
      };
      row.append(text, btn);
      box.append(row);
    }
    const cancel = el("button", "eq-small", vi.inventory.cancel);
    cancel.onclick = () => {
      choosing = null;
      render();
    };
    box.append(cancel);
    return box;
  }

  /** Full description of a worn piece: grade, rarity, stats at the current durability, durability, requirements, style. */
  function renderInfo(piece: EquippedItem): HTMLElement {
    const box = el("div", `eq-info rar-${getItemDef(piece.type)?.rarity ?? "common"}`);
    box.append(describeItem(piece.type, { dur: piece.dur, max: piece.max, lv: piece.lv, xp: piece.xp, rs: piece.rs, en: piece.en, wearer: wearer() ?? undefined }));
    return box;
  }

  function render(): void {
    if (panel.hidden) return;
    panel.replaceChildren();
    const w = wearer();
    const head = el("div", "eq-head");
    head.append(el("b", undefined, vi.equip.title));
    const close = el("button", "eq-small", "✕");
    close.onclick = () => setOpen(false);
    head.append(close);
    panel.append(head);
    if (!w) return;

    // Players repair at the blacksmith; the repair here is the GM's shortcut (the server refuses it for everyone else).
    if (isAdmin) {
      const all = planRepair({ items: [], equipped: worn }, "all");
      const repairAll = el("button", "eq-wide", all.ok ? vi.equip.repairAll(all.cost) : vi.equip.nothingToRepair);
      repairAll.disabled = !all.ok;
      repairAll.onclick = () => send({ t: "eq_repair", slot: "all" });
      panel.append(repairAll);
    } else {
      panel.append(el("div", "muted", vi.equip.repairAtSmith));
    }

    const bonus = equipmentBonus(worn, w);
    const parts = (Object.keys(bonus) as Array<keyof typeof bonus>).filter((k) => bonus[k] > 0).map((k) => statText(k, bonus[k]));
    panel.append(el("div", "muted", `${vi.equip.bonusTitle}: ${parts.length > 0 ? parts.join(", ") : vi.equip.noBonus}`));

    const tabs = el("div", "eq-tabs");
    for (const id of ["gear", "artifact"] as const) {
      const b = el("button", id === tab ? "active" : undefined, vi.equip.tabs[id]);
      b.onclick = () => {
        tab = id;
        choosing = null;
        inspecting = null;
        render();
      };
      tabs.append(b);
    }
    panel.append(tabs);

    for (const slot of EQUIP_SLOTS.filter((s) => ARTIFACT_SLOTS.has(s) === (tab === "artifact"))) {
      const piece = worn.find((e) => e.slot === slot);
      const row = el("div", piece ? `eq-row rar-${getItemDef(piece.type)?.rarity ?? "common"}` : "eq-row");
      row.append(el("span", "eq-slot", vi.equip.slots[slot]));
      // One line per slot: slot, element icon + name, realm/bậc tag, durability, buttons. An empty slot leaves the middle blank.
      const middle = el("div", "eq-name");
      const tier = el("span", "eq-tier");
      const durability = el("span", "eq-dur");
      if (piece) {
        const broken = piece.dur !== undefined && piece.dur <= 0;
        const dot = elementDot(piece.type);
        if (dot) middle.append(dot);
        middle.append(el("span", broken ? "eq-broken" : "eq-label", nameOf(piece.type)));
        tier.textContent = itemTierTag(piece.type, piece.lv) ?? "";
        const realmCls = realmClass(itemTierRealm(piece.type, piece.lv));
        if (realmCls) tier.classList.add(realmCls);
        durability.textContent = durabilityShort(piece.dur, piece.max);
        if (broken) durability.classList.add("eq-broken");
        // Tapping the piece opens or closes its details just below the row.
        middle.classList.add("clickable");
        middle.title = durabilityText(piece.dur, piece.max);
        middle.onclick = () => {
          inspecting = inspecting === slot ? null : slot;
          // Closing the details closes the chooser of the same slot too.
          if (inspecting === null && choosing === slot) choosing = null;
          render();
        };
      }
      const actions = el("div", "eq-actions");
      const change = el("button", "eq-small", piece ? vi.equip.change : vi.equip.pick);
      change.onclick = () => {
        choosing = choosing === slot ? null : slot;
        // Choosing a replacement shows what is worn now, like tapping the piece does.
        if (choosing === slot && piece) inspecting = slot;
        render();
      };
      actions.append(change);
      if (piece) {
        const off = el("button", "eq-small", vi.equip.unequip);
        off.onclick = () => send({ t: "eq_unequip", slot });
        actions.append(off);
      }
      row.append(middle, tier, durability, actions);
      panel.append(row);
      if (piece && inspecting === slot) panel.append(renderInfo(piece));
      if (choosing === slot) panel.append(renderChooser(slot, w));
    }
    panel.append(el("div", "muted", vi.equip.chooseHint));
  }

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    if (!open) {
      choosing = null;
      inspecting = null;
    }
    render();
  }

  toggle.onclick = () => setOpen(panel.hidden);
  document.addEventListener("keydown", (ev) => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!typing && (ev.key === "b" || ev.key === "B") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !toggle.hidden) setOpen(panel.hidden);
  });

  return {
    setSheet(next) {
      sheet = next;
      toggle.hidden = false;
      render();
    },
    setEquipped(items) {
      worn = items;
      render();
    },
    refresh: render,
  };
}

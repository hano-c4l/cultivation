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
import { durabilityText, equipLines, statText } from "./equip-text";
import { vi } from "./locales/vi";

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

/**
 * Equipment overlay (button or the E key): one row per slot. A worn piece can be taken off or repaired; any slot can
 * open a chooser with the bag pieces that fit it. The server decides everything (who may wear what, the price), the
 * checks here only grey out what it would refuse and say why.
 */
export function initEquipment(send: (msg: ClientMessage) => void, getBag: () => BagItem[]): EquipmentUi {
  const toggle = el("button", undefined, vi.equip.button);
  toggle.id = "eq-btn";
  toggle.hidden = true;
  const panel = el("div");
  panel.id = "eq-panel";
  panel.hidden = true;
  document.body.append(toggle, panel);

  let sheet: CharacterSheet | null = null;
  let worn: EquippedItem[] = [];
  let choosing: EquipSlot | null = null;

  const wearer = (): WearerCtx | null => (sheet ? { gender: sheet.gender, realm: sheet.realm, stage: sheet.stage, base: sheet.base } : null);
  const nameOf = (type: string) => getItemDef(type)?.nameVi ?? type;

  function renderChooser(slot: EquipSlot, w: WearerCtx): HTMLElement {
    const box = el("div", "eq-choose");
    box.append(el("b", undefined, `${vi.equip.choose} · ${vi.equip.slots[slot]}`));
    const kind = slotKind(slot);
    const options = getBag().filter((i) => equipmentInfo(i.type)?.kind === kind);
    if (options.length === 0) box.append(el("div", "muted", vi.equip.noCandidates));
    for (const item of options) {
      const info = equipmentInfo(item.type)!;
      const why = equipBlock(info, slot, item.dur, w);
      const row = el("div", "eq-opt");
      const text = el("div");
      text.append(el("div", undefined, nameOf(item.type)), el("div", "muted", equipLines(item.type, item.dur, item.max).join(" · ")));
      const btn = el("button", undefined, why ? (vi.inventory.errors[why] ?? vi.inventory.errors.invalid!) : vi.inventory.wear);
      btn.disabled = why !== null;
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

    const all = planRepair({ items: [], equipped: worn }, "all");
    const repairAll = el("button", "eq-wide", all.ok ? vi.equip.repairAll(all.cost) : vi.equip.nothingToRepair);
    repairAll.disabled = !all.ok;
    repairAll.onclick = () => send({ t: "eq_repair", slot: "all" });
    panel.append(repairAll);

    const bonus = equipmentBonus(worn, w);
    const parts = (Object.keys(bonus) as Array<keyof typeof bonus>).filter((k) => bonus[k] > 0).map((k) => statText(k, bonus[k]));
    panel.append(el("div", "muted", `${vi.equip.bonusTitle}: ${parts.length > 0 ? parts.join(", ") : vi.equip.noBonus}`));

    for (const slot of EQUIP_SLOTS) {
      const piece = worn.find((e) => e.slot === slot);
      const row = el("div", "eq-row");
      row.append(el("span", "eq-slot", vi.equip.slots[slot]));
      const middle = el("div", "eq-item");
      if (piece) {
        const broken = piece.dur !== undefined && piece.dur <= 0;
        const nm = el("div", broken ? "eq-broken" : undefined, nameOf(piece.type));
        nm.title = equipLines(piece.type, piece.dur, piece.max).join("\n");
        middle.append(nm, el("div", "muted", durabilityText(piece.dur, piece.max)));
      } else {
        middle.append(el("div", "muted", vi.equip.empty));
      }
      const actions = el("div", "eq-actions");
      const change = el("button", "eq-small", piece ? vi.equip.change : vi.equip.pick);
      change.onclick = () => {
        choosing = choosing === slot ? null : slot;
        render();
      };
      actions.append(change);
      if (piece) {
        const off = el("button", "eq-small", vi.equip.unequip);
        off.onclick = () => send({ t: "eq_unequip", slot });
        actions.append(off);
        if (piece.dur !== undefined && piece.max !== undefined && piece.dur > 0 && piece.dur < piece.max) {
          const cost = repairCost(equipmentInfo(piece.type)?.grade ?? 1, piece.max - piece.dur);
          const fix = el("button", "eq-small", vi.equip.repair(cost));
          fix.onclick = () => send({ t: "eq_repair", slot });
          actions.append(fix);
        }
      }
      row.append(middle, actions);
      panel.append(row);
      if (choosing === slot) panel.append(renderChooser(slot, w));
    }
    panel.append(el("div", "muted", vi.equip.chooseHint));
  }

  function setOpen(open: boolean): void {
    panel.hidden = !open;
    if (!open) choosing = null;
    render();
  }

  toggle.onclick = () => setOpen(panel.hidden);
  document.addEventListener("keydown", (ev) => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!typing && (ev.key === "e" || ev.key === "E") && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !toggle.hidden) setOpen(panel.hidden);
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

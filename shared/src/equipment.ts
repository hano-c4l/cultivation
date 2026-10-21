import {
  KIND_SLOTS,
  deathDurabilityLoss,
  equipBlock,
  equipmentInfo,
  mustUnequip,
  repairCost,
  type EquipBlock,
  type EquipSlot,
  type EquippedItem,
  type WearerCtx,
} from "./equipment-data";
import { applyBag, firstFreeCell, inBounds, itemAt, type BagContents, type BagOp, type BagPos } from "./inventory";

/** Ways a wear / take-off / repair request can be refused. `slot` means the piece does not belong in that slot. */
export type EquipError = "invalid" | EquipBlock | "full" | "nothing";

export type EquipPlan = { ok: true; ops: BagOp[] } | { ok: false; error: EquipError };

/**
 * Plans wearing the piece at `from`. With no `slot` it goes to the first empty slot of its kind, or replaces the
 * first slot of that kind when all are taken (rings, pháp bảo). A replaced piece takes the cell the new one leaves.
 */
export function planEquip(state: BagContents, bagTabs: number, from: BagPos, slot: EquipSlot | undefined, w: WearerCtx): EquipPlan {
  if (!inBounds(from, bagTabs)) return { ok: false, error: "invalid" };
  const item = itemAt(state.items, from);
  const info = item ? equipmentInfo(item.type) : undefined;
  if (!item || !info) return { ok: false, error: "invalid" };
  const slots = KIND_SLOTS[info.kind];
  const target = slot ?? slots.find((s) => !state.equipped.some((e) => e.slot === s)) ?? slots[0];
  if (!target) return { ok: false, error: "invalid" };
  const block = equipBlock(info, target, item.dur, w);
  if (block) return { ok: false, error: block };
  const old = state.equipped.find((e) => e.slot === target);
  return {
    ok: true,
    ops: [old ? { op: "swapequip", id: item.id, slot: target, tab: from.tab, cell: from.cell, oldId: old.id } : { op: "equip", id: item.id, slot: target, tab: from.tab, cell: from.cell }],
  };
}

/** Plans taking off the piece in `slot` into the first free bag cell. A full bag refuses (no mail for a manual action). */
export function planUnequip(state: BagContents, bagTabs: number, slot: EquipSlot): EquipPlan {
  const worn = state.equipped.find((e) => e.slot === slot);
  if (!worn) return { ok: false, error: "invalid" };
  const free = firstFreeCell(state.items, bagTabs);
  if (!free) return { ok: false, error: "full" };
  return { ok: true, ops: [{ op: "unequip", id: worn.id, slot, tab: free.tab, cell: free.cell }] };
}

/** One piece that came off on its own, and where it went. */
export interface AutoUnequip {
  item: EquippedItem;
  reason: EquipBlock;
  /** True when the bag was full and the piece went to the mailbox (no expiry). */
  mailed: boolean;
}

/**
 * Takes off every worn piece that is broken or that the wearer no longer qualifies for: into the bag when there is a
 * free cell, otherwise into the mailbox with no expiry. Used after death and when a character joins.
 */
export function planReconcile(state: BagContents, bagTabs: number, w: WearerCtx, newId: () => string): { ops: BagOp[]; removed: AutoUnequip[] } {
  let cur = state;
  const ops: BagOp[] = [];
  const removed: AutoUnequip[] = [];
  for (const { item, reason } of mustUnequip(state.equipped, w)) {
    const free = firstFreeCell(cur.items, bagTabs);
    const op: BagOp = free
      ? { op: "unequip", id: item.id, slot: item.slot, tab: free.tab, cell: free.cell }
      : { op: "mailequip", id: item.id, slot: item.slot, mailId: newId(), subject: "equip_removed" };
    ops.push(op);
    removed.push({ item, reason, mailed: !free });
    cur = applyBag(cur, [op]);
  }
  return { ops, removed };
}

/** Death wears every worn piece by the fixed share of its maximum, then drops what broke or no longer fits. */
export function planDeathWear(state: BagContents, bagTabs: number, w: WearerCtx, newId: () => string, fraction?: number): { ops: BagOp[]; removed: AutoUnequip[] } {
  const ops: BagOp[] = [];
  for (const e of state.equipped) {
    if (e.dur === undefined || e.max === undefined) continue; // never wears out
    const to = Math.max(0, e.dur - deathDurabilityLoss(e.max, fraction));
    if (to !== e.dur) ops.push({ op: "setdur", id: e.id, from: e.dur, to });
  }
  const worn = applyBag(state, ops);
  const rest = planReconcile(worn, bagTabs, w, newId);
  return { ops: [...ops, ...rest.ops], removed: rest.removed };
}

/** Repair of worn pieces: restores durability to the maximum, for `cost` Linh Thạch. Broken pieces cannot be repaired. */
export type RepairPlan = { ok: true; ops: BagOp[]; cost: number } | { ok: false; error: "invalid" | "nothing" };

export function planRepair(state: BagContents, slot: EquipSlot | "all"): RepairPlan {
  const targets = slot === "all" ? state.equipped : state.equipped.filter((e) => e.slot === slot);
  if (slot !== "all" && targets.length === 0) return { ok: false, error: "invalid" };
  const ops: BagOp[] = [];
  let cost = 0;
  for (const e of targets) {
    if (e.dur === undefined || e.max === undefined || e.dur <= 0 || e.dur >= e.max) continue;
    cost += repairCost(equipmentInfo(e.type)?.grade ?? 1, e.max - e.dur);
    ops.push({ op: "setdur", id: e.id, from: e.dur, to: e.max });
  }
  return ops.length === 0 ? { ok: false, error: "nothing" } : { ok: true, ops, cost };
}

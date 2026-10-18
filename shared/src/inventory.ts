import { type EquipSlot, type EquippedItem } from "./equipment-data";
import { ITEM_RARITIES, getItemDef } from "./items";

/**
 * Bag layout. Each tab is BAG_COLS x BAG_ROWS cells; a character owns `bagTabs` tabs. An item sits at (tab, cell),
 * never at a single linear index, so the tab size can change later without moving items across tabs.
 */
export const BAG_COLS = 8;
export const BAG_ROWS = 16;
export const BAG_CELLS_PER_TAB = BAG_COLS * BAG_ROWS;
export const START_BAG_TABS = 1;
export const MAX_BAG_TABS = 10;
/** Mail with an item (sent when the bag is full) must be claimed within this time or it is lost. */
export const MAIL_ITEM_EXPIRY_MS = 30 * 60_000;
/** Minimum time between inventory commands from one player; each is a D1 write. */
export const INV_MIN_GAP_MS = 150;

/** How the sort button orders the bag. Each click uses the next mode. */
export const SORT_MODES = ["name", "rarity", "grade"] as const;
export type SortMode = (typeof SORT_MODES)[number];
/**
 * A sort rewrites many rows (about 4 D1 rows per moved item, so a full bag costs hundreds), so it is limited: three
 * sorts per minute, at least a second apart. That is enough to click through the three modes, then the button waits.
 */
export const SORT_BURST = 3;
export const SORT_WINDOW_MS = 60_000;
export const SORT_MIN_GAP_MS = 1_000;

export interface BagItem {
  id: string;
  type: string;
  tab: number;
  cell: number;
  qty: number;
  /** Equipment only: current and maximum durability (both absent for gear that never wears out). */
  dur?: number;
  max?: number;
  /** Pháp bảo bản mệnh: trained level and EXP (see refineExpNeeded). */
  lv?: number;
  xp?: number;
}

/** The wear and training fields of an item that must travel with it between the bag, the slots and the mailbox. */
export function carried(x: { dur?: number; max?: number; lv?: number; xp?: number }): { dur?: number; max?: number; lv?: number; xp?: number } {
  return {
    ...(x.dur !== undefined && x.max !== undefined ? { dur: x.dur, max: x.max } : {}),
    ...(x.lv !== undefined ? { lv: x.lv } : {}),
    ...(x.xp !== undefined ? { xp: x.xp } : {}),
  };
}

/** Everything a character owns that is not in mail: the bag and the worn pieces. */
export interface BagContents {
  items: BagItem[];
  equipped: EquippedItem[];
}

export interface BagPos {
  tab: number;
  cell: number;
}

/**
 * One change to the bag, in the order it must be written. The server turns each into a guarded D1 statement
 * (the row must still look like `expected`), so a stale plan fails instead of duplicating or destroying items.
 */
export type BagOp =
  | { op: "add"; id: string; type: string; tab: number; cell: number; qty: number; dur?: number; max?: number; lv?: number; xp?: number }
  | { op: "setqty"; id: string; from: number; to: number }
  /** Deletes the whole row; `qty` is what the row must still hold for the write to be accepted. */
  | { op: "remove"; id: string; qty: number }
  | { op: "move"; id: string; tab: number; cell: number; fromTab: number; fromCell: number }
  | { op: "swap"; a: BagItem; b: BagItem }
  /**
   * Rewrites many rows at once (the sort). `before` is every row that changes or disappears, as it must still be in the
   * database; `after` is the final state of the rows that stay. Rows in `before` but not in `after` are deleted (merged).
   */
  | { op: "arrange"; before: BagItem[]; after: BagItem[] }
  /** Wear the bag item at (tab, cell) in an empty slot. */
  | { op: "equip"; id: string; slot: EquipSlot; tab: number; cell: number }
  /** Wear the bag item at (tab, cell) in an occupied slot; the piece that was there takes its cell. */
  | { op: "swapequip"; id: string; slot: EquipSlot; tab: number; cell: number; oldId: string }
  /** Take a worn piece off into a bag cell. */
  | { op: "unequip"; id: string; slot: EquipSlot; tab: number; cell: number }
  /** Durability of a worn or carried piece changes from `from` to `to` (guarded: it must still be `from`). */
  | { op: "setdur"; id: string; from: number; to: number }
  /** Take a worn piece off into the mailbox, never expiring (the bag had no room). `mailId` names the new mail. */
  | { op: "mailequip"; id: string; slot: EquipSlot; mailId: string; subject: string };

export function inBounds(pos: BagPos, bagTabs: number): boolean {
  return Number.isInteger(pos.tab) && Number.isInteger(pos.cell) && pos.tab >= 0 && pos.tab < bagTabs && pos.cell >= 0 && pos.cell < BAG_CELLS_PER_TAB;
}

export function itemAt(bag: readonly BagItem[], pos: BagPos): BagItem | undefined {
  return bag.find((i) => i.tab === pos.tab && i.cell === pos.cell);
}

/** Free cells in reading order (tab by tab, then cell by cell). */
function* freeCells(bag: readonly BagItem[], bagTabs: number): Generator<BagPos> {
  const used = new Set(bag.map((i) => i.tab * BAG_CELLS_PER_TAB + i.cell));
  for (let tab = 0; tab < bagTabs; tab++) {
    for (let cell = 0; cell < BAG_CELLS_PER_TAB; cell++) {
      if (!used.has(tab * BAG_CELLS_PER_TAB + cell)) yield { tab, cell };
    }
  }
}

/** The first free cell in reading order, or null when every cell of every owned tab is taken. */
export function firstFreeCell(bag: readonly BagItem[], bagTabs: number): BagPos | null {
  const next = freeCells(bag, bagTabs).next();
  return next.done ? null : next.value;
}

export function stackLimit(type: string): number {
  return getItemDef(type)?.maxStack ?? 1;
}

/** Applies ops to a copy of the bag and the worn pieces. The server applies the same ops to its cache only after they were committed. */
export function applyBag(state: BagContents, ops: readonly BagOp[]): BagContents {
  let next = state.items.map((i) => ({ ...i }));
  let worn = state.equipped.map((e) => ({ ...e }));
  const place = (id: string, tab: number, cell: number) => {
    next = next.map((i) => (i.id === id ? { ...i, tab, cell } : i));
  };
  const wear = (id: string, slot: EquipSlot) => {
    const it = next.find((i) => i.id === id);
    if (!it) return;
    next = next.filter((i) => i.id !== id);
    worn.push({ id, type: it.type, slot, ...carried(it) });
  };
  const takeOff = (id: string, tab: number, cell: number) => {
    const it = worn.find((e) => e.id === id);
    if (!it) return;
    worn = worn.filter((e) => e.id !== id);
    next.push({ id, type: it.type, tab, cell, qty: 1, ...carried(it) });
  };
  for (const op of ops) {
    switch (op.op) {
      case "add":
        next.push({ id: op.id, type: op.type, tab: op.tab, cell: op.cell, qty: op.qty, ...carried(op) });
        break;
      case "setqty":
        next = next.map((i) => (i.id === op.id ? { ...i, qty: op.to } : i));
        break;
      case "remove":
        next = next.filter((i) => i.id !== op.id);
        break;
      case "move":
        place(op.id, op.tab, op.cell);
        break;
      case "swap":
        next = next.map((i) =>
          i.id === op.a.id ? { ...i, tab: op.b.tab, cell: op.b.cell } : i.id === op.b.id ? { ...i, tab: op.a.tab, cell: op.a.cell } : i,
        );
        break;
      case "arrange": {
        const gone = new Set(op.before.map((i) => i.id));
        next = [...next.filter((i) => !gone.has(i.id)), ...op.after.map((i) => ({ ...i }))];
        break;
      }
      case "equip":
        wear(op.id, op.slot);
        break;
      case "swapequip":
        takeOff(op.oldId, op.tab, op.cell);
        wear(op.id, op.slot);
        break;
      case "unequip":
        takeOff(op.id, op.tab, op.cell);
        break;
      case "setdur":
        next = next.map((i) => (i.id === op.id ? { ...i, dur: op.to } : i));
        worn = worn.map((e) => (e.id === op.id ? { ...e, dur: op.to } : e));
        break;
      case "mailequip":
        worn = worn.filter((e) => e.id !== op.id);
        break;
    }
  }
  return { items: next, equipped: worn };
}

/** Bag-only view of applyBag, for callers (and tests) that never wear anything. */
export function applyOps(bag: readonly BagItem[], ops: readonly BagOp[]): BagItem[] {
  return applyBag({ items: bag as BagItem[], equipped: [] }, ops).items;
}

/**
 * Plans adding `qty` of an item: first onto existing stacks (reading order), then into free cells. Returns null when
 * the whole quantity does not fit, in which case nothing is planned (the caller sends the item by mail instead).
 */
export function planAdd(bag: readonly BagItem[], bagTabs: number, type: string, qty: number, newId: () => string, wear?: { dur: number; max: number }): BagOp[] | null {
  const limit = stackLimit(type);
  if (!Number.isInteger(qty) || qty <= 0) return null;
  const ops: BagOp[] = [];
  let left = qty;
  if (limit > 1) {
    const stacks = bag.filter((i) => i.type === type && i.qty < limit).sort((a, b) => a.tab - b.tab || a.cell - b.cell);
    for (const s of stacks) {
      if (left === 0) break;
      const put = Math.min(left, limit - s.qty);
      ops.push({ op: "setqty", id: s.id, from: s.qty, to: s.qty + put });
      left -= put;
    }
  }
  if (left > 0) {
    const cells = freeCells(bag, bagTabs);
    while (left > 0) {
      const next = cells.next();
      if (next.done) return null;
      const put = Math.min(left, limit);
      ops.push({ op: "add", id: newId(), type, tab: next.value.tab, cell: next.value.cell, qty: put, ...(wear ? { dur: wear.dur, max: wear.max } : {}) });
      left -= put;
    }
  }
  return ops;
}

/**
 * Plans moving the item at `from` to `to`: into an empty cell, merged into a stack of the same type (as much as fits),
 * or swapped with a different item. Returns null for anything invalid (out of range, empty source, same cell).
 */
export function planMove(bag: readonly BagItem[], bagTabs: number, from: BagPos, to: BagPos): BagOp[] | null {
  if (!inBounds(from, bagTabs) || !inBounds(to, bagTabs)) return null;
  if (from.tab === to.tab && from.cell === to.cell) return null;
  const src = itemAt(bag, from);
  if (!src) return null;
  const dst = itemAt(bag, to);
  if (!dst) return [{ op: "move", id: src.id, tab: to.tab, cell: to.cell, fromTab: src.tab, fromCell: src.cell }];
  const limit = stackLimit(src.type);
  if (dst.type === src.type && limit > 1 && dst.qty < limit) {
    const moved = Math.min(src.qty, limit - dst.qty);
    const ops: BagOp[] = [{ op: "setqty", id: dst.id, from: dst.qty, to: dst.qty + moved }];
    ops.push(moved === src.qty ? { op: "remove", id: src.id, qty: src.qty } : { op: "setqty", id: src.id, from: src.qty, to: src.qty - moved });
    return ops;
  }
  return [{ op: "swap", a: src, b: dst }];
}

/** Plans discarding `qty` (default all) of the item at `pos`. */
export function planRemove(bag: readonly BagItem[], bagTabs: number, pos: BagPos, qty?: number): BagOp[] | null {
  if (!inBounds(pos, bagTabs)) return null;
  const item = itemAt(bag, pos);
  if (!item) return null;
  const n = qty ?? item.qty;
  if (!Number.isInteger(n) || n <= 0 || n > item.qty) return null;
  return [n === item.qty ? { op: "remove", id: item.id, qty: n } : { op: "setqty", id: item.id, from: item.qty, to: item.qty - n }];
}

/**
 * Plans splitting `qty` off the stack at `pos` into the first free cell. Returns null when it is not a stack with more
 * than `qty` items, `qty` is invalid, or no cell is free (the caller reports which with `firstFreeCell`).
 */
export function planSplit(bag: readonly BagItem[], bagTabs: number, pos: BagPos, qty: number, newId: () => string): BagOp[] | null {
  if (!inBounds(pos, bagTabs) || !Number.isInteger(qty) || qty < 1) return null;
  const item = itemAt(bag, pos);
  if (!item || qty >= item.qty) return null;
  const free = firstFreeCell(bag, bagTabs);
  if (!free) return null;
  return [
    { op: "setqty", id: item.id, from: item.qty, to: item.qty - qty },
    { op: "add", id: newId(), type: item.type, tab: free.tab, cell: free.cell, qty },
  ];
}

/** Sort key per mode: rarity and grade sort best first; every mode falls back to the name so the order is stable. */
function compareTypes(a: string, b: string, mode: SortMode): number {
  const da = getItemDef(a);
  const db = getItemDef(b);
  const byName = (da?.nameVi ?? a).localeCompare(db?.nameVi ?? b, "vi");
  const rarity = (db ? ITEM_RARITIES.indexOf(db.rarity) : 0) - (da ? ITEM_RARITIES.indexOf(da.rarity) : 0);
  const grade = (db?.grade ?? 0) - (da?.grade ?? 0);
  if (mode === "name") return byName || a.localeCompare(b);
  if (mode === "rarity") return rarity || grade || byName || a.localeCompare(b);
  return grade || rarity || byName || a.localeCompare(b);
}

/**
 * Plans sorting the whole bag: stacks of one type are merged (full stacks first, the remainder last), types are ordered
 * by `mode`, and everything is packed from the first cell onwards across the tabs. Returns null when nothing would change.
 * Existing rows are reused (the lowest-positioned rows of a type keep living), the surplus rows are deleted.
 */
export function planSort(bag: readonly BagItem[], bagTabs: number, mode: SortMode): BagOp[] | null {
  const byType = new Map<string, BagItem[]>();
  for (const i of [...bag].sort((a, b) => a.tab - b.tab || a.cell - b.cell)) {
    const rows = byType.get(i.type) ?? [];
    rows.push(i);
    byType.set(i.type, rows);
  }
  const types = [...byType.keys()].sort((a, b) => compareTypes(a, b, mode));
  const after: BagItem[] = [];
  let position = 0;
  for (const type of types) {
    const rows = byType.get(type)!;
    const limit = stackLimit(type);
    let left = rows.reduce((s, r) => s + r.qty, 0);
    for (const row of rows) {
      if (left === 0) break;
      const put = Math.min(left, limit);
      after.push({ id: row.id, type, tab: Math.floor(position / BAG_CELLS_PER_TAB), cell: position % BAG_CELLS_PER_TAB, qty: put, ...carried(row) });
      position++;
      left -= put;
    }
  }
  if (position > bagTabs * BAG_CELLS_PER_TAB) return null; // cannot happen: sorting never needs more cells than the bag uses
  const finalById = new Map(after.map((i) => [i.id, i]));
  const before: BagItem[] = [];
  const changed: BagItem[] = [];
  for (const row of bag) {
    const f = finalById.get(row.id);
    if (!f) before.push(row); // merged away
    else if (f.tab !== row.tab || f.cell !== row.cell || f.qty !== row.qty) {
      before.push(row);
      changed.push(f);
    }
  }
  return before.length === 0 ? null : [{ op: "arrange", before, after: changed }];
}

/** Bag cells in use and the total, for display and for deciding when a bag is full. */
export function bagUsage(bag: readonly BagItem[], bagTabs: number): { used: number; total: number } {
  return { used: bag.length, total: bagTabs * BAG_CELLS_PER_TAB };
}

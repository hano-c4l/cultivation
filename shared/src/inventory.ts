import { getItemDef } from "./items";

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

export interface BagItem {
  id: string;
  type: string;
  tab: number;
  cell: number;
  qty: number;
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
  | { op: "add"; id: string; type: string; tab: number; cell: number; qty: number }
  | { op: "setqty"; id: string; from: number; to: number }
  /** Deletes the whole row; `qty` is what the row must still hold for the write to be accepted. */
  | { op: "remove"; id: string; qty: number }
  | { op: "move"; id: string; tab: number; cell: number; fromTab: number; fromCell: number }
  | { op: "swap"; a: BagItem; b: BagItem };

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

/** Applies ops to a copy of the bag. The server applies the same ops to its cache only after they were committed. */
export function applyOps(bag: readonly BagItem[], ops: readonly BagOp[]): BagItem[] {
  let next = bag.map((i) => ({ ...i }));
  for (const op of ops) {
    switch (op.op) {
      case "add":
        next.push({ id: op.id, type: op.type, tab: op.tab, cell: op.cell, qty: op.qty });
        break;
      case "setqty":
        next = next.map((i) => (i.id === op.id ? { ...i, qty: op.to } : i));
        break;
      case "remove":
        next = next.filter((i) => i.id !== op.id);
        break;
      case "move":
        next = next.map((i) => (i.id === op.id ? { ...i, tab: op.tab, cell: op.cell } : i));
        break;
      case "swap":
        next = next.map((i) =>
          i.id === op.a.id ? { ...i, tab: op.b.tab, cell: op.b.cell } : i.id === op.b.id ? { ...i, tab: op.a.tab, cell: op.a.cell } : i,
        );
        break;
    }
  }
  return next;
}

/**
 * Plans adding `qty` of an item: first onto existing stacks (reading order), then into free cells. Returns null when
 * the whole quantity does not fit, in which case nothing is planned (the caller sends the item by mail instead).
 */
export function planAdd(bag: readonly BagItem[], bagTabs: number, type: string, qty: number, newId: () => string): BagOp[] | null {
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
      ops.push({ op: "add", id: newId(), type, tab: next.value.tab, cell: next.value.cell, qty: put });
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

/** Bag cells in use and the total, for display and for deciding when a bag is full. */
export function bagUsage(bag: readonly BagItem[], bagTabs: number): { used: number; total: number } {
  return { used: bag.length, total: bagTabs * BAG_CELLS_PER_TAB };
}

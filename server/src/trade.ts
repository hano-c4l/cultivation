import { firstFreeCell, isTradable, type BagItem, type BagOp } from "@game/shared";
import { currencyStatements } from "./economy";
import type { BagState } from "./inventory";
import { actorGuard } from "./market";

/**
 * Direct trade (docs/PHASE5.md, 5b): the last step as ONE batch. Nothing is held in escrow while the two decide: the items and the Linh Thạch stay with their owners
 * until this runs, and every precondition is a statement that throws, so a stale bag or a short wallet rolls the whole batch back. Pure planning: the room hands in
 * both bags and both offers and gets the statements and the changes to apply to its cached bags after the batch went through.
 *
 * Each moved item costs two statements (a guard and the move), so a side's limit of 6 items keeps the batch under the 50 statements D1 allows.
 */
export interface TradeSide {
  id: string;
  bag: BagState;
  /** Ids of the bag items given (whole stacks). */
  items: readonly string[];
  linh: number;
  tienNgoc: number;
}

export type TradePlan =
  | { ok: true; statements: D1PreparedStatement[]; opsA: BagOp[]; opsB: BagOp[] }
  | { ok: false; reason: "stale" | "full"; /** Which side has no room (full only). */ side?: "a" | "b" };

/** The cells `n` new items would take in a bag: the cells free before the trade (so no moving item can land where another is still leaving). */
function destinations(bag: BagState, n: number): Array<{ tab: number; cell: number }> | null {
  const working: BagItem[] = [...bag.items];
  const out: Array<{ tab: number; cell: number }> = [];
  for (let i = 0; i < n; i++) {
    const free = firstFreeCell(working, bag.tabs);
    if (!free) return null;
    out.push(free);
    working.push({ id: `dest-${i}`, type: "", tab: free.tab, cell: free.cell, qty: 1 });
  }
  return out;
}

/** The items of `ids` as the bag holds them, or null when one is missing (it moved or went since the offer). */
function resolve(bag: BagState, ids: readonly string[]): BagItem[] | null {
  const out: BagItem[] = [];
  for (const id of ids) {
    const item = bag.items.find((i) => i.id === id);
    if (!item) return null;
    out.push(item);
  }
  return out;
}

/** Whether `bag` has room for `n` more items (checked when a side locks, so the refusal comes before anyone agrees). */
export function hasRoomFor(bag: BagState, n: number): boolean {
  return destinations(bag, n) !== null;
}

export function planTrade(db: D1Database, p: { tradeId: string; a: TradeSide; b: TradeSide; traceMin: number; now: number }): TradePlan {
  const givenA = resolve(p.a.bag, p.a.items);
  const givenB = resolve(p.b.bag, p.b.items);
  if (!givenA || !givenB) return { ok: false, reason: "stale" };
  if ([...givenA, ...givenB].some((i) => !isTradable(i.type))) return { ok: false, reason: "stale" }; // an admin put it on the list after it was offered
  const intoB = destinations(p.b.bag, givenA.length);
  const intoA = destinations(p.a.bag, givenB.length);
  if (!intoB) return { ok: false, reason: "full", side: "b" };
  if (!intoA) return { ok: false, reason: "full", side: "a" };

  const statements: D1PreparedStatement[] = [actorGuard(db, p.a.id, p.now), actorGuard(db, p.b.id, p.now)];
  const moves = (from: TradeSide, to: TradeSide, items: BagItem[], cells: Array<{ tab: number; cell: number }>) => {
    items.forEach((item, k) => {
      // In the bag (a cell, not worn) and as many as the offer says: an item in escrow at the market has no cell and cannot be traded away.
      statements.push(
        db
          .prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM item_instances WHERE id = ? AND owner_character_id = ? AND qty = ? AND cell IS NOT NULL AND equip_slot IS NULL)")
          .bind(item.id, from.id, item.qty),
        db.prepare("UPDATE item_instances SET owner_character_id = ?, bag_tab = ?, cell = ? WHERE id = ? AND owner_character_id = ?").bind(to.id, cells[k]!.tab, cells[k]!.cell, item.id, from.id),
      );
    });
  };
  moves(p.a, p.b, givenA, intoB);
  moves(p.b, p.a, givenB, intoA);

  // Each currency moves as the net of the two offers; a currency that nets to zero writes nothing (a zero change is refused by the ledger).
  for (const [currency, mine, theirs] of [["linh_thach", p.a.linh, p.b.linh], ["tien_ngoc", p.a.tienNgoc, p.b.tienNgoc]] as const) {
    const net = theirs - mine; // what A gains
    if (net === 0) continue;
    statements.push(...currencyStatements(db, { characterId: p.a.id, currency, delta: net, reason: `trade:${currency}`, actor: "system" }, p.traceMin, p.now));
    statements.push(...currencyStatements(db, { characterId: p.b.id, currency, delta: -net, reason: `trade:${currency}`, actor: "system" }, p.traceMin, p.now));
  }
  const list = (items: BagItem[]) => JSON.stringify(items.map((i) => ({ id: i.id, type: i.type, qty: i.qty })));
  statements.push(
    db.prepare("INSERT INTO trade_log (id, a_id, b_id, items_a, items_b, linh_a, linh_b, tn_a, tn_b, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(p.tradeId, p.a.id, p.b.id, list(givenA), list(givenB), p.a.linh, p.b.linh, p.a.tienNgoc, p.b.tienNgoc, p.now),
  );

  const opsFor = (given: BagItem[], received: BagItem[], cells: Array<{ tab: number; cell: number }>): BagOp[] => [
    ...given.map((i): BagOp => ({ op: "remove", id: i.id, qty: i.qty })),
    ...received.map((i, k): BagOp => ({ ...i, op: "add", tab: cells[k]!.tab, cell: cells[k]!.cell })),
  ];
  return { ok: true, statements, opsA: opsFor(givenA, givenB, intoA), opsB: opsFor(givenB, givenA, intoB) };
}

/** One side of a trade in progress, kept in the room's storage (a quiet town room sleeps between two messages, so memory would lose it). */
export interface TradeSideState {
  id: string;
  items: string[];
  linh: number;
  tienNgoc: number;
  locked: boolean;
  confirmed: boolean;
}

export interface TradeSession {
  id: string;
  /** The version of the offer: every change of either side's items or Linh Thạch bumps it, and a lock or an agreement must name the version it saw. */
  rev: number;
  a: TradeSideState;
  b: TradeSideState;
  createdAt: number;
}

export const newSession = (id: string, a: string, b: string, now: number): TradeSession => ({
  id,
  rev: 1,
  a: { id: a, items: [], linh: 0, tienNgoc: 0, locked: false, confirmed: false },
  b: { id: b, items: [], linh: 0, tienNgoc: 0, locked: false, confirmed: false },
  createdAt: now,
});

export const sideOf = (s: TradeSession, id: string): TradeSideState | null => (s.a.id === id ? s.a : s.b.id === id ? s.b : null);
export const otherSide = (s: TradeSession, id: string): TradeSideState => (s.a.id === id ? s.b : s.a);

/** A change to one side's offer: both locks and agreements are undone and the version moves on. */
export function setOffer(s: TradeSession, id: string, items: string[], linh: number, tienNgoc: number): void {
  const me = sideOf(s, id);
  if (!me) return;
  me.items = items;
  me.linh = linh;
  me.tienNgoc = tienNgoc;
  for (const side of [s.a, s.b]) {
    side.locked = false;
    side.confirmed = false;
  }
  s.rev++;
}

/** Locks or unlocks a side; unlocking takes back both agreements (what was agreed to is no longer what stands). */
export function setLock(s: TradeSession, id: string, on: boolean): void {
  const me = sideOf(s, id);
  if (!me) return;
  me.locked = on;
  if (!on) {
    s.a.confirmed = false;
    s.b.confirmed = false;
  }
  // The version belongs to the offer: a lock does not change what is offered, so both sides can lock at the same moment.
}

/** Records one side's agreement; true when both sides have agreed (and both are locked). */
export function setConfirm(s: TradeSession, id: string): boolean {
  const me = sideOf(s, id);
  if (!me || !s.a.locked || !s.b.locked) return false;
  me.confirmed = true; // the version does not move: the other side's agreement was given to the same offer
  return s.a.confirmed && s.b.confirmed;
}

import { opStatements } from "./inventory";
import { STAGES_PER_REALM, type BagItem, type BagOp } from "@game/shared";

/**
 * D1 side of a breakthrough (docs/PHASE2.md, 2d). A statement that changes 0 rows does not roll a batch back, so every
 * condition below is a guard that raises an error (`inv_guard.ok` is NOT NULL) when it is not met.
 */

const guard = (db: D1Database, where: string, ...args: unknown[]) =>
  db.prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM characters WHERE ${where})`).bind(...args);

/** True when a batch failed because one of the guards above did not hold (the row is not in the state the room believed). */
export function isStaleBreakthrough(err: unknown): boolean {
  return String(err).includes("inv_guard");
}

/**
 * Removes `count` pills of one type, taking from the stacks in reading order. Returns the bag ops, or null when the bag holds
 * fewer than `count` of them.
 */
export function planTakePills(items: readonly BagItem[], type: string, count: number): BagOp[] | null {
  if (!Number.isInteger(count) || count < 1) return null;
  const stacks = items.filter((i) => i.type === type).sort((a, b) => a.tab - b.tab || a.cell - b.cell);
  if (stacks.reduce((n, s) => n + s.qty, 0) < count) return null;
  const ops: BagOp[] = [];
  let left = count;
  for (const s of stacks) {
    if (left <= 0) break;
    const take = Math.min(left, s.qty);
    ops.push(take === s.qty ? { op: "remove", id: s.id, qty: take } : { op: "setqty", id: s.id, from: s.qty, to: s.qty - take });
    left -= take;
  }
  return ops;
}

/**
 * Statements that start a breakthrough: the pills leave the bag, the EXP overflow is used up (EXP is cut to `capExp`) and the start
 * time is stored, only if the row is still at stage 9 of `realm` with none running.
 */
export function startStatements(db: D1Database, characterId: string, realm: number, ops: readonly BagOp[], startedAt: number, capExp: number): D1PreparedStatement[] {
  return [
    guard(db, "id = ? AND realm = ? AND stage = ? AND bt_started_at IS NULL", characterId, realm, STAGES_PER_REALM),
    ...ops.flatMap((op) => opStatements(db, characterId, op, startedAt)),
    db.prepare("UPDATE characters SET bt_started_at = ?, exp = MIN(exp, ?), updated_at = ? WHERE id = ?").bind(startedAt, capExp, startedAt, characterId),
  ];
}

/** Success: the next realm, stage 1, no EXP, the points. Only while the marker of THIS breakthrough is still set. */
export async function commitBreakthroughSuccess(db: D1Database, characterId: string, fromRealm: number, startedAt: number, points: number): Promise<"ok" | "stale"> {
  try {
    await db.batch([
      guard(db, "id = ? AND realm = ? AND stage = ? AND bt_started_at = ?", characterId, fromRealm, STAGES_PER_REALM, startedAt),
      db
        .prepare("UPDATE characters SET realm = realm + 1, stage = 1, exp = 0, potential_points = potential_points + ?, bt_started_at = NULL, updated_at = ? WHERE id = ? AND bt_started_at = ?")
        .bind(points, Date.now(), characterId, startedAt),
    ]);
    return "ok";
  } catch (err) {
    if (isStaleBreakthrough(err)) return "stale";
    throw err;
  }
}

/** Failure: the EXP is cut to `capExp` (any overflow gone), then `expLost` comes off (never below 0) and the marker is cleared. */
export async function commitBreakthroughFailure(db: D1Database, characterId: string, startedAt: number, expLost: number, capExp: number): Promise<"ok" | "stale"> {
  try {
    await db.batch([
      guard(db, "id = ? AND bt_started_at = ?", characterId, startedAt),
      db.prepare("UPDATE characters SET exp = MAX(0, MIN(exp, ?) - ?), bt_started_at = NULL, updated_at = ? WHERE id = ? AND bt_started_at = ?").bind(capExp, expLost, Date.now(), characterId, startedAt),
    ]);
    return "ok";
  } catch (err) {
    if (isStaleBreakthrough(err)) return "stale";
    throw err;
  }
}

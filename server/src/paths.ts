import { PATHS, allPathSkills, pathRows, serializePaths, type BagOp, type PathId, type PathState } from "@game/shared";
import { applyCurrencyDelta } from "./economy";
import { opStatements } from "./inventory";

/**
 * D1 side of the hướng tu (docs/PHASE2.md, 2d-B). Every change is ONE batch whose first statement is a guard that the character's
 * `paths` text is still what the room read; the unique keys of `character_paths` reject a path taken twice or a third phụ tu.
 * Any failure rolls everything back.
 */
export type PathCommit = { status: "ok"; balance: number | null } | { status: "insufficient" } | { status: "stale" } | { status: "duplicate" };

const guardPaths = (db: D1Database, characterId: string, before: PathState) =>
  db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM characters WHERE id = ? AND paths = ?)").bind(characterId, serializePaths(before));

const grantSkills = (db: D1Database, characterId: string, skills: readonly string[], now: number) =>
  skills.map((skill) => db.prepare("INSERT OR IGNORE INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES (?, ?, ?, 'path', 1)").bind(characterId, skill, now));

/** Takes up a path: the item leaves the bag, the row and the text are written, and the two skills of its first level are granted. */
export function pathStatements(db: D1Database, characterId: string, path: PathId, slot: number, before: PathState, after: PathState, ops: readonly BagOp[], now: number): D1PreparedStatement[] {
  return [
    guardPaths(db, characterId, before),
    ...ops.flatMap((op) => opStatements(db, characterId, op, now)),
    db.prepare("INSERT INTO character_paths (character_id, path_id, slot, level, chosen_at) VALUES (?, ?, ?, 0, ?)").bind(characterId, path, slot, now),
    db.prepare("UPDATE characters SET paths = ?, updated_at = ? WHERE id = ?").bind(serializePaths(after), now, characterId),
    ...grantSkills(db, characterId, PATHS[path].levels[0]?.skills ?? [], now),
  ];
}

/**
 * Swapping (a phụ tu becomes the chủ tu) or dropping a path: the rows of the table are written again in their new slots,
 * the text follows, a dropped path takes its skills with it (and its one-time item key, so the item can be had again),
 * and the hotbar loses the skills that went.
 */
export function rearrangeStatements(
  db: D1Database,
  characterId: string,
  before: PathState,
  after: PathState,
  opts: { dropped?: PathId; hotbar?: readonly string[]; now: number },
): D1PreparedStatement[] {
  const out = [
    guardPaths(db, characterId, before),
    db.prepare("DELETE FROM character_paths WHERE character_id = ?").bind(characterId),
    ...pathRows(after).map((r) => db.prepare("INSERT INTO character_paths (character_id, path_id, slot, level, chosen_at) VALUES (?, ?, ?, ?, ?)").bind(characterId, r.path, r.slot, r.level, opts.now)),
    db.prepare("UPDATE characters SET paths = ?, updated_at = ? WHERE id = ?").bind(serializePaths(after), opts.now, characterId),
  ];
  if (opts.dropped) {
    const skills = allPathSkills(opts.dropped);
    out.push(db.prepare(`DELETE FROM character_skills WHERE character_id = ? AND skill_id IN (${skills.map(() => "?").join(", ")})`).bind(characterId, ...skills));
    out.push(db.prepare("DELETE FROM item_grants WHERE key = ?").bind(`path_item:${characterId}:${opts.dropped}`));
  }
  if (opts.hotbar) out.push(db.prepare("UPDATE characters SET hotbar = ? WHERE id = ?").bind(JSON.stringify(opts.hotbar), characterId));
  return out;
}

/** A path goes up a level: guarded on the level it was at, with the two skills of the new level granted. */
export function levelUpStatements(db: D1Database, characterId: string, path: PathId, from: number, before: PathState, after: PathState, now: number): D1PreparedStatement[] {
  return [
    guardPaths(db, characterId, before),
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM character_paths WHERE character_id = ? AND path_id = ? AND level = ?)").bind(characterId, path, from),
    db.prepare("UPDATE character_paths SET level = ? WHERE character_id = ? AND path_id = ?").bind(from + 1, characterId, path),
    db.prepare("UPDATE characters SET paths = ?, updated_at = ? WHERE id = ?").bind(serializePaths(after), now, characterId),
    ...grantSkills(db, characterId, PATHS[path].levels[from + 1]?.skills ?? [], now),
  ];
}

/** Runs a path batch; a cost is debited in the same batch (a short balance changes nothing). `key` makes the debit idempotent. */
export async function commitPathBatch(db: D1Database, characterId: string, statements: D1PreparedStatement[], cost: number, key: string, reason = "path"): Promise<PathCommit> {
  try {
    if (cost > 0) {
      const r = await applyCurrencyDelta(db, { characterId, currency: "linh_thach", delta: -cost, reason, actor: "system", idempotencyKey: key }, statements);
      if (r.status === "insufficient") return { status: "insufficient" };
      if (r.status === "duplicate") return { status: "duplicate" };
      return { status: "ok", balance: r.balance };
    }
    await db.batch(statements);
    return { status: "ok", balance: null };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("inv_guard") || msg.includes("idx_items_cell") || msg.includes("idx_items_equip") || msg.includes("item_instances.")) return { status: "stale" };
    if (msg.includes("character_paths")) return { status: "duplicate" };
    throw err;
  }
}

/** Takes up a path (see pathStatements); the Linh Thạch of a phụ tu is paid in the same batch. */
export function commitPathChoice(
  db: D1Database,
  characterId: string,
  path: PathId,
  slot: number,
  before: PathState,
  after: PathState,
  ops: readonly BagOp[],
  cost: number,
  now = Date.now(),
): Promise<PathCommit> {
  return commitPathBatch(db, characterId, pathStatements(db, characterId, path, slot, before, after, ops, now), cost, `path:${characterId}:${path}:${now}`);
}

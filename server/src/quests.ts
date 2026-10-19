import {
  MAPS_NPC_IDS,
  SEED_QUESTS,
  collectItems,
  applyBag,
  applyExp,
  objectiveTarget,
  planAdd,
  planRemove,
  questGrantKey,
  validateQuests,
  type BagContents,
  type BagOp,
  type QuestDef,
  type QuestProgressView,
} from "@game/shared";
import { applyCurrencyDelta } from "./economy";
import { opStatements } from "./inventory";

/**
 * D1 side of the quests (docs/PHASE2.md, 2e-B). The catalogue is read from the `quests` table (seeded once with the
 * default chain), validated with `validateQuests` and cached per isolate like the constitution catalogue. A character's
 * progress is in `character_quests`; the quest a kill counts for is kept in the room and written as absolute values.
 *
 * Handing a quest in is ONE batch whose first statement is the one-time grant key (so a repeat changes nothing), followed
 * by guards that raise errors when the world is no longer as the room believed, the item and EXP changes, the closing of
 * the quest, and (through the ledger) the Linh Thạch.
 */

const TTL_MS = 30_000;
let cache: { defs: QuestDef[]; checkedAt: number; version: number } | null = null;
let seeded = false;

export async function loadQuestCatalog(db: D1Database): Promise<{ defs: QuestDef[]; version: number }> {
  if (!seeded) {
    await db.batch(
      SEED_QUESTS.map((q) =>
        db.prepare("INSERT OR IGNORE INTO quests (id, chain, seq, enabled, def, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(q.id, q.chain, q.seq, q.enabled ? 1 : 0, JSON.stringify(q), Date.now()),
      ),
    );
    seeded = true;
  }
  const [versionRow, rows] = await Promise.all([
    db.prepare("SELECT version FROM config_versions WHERE name = 'quests'").first<{ version: number }>(),
    db.prepare("SELECT def, enabled FROM quests ORDER BY chain, seq, id").all<{ def: string; enabled: number }>(),
  ]);
  // Columns win over the JSON for the fields an admin toggles; a row that is not valid JSON is a hard error (never half a catalogue).
  const defs = rows.results.map((r) => ({ ...(JSON.parse(r.def) as QuestDef), enabled: r.enabled === 1 }));
  const problems = validateQuests(defs, MAPS_NPC_IDS);
  if (problems.length > 0) throw new Error(`quest catalogue is invalid: ${problems.join("; ")}`);
  return { defs, version: versionRow?.version ?? 0 };
}

/** The catalogue, cached 30 seconds per isolate; if D1 fails the last good copy is served. */
export async function getQuestCatalog(db: D1Database, now = Date.now()): Promise<QuestDef[]> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.defs;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'quests'").first<{ version: number }>();
      if (v && v.version === cache.version) {
        cache.checkedAt = now;
        return cache.defs;
      }
    }
    const { defs, version } = await loadQuestCatalog(db);
    cache = { defs, version, checkedAt: now };
    return defs;
  } catch (err) {
    if (cache) {
      console.error("quest catalogue read failed, serving the last copy", err);
      cache.checkedAt = now;
      return cache.defs;
    }
    throw err;
  }
}

/** Test hook: forget the cache and the seeding flag (each test has its own database). */
export function resetQuestCache(): void {
  cache = null;
  seeded = false;
}

export async function loadQuestProgress(db: D1Database, characterId: string): Promise<Record<string, QuestProgressView>> {
  const { results } = await db
    .prepare("SELECT quest_id, state, progress FROM character_quests WHERE character_id = ?")
    .bind(characterId)
    .all<{ quest_id: string; state: "active" | "done"; progress: number }>();
  const out: Record<string, QuestProgressView> = {};
  for (const r of results) out[r.quest_id] = { state: r.state, progress: r.progress };
  return out;
}

/** Takes a quest. The primary key throws when the character already has it (active or done). */
export async function acceptQuest(db: D1Database, characterId: string, questId: string, now: number): Promise<void> {
  await db.prepare("INSERT INTO character_quests (character_id, quest_id, state, progress, accepted_at) VALUES (?, ?, 'active', 0, ?)").bind(characterId, questId, now).run();
}

/** Writes absolute progress of active quests (a quest that was closed meanwhile is left alone). */
export async function saveQuestProgress(db: D1Database, characterId: string, list: ReadonlyArray<{ id: string; progress: number }>): Promise<void> {
  if (list.length === 0) return;
  await db.batch(list.map((q) => db.prepare("UPDATE character_quests SET progress = ? WHERE character_id = ? AND quest_id = ? AND state = 'active'").bind(q.progress, characterId, q.id)));
}

/**
 * Removes `qty` of an item from the bag's stacks (smallest cell first). Null when the bag holds fewer. Each stack's removal
 * is a guarded op, so a stale cache makes the whole batch fail instead of removing the wrong thing.
 */
export function planConsume(bag: BagContents, tabs: number, type: string, qty: number): BagOp[] | null {
  let items = bag.items;
  const stacks = items.filter((i) => i.type === type).sort((a, b) => a.tab - b.tab || a.cell - b.cell);
  let left = qty;
  const ops: BagOp[] = [];
  for (const s of stacks) {
    if (left <= 0) break;
    const take = Math.min(left, s.qty);
    const one = planRemove(items, tabs, { tab: s.tab, cell: s.cell }, take);
    if (!one) return null;
    ops.push(...one);
    items = applyBag({ items, equipped: [] }, one).items;
    left -= take;
  }
  return left > 0 ? null : ops;
}

export type TurnInPlan =
  | { ok: true; ops: BagOp[]; exp: { from: { realm: number; stage: number; exp: number }; to: { stage: number; exp: number; points: number } } | null }
  | { ok: false; reason: "full" | "not_ready" };

/** What handing the quest in does to the bag (collected items out, reward items in) and to the EXP bar. Pure: nothing is written. */
export function planTurnIn(def: QuestDef, bag: BagContents, tabs: number, character: { realm: number; stage: number; exp: number }, newId: () => string): TurnInPlan {
  let state = bag;
  const ops: BagOp[] = [];
  if (def.objective.kind === "collect") {
    for (const c of collectItems(def.objective)) {
      const out = planConsume(state, tabs, c.item, c.qty);
      if (!out) return { ok: false, reason: "not_ready" };
      ops.push(...out);
      state = applyBag(state, out);
    }
  }
  for (const r of def.rewards.items ?? []) {
    const add = planAdd(state.items, tabs, r.item, r.qty, newId, undefined);
    if (!add) return { ok: false, reason: "full" };
    ops.push(...add);
    state = applyBag(state, add);
  }
  let exp: Extract<TurnInPlan, { ok: true }>["exp"] = null;
  if (def.rewards.exp) {
    // The same rule as EXP from a kill: stage-ups carry over, and at stage 9 the bar overflows by at most 100% (the rest is lost).
    const r = applyExp({ realm: character.realm, stage: character.stage, exp: character.exp, potentialPoints: 0 }, def.rewards.exp);
    exp = { from: character, to: { stage: r.stage, exp: r.exp, points: r.potentialPoints } };
  }
  return { ok: true, ops, exp };
}

/** The target progress a counted objective must have reached at turn-in. */
export const requiredProgress = (def: QuestDef): number => objectiveTarget(def.objective);

/** The grant key of a path item (shared with the claim button and cleared when the path is dropped). */
export const pathItemKey = (characterId: string, path: string): string => `path_item:${characterId}:${path}`;

/** Whether the path item of this character was already given (the quest then cannot be handed in). */
export async function pathItemGiven(db: D1Database, characterId: string, path: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 AS ok FROM item_grants WHERE key = ?").bind(pathItemKey(characterId, path)).first<{ ok: number }>()) !== null;
}

/** Opens the path quests of a dropped path again: the progress rows and the one-time reward keys go (no ledger entry exists for them). */
export function resetQuestStatements(db: D1Database, characterId: string, quests: readonly QuestDef[]): D1PreparedStatement[] {
  return quests.flatMap((q) => [
    db.prepare("DELETE FROM character_quests WHERE character_id = ? AND quest_id = ?").bind(characterId, q.id),
    db.prepare("DELETE FROM item_grants WHERE key = ?").bind(questGrantKey(characterId, q.id)),
  ]);
}

export type TurnInResult = { status: "done"; balance: number | null } | { status: "duplicate" } | { status: "stale" };

/**
 * Commits the hand-in: grant key, guards, item and EXP changes, the closing of the quest and the Linh Thạch, in one batch.
 * `duplicate` (the key is already spent) and `stale` (the bag or EXP bar changed under the plan, or the quest is not
 * active with enough progress) change nothing.
 */
export async function commitTurnIn(
  db: D1Database,
  characterId: string,
  def: QuestDef,
  plan: Extract<TurnInPlan, { ok: true }>,
  counted: boolean,
  now: number,
): Promise<TurnInResult> {
  const key = questGrantKey(characterId, def.id);
  const needed = counted ? requiredProgress(def) : 0;
  const statements: D1PreparedStatement[] = [
    db.prepare("INSERT INTO item_grants (key, created_at) VALUES (?, ?)").bind(key, now),
    // A path quest shares the one-time key of the path item: a path item already had (the old claim button, an earlier run
    // that was not reset) makes the whole batch fail instead of handing out a second one.
    ...(def.path ? [db.prepare("INSERT INTO item_grants (key, created_at) VALUES (?, ?)").bind(pathItemKey(characterId, def.path), now)] : []),
    // The quest must still be active (and, for a counted objective, have the progress the room saw).
    db
      .prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM character_quests WHERE character_id = ? AND quest_id = ? AND state = 'active' AND progress >= ?)")
      .bind(characterId, def.id, needed),
    ...plan.ops.flatMap((op) => opStatements(db, characterId, op, now)),
  ];
  if (plan.exp) {
    const { from, to } = plan.exp;
    statements.push(
      db
        .prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM characters WHERE id = ? AND realm = ? AND stage = ? AND exp = ?)")
        .bind(characterId, from.realm, from.stage, from.exp),
      db.prepare("UPDATE characters SET stage = ?, exp = ?, potential_points = potential_points + ?, updated_at = ? WHERE id = ?").bind(to.stage, to.exp, to.points, now, characterId),
    );
  }
  statements.push(db.prepare("UPDATE character_quests SET state = 'done', done_at = ? WHERE character_id = ? AND quest_id = ? AND state = 'active'").bind(now, characterId, def.id));
  try {
    const linh = def.rewards.linhThach ?? 0;
    if (linh > 0) {
      // The ledger entry shares the key, so the two one-time guards agree; it goes through applyCurrencyDelta with everything else as `extra`.
      const r = await applyCurrencyDelta(db, { characterId, currency: "linh_thach", delta: linh, reason: "quest", actor: "system", idempotencyKey: key }, statements);
      if (r.status === "duplicate") return { status: "duplicate" };
      return { status: "done", balance: r.status === "applied" ? r.balance : null };
    }
    await db.batch(statements);
    return { status: "done", balance: null };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("item_grants")) return { status: "duplicate" };
    if (msg.includes("inv_guard") || msg.includes("idx_items_") || msg.includes("item_instances.")) return { status: "stale" };
    throw err;
  }
}

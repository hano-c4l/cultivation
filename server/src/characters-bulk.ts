import { ENHANCE_MAX, REALMS, SKILLS, STAGES_PER_REALM, equipmentInfo, getSkill, levelIndex, maxSkillLevel, refineLevelOf, refineStats, skillGrade, type BagItem, type EquippedItem } from "@game/shared";
import { logStatement } from "./admin-log";
import { CHARACTER_LOG_SCREEN, mapGuard, reviewGuard, reviewing, type CharacterResult } from "./characters-admin";
import { getGearMaster } from "./gear-master";
import { loadBag } from "./inventory";

/**
 * Bulk actions of the admin character screen (docs/PHASE2.md 2o): one button for a whole section instead of one edit per skill or per piece. Like every
 * change to a character they need the admin's own review to be running, checked in the same batch as the change.
 *   skills_learn   every skill of a realm up to the character's (root skills and bí tịch skills) it does not have
 *   skills_max     the mastery of every skill it has, at the top level its grade allows
 *   worn_*, bag_*  the gear worn / in the bag: enhance to +10, refine (every rolled stat at its maximum, a pháp bảo bản mệnh at its owner's level), repair
 */
export const BULK_ACTIONS = ["skills_learn", "skills_max", "worn_enhance", "worn_refine", "worn_repair", "bag_enhance", "bag_refine", "bag_repair"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

const LABEL: Record<BulkAction, string> = {
  skills_learn: "Học toàn bộ kỹ năng",
  skills_max: "Tăng tối đa toàn bộ kỹ năng",
  worn_enhance: "Cường hóa +10 toàn bộ trang bị đang mặc",
  worn_refine: "Tinh luyện toàn bộ trang bị đang mặc",
  worn_repair: "Sửa đầy độ bền toàn bộ trang bị đang mặc",
  bag_enhance: "Cường hóa +10 toàn bộ trang bị trong túi",
  bag_refine: "Tinh luyện toàn bộ trang bị trong túi",
  bag_repair: "Sửa đầy độ bền toàn bộ trang bị trong túi",
};

const isBulk = (v: unknown): v is BulkAction => typeof v === "string" && (BULK_ACTIONS as readonly string[]).includes(v);

/** Statements of one batch are kept under the 50 a D1 call may carry (the guard and the log take two). */
const CHUNK = 40;

export async function bulkAction(db: D1Database, admin: string, id: string, action: unknown, now = Date.now()): Promise<CharacterResult & { count?: number }> {
  if (!isBulk(action)) return { ok: false, error: "invalid" };
  const c = await db.prepare("SELECT name, realm, stage, root_grade FROM characters WHERE id = ?").bind(id).first<{ name: string; realm: number; stage: number; root_grade: number }>();
  if (!c) return { ok: false, error: "not_found" };
  if (!(await reviewing(db, id, admin, now))) return { ok: false, error: "not_reviewing" };
  const log = (n: number) => logStatement(db, { adminEmail: admin, screen: CHARACTER_LOG_SCREEN, content: `${LABEL[action]} của «${c.name}»: ${n}` }, now);
  const run = async (statements: D1PreparedStatement[], count: number): Promise<CharacterResult & { count?: number }> => {
    try {
      await db.batch([reviewGuard(db, id, admin, now), ...statements, log(count)]);
    } catch (err) {
      return mapGuard(err);
    }
    return { ok: true, count };
  };

  if (action === "skills_learn") {
    const have = new Set((await db.prepare("SELECT skill_id FROM character_skills WHERE character_id = ?").bind(id).all<{ skill_id: string }>()).results.map((r) => r.skill_id));
    const missing = SKILLS.map((s) => getSkill(s.id) ?? s).filter((s) => (s.source === "root" || s.source === "learned") && s.realm <= c.realm && !have.has(s.id));
    if (missing.length === 0) return { ok: false, error: "unchanged" };
    const rows = missing.map((s) => ({ id: s.id, realm: s.realm, src: s.source === "root" ? "root" : "learned" }));
    return run(
      [db.prepare("INSERT OR IGNORE INTO character_skills (character_id, skill_id, learned_at, source, realm) SELECT ?, json_extract(value, '$.id'), ?, json_extract(value, '$.src'), json_extract(value, '$.realm') FROM json_each(?)").bind(id, now, JSON.stringify(rows))],
      missing.length,
    );
  }

  if (action === "skills_max") {
    const owned = (await db.prepare("SELECT skill_id, level FROM character_skills WHERE character_id = ?").bind(id).all<{ skill_id: string; level: number }>()).results;
    const byTop = new Map<number, string[]>();
    let count = 0;
    for (const r of owned) {
      const def = getSkill(r.skill_id);
      if (!def) continue;
      const top = maxSkillLevel(skillGrade(def, c.root_grade));
      if (r.level >= top) continue;
      byTop.set(top, [...(byTop.get(top) ?? []), r.skill_id]);
      count++;
    }
    if (count === 0) return { ok: false, error: "unchanged" };
    return run(
      [...byTop].map(([top, ids]) => db.prepare("UPDATE character_skills SET level = ?, mastery = 0 WHERE character_id = ? AND skill_id IN (SELECT value FROM json_each(?))").bind(top, id, JSON.stringify(ids))),
      count,
    );
  }

  // The gear sections.
  const where = action.startsWith("worn_") ? "worn" : "bag";
  const what = action.slice(action.indexOf("_") + 1) as "enhance" | "refine" | "repair";
  const bag = await loadBag(db, id);
  const pieces: Array<BagItem | EquippedItem> = (where === "worn" ? bag.equipped : bag.items).filter((p) => !!equipmentInfo(p.type));
  const ids = (list: Array<{ id: string }>) => JSON.stringify(list.map((p) => p.id));

  if (what === "enhance") {
    const todo = pieces.filter((p) => (p.en ?? 0) < ENHANCE_MAX);
    if (todo.length === 0) return { ok: false, error: "unchanged" };
    return run([db.prepare("UPDATE item_instances SET enhance_level = ? WHERE owner_character_id = ? AND id IN (SELECT value FROM json_each(?))").bind(ENHANCE_MAX, id, ids(todo))], todo.length);
  }

  if (what === "repair") {
    const todo = pieces.filter((p) => p.max !== undefined && (p.dur ?? p.max) < p.max);
    if (todo.length === 0) return { ok: false, error: "unchanged" };
    return run([db.prepare("UPDATE item_instances SET durability = max_durability WHERE owner_character_id = ? AND max_durability IS NOT NULL AND id IN (SELECT value FROM json_each(?))").bind(id, ids(todo))], todo.length);
  }

  // Refining: every stat with a range at its maximum (the same function as the blacksmith's, with the dice loaded: picked, and the top of the range), and a
  // pháp bảo bản mệnh at the level of its owner (the most it can be trained to).
  const master = await getGearMaster(db, now);
  const ownerLevel = Math.min(levelIndex(c.realm, c.stage), REALMS.length * STAGES_PER_REALM - 1);
  const statements: D1PreparedStatement[] = [];
  let count = 0;
  for (const p of pieces) {
    const info = equipmentInfo(p.type);
    if (!info) continue;
    if (info.kind === "bonded") {
      if (refineLevelOf(info, p.lv) < ownerLevel) {
        statements.push(db.prepare("UPDATE item_instances SET refine_level = ?, refine_exp = 0 WHERE id = ? AND owner_character_id = ?").bind(ownerLevel, p.id, id));
        count++;
      }
      continue;
    }
    let turn = 0;
    const result = refineStats(p.type, p.rs, () => (turn++ % 2 === 0 ? 0 : 1), 1, (key) => master.stats.get(key));
    if (!result || Object.keys(result.gains).length === 0) continue;
    statements.push(db.prepare("UPDATE item_instances SET rolled_stats = ? WHERE id = ? AND owner_character_id = ?").bind(JSON.stringify(result.rs), p.id, id));
    count++;
  }
  if (count === 0) return { ok: false, error: "unchanged" };
  // Many pieces: several batches, each guarded by the review (a review that ends in between stops the rest).
  let done = 0;
  for (let i = 0; i < statements.length; i += CHUNK) {
    const part = statements.slice(i, i + CHUNK);
    const r = await run(part, part.length);
    if (!r.ok) return r;
    done += part.length;
  }
  return { ok: true, count: done };
}

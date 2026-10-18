import {
  REALMS,
  STAT_DEFS,
  getSkill,
  rollRealmSkills,
  parseRoots,
  type Gender,
  applyExp,
  type BaseStats,
  type CharacterSheet,
  type SpiritualRoot,
  type StatKey,
} from "@game/shared";

export interface CharacterRow {
  id: string;
  account_id: string;
  name: string;
  spiritual_root: SpiritualRoot;
  map_id: string;
  x: number;
  y: number;
  realm: number;
  stage: number;
  exp: number;
  potential_points: number;
  root_grade: number;
  constitution: string;
  constitution_tier: number;
  gender: Gender;
  hotbar: string;
  vitals: string | null;
  /** All the elements of the spiritual root, main one first, comma separated; empty: only `spiritual_root`. */
  roots: string;
  stat_can_cot: number;
  stat_than_phap: number;
  stat_ngo_tinh: number;
  stat_linh_luc: number;
  stat_than_thuc: number;
  stat_phuc_duyen: number;
}

const COLUMNS =
  "id, account_id, name, spiritual_root, map_id, x, y, realm, stage, exp, potential_points, root_grade, constitution, constitution_tier, gender, hotbar, vitals, roots, " +
  STAT_DEFS.map((d) => d.column).join(", ");

export function getCharacterByAccount(db: D1Database, accountId: string): Promise<CharacterRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM characters WHERE account_id = ?`).bind(accountId).first<CharacterRow>();
}

export function getCharacterById(db: D1Database, id: string): Promise<CharacterRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM characters WHERE id = ?`).bind(id).first<CharacterRow>();
}

/** One skill a character was given (see migration 0016): root skills of each realm and skills learned from a bí tịch. */
export interface SkillRow {
  skill_id: string;
  source: "root" | "learned" | "sect";
  realm: number;
  level: number;
  mastery: number;
}

export async function loadSkillRows(db: D1Database, characterId: string): Promise<SkillRow[]> {
  const { results } = await db
    .prepare("SELECT skill_id, source, realm, level, mastery FROM character_skills WHERE character_id = ? ORDER BY learned_at, skill_id")
    .bind(characterId)
    .all<SkillRow>();
  return results.filter((r) => getSkill(r.skill_id) !== undefined);
}

/**
 * Gives a character the two root skills of every realm up to `realm` that it does not have yet (a realm with two rows is
 * done; one more roll is only made for a realm that has fewer). The picks are stored, so they never change afterwards.
 * `INSERT OR IGNORE` keeps a repeated call harmless. Returns the rows after the change.
 */
export async function ensureRootSkills(db: D1Database, characterId: string, realm: number, rows: SkillRow[], rand: () => number = Math.random): Promise<SkillRow[]> {
  const inserts: D1PreparedStatement[] = [];
  const now = Date.now();
  for (let r = 0; r <= Math.min(realm, REALMS.length - 1); r++) {
    if (rows.filter((x) => x.source === "root" && x.realm === r).length >= 2) continue;
    const have = new Set(rows.map((x) => x.skill_id));
    for (const id of rollRealmSkills(r, rand)) {
      if (have.has(id)) continue;
      inserts.push(db.prepare("INSERT OR IGNORE INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES (?, ?, ?, 'root', ?)").bind(characterId, id, now, r));
    }
  }
  if (inserts.length === 0) return rows;
  await db.batch(inserts);
  return loadSkillRows(db, characterId);
}

/** Writes the mastery of the given skills (absolute values, one row write each). */
export async function saveSkillMastery(db: D1Database, characterId: string, list: ReadonlyArray<{ id: string; lv: number; xp: number }>): Promise<void> {
  if (list.length === 0) return;
  const results = await db.batch(list.map((m) => db.prepare("UPDATE character_skills SET level = ?, mastery = ? WHERE character_id = ? AND skill_id = ?").bind(m.lv, m.xp, characterId, m.id)));
  // Logged so `wrangler tail` shows the real D1 write cost of a mastery flush (docs/STATUS.md).
  console.log("skill mastery rows_written", list.length, results.reduce((n, r) => n + (r.meta?.rows_written ?? 0), 0));
}

/** Writes the whole hotbar (one D1 row write); the room has already validated every slot. */
export async function saveHotbar(db: D1Database, characterId: string, slots: readonly string[]): Promise<void> {
  await db.prepare("UPDATE characters SET hotbar = ? WHERE id = ?").bind(JSON.stringify(slots), characterId).run();
}

/** Progression the room holds in memory; written together with the position when present. */
export interface ProgressWrite {
  stage: number;
  exp: number;
  /** Points gained since the last write, added relative to the stored value so `allocate` is never overwritten. */
  addPoints: number;
}

export async function saveCharacterPosition(
  db: D1Database,
  id: string,
  mapId: string,
  x: number,
  y: number,
  progress?: ProgressWrite,
  /** HP/MP/cooldowns/buffs JSON (same row, no extra write); null clears it (fresh: full HP and MP); undefined leaves it as it is. */
  vitals?: string | null,
): Promise<void> {
  const vitalsSql = vitals === undefined ? "" : ", vitals = ?";
  const vitalsArg = vitals === undefined ? [] : [vitals];
  if (!progress) {
    await db
      .prepare(`UPDATE characters SET map_id = ?, x = ?, y = ?${vitalsSql}, updated_at = ? WHERE id = ?`)
      .bind(mapId, x, y, ...vitalsArg, Date.now(), id)
      .run();
    return;
  }
  await db
    .prepare(
      `UPDATE characters SET map_id = ?, x = ?, y = ?, stage = ?, exp = ?, potential_points = potential_points + ?${vitalsSql}, updated_at = ? WHERE id = ?`,
    )
    .bind(mapId, x, y, progress.stage, progress.exp, progress.addPoints, ...vitalsArg, Date.now(), id)
    .run();
}

/** Writes only EXP, stage and points (no position), for flushes while the character stays in the room. */
export async function saveCharacterProgress(db: D1Database, id: string, progress: ProgressWrite): Promise<void> {
  await db
    .prepare("UPDATE characters SET stage = ?, exp = ?, potential_points = potential_points + ?, updated_at = ? WHERE id = ?")
    .bind(progress.stage, progress.exp, progress.addPoints, Date.now(), id)
    .run();
}

/** Shape sent to the client; never exposes account ids. */
export function toCharacterSheet(c: CharacterRow): CharacterSheet {
  const base = {} as BaseStats;
  for (const def of STAT_DEFS) base[def.key] = c[def.column as keyof CharacterRow] as number;
  return {
    id: c.id,
    name: c.name,
    spiritualRoot: c.spiritual_root,
    roots: parseRoots(c.roots, c.spiritual_root),
    rootGrade: c.root_grade,
    constitution: c.constitution,
    constitutionTier: c.constitution_tier,
    gender: c.gender,
    realm: c.realm,
    stage: c.stage,
    exp: c.exp,
    potentialPoints: c.potential_points,
    base,
  };
}

/**
 * Spends potential points in one atomic statement: the WHERE clause rejects the whole request when the
 * character has fewer points than asked. Returns the updated row, or null when the points were not enough.
 */
export async function allocatePoints(db: D1Database, id: string, points: Partial<Record<StatKey, number>>): Promise<CharacterRow | null> {
  let total = 0;
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const def of STAT_DEFS) {
    const v = points[def.key] ?? 0;
    if (v <= 0) continue;
    total += v;
    sets.push(`${def.column} = ${def.column} + ?`);
    binds.push(v);
  }
  if (total <= 0) return null;
  return db
    .prepare(
      `UPDATE characters SET ${sets.join(", ")}, potential_points = potential_points - ?, updated_at = ? ` +
        `WHERE id = ? AND potential_points >= ? RETURNING ${COLUMNS}`,
    )
    .bind(...binds, total, Date.now(), id, total)
    .first<CharacterRow>();
}

/**
 * Adds EXP and persists the outcome. The write is conditional on the realm/stage/exp that were read, and
 * retried on a race, so concurrent grants never lose EXP. Points are added relative to the stored value so a
 * concurrent allocation is never overwritten. Nothing calls this in gameplay yet (combat is phase 1d).
 */
export async function grantExp(db: D1Database, id: string, gain: number): Promise<CharacterRow | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await getCharacterById(db, id);
    if (!row) return null;
    const next = applyExp(
      { realm: row.realm, stage: row.stage, exp: row.exp, potentialPoints: row.potential_points },
      gain,
    );
    const addedPoints = next.potentialPoints - row.potential_points;
    const updated = await db
      .prepare(
        "UPDATE characters SET stage = ?, exp = ?, potential_points = potential_points + ?, updated_at = ? " +
          `WHERE id = ? AND realm = ? AND stage = ? AND exp = ? RETURNING ${COLUMNS}`,
      )
      .bind(next.stage, next.exp, addedPoints, Date.now(), id, row.realm, row.stage, row.exp)
      .first<CharacterRow>();
    if (updated) return updated;
  }
  throw new Error("grantExp: too many concurrent updates");
}

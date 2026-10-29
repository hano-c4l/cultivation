import {
  BASIC_SKILL_ID,
  REALMS,
  STAT_DEFS,
  getSkill,
  rollRealmSkills,
  parseRoots,
  parsePaths,
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
  /** 1 while riding the flight pháp bảo (migration 0029). */
  mounted: number;
  hotbar: string;
  vitals: string | null;
  /** All the elements of the spiritual root, main one first, comma separated; empty: only `spiritual_root`. */
  roots: string;
  /** When a paid breakthrough started (ms), or null (migration 0017). */
  bt_started_at: number | null;
  /** The hướng tu as "main:sub1:sub2" (migration 0018); empty: none. */
  paths: string;
  /** PvP scores (migration 0022): sát khí, sát nhân (as of the last write; it falls while the character is online) and anh hùng. */
  sat_khi: number;
  sat_nhan: number;
  anh_hung: number;
  stat_can_cot: number;
  stat_than_phap: number;
  stat_ngo_tinh: number;
  stat_linh_luc: number;
  stat_than_thuc: number;
  stat_phuc_duyen: number;
}

const COLUMNS =
  "id, account_id, name, spiritual_root, map_id, x, y, realm, stage, exp, potential_points, root_grade, constitution, constitution_tier, gender, mounted, hotbar, vitals, roots, bt_started_at, paths, sat_khi, sat_nhan, anh_hung, " +
  STAT_DEFS.map((d) => d.column).join(", ");

/** The characters of an account that have not been deleted, oldest first. */
export async function listCharacters(db: D1Database, accountId: string): Promise<CharacterRow[]> {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM characters WHERE account_id = ? AND deleted_at IS NULL ORDER BY created_at, id`).bind(accountId).all<CharacterRow>();
  return results.map((r) => withRealRoot(r)!);
}

/** A live character of this account by id (null: not theirs, or deleted). */
export async function getOwnCharacter(db: D1Database, accountId: string, id: string): Promise<CharacterRow | null> {
  return withRealRoot(await db.prepare(`SELECT ${COLUMNS} FROM characters WHERE id = ? AND account_id = ? AND deleted_at IS NULL`).bind(id, accountId).first<CharacterRow>());
}

export type ActiveCharacter = { ok: true; character: CharacterRow } | { ok: false; reason: "none" | "reviewing" };

/**
 * The character a request plays: the one the session chose; with no choice, the only live character of the account (so a client that never chooses, like the
 * smoke scripts, keeps working with one). A character under an admin's review (migration 0045) cannot be played.
 */
export async function resolveActiveCharacter(db: D1Database, accountId: string, chosenId: string | null, now = Date.now()): Promise<ActiveCharacter> {
  let character: CharacterRow | null = null;
  if (chosenId) character = await getOwnCharacter(db, accountId, chosenId);
  if (!character) {
    const all = await listCharacters(db, accountId);
    if (all.length === 1) character = all[0]!;
  }
  if (!character) return { ok: false, reason: "none" };
  const review = await db.prepare("SELECT 1 AS x FROM characters WHERE id = ? AND review_until > ?").bind(character.id, now).first();
  return review ? { ok: false, reason: "reviewing" } : { ok: true, character };
}

export async function getCharacterById(db: D1Database, id: string): Promise<CharacterRow | null> {
  return withRealRoot(await db.prepare(`SELECT ${COLUMNS} FROM characters WHERE id = ?`).bind(id).first<CharacterRow>());
}

/** One skill a character was given (see migration 0016): root skills of each realm and skills learned from a bí tịch. */
export interface SkillRow {
  skill_id: string;
  source: "root" | "learned" | "sect" | "path";
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
  // Everyone has the basic qi blast: its row has its own source, so it never counts as one of a realm's two root skills.
  if (!rows.some((x) => x.skill_id === BASIC_SKILL_ID)) inserts.push(db.prepare("INSERT OR IGNORE INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES (?, ?, ?, 'basic', 0)").bind(characterId, BASIC_SKILL_ID, now));
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
  // Logged so `wrangler tail` shows the real D1 write cost of a mastery flush (docs/PHASE2.md, 2c).
  console.log("skill mastery rows_written", list.length, results.reduce((n, r) => n + (r.meta?.rows_written ?? 0), 0));
}

/** Writes the whole hotbar (one D1 row write); the room has already validated every slot. */
export async function saveHotbar(db: D1Database, characterId: string, slots: readonly string[]): Promise<void> {
  await db.prepare("UPDATE characters SET hotbar = ? WHERE id = ?").bind(JSON.stringify(slots), characterId).run();
}

/** Progression the room holds in memory; written together with the position when present. */
export interface ProgressWrite {
  /**
   * The realm the room believes the character is in. Stage and EXP are only written while the row is still in that realm, so a
   * save that started before a breakthrough committed cannot put the old stage 9 back over the new realm.
   */
  realm: number;
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
  /** Statements that must commit together with the move (they run first in one batch: if one throws, the position is not written either). */
  before: readonly D1PreparedStatement[] = [],
): Promise<void> {
  const vitalsSql = vitals === undefined ? "" : ", vitals = ?";
  const vitalsArg = vitals === undefined ? [] : [vitals];
  const update = !progress
    ? db.prepare(`UPDATE characters SET map_id = ?, x = ?, y = ?${vitalsSql}, updated_at = ? WHERE id = ?`).bind(mapId, x, y, ...vitalsArg, Date.now(), id)
    : db
        .prepare(
          `UPDATE characters SET map_id = ?, x = ?, y = ?, stage = CASE WHEN realm = ? THEN ? ELSE stage END, exp = CASE WHEN realm = ? THEN ? ELSE exp END, ` +
            `potential_points = potential_points + ?${vitalsSql}, updated_at = ? WHERE id = ?`,
        )
        .bind(mapId, x, y, progress.realm, progress.stage, progress.realm, progress.exp, progress.addPoints, ...vitalsArg, Date.now(), id);
  if (before.length === 0) await update.run();
  else await db.batch([...before, update]);
}

/** Writes only EXP, stage and points (no position), for flushes while the character stays in the room. */
export async function saveCharacterProgress(db: D1Database, id: string, progress: ProgressWrite): Promise<void> {
  await db
    .prepare(
      "UPDATE characters SET stage = CASE WHEN realm = ? THEN ? ELSE stage END, exp = CASE WHEN realm = ? THEN ? ELSE exp END, " +
        "potential_points = potential_points + ?, updated_at = ? WHERE id = ?",
    )
    .bind(progress.realm, progress.stage, progress.realm, progress.exp, progress.addPoints, Date.now(), id)
    .run();
}

/**
 * `spiritual_root` has a CHECK for the five plain elements, so a mutant character (Lôi, Băng, Phong) keeps a stand-in there
 * (see STAND_IN_ROOT) and its real element is the first of `roots`. Rows are read through this so the rest of the code sees it.
 */
export function withRealRoot<T extends CharacterRow | null>(row: T): T {
  if (!row) return row;
  return { ...row, spiritual_root: parseRoots(row.roots, row.spiritual_root)[0]! };
}

/** The plain element stored in `spiritual_root` for a mutant main element (it only has to satisfy the CHECK). */
export const STAND_IN_ROOT: Record<string, SpiritualRoot> = { loi: "thuy", bang: "thuy", phong: "kim" };

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
    paths: parsePaths(c.paths),
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
    .first<CharacterRow>()
    .then(withRealRoot);
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
      .first<CharacterRow>()
      .then(withRealRoot);
    if (updated) return updated;
  }
  throw new Error("grantExp: too many concurrent updates");
}

/** Writes the three PvP scores as absolute values (the room is the only writer of a character it holds). */
export async function savePkScores(db: D1Database, id: string, scores: { satKhi: number; satNhan: number; hero: number }): Promise<void> {
  await db
    .prepare("UPDATE characters SET sat_khi = ?, sat_nhan = ?, anh_hung = ? WHERE id = ?")
    .bind(Math.max(0, Math.round(scores.satKhi)), Math.max(0, Math.round(scores.satNhan)), Math.max(0, Math.round(scores.hero)), id)
    .run();
}

/** Records whether the character rides the flight pháp bảo (kept across maps and reconnects). */
export async function saveMounted(db: D1Database, id: string, on: boolean): Promise<void> {
  await db.prepare("UPDATE characters SET mounted = ? WHERE id = ? AND mounted != ?").bind(on ? 1 : 0, id, on ? 1 : 0).run();
}

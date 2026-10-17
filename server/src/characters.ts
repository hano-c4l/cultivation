import {
  STAT_DEFS,
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
  stat_can_cot: number;
  stat_than_phap: number;
  stat_ngo_tinh: number;
  stat_linh_luc: number;
  stat_than_thuc: number;
  stat_phuc_duyen: number;
}

const COLUMNS =
  "id, account_id, name, spiritual_root, map_id, x, y, realm, stage, exp, potential_points, " +
  STAT_DEFS.map((d) => d.column).join(", ");

export function getCharacterByAccount(db: D1Database, accountId: string): Promise<CharacterRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM characters WHERE account_id = ?`).bind(accountId).first<CharacterRow>();
}

export function getCharacterById(db: D1Database, id: string): Promise<CharacterRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM characters WHERE id = ?`).bind(id).first<CharacterRow>();
}

export async function saveCharacterPosition(db: D1Database, id: string, mapId: string, x: number, y: number): Promise<void> {
  await db
    .prepare("UPDATE characters SET map_id = ?, x = ?, y = ?, updated_at = ? WHERE id = ?")
    .bind(mapId, x, y, Date.now(), id)
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

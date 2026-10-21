/** The ranking (phase 2h): the top characters by realm, then stage, then EXP. Admin accounts are left out. */
export interface RankRow {
  name: string;
  realm: number;
  stage: number;
  exp: number;
}

export const LEADERBOARD_SIZE = 50;
/** The list is kept this long in each isolate, so a crowd opening the window costs one D1 read, not one each. */
export const LEADERBOARD_TTL_MS = 60_000;

let cache: { at: number; rows: RankRow[] } | null = null;

export async function getLeaderboard(db: D1Database, now = Date.now()): Promise<RankRow[]> {
  if (cache && now - cache.at < LEADERBOARD_TTL_MS) return cache.rows;
  const { results } = await db
    .prepare(
      `SELECT c.name AS name, c.realm AS realm, c.stage AS stage, c.exp AS exp
         FROM characters c JOIN accounts a ON a.id = c.account_id
        WHERE a.role != 'admin'
        ORDER BY c.realm DESC, c.stage DESC, c.exp DESC, c.name
        LIMIT ?`,
    )
    .bind(LEADERBOARD_SIZE)
    .all<RankRow>();
  cache = { at: now, rows: results };
  return results;
}

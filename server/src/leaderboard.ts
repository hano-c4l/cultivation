import { STAT_DEFS, combatPower, equipScore, isArtifactSlot, wornStats, type BaseStats, type Leaderboard } from "@game/shared";

/** The rankings (phase 2h). Admin accounts are left out of all of them. `value` is what the board is ordered by (EXP, power, Linh Thạch or points). */
export interface RankRow {
  name: string;
  realm: number;
  stage: number;
  value: number;
}

export const LEADERBOARD_SIZE = 50;
/** Each list is kept this long in each isolate, so a crowd opening the window costs one D1 read per board, not one each. */
export const LEADERBOARD_TTL_MS = 60_000;

const cache = new Map<string, { at: number; rows: RankRow[] }>();

/** The condition that leaves admin accounts out (nothing when an admin asks to see everyone). */
const skipAdmin = (all: boolean): string => (all ? "1 = 1" : "a.role != 'admin'");

export async function realmBoard(db: D1Database, all = false): Promise<RankRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.name AS name, c.realm AS realm, c.stage AS stage, c.exp AS value
         FROM characters c JOIN accounts a ON a.id = c.account_id
        WHERE ${skipAdmin(all)} AND c.deleted_at IS NULL
        ORDER BY c.realm DESC, c.stage DESC, c.exp DESC, c.name
        LIMIT ?`,
    )
    .bind(LEADERBOARD_SIZE)
    .all<RankRow>();
  return results;
}

async function wealthBoard(db: D1Database, all: boolean): Promise<RankRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.name AS name, c.realm AS realm, c.stage AS stage, b.balance AS value
         FROM currency_balances b JOIN characters c ON c.id = b.character_id JOIN accounts a ON a.id = c.account_id
        WHERE b.currency = 'linh_thach' AND b.balance > 0 AND ${skipAdmin(all)} AND c.deleted_at IS NULL
        ORDER BY b.balance DESC, c.name
        LIMIT ?`,
    )
    .bind(LEADERBOARD_SIZE)
    .all<RankRow>();
  return results;
}

interface WornRow {
  id: string;
  name: string;
  realm: number;
  stage: number;
  root_grade: number;
  item_type: string | null;
  equip_slot: string | null;
  refine_level: number | null;
  [column: string]: unknown;
}

/**
 * Power, gear and pháp bảo boards need every character's worn pieces, so they read all non-admin characters with their worn items and rank
 * in code (one query). Fine for a small population; with thousands of characters keep a stored score per character instead.
 */
async function wornBoard(db: D1Database, board: "power" | "gear" | "artifact", all: boolean): Promise<RankRow[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id AS id, c.name AS name, c.realm AS realm, c.stage AS stage, c.root_grade AS root_grade, ${STAT_DEFS.map((d) => `c.${d.column} AS ${d.column}`).join(", ")},
              i.item_type AS item_type, i.equip_slot AS equip_slot, i.refine_level AS refine_level
         FROM characters c JOIN accounts a ON a.id = c.account_id
         LEFT JOIN item_instances i ON i.owner_character_id = c.id AND i.equip_slot IS NOT NULL
        WHERE ${skipAdmin(all)} AND c.deleted_at IS NULL`,
    )
    .all<WornRow>();
  const byChar = new Map<string, { row: WornRow; worn: Array<{ type: string; slot: string; refine: number }> }>();
  for (const r of results) {
    const entry = byChar.get(r.id) ?? { row: r, worn: [] };
    if (r.item_type && r.equip_slot) entry.worn.push({ type: r.item_type, slot: r.equip_slot, refine: r.refine_level ?? 0 });
    byChar.set(r.id, entry);
  }
  const rows: RankRow[] = [];
  for (const { row, worn } of byChar.values()) {
    let value: number;
    if (board === "power") {
      const base = Object.fromEntries(STAT_DEFS.map((d) => [d.key, Number(row[d.column] ?? 0)])) as unknown as BaseStats;
      value = combatPower(base, row.realm, row.stage, row.root_grade, wornStats(worn.map((w) => w.type)));
    } else {
      value = worn.filter((w) => isArtifactSlot(w.slot) === (board === "artifact")).reduce((n, w) => n + equipScore(w.type, w.refine), 0);
    }
    if (board !== "power" && value <= 0) continue;
    rows.push({ name: row.name, realm: row.realm, stage: row.stage, value });
  }
  rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return rows.slice(0, LEADERBOARD_SIZE);
}

/** `all` (an admin's request only) puts the admin accounts in the list too. */
export async function getLeaderboard(db: D1Database, board: Leaderboard = "realm", now = Date.now(), all = false): Promise<RankRow[]> {
  const key = `${board}${all ? ":all" : ""}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < LEADERBOARD_TTL_MS) return hit.rows;
  const rows = board === "realm" ? await realmBoard(db, all) : board === "wealth" ? await wealthBoard(db, all) : await wornBoard(db, board, all);
  cache.set(key, { at: now, rows });
  return rows;
}

/** Test hook: forget the cached lists. */
export function resetLeaderboardCache(): void {
  cache.clear();
}



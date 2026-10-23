import { BOSS_CLAIM_TTL_MS } from "@game/shared";

/**
 * The claim on a map's boss (table `world_boss`): one row per map, so one boss at a time across every channel of the map. The boss itself
 * (position, health) lives in the room that holds the claim; the row only says which room that is.
 */

/** Tries to take the map's boss for `room`. A claim older than BOSS_CLAIM_TTL_MS is treated as lost and cleared first. True when this room now holds it. */
export async function claimBoss(db: D1Database, mapId: string, room: string, now = Date.now()): Promise<boolean> {
  const results = await db.batch([
    db.prepare("DELETE FROM world_boss WHERE map_id = ? AND claimed_at < ?").bind(mapId, now - BOSS_CLAIM_TTL_MS),
    db.prepare("INSERT OR IGNORE INTO world_boss (map_id, room, claimed_at) VALUES (?, ?, ?)").bind(mapId, room, now),
    db.prepare("SELECT room FROM world_boss WHERE map_id = ?").bind(mapId),
  ]);
  const holder = (results[2]?.results as Array<{ room: string }> | undefined)?.[0]?.room;
  return holder === room;
}

/** The room that holds the map's boss, if any (and its claim has not expired). */
export async function bossHolder(db: D1Database, mapId: string, now = Date.now()): Promise<string | null> {
  const row = await db
    .prepare("SELECT room FROM world_boss WHERE map_id = ? AND claimed_at >= ?")
    .bind(mapId, now - BOSS_CLAIM_TTL_MS)
    .first<{ room: string }>();
  return row?.room ?? null;
}

/** Gives the claim up (the boss died). Only the holder can: a late call from another room changes nothing. Safe to repeat. */
export async function releaseBoss(db: D1Database, mapId: string, room: string): Promise<void> {
  await db.prepare("DELETE FROM world_boss WHERE map_id = ? AND room = ?").bind(mapId, room).run();
}

/** Renews the claim while the boss is alive in `room`, so the 24-hour limit counts from the last time the room had it. False when the claim is no longer this room's (it expired and another room took it, or it was cleared). */
export async function refreshBoss(db: D1Database, mapId: string, room: string, now = Date.now()): Promise<boolean> {
  const r = await db.prepare("UPDATE world_boss SET claimed_at = ? WHERE map_id = ? AND room = ?").bind(now, mapId, room).run();
  return (r.meta.changes ?? 0) > 0;
}

/** Kills of non-guard monsters counted for the map across every channel (table `boss_kills`); 0 when there is no row. */
export async function getBossKills(db: D1Database, mapId: string): Promise<number> {
  const row = await db.prepare("SELECT kills FROM boss_kills WHERE map_id = ?").bind(mapId).first<{ kills: number }>();
  return row?.kills ?? 0;
}

/** Adds `n` kills to the map's counter and returns the new total (the rooms add in batches, so a busy map writes once per batch, not per kill). */
export async function addBossKills(db: D1Database, mapId: string, n: number, now = Date.now()): Promise<number> {
  const row = await db
    .prepare("INSERT INTO boss_kills (map_id, kills, updated_at) VALUES (?, ?, ?) ON CONFLICT (map_id) DO UPDATE SET kills = kills + excluded.kills, updated_at = excluded.updated_at RETURNING kills")
    .bind(mapId, n, now)
    .first<{ kills: number }>();
  return row?.kills ?? n;
}

/** Starts the map's counter again (a room asked for the boss). */
export async function resetBossKills(db: D1Database, mapId: string, now = Date.now()): Promise<void> {
  await db.prepare("INSERT INTO boss_kills (map_id, kills, updated_at) VALUES (?, 0, ?) ON CONFLICT (map_id) DO UPDATE SET kills = 0, updated_at = excluded.updated_at").bind(mapId, now).run();
}

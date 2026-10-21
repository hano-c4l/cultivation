import type { MapId } from "./map";

/**
 * Map bosses (phase 2h). One boss per map across all channels (its claim lives in D1, table `world_boss`), never respawning once killed,
 * it comes back only through a new spawn roll. Every number here is a placeholder.
 */

/** Chance that a respawning monster of the room asks for the boss (per respawn). */
export const BOSS_SPAWN_CHANCE = 0.001;
/**
 * "Pity": kills counted in one room since its last boss request; reaching the number asks for the boss for sure. The docs hold two
 * proposals (500/1500 and the rarer 100/1000 the owner mentioned): this is the first, by the map's realm.
 */
export const BOSS_PITY_KILLS: Readonly<Record<number, number>> = { 0: 500, 1: 1500 };
export const BOSS_PITY_DEFAULT = 1500;
/** A claim older than this is treated as lost (a room that never came back), so a map cannot stay without a boss forever. */
export const BOSS_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/** The species of the boss of each map (see MONSTERS) and its bậc: the highest of the realm, so a group is needed. */
export const BOSSES: Readonly<Record<MapId, string | null>> = { town: null, forest: "huyet_lang_vuong", cave: "quy_vuong" };
export const BOSS_TIER = 9;

/** A contribution under this share of the HP-and-last-hit total gets nothing, from Linh Thạch as well as from items. */
export const BOSS_MIN_SHARE = 0.1;
/** Weights of the contribution: the damage dealt (as a share of the boss's HP) and the last hit. They add up to 1. */
export const BOSS_DAMAGE_WEIGHT = 0.7;
export const BOSS_LAST_HIT_WEIGHT = 0.3;

/** The whole kill pays this many times the EXP of a Đại Yêu of the same bậc, split by share; and this times a Đại Yêu's Linh Thạch drop. */
export const BOSS_EXP_MULT = 4;
export const BOSS_LINH_MULT = 25;
/** The item rolls (each a full set of Đại Yêu loot rolls, with the chances multiplied by BOSS_ITEM_CHANCE_MULT); every item goes to one player, picked by share. */
export const BOSS_ITEM_ROUNDS = 5;
export const BOSS_ITEM_CHANCE_MULT = 3;

export interface BossShare {
  id: string;
  /** Fraction of the whole reward (the shares of the qualifying players add up to 1). */
  share: number;
}

/**
 * Who shares a boss kill and how much: every eligible player (present, alive) has a contribution of 0.7 x the damage they dealt as a share of
 * the boss's HP (capped at 1) plus 0.3 for the last hit. A contribution under 10% is dropped, and the rest are scaled to add up to 1, so the
 * dropped part is shared out among the others. The last hit counts only when its dealer is eligible. A boss nobody eligible hit pays nobody.
 */
export function bossShares(damage: ReadonlyMap<string, number>, maxHp: number, killerId: string, isEligible: (id: string) => boolean): BossShare[] {
  const ids = new Set(damage.keys());
  ids.add(killerId);
  const raw: BossShare[] = [];
  for (const id of [...ids].sort()) {
    if (!isEligible(id)) continue;
    const c = BOSS_DAMAGE_WEIGHT * Math.min(1, (damage.get(id) ?? 0) / Math.max(1, maxHp)) + (id === killerId ? BOSS_LAST_HIT_WEIGHT : 0);
    if (c >= BOSS_MIN_SHARE - 1e-9) raw.push({ id, share: c });
  }
  const total = raw.reduce((s, r) => s + r.share, 0);
  return total > 0 ? raw.map((r) => ({ id: r.id, share: r.share / total })) : [];
}

/** Picks one of the sharing players, by share, from a uniform [0, 1) number. */
export function pickByShare(shares: readonly BossShare[], roll: number): string | null {
  if (shares.length === 0) return null;
  let acc = 0;
  for (const s of shares) {
    acc += s.share;
    if (roll < acc) return s.id;
  }
  return shares[shares.length - 1]!.id;
}

/** Where players read about the boss: the map's name and the channel number (a boss lives in one channel only). */
const BOSS_MAP_NAMES: Readonly<Record<string, string>> = { forest: "Hắc Mộc Lâm", cave: "U Minh Động" };

export function bossSpawnText(bossName: string, mapId: string, channel: string): string {
  return `${bossName} đã xuất hiện ở ${BOSS_MAP_NAMES[mapId] ?? mapId}, kênh ${channel}!`;
}

export function bossKillText(bossName: string, mapId: string, channel: string, killer: string): string {
  return `${bossName} ở ${BOSS_MAP_NAMES[mapId] ?? mapId}, kênh ${channel} đã bị ${killer} cùng đồng đạo hạ gục.`;
}

/** Kills needed in one room to ask for the boss for sure. */
export function bossPityKills(realm: number): number {
  return BOSS_PITY_KILLS[realm] ?? BOSS_PITY_DEFAULT;
}

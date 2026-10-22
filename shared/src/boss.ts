import { fullGearStats, type GuardStats } from "./guards";
import { MAP_SIZE, screenToTile, type MapId } from "./map";
import { deriveStats, levelIndex, startingStats } from "./progression";
import { REALMS } from "./progression-data";
import { tuning } from "./tuning";

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
export const BOSS_PITY_KILLS: Readonly<Record<number, number>> = { 0: 500, 1: 1500, 2: 2500, 3: 4000 };
export const BOSS_PITY_DEFAULT = 1500;
/** A claim older than this is treated as lost (a room that never came back), so a map cannot stay without a boss forever. */
export const BOSS_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/** The species of the boss of each map (see MONSTERS) and its bậc: the highest of the realm, so a group is needed. */
export const BOSSES: Readonly<Record<MapId, string | null>> = { town: null, forest: "huyet_lang_vuong", cave: "quy_vuong", town2: null, kimdan: "hoa_long_vuong", nguyenanh: "bang_hoang" };
/** The bậc the boss pays out at (EXP and drops follow it, as for any monster): the top of the map's realm. */
export const BOSS_TIER = 9;
/** Where the boss stands (tile units): away from the three monster clusters and the guards of its map, so it is found, not stumbled into. */
export const BOSS_SPOTS: Readonly<Record<MapId, readonly [number, number] | null>> = { town: null, forest: screenToTile(MAP_SIZE.forest, 20, 9), cave: screenToTile(MAP_SIZE.cave, 40, 0), town2: null, kimdan: screenToTile(MAP_SIZE.kimdan, 0, 6), nguyenanh: screenToTile(MAP_SIZE.nguyenanh, 0, 6) };
/**
 * Its fighting strength is a few levels above the map's, like a vệ binh: a character `BOSS_REALM_BONUS` realm above the map's, at bậc
 * `BOSS_STAT_TIER`, in a full set of top-grade gear, with its points spent and `BOSS_HP_MULT` times the maximum HP. Placeholder values.
 */
export const BOSS_REALM_BONUS = 1;
export const BOSS_STAT_TIER = 2;
export const BOSS_GEAR_GRADE = 4;
export const BOSS_HP_MULT = 25;
export const BOSS_POINTS_PER_LEVEL = 2;

/**
 * What the boss does besides its plain attack (3 skills: two attacks and a heal; no buff). Checked in this order each time it acts, each on
 * its own cooldown. `power` multiplies its attack; the heal restores `fraction` of its maximum HP and is used below `below` of it.
 */
export const BOSS_SKILLS = {
  mend: { fraction: 0.04, below: 0.5, cdMs: 20_000 },
  burst: { power: 2.6, cdMs: 10_000 },
  slash: { power: 1.7, cdMs: 5_000 },
} as const;

/**
 * The boss's special skill (numbers in the tuning, `bossCone`): a cone in front of it (towards the player it is fighting) that hits every player inside, with a long cooldown,
 * and only once its HP is below `below` of the maximum. `halfAngleDeg` is half the opening of the cone. Placeholder numbers.
 */
export function bossCone(): { power: number; cdMs: number; below: number; range: number; halfAngleDeg: number } {
  return tuning().bossCone;
}

/**
 * Unlike an ordinary monster, a boss that has lost its fight (everybody dead or out of reach) and walked home does not jump back to full
 * HP: it heals a fraction of its maximum HP per second (tuning `bossRegen`, 0.02 by default), so players who died can run back and carry on. Its damage table is kept until
 * it is full again. Back to full from nothing in 50 seconds.
 */
export function bossRegenPerS(): number {
  return tuning().bossRegen.perSecond;
}

/** Whether a point at offset (dx, dy) from the boss lies inside its cone when it faces (fx, fy); true at the boss's own spot. */
export function inCone(dx: number, dy: number, fx: number, fy: number, range: number, halfAngleDeg: number): boolean {
  const d = Math.hypot(dx, dy);
  if (d > range) return false;
  if (d < 1e-6 || Math.hypot(fx, fy) < 1e-6) return true;
  const cos = (dx * fx + dy * fy) / (d * Math.hypot(fx, fy));
  return cos >= Math.cos((halfAngleDeg * Math.PI) / 180) - 1e-9;
}

export function bossStats(mapRealm: number): GuardStats {
  const realm = Math.min(mapRealm + BOSS_REALM_BONUS, REALMS.length - 1); // the top realm has none above it
  const base = startingStats("kim", 1).base;
  const lv = levelIndex(realm, BOSS_STAT_TIER);
  base.canCot += lv * BOSS_POINTS_PER_LEVEL;
  base.linhLuc += lv * BOSS_POINTS_PER_LEVEL;
  const d = deriveStats(base, realm, BOSS_STAT_TIER, 1, fullGearStats(realm, BOSS_STAT_TIER, BOSS_GEAR_GRADE), 1);
  return { maxHp: d.maxHp * BOSS_HP_MULT, attack: d.attack, defense: d.defense, critRate: d.critRate, dodgeRate: d.dodgeRate };
}

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
const BOSS_MAP_NAMES: Readonly<Record<string, string>> = { forest: "Hắc Mộc Lâm", cave: "U Minh Động", kimdan: "Xích Diễm Sơn", nguyenanh: "Vạn Cổ Hàn Uyên" };

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

import { fullGearStats, type GuardStats } from "./guards";
import { MAP_NAMES, MAP_SIZE, onMapRecipe, screenToTile, type MapId } from "./map";
import { deriveStats, levelIndex, startingStats } from "./progression";
import { REALMS } from "./progression-data";
import { tuning, type Tuning } from "./tuning";

/**
 * Map bosses (phase 2h). One boss per map across all channels (its claim lives in D1, table `world_boss`), never respawning once killed,
 * it comes back only through a new spawn roll. Every number here is a placeholder.
 */

/** Chance that a respawning monster of the room asks for the boss (per respawn): the tuning `bossSpawn`. */
export function bossSpawnChance(): number {
  return tuning().bossSpawn.chance;
}
/** A claim older than this is treated as lost (a room that never came back), so a map cannot stay without a boss forever. */
export function bossClaimTtlMs(): number {
  return tuning().boss.claimTtlMs;
}

/** The species of the boss of each map (see MONSTERS) and its bậc: the highest of the realm, so a group is needed. */
export function bossKind(mapId: string): string | null {
  return tuning().boss.species[mapId] ?? null;
}
/** Every species that is a boss on some map. */
export function bossKinds(): string[] {
  return Object.values(tuning().boss.species).filter((k): k is string => k !== null);
}
/** The bậc the boss pays out at (EXP and drops follow it, as for any monster): the top of the map's realm. */
export function bossTier(): number {
  return tuning().boss.tier;
}
/** Where the boss stands when no random spot could be found (tile units): the middle of the map, off the monster groups and the guards (see CombatSim.spawnBoss, which picks a random spot). */
export const BOSS_SPOTS: Record<MapId, readonly [number, number] | null> = { town: null, forest: screenToTile(MAP_SIZE.forest!, 0, 0), cave: screenToTile(MAP_SIZE.cave!, 0, 0), town2: null, kimdan: screenToTile(MAP_SIZE.kimdan!, 0, 0), nguyenanh: screenToTile(MAP_SIZE.nguyenanh!, 0, 0) };
const CODE_BOSS_SPOTS: Readonly<Record<MapId, readonly [number, number] | null>> = { ...BOSS_SPOTS };
// A map recipe with its own content (or without, which is the code's) sets the fallback boss spot of its map.
onMapRecipe((id, r) => {
  if (r?.content) BOSS_SPOTS[id] = r.content.bossSpot;
  else if (id in CODE_BOSS_SPOTS) BOSS_SPOTS[id] = CODE_BOSS_SPOTS[id]!;
  else delete BOSS_SPOTS[id];
});
export { CODE_BOSS_SPOTS };
/**
 * Its fighting strength is a few levels above the map's, like a vệ binh: a character `bossRealmBonus()` realms above the map's, at bậc
 * the tuning `bossStats.statTier`, in a full set of top-grade gear, with its points spent and `bossStats.hpMult` times the maximum HP. Placeholder values.
 */
export function bossRealmBonus(): number {
  return tuning().bossStats.realmBonus;
}
export function bossStatTier(): number {
  return tuning().bossStats.statTier;
}

/**
 * What the boss does besides its plain attack (3 skills: two attacks and a heal; no buff). Checked in this order each time it acts, each on
 * its own cooldown. `power` multiplies its attack; the heal restores `fraction` of its maximum HP and is used below `below` of it.
 */
export function bossSkills(): Tuning["bossSkills"] {
  return tuning().bossSkills;
}

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
  const realm = Math.min(mapRealm + bossRealmBonus(), REALMS.length - 1); // the top realm has none above it
  const base = startingStats("kim", 1).base;
  const b = tuning().bossStats;
  const lv = levelIndex(realm, b.statTier);
  base.canCot += lv * b.pointsPerLevel;
  base.linhLuc += lv * b.pointsPerLevel;
  const d = deriveStats(base, realm, b.statTier, 1, fullGearStats(realm, b.statTier, b.gearGrade), 1);
  return { maxHp: d.maxHp * b.hpMult, attack: d.attack, defense: d.defense, critRate: d.critRate, dodgeRate: d.dodgeRate };
}

/** The numbers of a boss kill (tuning `bossReward`): a contribution under `minShare` of the HP-and-last-hit total gets nothing, from Linh Thạch as well as from items; the weights of the damage dealt (as a share of the boss's HP) and of the last hit add up to 1; the whole kill pays `expMult` times the EXP of a Đại Yêu of the same bậc, split by share, and `linhMult` times a Đại Yêu's Linh Thạch drop; the items are `itemRounds` full sets of Đại Yêu loot rolls with the chances multiplied by `itemChanceMult`, each item going whole to one player picked by share. */
export function bossReward(): Tuning["bossReward"] {
  return tuning().bossReward;
}

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
    const c = bossReward().damageWeight * Math.min(1, (damage.get(id) ?? 0) / Math.max(1, maxHp)) + (id === killerId ? bossReward().lastHitWeight : 0);
    if (c >= bossReward().minShare - 1e-9) raw.push({ id, share: c });
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
  return `${bossName} đã xuất hiện ở ${BOSS_MAP_NAMES[mapId] ?? MAP_NAMES[mapId] ?? mapId}, kênh ${channel}!`;
}

export function bossKillText(bossName: string, mapId: string, channel: string, killer: string): string {
  return `${bossName} ở ${BOSS_MAP_NAMES[mapId] ?? MAP_NAMES[mapId] ?? mapId}, kênh ${channel} đã bị ${killer} cùng đồng đạo hạ gục.`;
}

/** Kills needed in one room to ask for the boss for sure. */
export function bossPityKills(realm: number): number {
  const t = tuning().bossSpawn;
  return t.pityKills[realm] ?? t.pityDefault;
}

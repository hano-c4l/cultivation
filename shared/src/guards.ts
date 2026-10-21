import { EQUIP_KINDS, KIND_SLOTS, GENDERED_KINDS, emptyEquipStats, equipmentInfo, makeEquipmentId, type EquipStats } from "./equipment-data";
import { GUARD_REALM_BONUS, GUARD_TIER } from "./monsters";
import { deriveStats, levelIndex, startingStats } from "./progression";

/**
 * Stats of a vệ binh (phase 2f): a character one realm above the map's, at bậc `GUARD_TIER`, wearing a FULL set of top-grade gear of
 * that realm (every slot but the pháp bảo), with its potential points spent, and five times the maximum HP. Computed from the same
 * formulas players use, so it follows the gear and level tables. Placeholder values ("giá trị tạm").
 */
export const GUARD_GEAR_GRADE = 4;
export const GUARD_HP_MULT = 5;
/** Base stat points per level index a guard is assumed to have spent on Căn cốt and Linh lực. */
export const GUARD_POINTS_PER_LEVEL = 2;

export interface GuardStats {
  maxHp: number;
  attack: number;
  defense: number;
  critRate: number;
  dodgeRate: number;
}

/** What a full set of gear of `realm`/`tier` and `grade` adds up to (every slot filled, but the bonded and flying pháp bảo). */
export function fullGearStats(realm: number, tier: number, grade: number): EquipStats {
  const total = emptyEquipStats();
  for (const kind of EQUIP_KINDS) {
    if (kind === "bonded" || kind === "flight") continue;
    const info = equipmentInfo(makeEquipmentId(kind, GENDERED_KINDS.has(kind) ? "m" : "u", realm, tier, grade));
    if (!info) continue;
    for (const key of Object.keys(total) as Array<keyof EquipStats>) total[key] += info.stats[key] * KIND_SLOTS[kind].length;
  }
  return total;
}

export function guardStats(mapRealm: number): GuardStats {
  const realm = mapRealm + GUARD_REALM_BONUS;
  const base = startingStats("kim", 1).base;
  const lv = levelIndex(realm, GUARD_TIER);
  base.canCot += lv * GUARD_POINTS_PER_LEVEL;
  base.linhLuc += lv * GUARD_POINTS_PER_LEVEL;
  const d = deriveStats(base, realm, GUARD_TIER, 1, fullGearStats(realm, GUARD_TIER, GUARD_GEAR_GRADE), 1);
  return { maxHp: d.maxHp * GUARD_HP_MULT, attack: d.attack, defense: d.defense, critRate: d.critRate, dodgeRate: d.dodgeRate };
}

/**
 * What a guard does besides its plain attack (4 skills): two attacks, a buff and a heal. Checked in this order each time it acts; each has
 * its own cooldown. `power` multiplies its attack, the buff adds `attackPct` percent attack for `durationMs`, the heal restores `fraction` of
 * its maximum HP and is used below `below` of it.
 */
export const GUARD_SKILLS = {
  mend: { fraction: 0.25, below: 0.6, cdMs: 15_000 },
  ward: { attackPct: 30, durationMs: 8_000, cdMs: 20_000 },
  burst: { power: 2.4, cdMs: 9_000 },
  slash: { power: 1.6, cdMs: 5_000 },
} as const;

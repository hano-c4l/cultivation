import { tuning, type Tuning } from "./tuning";
import { EQUIP_KINDS, KIND_SLOTS, GENDERED_KINDS, emptyEquipStats, equipmentInfo, makeEquipmentId, type EquipStats } from "./equipment-data";
import { guardRealmBonus, guardTier } from "./monsters";
import { deriveStats, levelIndex, startingStats } from "./progression";
import { REALMS } from "./progression-data";

/**
 * Stats of a vệ binh (phase 2f): a character one realm above the map's, at bậc `guardTier()`, wearing a FULL set of top-grade gear of
 * that realm (every slot but the pháp bảo), with its potential points spent, and five times the maximum HP. Computed from the same
 * formulas players use, so it follows the gear and level tables. Placeholder values ("giá trị tạm").
 */

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
  const g = tuning().guard; // gear grade, HP multiple and the stat points a guard is assumed to have spent per level (Căn cốt and Linh lực)
  const realm = Math.min(mapRealm + guardRealmBonus(), REALMS.length - 1); // the top realm has none above it
  const base = startingStats("kim", 1).base;
  const lv = levelIndex(realm, guardTier());
  base.canCot += lv * g.pointsPerLevel;
  base.linhLuc += lv * g.pointsPerLevel;
  const d = deriveStats(base, realm, guardTier(), 1, fullGearStats(realm, guardTier(), g.gearGrade), 1);
  return { maxHp: d.maxHp * g.hpMult, attack: d.attack, defense: d.defense, critRate: d.critRate, dodgeRate: d.dodgeRate };
}

/**
 * What a guard does besides its plain attack (4 skills): two attacks, a buff and a heal. Checked in this order each time it acts; each has
 * its own cooldown. `power` multiplies its attack, the buff adds `attackPct` percent attack for `durationMs`, the heal restores `fraction` of
 * its maximum HP and is used below `below` of it.
 */
export function guardSkills(): Tuning["guardSkills"] {
  return tuning().guardSkills;
}

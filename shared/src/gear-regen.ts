import { equipBlock, equipmentInfo, GRADE_MULT, type EquippedItem, type EquipInfo, type WearerCtx } from "./equipment-data";
import { levelIndex } from "./progression";
import { REGEN_PER_S } from "./combat";
import { tuning } from "./tuning";
import { mpRegenPerS } from "./skills";

/**
 * Regeneration of HP and MP (meditation, docs/PHASE2.md 2o). Nothing regenerates by itself any more: the ordinary regeneration (a share of the maximum
 * per second, `REGEN_PER_S` for HP and the tuning `combat.mpRegenPerS` for MP) works only while the character meditates. Some worn pieces give regeneration of
 * their own that works all the time, in a fight too, and adds to the ordinary one while meditating.
 */
export interface GearRegen {
  /** Points per second. */
  hp: number;
  mp: number;
  /** Percent of the maximum per second. */
  hpPct: number;
  mpPct: number;
}

export const NO_GEAR_REGEN: GearRegen = { hp: 0, mp: 0, hpPct: 0, mpPct: 0 };

/** The regeneration one piece gives: the weight of its kind (tuning `gearRegen`) times its units (level and grade, like the rest of its stats). */
export function gearRegenOf(info: EquipInfo): GearRegen {
  const w = tuning().gearRegen.weights[info.kind];
  if (!w) return NO_GEAR_REGEN;
  const units = (1 + levelIndex(info.realm, info.tier) * 0.6) * (GRADE_MULT[info.grade - 1] ?? 1);
  const flat = (x: number): number => (x > 0 ? Math.max(1, Math.round(units * x)) : 0);
  const pct = (x: number): number => Math.round(units * x * 100) / 100;
  return { hp: flat(w.hp), mp: flat(w.mp), hpPct: pct(w.hpPct), mpPct: pct(w.mpPct) };
}

/** The regeneration of every worn piece that counts (the same rule as for the other stats: not broken, requirements met). */
export function equipmentRegen(items: readonly EquippedItem[], w: WearerCtx): GearRegen {
  const total = { ...NO_GEAR_REGEN };
  for (const it of items) {
    const info = equipmentInfo(it.type);
    if (!info || equipBlock(info, it.slot, it.dur, w)) continue;
    const g = gearRegenOf(info);
    total.hp += g.hp;
    total.mp += g.mp;
    total.hpPct += g.hpPct;
    total.mpPct += g.mpPct;
  }
  total.hpPct = Math.round(total.hpPct * 100) / 100;
  total.mpPct = Math.round(total.mpPct * 100) / 100;
  return total;
}

/** HP and MP regenerated per second (points, may be fractional) for these maximums, meditating or not, with this gear. */
export function regenPerSecond(maxHp: number, maxMp: number, meditating: boolean, gear: GearRegen = NO_GEAR_REGEN): { hp: number; mp: number } {
  return {
    hp: (meditating ? maxHp * REGEN_PER_S : 0) + gear.hp + (maxHp * gear.hpPct) / 100,
    mp: (meditating ? maxMp * mpRegenPerS() : 0) + gear.mp + (maxMp * gear.mpPct) / 100,
  };
}

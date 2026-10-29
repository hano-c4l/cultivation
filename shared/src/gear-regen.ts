import type { EquipStats } from "./equipment-data";
import { REGEN_PER_S } from "./combat";
import { mpRegenPerS } from "./skills";

/**
 * Regeneration of HP and MP (meditation, docs/PHASE2.md 2o). Nothing regenerates by itself any more: the ordinary regeneration (a share of the maximum
 * per second, `REGEN_PER_S` for HP and the tuning `combat.mpRegenPerS` for MP) works only while the character meditates. Worn gear can give regeneration of
 * its own as stats (`hpRegen`, `mpRegen` points a second, `hpRegenPct`, `mpRegenPct` percent of the maximum a minute): it works all the time, in a fight
 * too, and adds to the ordinary one while meditating.
 */
export interface GearRegen {
  /** Points per second. */
  hp: number;
  mp: number;
  /** Percent of the maximum per second (the gear gives it per minute). */
  hpPct: number;
  mpPct: number;
}

export const NO_GEAR_REGEN: GearRegen = { hp: 0, mp: 0, hpPct: 0, mpPct: 0 };

/** The regeneration that the stats of the worn gear (equipmentBonus) give. */
export function gearRegenFrom(stats: Partial<EquipStats> | undefined): GearRegen {
  if (!stats) return NO_GEAR_REGEN;
  return { hp: stats.hpRegen ?? 0, mp: stats.mpRegen ?? 0, hpPct: (stats.hpRegenPct ?? 0) / 60, mpPct: (stats.mpRegenPct ?? 0) / 60 };
}

/** HP and MP regenerated per second (points, may be fractional) for these maximums, meditating or not, with this gear. */
export function regenPerSecond(maxHp: number, maxMp: number, meditating: boolean, gear: GearRegen = NO_GEAR_REGEN): { hp: number; mp: number } {
  return {
    hp: (meditating ? maxHp * REGEN_PER_S : 0) + gear.hp + (maxHp * gear.hpPct) / 100,
    mp: (meditating ? maxMp * mpRegenPerS() : 0) + gear.mp + (maxMp * gear.mpPct) / 100,
  };
}

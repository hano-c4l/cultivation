import { emptyEquipStats, equipmentInfo, type EquipSlot, type EquipStats } from "./equipment-data";
import type { BaseStats } from "./progression-data";
import { deriveStats, levelIndex } from "./progression";

/** The ways to rank characters (phase 2h): realm, combat power, wealth (Linh Thạch only), worn gear, worn pháp bảo. */
export const LEADERBOARDS = ["realm", "power", "wealth", "gear", "artifact"] as const;
export type Leaderboard = (typeof LEADERBOARDS)[number];

export function isLeaderboard(v: unknown): v is Leaderboard {
  return typeof v === "string" && (LEADERBOARDS as readonly string[]).includes(v);
}

/** The slots that count as pháp bảo (the bonded one, the flight one and the four others); the rest are gear. */
const ARTIFACT_SLOT_SET: ReadonlySet<string> = new Set(["bonded", "flight", "charm1", "charm2", "charm3", "charm4"]);
export function isArtifactSlot(slot: EquipSlot | string): boolean {
  return ARTIFACT_SLOT_SET.has(slot);
}

const GRADE_POINTS = [1, 2, 4, 8] as const;
/** Points per refine level of a pháp bảo bản mệnh (its trained level is worth showing). */
export const REFINE_LEVEL_POINTS = 50;

/**
 * What one worn piece adds to the gear or pháp bảo ranking: more for a higher realm and bậc and for a better grade, whatever the
 * wear and tear, plus the refine level of a pháp bảo bản mệnh. Placeholder weights ("giá trị tạm"). 0 for an unknown id.
 */
export function equipScore(type: string, refineLevel = 0): number {
  const info = equipmentInfo(type);
  if (!info) return 0;
  const level = levelIndex(info.realm, info.tier);
  return Math.round(100 * (1 + level * 0.6) * (GRADE_POINTS[info.grade - 1] ?? 1)) + Math.max(0, refineLevel) * REFINE_LEVEL_POINTS;
}

/** The sum of the stats of the worn pieces (full durability, no wearer bonus): what the power ranking counts from gear. */
export function wornStats(types: readonly string[]): EquipStats {
  const total = emptyEquipStats();
  for (const t of types) {
    const info = equipmentInfo(t);
    if (!info) continue;
    for (const k of Object.keys(total) as Array<keyof EquipStats>) total[k] += info.stats[k];
  }
  return total;
}

/** Combat power for the ranking: attack and defence count in full and maximum health at a tenth, from the stats the game derives. */
export function combatPower(base: BaseStats, realm: number, stage: number, rootGrade: number, gear?: EquipStats): number {
  const d = deriveStats(base, realm, stage, rootGrade, gear);
  return Math.round(d.attack + d.defense + d.maxHp / 10);
}

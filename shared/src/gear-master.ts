import { EQUIP_RATE_KEYS, EQUIP_STAT_KEYS, equipmentInfo, formulaStats, GRADE_MULT, speedRangeAt, type EquipKind, type EquipStatKey, type EquipStyle, type RolledStats } from "./equipment-data";
import { levelIndex } from "./progression";

/**
 * The master table of gear (D1 tables `equipment_master` and `equipment_sets`). One entry for each kind, style, realm and bậc,
 * giving for every stat the piece has a [min, max] range at the lowest grade (Hạ). When a piece is created (a drop, a shop sale) each
 * stat is rolled in its range and then scaled by the grade of the piece, so two pieces of the same type differ. The defaults are
 * built from the same formula the fixed stats used before: DEFAULT_SPREAD around the old value.
 */

/** A stat's range: [min, max] at grade 1. */
export type StatRange = readonly [number, number];
export type MasterStats = Partial<Record<EquipStatKey, StatRange>>;

export interface MasterEntry {
  kind: EquipKind;
  style: EquipStyle;
  realm: number;
  tier: number;
  stats: MasterStats;
}

/** Default range around the formula value: 80% to 120%. */
export const DEFAULT_SPREAD = 0.2;

export function masterKey(kind: string, style: string, realm: number, tier: number): string {
  return `${kind}.${style}.${realm}.${tier}`;
}

/** The entry the formula gives (no D1 row needed); null for pieces that are not rolled: the pháp bảo bản mệnh grows by its level instead. */
export function defaultMasterEntry(kind: EquipKind, style: EquipStyle, realm: number, tier: number): MasterEntry | null {
  if (kind === "bonded") return null;
  const base = formulaStats(kind, levelIndex(realm, tier), 1);
  const stats: MasterStats = {};
  for (const key of EQUIP_STAT_KEYS) {
    const v = base[key];
    if (!v) continue;
    const rate = EQUIP_RATE_KEYS.includes(key);
    if (key === "moveSpeed") continue; // set from SPEED_RANGES below
    const lo = v * (1 - DEFAULT_SPREAD);
    const hi = v * (1 + DEFAULT_SPREAD);
    if (rate) {
      stats[key] = [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
    } else {
      // Whole numbers: keep the range at least one wide even where 80%-120% would round to a single value (the first levels).
      const min = Math.max(1, Math.floor(lo));
      stats[key] = [min, Math.max(min + 1, Math.ceil(hi))];
    }
  }
  const speed = speedRangeAt(kind, levelIndex(realm, tier));
  if (speed) stats.moveSpeed = [speed[0], speed[1]];
  return { kind, style, realm, tier, stats };
}

/** Every entry of the default master table (the seed for D1). */
export function allDefaultMasterEntries(realms: number, tiers: number, styles: (kind: EquipKind) => readonly EquipStyle[], kinds: readonly EquipKind[]): MasterEntry[] {
  const out: MasterEntry[] = [];
  for (const kind of kinds) {
    for (const style of styles(kind)) {
      for (let realm = 0; realm < realms; realm++) {
        for (let tier = 1; tier <= tiers; tier++) {
          const e = defaultMasterEntry(kind, style, realm, tier);
          if (e) out.push(e);
        }
      }
    }
  }
  return out;
}

/** Whether a master entry is well formed (stat keys known, 0 <= min <= max, sane size). */
export function validMasterStats(raw: unknown): raw is MasterStats {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  for (const [k, v] of Object.entries(raw)) {
    if (!(EQUIP_STAT_KEYS as readonly string[]).includes(k)) return false;
    if (!Array.isArray(v) || v.length !== 2) return false;
    const [lo, hi] = v as unknown[];
    if (typeof lo !== "number" || typeof hi !== "number" || !Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi < lo || hi > 100_000) return false;
  }
  return true;
}

/**
 * Rolls the stats of a new piece: each stat of the entry uniformly in [min, max] (grade 1), scaled by the grade, and rounded like the
 * fixed stats were (whole numbers, or one decimal for the percentage stats). One random number per stat, in EQUIP_STAT_KEYS order.
 */
export function rollGearStats(stats: MasterStats, grade: number, rand: () => number): RolledStats {
  const mult = GRADE_MULT[Math.min(Math.max(grade, 1), GRADE_MULT.length) - 1] ?? 1;
  const out: RolledStats = {};
  for (const key of EQUIP_STAT_KEYS) {
    const r = stats[key];
    if (!r) continue;
    // Speed keeps the range of the master as it is: the grade does not scale it.
    const v = (r[0] + rand() * (r[1] - r[0])) * (key === "moveSpeed" ? 1 : mult);
    out[key] = EQUIP_RATE_KEYS.includes(key) ? Math.round(v * 10) / 10 : Math.max(1, Math.round(v));
  }
  return out;
}

/**
 * The stats rolled for a new piece of this type, or undefined when the type is not rolled (not gear, special, or a bonded artifact).
 * `lookup` gives the live master entry (from D1); without one, or when it has no such entry, the default entry is used.
 */
export function rollForType(type: string, rand: () => number, lookup?: (key: string) => MasterStats | undefined): RolledStats | undefined {
  const info = equipmentInfo(type);
  if (!info || info.kind === "bonded" || type.startsWith("eqs.")) return undefined;
  const stats = lookup?.(masterKey(info.kind, info.style, info.realm, info.tier)) ?? defaultMasterEntry(info.kind, info.style, info.realm, info.tier)?.stats;
  return stats ? rollGearStats(stats, info.grade, rand) : undefined;
}

/** How a rolled value sits in the range it was rolled from: at the top (max), at the bottom (min) or between. */
export type RollPosition = "max" | "min" | "mid";

/**
 * The range a rolled stat of this piece can have (after the grade, as rolled; the master's default ranges), and where `value` sits in it.
 * Pieces without a roll, stats without a range, and ranges of a single value have no position ("mid").
 */
export function rollPosition(type: string, key: EquipStatKey, value: number | undefined): RollPosition {
  const info = equipmentInfo(type);
  if (!info || value === undefined) return "mid";
  const r = defaultMasterEntry(info.kind, info.style, info.realm, info.tier)?.stats[key];
  if (!r || r[1] <= r[0]) return "mid";
  const mult = key === "moveSpeed" ? 1 : (GRADE_MULT[Math.min(Math.max(info.grade, 1), GRADE_MULT.length) - 1] ?? 1);
  const round = (v: number) => (EQUIP_RATE_KEYS.includes(key) ? Math.round(v * 10) / 10 : Math.max(1, Math.round(v)));
  const lo = round(r[0] * mult);
  const hi = round(r[1] * mult);
  if (value >= hi - 1e-9) return "max";
  if (value <= lo + 1e-9) return "min";
  return "mid";
}

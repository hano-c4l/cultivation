import type { SpiritualRoot } from "./character";
import { BASE_SPEED } from "./pathfinding";
import {
  BASE_STAT_START,
  ELEMENT_GENERATE_MULT,
  KILLS_BASE,
  KILLS_GROWTH,
  ELEMENT_OVERCOME_BY_MULT,
  ELEMENT_OVERCOME_MULT,
  MAX_ALLOCATE_PER_STAT,
  REALMS,
  ROOT_FAVOURED_STAT,
  ROOT_STAT_BONUS,
  STAGES_PER_REALM,
  STAT_KEYS,
  STARTING_POTENTIAL_POINTS,
  STAGE_EXP_GROWTH,
  type BaseStats,
  ROOT_GRADES,
  type RealmDef,
  type RootGradeDef,
  type StatKey,
} from "./progression-data";

export interface CharacterProgress {
  realm: number;
  stage: number;
  exp: number;
  potentialPoints: number;
}

/** Everything the client needs to draw the character sheet; derived stats are computed with deriveStats. */
export interface CharacterSheet extends CharacterProgress {
  id: string;
  name: string;
  spiritualRoot: SpiritualRoot;
  /** Index into ROOT_GRADES. */
  rootGrade: number;
  /** Thể chất: an id from CONSTITUTIONS and its 1-based tier (see constitutions.ts). */
  constitution: string;
  constitutionTier: number;
  base: BaseStats;
}

export function getRealm(realm: number): RealmDef {
  const def = REALMS[Math.min(Math.max(Math.trunc(realm), 0), REALMS.length - 1)];
  return def ?? (REALMS[0] as RealmDef);
}

/** Flat 0-based index across all realms and stages (Luyện Khí tầng 1 = 0). */
export function levelIndex(realm: number, stage: number): number {
  const r = Math.min(Math.max(Math.trunc(realm), 0), REALMS.length - 1);
  const s = Math.min(Math.max(Math.trunc(stage), 1), STAGES_PER_REALM);
  return r * STAGES_PER_REALM + (s - 1);
}

/** Same-bậc normal monsters needed to finish a stage (see KILLS_BASE). */
export function killsToNext(realm: number, stage: number): number {
  return Math.round(KILLS_BASE * KILLS_GROWTH ** levelIndex(realm, stage));
}

/** EXP of a normal monster of this realm and bậc: the stage's EXP divided by the kills it should take. */
export function monsterBaseExp(realm: number, tier: number): number {
  return Math.max(1, Math.round(expToNext(realm, tier) / killsToNext(realm, tier)));
}

/** EXP needed to finish the given stage. At stage 9 this is also the EXP cap until breakthrough exists. */
export function expToNext(realm: number, stage: number): number {
  const s = Math.min(Math.max(Math.trunc(stage), 1), STAGES_PER_REALM);
  return Math.round(getRealm(realm).expBase * STAGE_EXP_GROWTH ** (s - 1));
}

export interface ExpResult extends CharacterProgress {
  stagesGained: number;
}

/**
 * Adds EXP, advancing through as many stages as it pays for. Each new stage grants the realm's potential points.
 * Progress stops at stage 9 of a realm (EXP is capped, the overflow is dropped); moving to the next realm is a
 * separate breakthrough step that does not exist yet. Pure: the caller persists the result.
 */
export function applyExp(progress: CharacterProgress, gain: number): ExpResult {
  let { realm, stage, exp, potentialPoints } = progress;
  let stagesGained = 0;
  exp += Math.max(0, Math.floor(gain));
  while (stage < STAGES_PER_REALM) {
    const need = expToNext(realm, stage);
    if (exp < need) break;
    exp -= need;
    stage += 1;
    stagesGained += 1;
    potentialPoints += getRealm(realm).pointsPerStage;
  }
  if (stage >= STAGES_PER_REALM) exp = Math.min(exp, expToNext(realm, stage));
  return { realm, stage, exp, potentialPoints, stagesGained };
}

export function getRootGrade(grade: number): RootGradeDef {
  const def = ROOT_GRADES[Math.min(Math.max(Math.trunc(grade), 0), ROOT_GRADES.length - 1)];
  return def ?? (ROOT_GRADES[0] as RootGradeDef);
}

/** Maps a uniform integer roll in 0..99 to a root grade by the configured weights. */
export function rootGradeFromRoll(roll: number): number {
  let acc = 0;
  for (const g of ROOT_GRADES) {
    acc += g.weight;
    if (roll < acc) return g.id;
  }
  return ROOT_GRADES.length - 1;
}

/** Base stats and potential points of a freshly created character; a better root grade starts with more points. */
export function startingStats(root: SpiritualRoot, grade: number): { base: BaseStats; potentialPoints: number } {
  const base = {} as BaseStats;
  for (const key of STAT_KEYS) base[key] = BASE_STAT_START;
  base[ROOT_FAVOURED_STAT[root]] += ROOT_STAT_BONUS;
  return { base, potentialPoints: STARTING_POTENTIAL_POINTS + getRootGrade(grade).bonusPoints };
}

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  attack: number;
  defense: number;
  /** Percent chances, capped. */
  critRate: number;
  dodgeRate: number;
  /** Percent bonus to EXP gained; applied by whoever grants EXP. */
  expBonus: number;
  /** Percent bonus to drop chance. */
  dropBonus: number;
  /** Tiles per second. Display only: movement still uses BASE_SPEED (changing speed mid-walk would desync paths). */
  moveSpeed: number;
}

const RATE_CAP = 60;

/** Combat stats from base stats and cultivation level. Formulas live here so client and server always agree. */
export function deriveStats(base: BaseStats, realm: number, stage: number, rootGrade: number): DerivedStats {
  const lv = levelIndex(realm, stage);
  return {
    maxHp: 100 + base.canCot * 15 + lv * 25,
    maxMp: 50 + base.linhLuc * 10 + lv * 12,
    attack: Math.floor(5 + base.linhLuc * 2 + base.canCot * 0.5 + lv * 3),
    defense: Math.floor(2 + base.canCot * 1.5 + lv * 2),
    critRate: Math.min(RATE_CAP, 5 + base.thanThuc * 0.5),
    dodgeRate: Math.min(RATE_CAP, base.thanPhap * 0.5),
    expBonus: Math.max(-50, base.ngoTinh + getRootGrade(rootGrade).expBonusPct),
    dropBonus: Math.min(RATE_CAP, base.phucDuyen * 0.5),
    moveSpeed: Math.round(BASE_SPEED * (1 + base.thanPhap * 0.01) * 100) / 100,
  };
}

/**
 * Validates an untrusted allocation request: only known stat keys, non-negative integers, a positive total and
 * sane per-stat caps. Returns the deltas (zero entries dropped) or null.
 */
export function parseAllocation(raw: unknown): Partial<BaseStats> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const result: Partial<BaseStats> = {};
  let total = 0;
  for (const key of Object.keys(input)) {
    if (!(STAT_KEYS as readonly string[]).includes(key)) return null;
    const v = input[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_ALLOCATE_PER_STAT) return null;
    if (v > 0) {
      result[key as StatKey] = v;
      total += v;
    }
  }
  return total > 0 ? result : null;
}

export type Element = SpiritualRoot;

/** Each element overcomes (tương khắc) the next one in this cycle: kim > mộc > thổ > thủy > hỏa > kim. */
const OVERCOMES: Record<Element, Element> = { kim: "moc", moc: "tho", tho: "thuy", thuy: "hoa", hoa: "kim" };
/** Generating cycle (tương sinh): kim > thủy > mộc > hỏa > thổ > kim. */
const GENERATES: Record<Element, Element> = { kim: "thuy", thuy: "moc", moc: "hoa", hoa: "tho", tho: "kim" };

/** Damage multiplier of an attack by `attacker` element against a `defender` element. */
export function elementMultiplier(attacker: Element, defender: Element): number {
  if (OVERCOMES[attacker] === defender) return ELEMENT_OVERCOME_MULT;
  if (OVERCOMES[defender] === attacker) return ELEMENT_OVERCOME_BY_MULT;
  if (GENERATES[attacker] === defender) return ELEMENT_GENERATE_MULT;
  return 1;
}

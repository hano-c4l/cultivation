import type { MonsterRank } from "./monsters";
import { expToNext, getRootGrade, overflowExp } from "./progression";
import { BREAKTHROUGH_OVERFLOW_FROM, BREAKTHROUGH_OVERFLOW_FROM_BONUS, BREAKTHROUGH_OVERFLOW_MAX_BONUS, OVERFLOW_EXP_MAX, REALMS, STAGES_PER_REALM } from "./progression-data";

/**
 * Breakthrough (đột phá): moving from stage 9 of a realm to stage 1 of the next. Every number here is a placeholder
 * (docs/PHASE2.md, 2d). The pill is mandatory; extra pills raise the chance up to `maxRatePct`; the EXP overflow adds up to
 * BREAKTHROUGH_OVERFLOW_MAX_BONUS points (see overflowBonus); the higher the realm the lower, the longer and the dearer it is.
 */
export interface BreakthroughDef {
  /** Realm index the character leaves, and the one it reaches. */
  from: number;
  to: number;
  /** Item type of the pill that realm asks for. */
  pill: string;
  /** Pills that can be used at once (at least one is needed). */
  maxPills: number;
  /** Chance (percent) with one pill, and with `maxPills` pills; in between it grows evenly. */
  baseRatePct: number;
  maxRatePct: number;
  /** How long the character must stay undisturbed. */
  durationMs: number;
  /** Linh Thạch paid when it starts (lost on failure too). */
  cost: number;
  /** Potential points of the first stage of the new realm, before the root grade and constitution extras. */
  basePoints: number;
}

export function breakthroughPillId(toRealm: number): string {
  return `bt_pill_${toRealm}`;
}

export const BREAKTHROUGHS: readonly BreakthroughDef[] = [
  { from: 0, to: 1, pill: breakthroughPillId(1), maxPills: 2, baseRatePct: 70, maxRatePct: 90, durationMs: 60_000, cost: 5_000, basePoints: 10 },
  { from: 1, to: 2, pill: breakthroughPillId(2), maxPills: 3, baseRatePct: 60, maxRatePct: 80, durationMs: 180_000, cost: 50_000, basePoints: 16 },
  { from: 2, to: 3, pill: breakthroughPillId(3), maxPills: 3, baseRatePct: 50, maxRatePct: 70, durationMs: 600_000, cost: 500_000, basePoints: 24 },
];

/** The most any breakthrough can reach, overflow bonus included. */
export const BREAKTHROUGH_MAX_RATE_PCT = 95;
/** A failed breakthrough costs this fraction of the stage-9 EXP need (on top of the cost and the pills). */
export const BREAKTHROUGH_FAIL_EXP_LOSS = 0.3;
/** Extra potential points per root-grade bonus point and per constitution tier (non-default constitutions only). */
export const BREAKTHROUGH_GRADE_POINTS_MULT = 2;
export const BREAKTHROUGH_CONSTITUTION_POINTS = 2;

export function getBreakthrough(fromRealm: number): BreakthroughDef | undefined {
  return BREAKTHROUGHS.find((b) => b.from === fromRealm);
}

/** Why a breakthrough did not start or did not finish. */
export type BreakthroughError = "not_ready" | "max_realm" | "pills" | "no_pill" | "funds" | "busy" | "dead" | "invalid";
export type BreakthroughEnd = "timeout" | "hit" | "moved" | "cancel" | "left" | "died";

export interface BreakthroughReady {
  ok: true;
  def: BreakthroughDef;
  /** Percent points the EXP overflow adds to the chance (0 below the first mark). */
  overflowBonus: number;
}

/** Whether a character at (realm, stage, exp) may start a breakthrough: stage 9 with a full bar, and a next realm to go to. */
export function checkBreakthroughReady(realm: number, stage: number, exp: number): BreakthroughReady | { ok: false; error: "not_ready" | "max_realm" } {
  if (stage < STAGES_PER_REALM || exp < expToNext(realm, stage)) return { ok: false, error: "not_ready" };
  const def = getBreakthrough(realm);
  if (!def || def.to >= REALMS.length) return { ok: false, error: "max_realm" };
  return { ok: true, def, overflowBonus: overflowBonus(realm, stage, exp) };
}

/**
 * Percent points the EXP overflow adds to the chance: 0 below half the need, BREAKTHROUGH_OVERFLOW_FROM_BONUS at half, growing
 * evenly to BREAKTHROUGH_OVERFLOW_MAX_BONUS at a full overflow (OVERFLOW_EXP_MAX of the need).
 */
export function overflowBonus(realm: number, stage: number, exp: number): number {
  const frac = overflowExp(realm, stage, exp) / expToNext(realm, stage);
  if (frac < BREAKTHROUGH_OVERFLOW_FROM) return 0;
  const t = Math.min(1, (frac - BREAKTHROUGH_OVERFLOW_FROM) / (OVERFLOW_EXP_MAX - BREAKTHROUGH_OVERFLOW_FROM));
  return Math.round((BREAKTHROUGH_OVERFLOW_FROM_BONUS + (BREAKTHROUGH_OVERFLOW_MAX_BONUS - BREAKTHROUGH_OVERFLOW_FROM_BONUS) * t) * 100) / 100;
}

/** EXP left when a breakthrough starts: the overflow is used up (like the pills), the bar stays full. */
export function expAtStart(realm: number, stage: number, exp: number): number {
  return Math.min(exp, expToNext(realm, stage));
}

/** Chance (percent) of a breakthrough with this many pills (clamped to 1..maxPills) and this overflow bonus (see overflowBonus). */
export function breakthroughRate(def: BreakthroughDef, pills: number, bonus: number): number {
  const n = Math.min(Math.max(Math.trunc(pills), 1), def.maxPills);
  const step = def.maxPills > 1 ? (def.maxRatePct - def.baseRatePct) / (def.maxPills - 1) : 0;
  const rate = def.baseRatePct + step * (n - 1) + Math.max(0, bonus);
  return Math.min(BREAKTHROUGH_MAX_RATE_PCT, Math.round(rate * 100) / 100);
}

/** Rolls the outcome with the injected random source (uniform [0, 1)). */
export function rollBreakthrough(ratePct: number, rand: () => number): boolean {
  return rand() * 100 < ratePct;
}

/** EXP left after a failed breakthrough: the bar (overflow already used up) loses 30% of the stage-9 need, so it is left at 70% (never below 0). */
export function expAfterFailure(realm: number, stage: number, exp: number): number {
  return Math.max(0, expAtStart(realm, stage, exp) - Math.round(expToNext(realm, stage) * BREAKTHROUGH_FAIL_EXP_LOSS));
}

/**
 * Potential points a successful breakthrough grants: the realm's base, more for a better root grade, and more for a special
 * constitution by its tier (like the extras a new character starts with, but larger).
 */
export function breakthroughPoints(def: BreakthroughDef, rootGrade: number, constitutionTier: number, defaultConstitution: boolean): number {
  const grade = getRootGrade(rootGrade).bonusPoints * BREAKTHROUGH_GRADE_POINTS_MULT;
  const constitution = defaultConstitution ? 0 : Math.max(1, Math.trunc(constitutionTier)) * BREAKTHROUGH_CONSTITUTION_POINTS;
  return def.basePoints + grade + constitution;
}

/**
 * Chance (0..1) that one kill by a monster of `rank` in a map of `realm` drops that realm's breakthrough pill. Rarer for
 * higher realms; the strongest pills are meant to come from bosses, shops and the one-time quest instead (later phases).
 */
export const PILL_DROP_CHANCE: Readonly<Record<number, Readonly<Record<MonsterRank, number>>>> = {
  0: { normal: 0.004, rare1: 0.04, rare2: 0.12 },
  1: { normal: 0.0015, rare1: 0.02, rare2: 0.06 },
  2: { normal: 0.0005, rare1: 0.008, rare2: 0.03 },
};

/** The pill dropped by one kill, or null. Draws exactly one number, after every other roll of the kill (so seeded sequences stay stable). */
export function rollPillDrop(mapRealm: number, rank: MonsterRank, rand: () => number): string | null {
  const roll = rand();
  const def = getBreakthrough(mapRealm);
  const chance = PILL_DROP_CHANCE[mapRealm]?.[rank] ?? 0;
  return def && roll < chance ? def.pill : null;
}

/** Whether an item type is a breakthrough pill, and for which realm it is meant (the realm it leads to). */
export function pillTargetRealm(type: string): number | undefined {
  const m = /^bt_pill_(\d+)$/.exec(type);
  if (!m) return undefined;
  const to = Number(m[1]);
  return getBreakthrough(to - 1)?.pill === type ? to : undefined;
}

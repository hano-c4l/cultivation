import { ALL_ROOTS, MUTANT_ROOTS, SPIRITUAL_ROOTS, type SpiritualRoot } from "./character";
import type { PathState } from "./paths";
import type { EquipStats } from "./equipment-data";
import type { Gender } from "./gender";
import { BASE_SPEED } from "./pathfinding";
import { effectiveSpeed } from "./movement";
import { elementTuning } from "./element-tuning";
import { tuning } from "./tuning";
import {
  BASE_STAT_START,
  MAX_ALLOCATE_PER_STAT,
  REALMS,
  ROOT_FAVOURED_STAT,
  ROOT_STAT_BONUS,
  STAGES_PER_REALM,
  STAT_KEYS,
  STARTING_POTENTIAL_POINTS,
  type BaseStats,
  ROOT_COUNTS,
  ROOT_GRADES,
  type RealmDef,
  type RootCountDef,
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
  /** The main element (the first of `roots`). */
  spiritualRoot: SpiritualRoot;
  /** All the character's elements, main one first (1 to 5 of them). */
  roots: SpiritualRoot[];
  /** Index into ROOT_GRADES. */
  rootGrade: number;
  /** Thể chất: an id from CONSTITUTIONS and its 1-based tier (see constitutions.ts). */
  constitution: string;
  constitutionTier: number;
  gender: Gender;
  /** The hướng tu the character has taken up (the chủ tu and up to two phụ tu). */
  paths: PathState;
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

/** Same-bậc normal monsters needed to finish a stage (tuning `kills`). */
export function killsToNext(realm: number, stage: number): number {
  const k = tuning().kills;
  return Math.round(k.base * k.growth ** levelIndex(realm, stage));
}

/** EXP of a normal monster of this realm and bậc: the stage's EXP divided by the kills it should take. */
export function monsterBaseExp(realm: number, tier: number): number {
  return Math.max(1, Math.round(expToNext(realm, tier) / killsToNext(realm, tier)));
}

/** Potential points granted on reaching each new stage of a realm (tuning `exp`). */
export function pointsPerStage(realm: number): number {
  const e = tuning().exp;
  return e.realms[Math.min(Math.max(Math.trunc(realm), 0), e.realms.length - 1)]?.pointsPerStage ?? getRealm(realm).pointsPerStage;
}

/** EXP needed to finish the given stage. At stage 9 a full bar is what a breakthrough asks for (see breakthrough.ts). */
export function expToNext(realm: number, stage: number): number {
  const s = Math.min(Math.max(Math.trunc(stage), 1), STAGES_PER_REALM);
  const e = tuning().exp;
  const base = e.realms[Math.min(Math.max(Math.trunc(realm), 0), e.realms.length - 1)]?.expBase ?? getRealm(realm).expBase;
  return Math.round(base * e.stageGrowth ** (s - 1));
}

export interface ExpResult extends CharacterProgress {
  stagesGained: number;
}

/**
 * Adds EXP, advancing through as many stages as it pays for. Each new stage grants the realm's potential points.
 * Progress stops at stage 9 of a realm: the bar can fill past its need by up to OVERFLOW_EXP_MAX of it (see overflowExp),
 * the rest is dropped; moving to the next realm is a separate breakthrough step. Pure: the caller persists the result.
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
    potentialPoints += pointsPerStage(realm);
  }
  if (stage >= STAGES_PER_REALM) exp = Math.min(exp, expCap(realm, stage));
  return { realm, stage, exp, potentialPoints, stagesGained };
}

/** Most EXP a character can hold at this stage: the stage's need, and at stage 9 also the overflow. */
export function expCap(realm: number, stage: number): number {
  const need = expToNext(realm, stage);
  return stage >= STAGES_PER_REALM ? need + Math.round(need * tuning().exp.overflowMax) : need;
}

/** EXP held beyond a full stage-9 bar (0 below stage 9 or while the bar is not full). */
export function overflowExp(realm: number, stage: number, exp: number): number {
  return stage >= STAGES_PER_REALM ? Math.max(0, exp - expToNext(realm, stage)) : 0;
}

/** A root grade with the live numbers of the tuning (`roots.grades`) over the ones written in progression-data. */
export function getRootGrade(grade: number): RootGradeDef {
  const i = Math.min(Math.max(Math.trunc(grade), 0), ROOT_GRADES.length - 1);
  const base = ROOT_GRADES[i] ?? (ROOT_GRADES[0] as RootGradeDef);
  const live = tuning().roots.grades[i];
  return live ? { ...base, ...live } : base;
}

/** Maps a uniform integer roll in 0..99 to a root grade by the configured weights. */
export function rootGradeFromRoll(roll: number): number {
  const grades = tuning().roots.grades;
  const total = grades.reduce((n, g) => n + g.weight, 0) || 100;
  const at = (roll / 100) * total; // the weights need not add up to 100
  let acc = 0;
  for (let i = 0; i < grades.length; i++) {
    acc += grades[i]!.weight;
    if (at < acc) return i;
  }
  return ROOT_GRADES.length - 1;
}

export function getRootCount(count: number): RootCountDef {
  const i = Math.min(Math.max(Math.trunc(count), 1), ROOT_COUNTS.length) - 1;
  const base = ROOT_COUNTS[i] ?? (ROOT_COUNTS[0] as RootCountDef);
  const live = tuning().roots.counts[i];
  return live ? { ...base, ...live } : base;
}

/** Maps a uniform integer roll in 0..99 to how many elements the root has, by the configured weights. */
export function rootCountFromRoll(roll: number): number {
  const counts = tuning().roots.counts;
  const total = counts.reduce((n, c) => n + c.weight, 0) || 100;
  const at = (roll / 100) * total;
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i]!.weight;
    if (at < acc) return i + 1;
  }
  return ROOT_COUNTS.length;
}

/**
 * The elements of a new character: `count` distinct ones out of the five, picked with the given random numbers (any
 * non-negative integers; each picks from what is left). The first is the main element.
 */
export function rollRoots(count: number, picks: readonly number[]): SpiritualRoot[] {
  const pool: SpiritualRoot[] = [...SPIRITUAL_ROOTS];
  const out: SpiritualRoot[] = [];
  for (let i = 0; i < Math.min(Math.max(Math.trunc(count), 1), pool.length + out.length); i++) {
    const idx = Math.abs(Math.trunc(picks[i] ?? 0)) % pool.length;
    out.push(pool.splice(idx, 1)[0] as SpiritualRoot);
  }
  return out;
}

/**
 * A single plain element may turn out to be a mutant one (Lôi, Băng, Phong): `chanceRoll` in 0..999 decides whether
 * (below the chance, per thousand), `pick` which of the three. Characters with more elements never get one.
 */
export function maybeMutantRoot(roots: readonly SpiritualRoot[], chanceRoll: number, pick: number, chancePermille = elementTuning().mutantRootChancePermille): SpiritualRoot[] {
  if (roots.length !== 1 || chanceRoll >= chancePermille) return [...roots];
  return [MUTANT_ROOTS[Math.abs(Math.trunc(pick)) % MUTANT_ROOTS.length] as SpiritualRoot];
}

/** The roots stored on a character: the list when there is one, otherwise just the main element (older characters). */
export function parseRoots(raw: string | null | undefined, primary: SpiritualRoot): SpiritualRoot[] {
  const list = (raw ?? "").split(",").filter((r): r is SpiritualRoot => (ALL_ROOTS as readonly string[]).includes(r));
  const unique = [...new Set(list)];
  return unique.length > 0 ? unique : [primary];
}

/**
 * The element an attack from `roots` uses against a defender of `defender` element: the one with the best multiplier
 * (the first of them on a tie), so a multi-root character always fights with its most favourable element.
 */
export function bestElementVs(roots: readonly Element[], defender: Element): Element {
  let best = roots[0] as Element;
  for (const r of roots) if (elementMultiplier(r, defender) > elementMultiplier(best, defender)) best = r;
  return best;
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
  /** Tiles per second: what the server walks the character at (a speed change re-plans the path, see map-room refreshSpeed). */
  moveSpeed: number;
}

/** The highest percent crit and dodge reach (tuning `stats.rateCap`). */
export function rateCap(): number {
  return tuning().stats.rateCap;
}

/** Walking speed (tiles per second) from the base stats, the speed percent of worn gear and any other percent modifiers. */
export function walkSpeed(base: BaseStats, gearPct: number, speedMods: readonly number[] = []): number {
  return effectiveSpeed(BASE_SPEED * (1 + base.thanPhap * 0.01), [gearPct, ...speedMods]);
}

/**
 * Combat stats from base stats and cultivation level, plus the stats of worn gear (`gear`, see equipmentBonus).
 * Formulas live here so client and server always agree.
 */
export function deriveStats(base: BaseStats, realm: number, stage: number, rootGrade: number, gear?: EquipStats, rootCount = 1, speedMods: readonly number[] = []): DerivedStats {
  const lv = levelIndex(realm, stage);
  const t = tuning().stats; // the coefficients are tuning numbers (docs/PHASE3.md 3f); the caps of the percent stats stay as written
  const cap = rateCap();
  return {
    maxHp: t.maxHp.base + base.canCot * t.maxHp.perCanCot + lv * t.maxHp.perLevel + (gear?.maxHp ?? 0),
    maxMp: t.maxMp.base + base.linhLuc * t.maxMp.perLinhLuc + lv * t.maxMp.perLevel,
    attack: Math.floor(t.attack.base + base.linhLuc * t.attack.perLinhLuc + base.canCot * t.attack.perCanCot + lv * t.attack.perLevel + (gear?.attack ?? 0)),
    defense: Math.floor(t.defense.base + base.canCot * t.defense.perCanCot + lv * t.defense.perLevel + (gear?.defense ?? 0)),
    critRate: Math.min(cap, t.critRate.base + base.thanThuc * t.critRate.perThanThuc + (gear?.critRate ?? 0)),
    dodgeRate: Math.min(cap, base.thanPhap * t.dodgeRate.perThanPhap + (gear?.dodgeRate ?? 0)),
    expBonus: Math.max(-50, base.ngoTinh * t.expBonus.perNgoTinh + getRootGrade(rootGrade).expBonusPct + getRootCount(rootCount).expBonusPct),
    dropBonus: Math.min(cap, base.phucDuyen * t.dropBonus.perPhucDuyen),
    moveSpeed: walkSpeed(base, gear?.moveSpeed ?? 0, speedMods),
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

/**
 * Damage multiplier of one attack, judged from the attacker's side (the one hit simply takes what the attacker deals).
 * An element both sides have is a draw and counts for nobody. Each remaining element of the attacker scores one point for
 * the attacker when it overcomes (khắc) any element of the target; each remaining element of the target scores one for the
 * target when it overcomes any element of the attacker. Whoever has more points wins: x1.2 for the attacker, x0.8 for the
 * target, x1 on a tie. A skill has one element, a plain attack uses all of the attacker's.
 * Example: A hỏa + kim + thổ plain-attacks B hỏa + mộc + thủy: hỏa is shared (a draw); A's kim overcomes mộc and thổ overcomes
 * thủy (2); B's mộc overcomes thổ and thủy overcomes hỏa (2); equal, so x1. Who overcomes whom is in ElementTuning.
 */
export function elementOutcome(attacker: readonly Element[], target: readonly Element[]): number {
  const t = elementTuning();
  const mine = attacker.filter((a) => !target.includes(a) && target.some((d) => t.overcomes[a]?.includes(d))).length;
  const theirs = target.filter((d) => !attacker.includes(d) && attacker.some((a) => t.overcomes[d]?.includes(a))).length;
  if (mine > theirs) return t.overcomeMult;
  if (mine < theirs) return t.overcomeByMult;
  return 1;
}

/** Damage multiplier of an attack by one `attacker` element against one `defender` element. */
export function elementMultiplier(attacker: Element, defender: Element): number {
  return elementOutcome([attacker], [defender]);
}

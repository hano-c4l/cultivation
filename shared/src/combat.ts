import { elementMultiplier, type Element } from "./progression";

/** Server tick rate for combat (ms). */
export const TICK_MS = 100;
/** Player melee reach in tiles and the delay between auto-attacks. */
export const PLAYER_ATTACK_RANGE = 1.6;
export const PLAYER_ATTACK_COOLDOWN_MS = 1000;
/** Fraction of current-stage EXP lost on death (the stage itself is never lost). */
export const DEATH_EXP_LOSS = 0.1;
/** After this long without taking damage a character regenerates; fraction of max HP per second. */
export const REGEN_DELAY_MS = 5000;
export const REGEN_PER_S = 0.02;
export const ATTACK_MIN_GAP_MS = 200;

export interface Combatant {
  attack: number;
  defense: number;
  /** Percent chances. */
  critRate: number;
  dodgeRate: number;
  element: Element;
}

export type HitKind = "miss" | "hit" | "crit";

export interface HitResult {
  kind: HitKind;
  damage: number;
}

/**
 * Damage of one attack. Defense reduces damage by 100 / (100 + defense), the element table scales it, and a small
 * random spread applies. `rand` returns [0, 1) and is injected so every branch can be tested.
 */
export function computeDamage(attacker: Combatant, defender: Combatant, rand: () => number): HitResult {
  if (rand() * 100 < defender.dodgeRate) return { kind: "miss", damage: 0 };
  const crit = rand() * 100 < attacker.critRate;
  const raw =
    attacker.attack *
    (100 / (100 + defender.defense)) *
    elementMultiplier(attacker.element, defender.element) *
    (0.9 + 0.2 * rand()) *
    (crit ? 1.5 : 1);
  return { kind: crit ? "crit" : "hit", damage: Math.max(1, Math.round(raw)) };
}

/** EXP actually gained for a kill: the monster's base EXP scaled by the killer's percent bonus (never below 0). */
export function expForKill(baseExp: number, expBonusPct: number): number {
  return Math.max(0, Math.floor(baseExp * (1 + expBonusPct / 100)));
}

export function expLostOnDeath(exp: number): number {
  return Math.floor(Math.max(0, exp) * DEATH_EXP_LOSS);
}

/** Valid monster instance id as sent by clients (m + digits). */
export function isMonsterId(value: unknown): value is string {
  return typeof value === "string" && /^m\d{1,6}$/.test(value);
}

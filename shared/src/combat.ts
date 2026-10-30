import { tuning } from "./tuning";
import { rankDef, homeExpCap, type MonsterRank } from "./monsters";
import { elementOutcome, monsterBaseExp, type Element } from "./progression";

/** Server tick rate for combat (ms). */
export const TICK_MS = 100;
/** Player melee reach in tiles and the delay between auto-attacks. */
export const PLAYER_ATTACK_RANGE = 1.6;
export const PLAYER_ATTACK_COOLDOWN_MS = 1000;
/** After this long without taking damage a character regenerates (tuning `combat.hpRegenDelayMs`); fraction of max HP per second. */
export function regenDelayMs(): number {
  return tuning().combat.hpRegenDelayMs;
}
export const REGEN_PER_S = 0.02;
export const ATTACK_MIN_GAP_MS = 200;

export interface Combatant {
  attack: number;
  defense: number;
  /** Percent chances. */
  critRate: number;
  dodgeRate: number;
  element: Element;
  /**
   * All the elements of a player. As the target, every one of them counts; as the attacker, a plain attack goes by all of them
   * while a skill hits with the one element chosen for it, so it leaves this out (see elementOutcome).
   */
  roots?: readonly Element[];
}

/** The element table's factor for one hit, from the attacker's side: its elements (or the skill's one) against all of the target's. */
export function elementFactor(attacker: Combatant, defender: Combatant): number {
  return elementOutcome(attacker.roots ?? [attacker.element], defender.roots ?? [defender.element]);
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
    elementFactor(attacker, defender) *
    (0.9 + 0.2 * rand()) *
    (crit ? 1.5 : 1);
  return { kind: crit ? "crit" : "hit", damage: Math.max(1, Math.round(raw)) };
}

/** What a kill is worth is decided by the monster's realm (its map), bậc and rank. */
export interface KillSource {
  realm: number;
  tier: number;
  rank: MonsterRank;
}

/**
 * EXP for killing a monster: its base EXP (from the pace table) times its rank, then the player's EXP bonus.
 * Hunting in a map of a higher realm never pays more than the same rank pays at home (homeExpCap); hunting below
 * your realm is scaled by LOW_MAP_EXP_MULT per realm of difference.
 */
export function killExp(source: KillSource, playerRealm: number, expBonusPct: number): number {
  let base = monsterBaseExp(source.realm, source.tier) * rankDef(source.rank).expMult;
  if (source.realm > playerRealm) {
    const cap = homeExpCap(playerRealm, source.rank);
    if (cap !== undefined) base = Math.min(base, cap);
  } else if (source.realm < playerRealm) {
    base *= tuning().exp.lowMapMult ** (playerRealm - source.realm);
  }
  return expForKill(base, expBonusPct);
}

/**
 * EXP a meditating character gains each second: a share (`huntRatio`) of what one ordinary kill on its own realm's map pays, spread over the seconds a kill takes
 * (`secondsPerKill`). It grows with the realm like the kills do, but stays a fraction of hunting (the tuning `meditation`), so sitting never beats fighting.
 */
export function meditationExpPerSecond(realm: number, expBonusPct = 0): number {
  const m = tuning().meditation;
  const perKill = killExp({ realm, tier: 4, rank: "normal" }, realm, expBonusPct);
  return (perKill * m.huntRatio) / Math.max(1, m.secondsPerKill);
}

/** Weights of a rare monster's reward: share of its HP dealt as damage, plus the last hit. They add up to 1. */
export const DAMAGE_WEIGHT = 0.7;
export const LAST_HIT_WEIGHT = 0.3;

/**
 * Who takes the whole reward of a rare monster: the present player with the highest contribution
 * (DAMAGE_WEIGHT x share of max HP dealt + LAST_HIT_WEIGHT for the killer). A tie goes to the killer, then to the
 * lower id so the result is deterministic. Returns null when nobody is present.
 */
export function topContributor(
  damage: ReadonlyMap<string, number>,
  maxHp: number,
  killerId: string,
  isPresent: (id: string) => boolean,
): string | null {
  const ids = new Set(damage.keys());
  ids.add(killerId);
  let best: string | null = null;
  let bestShare = -1;
  for (const id of [...ids].sort()) {
    if (!isPresent(id)) continue;
    const share = DAMAGE_WEIGHT * Math.min(1, (damage.get(id) ?? 0) / maxHp) + (id === killerId ? LAST_HIT_WEIGHT : 0);
    if (share > bestShare + 1e-9 || (Math.abs(share - bestShare) <= 1e-9 && id === killerId)) {
      best = id;
      bestShare = share;
    }
  }
  return best;
}

/** EXP actually gained for a kill: the monster's base EXP scaled by the killer's percent bonus (never below 0). */
export function expForKill(baseExp: number, expBonusPct: number): number {
  return Math.max(0, Math.floor(baseExp * (1 + expBonusPct / 100)));
}

export function expLostOnDeath(exp: number): number {
  return Math.floor(Math.max(0, exp) * tuning().combat.deathExpLoss);
}

/** Valid monster instance id as sent by clients (m + digits). */
/** A target of an attack or an attack skill: a monster ("m12") or, in PvP, another player (a character id, a UUID). */
export function isCombatTargetId(value: unknown): value is string {
  return isMonsterId(value) || (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value));
}

export function isMonsterId(value: unknown): value is string {
  return typeof value === "string" && /^m\d{1,6}$/.test(value);
}

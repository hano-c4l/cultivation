/**
 * Movement budget: the client claims the tile it starts walking from, and the server trusts that claim only while a
 * small allowance lasts. Without it, chaining claims that are each a few tiles ahead of the server position is a
 * speed hack (and breaks attack range once combat exists). Honest latency drift is about speed x one-way delay.
 */
export const MOVE_BUDGET_CAP = 3;
/** Tiles of trusted drift regained per second; this bounds the extra speed a cheater can gain. */
export const MOVE_BUDGET_REFILL_PER_S = 1;

/** Hard bounds on a walking speed (tiles per second), whatever buffs and gear add up to. */
export const MIN_MOVE_SPEED = 1;
export const MAX_MOVE_SPEED = 12;

/**
 * Walking speed from the base speed and any number of percent modifiers (flight pháp bảo, buffs, items, ...), which add
 * up (+20% and +30% make +50%). One place, so the server and the displayed stat always agree.
 */
export function effectiveSpeed(baseSpeed: number, percentMods: readonly number[] = []): number {
  const pct = percentMods.reduce((s, m) => s + m, 0);
  const v = baseSpeed * Math.max(0, 1 + pct / 100);
  return Math.round(Math.min(MAX_MOVE_SPEED, Math.max(MIN_MOVE_SPEED, v)) * 100) / 100;
}

export interface MoveBudgetResult {
  /** Whether the claimed start (this far from the server's position) is accepted. */
  accepted: boolean;
  /** Budget left to store for the next move. */
  budget: number;
}

/** Refills by elapsed time, then spends `drift` tiles if the claim fits. A rejected claim spends nothing. */
export function spendMoveBudget(budget: number, elapsedMs: number, drift: number, maxDrift: number, speedScale = 1): MoveBudgetResult {
  // Honest drift grows with speed, so a faster walker gets a proportionally bigger allowance.
  const scale = Math.max(1, speedScale);
  const refilled = Math.min(MOVE_BUDGET_CAP * scale, budget + (Math.max(0, elapsedMs) / 1000) * MOVE_BUDGET_REFILL_PER_S * scale);
  if (drift > maxDrift || drift > refilled) return { accepted: false, budget: refilled };
  return { accepted: true, budget: refilled - drift };
}

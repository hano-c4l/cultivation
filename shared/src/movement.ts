/**
 * Movement budget: the client claims the tile it starts walking from, and the server trusts that claim only while a
 * small allowance lasts. Without it, chaining claims that are each a few tiles ahead of the server position is a
 * speed hack (and breaks attack range once combat exists). Honest latency drift is about speed x one-way delay.
 */
export const MOVE_BUDGET_CAP = 3;
/** Tiles of trusted drift regained per second; this bounds the extra speed a cheater can gain. */
export const MOVE_BUDGET_REFILL_PER_S = 1;

export interface MoveBudgetResult {
  /** Whether the claimed start (this far from the server's position) is accepted. */
  accepted: boolean;
  /** Budget left to store for the next move. */
  budget: number;
}

/** Refills by elapsed time, then spends `drift` tiles if the claim fits. A rejected claim spends nothing. */
export function spendMoveBudget(budget: number, elapsedMs: number, drift: number, maxDrift: number): MoveBudgetResult {
  const refilled = Math.min(MOVE_BUDGET_CAP, budget + (Math.max(0, elapsedMs) / 1000) * MOVE_BUDGET_REFILL_PER_S);
  if (drift > maxDrift || drift > refilled) return { accepted: false, budget: refilled };
  return { accepted: true, budget: refilled - drift };
}

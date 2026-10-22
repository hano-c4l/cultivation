import { describe, expect, it } from "vitest";
import { BASE_SPEED } from "./pathfinding";
import { effectiveSpeed, MAX_MOVE_SPEED, MIN_MOVE_SPEED, spendMoveBudget } from "./movement";
import { walkSpeed } from "./progression";
import { STAT_KEYS, type BaseStats } from "./progression-data";

describe("effectiveSpeed", () => {
  it("adds the percent modifiers together", () => {
    expect(effectiveSpeed(4, [20, 30])).toBe(6);
    expect(effectiveSpeed(4)).toBe(4);
  });

  it("stays between the minimum and the maximum", () => {
    expect(effectiveSpeed(4, [-500])).toBe(MIN_MOVE_SPEED);
    expect(effectiveSpeed(4, [100_000])).toBe(MAX_MOVE_SPEED);
  });

  it("walkSpeed folds the stats, the gear percent and extra modifiers", () => {
    const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as unknown as BaseStats;
    expect(walkSpeed(base, 0)).toBe(BASE_SPEED);
    expect(walkSpeed(base, 50)).toBe(BASE_SPEED * 1.5);
    expect(walkSpeed(base, 50, [50])).toBe(BASE_SPEED * 2);
  });
});

describe("spendMoveBudget with speed", () => {
  it("gives a faster walker a bigger allowance", () => {
    expect(spendMoveBudget(100, 10_000, 5, 10, 1).accepted).toBe(false); // cap 3 tiles
    expect(spendMoveBudget(100, 10_000, 5, 10, 2).accepted).toBe(true); // cap 6 tiles
  });
});

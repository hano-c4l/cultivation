import { describe, expect, it } from "vitest";
import { BASE_SPEED } from "./pathfinding";
import { effectiveSpeed, MAX_MOVE_SPEED, MIN_MOVE_SPEED, spendMoveBudget, takeMoveToken } from "./movement";
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

describe("takeMoveToken", () => {
  it("accepts a bunched-up pair of moves that one steady gap would have refused", () => {
    const first = takeMoveToken(undefined, 10_000, 100, 4);
    expect(first).toBe(3);
    expect(takeMoveToken(first!, 30, 100, 4)).not.toBeNull(); // 120 ms apart on the client, 30 ms apart on arrival
  });
  it("holds to one move per interval once the burst is spent", () => {
    let t: number | null = 4;
    let ok = 0;
    for (let i = 0; i < 20; i++) {
      t = takeMoveToken(t!, 10, 100, 4);
      if (t === null) { t = 0; continue; }
      ok++;
    }
    expect(ok).toBeLessThanOrEqual(6); // 4 burst + about 2 refilled over 200 ms
  });
  it("refuses with nothing charged when empty and refills with time", () => {
    expect(takeMoveToken(0, 50, 100, 4)).toBeNull();
    expect(takeMoveToken(0, 100, 100, 4)).toBeCloseTo(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  BREAKTHROUGHS,
  BREAKTHROUGH_MAX_RATE_PCT,
  breakthroughPillId,
  breakthroughPoints,
  breakthroughRate,
  checkBreakthroughReady,
  expAfterFailure,
  getBreakthrough,
  expAtStart,
  overflowBonus,
  pillTargetRealm,
  rollBreakthrough,
  rollPillDrop,
} from "./breakthrough";
import { getItemDef } from "./items";
import { applyExp, expCap, expToNext, overflowExp } from "./progression";
import { REALMS } from "./progression-data";

const LK = getBreakthrough(0)!;
const TC = getBreakthrough(1)!;

describe("breakthrough chance", () => {
  it("follows the user's table: Luyện Khí 70/90, Trúc Cơ 60/70/80", () => {
    expect(breakthroughRate(LK, 1, 0)).toBe(70);
    expect(breakthroughRate(LK, 2, 0)).toBe(90);
    expect(breakthroughRate(TC, 1, 0)).toBe(60);
    expect(breakthroughRate(TC, 2, 0)).toBe(70);
    expect(breakthroughRate(TC, 3, 0)).toBe(80);
  });

  it("clamps the pill count and falls with the realm", () => {
    expect(breakthroughRate(LK, 0, 0)).toBe(70);
    expect(breakthroughRate(LK, 9, 0)).toBe(90);
    for (let i = 1; i < BREAKTHROUGHS.length; i++) {
      expect(BREAKTHROUGHS[i]!.baseRatePct).toBeLessThan(BREAKTHROUGHS[i - 1]!.baseRatePct);
      expect(BREAKTHROUGHS[i]!.maxRatePct).toBeLessThan(BREAKTHROUGHS[i - 1]!.maxRatePct);
      expect(BREAKTHROUGHS[i]!.durationMs).toBeGreaterThan(BREAKTHROUGHS[i - 1]!.durationMs);
    }
  });

  it("the overflow bonus adds to the chance and the total is capped", () => {
    expect(breakthroughRate(LK, 1, 15)).toBe(85);
    expect(breakthroughRate(LK, 1, 5)).toBe(75);
    expect(breakthroughRate(LK, 2, 15)).toBe(BREAKTHROUGH_MAX_RATE_PCT);
    expect(breakthroughRate(LK, 1, -3)).toBe(70);
  });

  it("rolls with the injected random source", () => {
    expect(rollBreakthrough(70, () => 0.6999)).toBe(true);
    expect(rollBreakthrough(70, () => 0.7)).toBe(false);
    let ok = 0;
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let i = 0; i < 20000; i++) if (rollBreakthrough(70, rand)) ok++;
    expect(ok / 20000).toBeGreaterThan(0.68);
    expect(ok / 20000).toBeLessThan(0.72);
  });
});

describe("readiness and overflow EXP", () => {
  const need = expToNext(0, 9);
  it("needs stage 9 and a full bar", () => {
    expect(checkBreakthroughReady(0, 8, need)).toEqual({ ok: false, error: "not_ready" });
    expect(checkBreakthroughReady(0, 9, need - 1)).toEqual({ ok: false, error: "not_ready" });
    const r = checkBreakthroughReady(0, 9, need);
    expect(r).toMatchObject({ ok: true, overflowBonus: 0 });
  });

  it("the last realm has nowhere to go", () => {
    const last = REALMS.length - 1;
    expect(checkBreakthroughReady(last, 9, expToNext(last, 9))).toEqual({ ok: false, error: "max_realm" });
  });

  it("EXP keeps filling past the bar at stage 9, up to a whole extra bar", () => {
    const r = applyExp({ realm: 0, stage: 9, exp: need, potentialPoints: 0 }, 10_000_000);
    expect(r.exp).toBe(expCap(0, 9));
    expect(r.exp).toBe(need * 2);
    expect(overflowExp(0, 9, r.exp)).toBe(need);
    expect(applyExp({ realm: 0, stage: 9, exp: need, potentialPoints: 0 }, 5).exp).toBe(need + 5);
  });

  it("below stage 9 nothing overflows into the next stage's bar", () => {
    expect(expCap(0, 8)).toBe(expToNext(0, 8));
    expect(overflowExp(0, 8, 99999)).toBe(0);
  });

  it("the overflow bonus is 0 below half, +5 at half and grows evenly to +15 at a full extra bar", () => {
    expect(overflowBonus(0, 9, need)).toBe(0);
    expect(overflowBonus(0, 9, need + Math.round(need * 0.49))).toBe(0);
    expect(overflowBonus(0, 9, need + Math.round(need * 0.5))).toBe(5);
    expect(overflowBonus(0, 9, need + Math.round(need * 0.75))).toBeCloseTo(10, 1);
    expect(overflowBonus(0, 9, need * 2)).toBe(15);
    expect(overflowBonus(0, 8, 99999)).toBe(0);
    expect(checkBreakthroughReady(0, 9, need * 2)).toMatchObject({ ok: true, overflowBonus: 15 });
    expect(checkBreakthroughReady(0, 9, need)).toMatchObject({ ok: true, overflowBonus: 0 });
  });

  it("starting uses the overflow up", () => {
    expect(expAtStart(0, 9, need * 2)).toBe(need);
    expect(expAtStart(0, 9, need)).toBe(need);
  });
});

describe("failure and reward", () => {
  it("failure leaves 70% of the bar whatever the overflow was, never below zero", () => {
    const need = expToNext(0, 9);
    expect(expAfterFailure(0, 9, need)).toBe(need - Math.round(need * 0.3));
    expect(expAfterFailure(0, 9, need * 2)).toBe(need - Math.round(need * 0.3));
    expect(expAfterFailure(0, 9, 10)).toBe(0);
  });

  it("points grow with root grade and with a special constitution", () => {
    expect(breakthroughPoints(LK, 0, 1, true)).toBe(LK.basePoints);
    expect(breakthroughPoints(LK, 4, 1, true)).toBeGreaterThan(breakthroughPoints(LK, 0, 1, true));
    expect(breakthroughPoints(LK, 0, 2, false)).toBeGreaterThan(breakthroughPoints(LK, 0, 1, false));
    expect(breakthroughPoints(LK, 0, 1, false)).toBeGreaterThan(breakthroughPoints(LK, 0, 1, true));
  });
});

describe("pills", () => {
  it("have an item per step, recognised by their realm", () => {
    for (const b of BREAKTHROUGHS) {
      expect(getItemDef(b.pill)?.breakthroughTo).toBe(b.to);
      expect(pillTargetRealm(b.pill)).toBe(b.to);
    }
    expect(pillTargetRealm("bt_pill_99")).toBeUndefined();
    expect(pillTargetRealm("hoi_huyet_dan")).toBeUndefined();
    expect(breakthroughPillId(1)).toBe("bt_pill_1");
  });

  it("drop rarer for higher realms and for weaker monsters, one roll each", () => {
    let draws = 0;
    const low = () => (draws++, 0.0001);
    expect(rollPillDrop(0, "normal", low)).toBe("bt_pill_1");
    expect(draws).toBe(1);
    expect(rollPillDrop(0, "normal", () => 0.9)).toBeNull();
    expect(rollPillDrop(3, "rare2", () => 0)).toBeNull(); // no step from the last realm
    // a roll that passes at Luyện Khí fails at Kim Đan
    expect(rollPillDrop(0, "normal", () => 0.003)).toBe("bt_pill_1");
    expect(rollPillDrop(2, "normal", () => 0.003)).toBeNull();
  });
});

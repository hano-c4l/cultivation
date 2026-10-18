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
  hasOverflowBonus,
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
    expect(breakthroughRate(LK, 1, false)).toBe(70);
    expect(breakthroughRate(LK, 2, false)).toBe(90);
    expect(breakthroughRate(TC, 1, false)).toBe(60);
    expect(breakthroughRate(TC, 2, false)).toBe(70);
    expect(breakthroughRate(TC, 3, false)).toBe(80);
  });

  it("clamps the pill count and falls with the realm", () => {
    expect(breakthroughRate(LK, 0, false)).toBe(70);
    expect(breakthroughRate(LK, 9, false)).toBe(90);
    for (let i = 1; i < BREAKTHROUGHS.length; i++) {
      expect(BREAKTHROUGHS[i]!.baseRatePct).toBeLessThan(BREAKTHROUGHS[i - 1]!.baseRatePct);
      expect(BREAKTHROUGHS[i]!.maxRatePct).toBeLessThan(BREAKTHROUGHS[i - 1]!.maxRatePct);
      expect(BREAKTHROUGHS[i]!.durationMs).toBeGreaterThan(BREAKTHROUGHS[i - 1]!.durationMs);
    }
  });

  it("the overflow bonus adds 15 points and the total is capped", () => {
    expect(breakthroughRate(LK, 1, true)).toBe(85);
    expect(breakthroughRate(LK, 2, true)).toBe(BREAKTHROUGH_MAX_RATE_PCT);
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
    expect(r).toMatchObject({ ok: true, overflow: false });
  });

  it("the last realm has nowhere to go", () => {
    const last = REALMS.length - 1;
    expect(checkBreakthroughReady(last, 9, expToNext(last, 9))).toEqual({ ok: false, error: "max_realm" });
  });

  it("EXP keeps filling past the bar at stage 9, up to the overflow cap", () => {
    const r = applyExp({ realm: 0, stage: 9, exp: need, potentialPoints: 0 }, 10_000_000);
    expect(r.exp).toBe(expCap(0, 9));
    expect(overflowExp(0, 9, r.exp)).toBe(Math.round(need * 0.5));
    expect(applyExp({ realm: 0, stage: 9, exp: need, potentialPoints: 0 }, 5).exp).toBe(need + 5);
  });

  it("below stage 9 nothing overflows into the next stage's bar", () => {
    expect(expCap(0, 8)).toBe(expToNext(0, 8));
    expect(overflowExp(0, 8, 99999)).toBe(0);
  });

  it("the milestone bonus starts at a quarter of the need", () => {
    expect(hasOverflowBonus(0, 9, need + Math.round(need * 0.25) - 1)).toBe(false);
    expect(hasOverflowBonus(0, 9, need + Math.round(need * 0.25))).toBe(true);
    expect(checkBreakthroughReady(0, 9, need + Math.round(need * 0.25))).toMatchObject({ ok: true, overflow: true });
  });
});

describe("failure and reward", () => {
  it("failure takes 30% of the stage-9 need, never below zero", () => {
    const need = expToNext(0, 9);
    expect(expAfterFailure(0, 9, need)).toBe(need - Math.round(need * 0.3));
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

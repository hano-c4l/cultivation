import { describe, expect, it } from "vitest";
import { parseVitals, restoreVitals, type Vitals } from "./vitals";

const v = (over: Partial<Vitals> = {}): Vitals => ({ hp: 100, mp: 20, at: 1_000_000, cd: {}, buffs: [], ...over });

describe("vitals", () => {
  it("nothing stored means full HP and MP and nothing cooling down", () => {
    expect(restoreVitals(null, 5, 300, 90)).toEqual({ hp: 300, mp: 90, cooldowns: {}, buffs: [] });
  });

  it("a quick reload keeps HP and MP as they were (no regeneration inside the delay)", () => {
    const r = restoreVitals(v(), 1_003_000, 300, 90);
    expect(r.hp).toBe(100);
    expect(r.mp).toBe(20);
  });

  it("time away regenerates like standing still: after the delay, a share of the maximum per second", () => {
    // 5 s delay, then 2% of max per second (at least 1): 10 s after the delay is 20% of 300 = 60 HP, and 2 MP a second of 90.
    const r = restoreVitals(v(), 1_000_000 + 5000 + 10_000, 300, 90);
    expect(r.hp).toBe(100 + 60);
    expect(r.mp).toBe(20 + 10 * Math.max(1, 90 * 0.02));
  });

  it("a long absence ends full, never above the maximum", () => {
    const r = restoreVitals(v(), 1_000_000 + 24 * 3600_000, 300, 90);
    expect(r).toMatchObject({ hp: 300, mp: 90 });
  });

  it("cooldowns that are still running and buffs that have not ended carry over; finished ones do not", () => {
    const r = restoreVitals(v({ cd: { kim_1: 1_004_000, hoi_khi: 1_001_000 }, buffs: [{ skill: "linh_thuan", until: 1_010_000 }, { skill: "cuong_than", until: 1_002_000 }] }), 1_003_000, 300, 90);
    expect(r.cooldowns).toEqual({ kim_1: 1_004_000 });
    expect(r.buffs).toEqual([{ skill: "linh_thuan", until: 1_010_000 }]);
  });

  it("is parsed defensively", () => {
    expect(parseVitals(null)).toBeNull();
    expect(parseVitals("garbage")).toBeNull();
    expect(parseVitals(JSON.stringify({ hp: 0, mp: 5, at: 1 }))).toBeNull(); // dead: fresh
    expect(parseVitals(JSON.stringify({ hp: 50, mp: 5, at: 1, cd: { "bad id!": 5, ok_1: 9 } }))).toMatchObject({ hp: 50, cd: { ok_1: 9 } });
    expect(parseVitals(JSON.stringify({ hp: 50, mp: -3, at: 1 }))!.mp).toBe(0);
  });
});

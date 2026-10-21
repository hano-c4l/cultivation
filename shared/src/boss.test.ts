import { describe, expect, it } from "vitest";
import { bossShares, pickByShare } from "./boss";

const dmg = (o: Record<string, number>) => new Map(Object.entries(o));
const all = () => true;

describe("bossShares", () => {
  it("weights 70% damage and 30% last hit, drops contributions under 10% and shares the rest out", () => {
    // a: 0.7*0.5 = .35; b (killer): 0.7*0.3 + .3 = .51; c: 0.7*0.1 = .07 (dropped); d: 0.
    const r = bossShares(dmg({ a: 50, b: 30, c: 10 }), 100, "b", all);
    expect(r.map((s) => s.id)).toEqual(["a", "b"]);
    expect(r[0]!.share).toBeCloseTo(0.35 / 0.86);
    expect(r[1]!.share).toBeCloseTo(0.51 / 0.86);
    expect(r.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1);
  });

  it("a killer who dealt almost nothing still holds the last-hit 30%", () => {
    const r = bossShares(dmg({ a: 90, b: 1 }), 100, "b", all);
    expect(r.find((s) => s.id === "b")!.share).toBeGreaterThan(0.3);
  });

  it("players who are gone or dead are not counted, and their share is spread over the others", () => {
    const r = bossShares(dmg({ a: 50, b: 50 }), 100, "a", (id) => id !== "b");
    expect(r).toEqual([{ id: "a", share: 1 }]);
  });

  it("nobody eligible pays nobody", () => {
    expect(bossShares(dmg({ a: 100 }), 100, "a", () => false)).toEqual([]);
  });
});

describe("pickByShare", () => {
  it("follows the shares", () => {
    const s = [{ id: "a", share: 0.25 }, { id: "b", share: 0.75 }];
    expect(pickByShare(s, 0.1)).toBe("a");
    expect(pickByShare(s, 0.26)).toBe("b");
    expect(pickByShare(s, 0.999)).toBe("b");
    expect(pickByShare([], 0.5)).toBeNull();
  });
});

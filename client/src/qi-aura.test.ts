import { DEFAULT_THEME } from "@game/shared";
import { describe, expect, it } from "vitest";
import { qiParts, qiSpawnPoint, qiStyleOf } from "./qi-aura";

const colors = DEFAULT_THEME.realmColors;

describe("the qi round a cultivator", () => {
  it("splits the level into realm and stage", () => {
    expect(qiParts(11)).toEqual({ realm: 1, stage: 1 });
    expect(qiParts(39)).toEqual({ realm: 3, stage: 9 });
    expect(qiParts(0)).toEqual({ realm: 0, stage: 1 });
  });

  it("gets stronger with the stage inside a realm and with the realm", () => {
    for (let realm = 0; realm < 4; realm++) {
      for (let stage = 1; stage < 9; stage++) {
        expect(qiStyleOf(realm * 10 + stage + 1, colors).rate).toBeGreaterThan(qiStyleOf(realm * 10 + stage, colors).rate);
      }
    }
    for (let realm = 0; realm < 3; realm++) expect(qiStyleOf((realm + 1) * 10 + 1, colors).rate).toBeGreaterThan(qiStyleOf(realm * 10 + 9, colors).rate);
  });

  it("is a different colour in each realm, and the last stage is the realm's own colour", () => {
    const top = [0, 1, 2, 3].map((r) => qiStyleOf(r * 10 + 9, colors).color);
    expect(new Set(top).size).toBe(4);
    expect(qiStyleOf(9, colors).color).toBe(parseInt(colors[0]!.slice(1), 16));
    expect(qiStyleOf(41, colors).rate).toBeLessThanOrEqual(12); // a realm beyond the colours uses the last one and stays in range
  });

  it("a wisp never starts under the feet and stays near the body", () => {
    for (let i = 0; i < 200; i++) {
      const p = qiSpawnPoint(100, 200, 60);
      expect(p.y).toBeLessThan(195); // above the feet
      expect(p.y).toBeGreaterThan(200 - 60 - 25);
      expect(Math.abs(p.x - 100)).toBeLessThan(25);
    }
  });
});

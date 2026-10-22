import { afterEach, describe, expect, it } from "vitest";
import { parseClientMessage } from "./protocol";
import { resetTuning, setTuning } from "./tuning";
import { TOWN_WORLD_POS, WAYGATE_TOWNS, isWaygateTown, townDistance, waygateDestinations, waygatePrice } from "./waygate";
import { getMap } from "./map";

afterEach(() => resetTuning());

describe("the teleport array", () => {
  it("prices a trip by the distance between the two towns, the same both ways, and lists the other towns only", () => {
    expect(townDistance("town", "town2")).toBe(100);
    expect(waygatePrice("town", "town2")).toBe(waygatePrice("town2", "town"));
    expect(waygatePrice("town", "town2")).toBe(500 + 40 * 100);
    expect(waygateDestinations("town").map((d) => d.map)).toEqual(["town2"]);
    expect(waygateDestinations("town2").map((d) => d.map)).toEqual(["town"]);
  });

  it("a farther town costs more (the tuning sets the rate), and a nearer one less", () => {
    setTuning({ waygate: { base: 100, perUnit: 10 } });
    expect(waygatePrice("town", "town2")).toBe(1100);
    // Distances come from positions: the farther the position the dearer the trip (a third town later is just one more entry).
    expect(Math.hypot(...TOWN_WORLD_POS.town2)).toBeGreaterThan(Math.hypot(...TOWN_WORLD_POS.town));
  });

  it("every main town has exactly one array in its middle, and no other map has one", () => {
    for (const t of WAYGATE_TOWNS) {
      const arrays = getMap(t).npcs.filter((n) => n.kind === "waygate");
      expect(arrays).toHaveLength(1);
      expect(Math.hypot(arrays[0]!.x - (getMap(t).spawn[0] + 0.5), arrays[0]!.y - (getMap(t).spawn[1] + 0.5))).toBeLessThan(1.5);
    }
    expect(getMap("forest").npcs).toHaveLength(0);
    expect(isWaygateTown("forest")).toBe(false);
  });

  it("the client message is only accepted for a main town", () => {
    expect(parseClientMessage(JSON.stringify({ t: "waygate_go", npc: "waygate", to: "town2" }))).toEqual({ t: "waygate_go", npc: "waygate", to: "town2" });
    expect(parseClientMessage(JSON.stringify({ t: "waygate_go", npc: "waygate", to: "forest" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "waygate_go", npc: "waygate" }))).toBeNull();
  });

  it("the tuning group is validated", () => {
    setTuning({ waygate: { base: -5, perUnit: 10 } });
    expect(waygatePrice("town", "town2")).toBe(500 + 40 * 100);
  });
});

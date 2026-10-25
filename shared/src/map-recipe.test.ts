import { afterEach, describe, expect, it } from "vitest";
import { CLUSTERS, GUARDS } from "./monsters";
import { BOSS_SPOTS } from "./boss";
import { CODE_MAP_IDS, MAP_IDS, MAP_REALM, MAP_SIZE, buildFromRecipe, codeMapRecipe, getMap, isMapId, setMapRecipe, startingNpcs, type MapRecipe } from "./map";
import { fullCodeMapRecipe } from "./map-content";

afterEach(() => {
  for (const id of [...MAP_IDS]) setMapRecipe(null, id);
});

describe("map recipes", () => {
  for (const id of CODE_MAP_IDS) {
    it(`${id}: the recipe, after a trip through JSON, builds the identical map`, () => {
      const code = getMap(id);
      const recipe = JSON.parse(JSON.stringify(codeMapRecipe(id))) as MapRecipe;
      const rebuilt = buildFromRecipe(recipe);
      expect(rebuilt.collision.length).toBe(code.collision.length);
      expect(rebuilt.collision.every((c, i) => c === code.collision[i])).toBe(true);
      for (const key of ["id", "width", "height", "rect", "home", "palette", "spawn", "safe", "realm", "guardRealm", "portals", "npcs"] as const) expect(rebuilt[key], key).toEqual(code[key]);
      expect(rebuilt.ops).toEqual(code.ops);
    });
  }

  it("records each public step once (a scatter is one step, not one per disc)", () => {
    const ops = codeMapRecipe("forest").ops;
    expect(ops.filter((o) => o.op === "scatter").length).toBe(1);
    expect(ops.filter((o) => o.op === "frame").length).toBe(1);
    expect(ops.at(-1)?.op).toBe("clip");
  });

  it("an installed recipe replaces the map and removing it brings the code's map back", () => {
    const code = getMap("forest");
    const recipe = codeMapRecipe("forest");
    recipe.palette = { ...recipe.palette, groundA: 0x123456 };
    recipe.ops = recipe.ops.filter((o) => o.op !== "scatter");
    setMapRecipe(recipe);
    expect(getMap("forest").palette.groundA).toBe(0x123456);
    expect(getMap("forest").collision.reduce((n, c) => n + c, 0)).toBeGreaterThan(code.collision.reduce((n, c) => n + c, 0)); // no trees: more ground
    setMapRecipe(null, "forest");
    expect(getMap("forest").palette.groundA).toBe(code.palette.groundA);
  });

  it("the content taken from the code equals the tables the game reads, after a trip through JSON", () => {
    for (const id of CODE_MAP_IDS) {
      const recipe = JSON.parse(JSON.stringify(fullCodeMapRecipe(id))) as MapRecipe;
      expect(recipe.content!.groups).toEqual((CLUSTERS[id] ?? []).map((g) => ({ tier: g.tier, kind: g.kind, x: g.x, y: g.y, radius: g.radius, count: g.count })));
      expect(recipe.content!.guards).toEqual((GUARDS[id] ?? []).map((g) => [g[0], g[1]]));
      expect(recipe.content!.bossSpot).toEqual(BOSS_SPOTS[id] ? [BOSS_SPOTS[id]![0], BOSS_SPOTS[id]![1]] : null);
    }
  });

  it("a recipe with content replaces the groups, the guards and the boss spot of its map; removing it brings the code's back", () => {
    const codeGroups = CLUSTERS.forest!;
    const recipe = fullCodeMapRecipe("forest");
    recipe.content = { groups: [{ tier: 1, kind: "soi_rung", x: 30, y: 30, radius: 2, count: 3 }], guards: [[31, 31]], bossSpot: [40, 40] };
    setMapRecipe(recipe);
    expect(CLUSTERS.forest).toHaveLength(1);
    expect(GUARDS.forest).toEqual([[31, 31]]);
    expect(BOSS_SPOTS.forest).toEqual([40, 40]);
    setMapRecipe(null, "forest");
    expect(CLUSTERS.forest).toEqual(codeGroups);
    expect(BOSS_SPOTS.forest).toEqual(fullCodeMapRecipe("forest").content!.bossSpot);
    // a recipe without content is the code's too
    setMapRecipe(codeMapRecipe("forest"));
    expect(CLUSTERS.forest).toEqual(codeGroups);
  });

  it("a map the code does not know registers when its recipe is installed and disappears when it is removed", () => {
    const recipe = { ...fullCodeMapRecipe("forest"), id: "rung_moi" };
    expect(isMapId("rung_moi")).toBe(false);
    setMapRecipe(recipe);
    expect(isMapId("rung_moi")).toBe(true);
    expect(MAP_SIZE.rung_moi).toBe(recipe.size);
    expect(MAP_REALM.rung_moi).toBe(0);
    expect(CLUSTERS.rung_moi).toHaveLength(recipe.content!.groups.length);
    expect(getMap("rung_moi").collision.length).toBe(getMap("forest").collision.length);
    expect(getMap("rung_moi").npcs).toEqual([]);
    // the seeds of the NPC table come from the code's maps only: with an admin map installed they must still be built (they threw, and no NPC loaded at all)
    expect(() => startingNpcs()).not.toThrow();
    expect(startingNpcs().every((n) => (CODE_MAP_IDS as readonly string[]).includes(n.mapId))).toBe(true);
    setMapRecipe(null, "rung_moi");
    expect(isMapId("rung_moi")).toBe(false);
    expect(MAP_SIZE.rung_moi).toBeUndefined();
    expect(CLUSTERS.rung_moi).toBeUndefined();
    expect(BOSS_SPOTS.rung_moi).toBeUndefined();
  });
});

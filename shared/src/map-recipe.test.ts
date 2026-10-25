import { afterEach, describe, expect, it } from "vitest";
import { MAP_IDS, buildFromRecipe, codeMapRecipe, getMap, setMapRecipe, type MapRecipe } from "./map";

afterEach(() => {
  for (const id of MAP_IDS) setMapRecipe(null, id);
});

describe("map recipes", () => {
  for (const id of MAP_IDS) {
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
});

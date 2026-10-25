import { describe, expect, it } from "vitest";
import { CODE_MAP_IDS, fullCodeMapRecipe, type CodeMapId } from "./index";
import { mapRouteProblems } from "./map-route";

describe("the route check the map editor runs", () => {
  for (const id of CODE_MAP_IDS) {
    it(`finds nothing wrong with ${id}, which the game itself plays on`, () => {
      expect(mapRouteProblems(fullCodeMapRecipe(id as CodeMapId))).toEqual([]);
    });
  }

  it("names a gate that was walled in", () => {
    const r = fullCodeMapRecipe("forest");
    const far = (q: { x: number; y: number }) => Math.hypot(q.x - r.spawn[0], q.y - r.spawn[1]);
    const p = [...r.portals].sort((a, b) => far(b) - far(a))[0]!; // the gate farthest from the spawn, so walling it in does not wall in the spawn
    const px = p.x + 0.5 - (p.y + 0.5);
    const py = (p.x + 0.5 + (p.y + 0.5) - r.size) / 2;
    const ops = [...r.ops];
    const wall = { op: "srect" as const, px0: px - 40, py0: py - 30, px1: px + 40, py1: py + 30, walkable: false };
    ops.splice(ops.length - 1, 0, wall); // before the cut to the playing rectangle, so the gate is inside a solid block
    const problems = mapRouteProblems({ ...r, ops });
    expect(problems.length).toBeGreaterThanOrEqual(1); // the block may also cover a boss spot or a group near the gate
    expect(problems.some((t) => t.includes(`cổng (${p.x}, ${p.y})`))).toBe(true);
  });
});

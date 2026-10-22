import { describe, expect, it } from "vitest";
import { BOSS_SPOTS } from "./boss";
import { MAPS_NPC_IDS, MAP_IDS, MAP_REALM, MAP_SIZE, getMap, inPlayRect, isStandable, lineClear, mapPoint, nearestStandablePoint, playRectPixels, portalNear, screenToTile, tileToScreenUnit, type MapData, type Vec2 } from "./map";
import { CAVE_CHAMBERS, FOREST_GLADES, KIMDAN_GLADES, NGUYENANH_GLADES } from "./map";
import { CLUSTERS, GUARDS, clusterSlots, tiersByDistance } from "./monsters";
import { findSmoothPath } from "./pathfinding";

/** A spot the server could put something on: standable ground within `reach` tiles of it, inside the rectangle. */
function ground(map: MapData, p: Vec2, reach: number): Vec2 | null {
  const q = nearestStandablePoint(map, p[0], p[1], reach);
  return q && inPlayRect(map, q[0], q[1]) ? q : null;
}

describe("the screen rectangle of a map", () => {
  it("maps tiles to screen units and back, and the grid holds the rectangle", () => {
    for (const id of MAP_IDS) {
      const map = getMap(id);
      expect(map.width).toBe(map.height);
      expect(map.width).toBeGreaterThanOrEqual(map.rect.halfW + 2 * map.rect.halfH);
      const [x, y] = screenToTile(map.width, 7, -3);
      const [px, py] = tileToScreenUnit(map.width, x, y);
      expect(px).toBeCloseTo(7);
      expect(py).toBeCloseTo(-3);
      const r = playRectPixels(map);
      expect(r.x1 - r.x0).toBe(map.rect.halfW * 64);
      expect(r.y1 - r.y0).toBe(map.rect.halfH * 64);
    }
  });

  it("the void outside it and its wall band are blocked, and nothing walkable lies outside", () => {
    for (const id of MAP_IDS) {
      const map = getMap(id);
      let outsideWalkable = 0;
      for (let cy = 0; cy < map.height * 4; cy++) {
        for (let cx = 0; cx < map.width * 4; cx++) {
          if (map.collision[cy * map.width * 4 + cx] === 1 && !inPlayRect(map, (cx + 0.5) / 4, (cy + 0.5) / 4)) outsideWalkable++;
        }
      }
      expect(outsideWalkable).toBe(0);
    }
  });
});

describe("every map is consistent", () => {
  for (const id of MAP_IDS) {
    const map = getMap(id);
    const reachable = (p: Vec2, what: string) => {
      const q = ground(map, p, 3);
      expect(q, `${id}: ${what} has no standable ground`).not.toBeNull();
      const path = findSmoothPath(map, map.spawn.map((v) => v + 0.5) as Vec2, q!);
      expect(path, `${id}: ${what} is not reachable from the spawn`).not.toBeNull();
      const end = path!.at(-1)!;
      expect(Math.hypot(end[0] - q![0], end[1] - q![1]), `${id}: the route to ${what} stops short`).toBeLessThan(0.6);
      // A complete route: every straight piece of it is clear ground (a search that gave up must not leave a hop through the obstacles).
      for (let i = 1; i < path!.length; i++) expect(lineClear(map, path![i - 1]!, path![i]!), `${id}: the route to ${what} cuts through an obstacle`).toBe(true);
    };

    it(`${id}: spawn, portals, NPCs, monster groups, guards and boss spot are on reachable ground`, () => {
      const spawn: Vec2 = [map.spawn[0] + 0.5, map.spawn[1] + 0.5];
      expect(isStandable(map, spawn[0], spawn[1])).toBe(true);
      expect(inPlayRect(map, spawn[0], spawn[1])).toBe(true);
      for (const p of map.portals) {
        reachable([p.x + 0.5, p.y + 0.5], `portal to ${p.toMap}`);
        const dest = getMap(p.toMap);
        const arrive: Vec2 = [p.toX + 0.5, p.toY + 0.5];
        expect(isStandable(dest, arrive[0], arrive[1]), `${id} -> ${p.toMap}: arrival is not standable`).toBe(true);
        expect(inPlayRect(dest, arrive[0], arrive[1])).toBe(true);
        expect(portalNear(dest, arrive[0], arrive[1]), `${id} -> ${p.toMap}: arrival would trigger a portal at once`).toBeUndefined();
      }
      for (const n of map.npcs) reachable([n.x, n.y], `npc ${n.id}`);
      for (const c of CLUSTERS[id]) for (const slot of clusterSlots(c)) reachable(slot, `a monster of the tier ${c.tier} group`);
      for (const g of GUARDS[id]) reachable([g[0], g[1]], "a guard");
      const boss = BOSS_SPOTS[id];
      if (boss) reachable([boss[0], boss[1]], "the boss spot");
    });
  }

  it("mapPoint agrees with screenToTile", () => {
    const m = getMap("forest");
    expect(mapPoint(m, 5, 6)).toEqual(screenToTile(m.width, 5, 6));
  });
});

describe("the world of two towns", () => {
  it("every map has a safe town to go back to, and every town leads somewhere", () => {
    for (const id of MAP_IDS) {
      const map = getMap(id);
      expect(getMap(map.home).safe, `${id} -> ${map.home}`).toBe(true);
      if (map.safe) expect(map.home).toBe(id);
    }
  });

  it("the portals lead back and forth: every portal has one on the other side that returns", () => {
    for (const id of MAP_IDS) {
      for (const p of getMap(id).portals) {
        const back = getMap(p.toMap).portals.some((q) => q.toMap === id);
        expect(back, `${id} -> ${p.toMap} has no way back`).toBe(true);
      }
    }
  });

  it("the Kim Đan and Nguyên Anh maps are reached from the second town, which is reached through the cave", () => {
    expect(getMap("cave").portals.some((p) => p.toMap === "town2")).toBe(true);
    expect(getMap("town2").portals.map((p) => p.toMap).sort()).toEqual(["cave", "kimdan", "nguyenanh"]);
    expect(getMap("kimdan").realm).toBe(2);
    expect(getMap("nguyenanh").realm).toBe(3);
    expect(getMap("town2").npcs.map((n) => n.id).sort()).toEqual(["elder2", "merchant2", "path_dan", "path_kiem", "path_thuat", "smith2", "waygate2"]);
  });
});

describe("what is known without building a map", () => {
  it("the size, realm and NPC id tables agree with the built maps", () => {
    for (const id of MAP_IDS) {
      expect(getMap(id).width, id).toBe(MAP_SIZE[id]);
      expect(getMap(id).realm, id).toBe(MAP_REALM[id]);
    }
    expect([...MAPS_NPC_IDS].sort()).toEqual([...new Set(MAP_IDS.flatMap((id) => getMap(id).npcs.map((n) => n.id)))].sort());
  });
});

describe("the monster groups are spread evenly", () => {
  const sets = { forest: FOREST_GLADES, cave: CAVE_CHAMBERS, kimdan: KIMDAN_GLADES, nguyenanh: NGUYENANH_GLADES } as const;
  for (const [id, spots] of Object.entries(sets)) {
    it(`${id}: no two groups close together and no wide stretch of standable ground without one`, () => {
      const map = getMap(id as keyof typeof sets);
      let closest = Infinity;
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) closest = Math.min(closest, Math.hypot(spots[i]![0] - spots[j]![0], spots[i]![1] - spots[j]![1]));
      expect(closest, "closest pair (screen units)").toBeGreaterThanOrEqual(18);
      let farthest = 0;
      for (let px = -map.rect.halfW + 3; px < map.rect.halfW - 3; px += 4) {
        for (let py = -map.rect.halfH + 3; py < map.rect.halfH - 3; py += 4) {
          const [x, y] = screenToTile(map.width, px, py);
          if (!isStandable(map, x, y)) continue;
          farthest = Math.max(farthest, Math.min(...spots.map(([a, b]) => Math.hypot(a - px, b - py))));
        }
      }
      expect(farthest, "farthest standable ground from a group (screen units)").toBeLessThanOrEqual(40);
    });
  }

  it("the bậc runs from 1 to 9 in even bands by distance from the arrival", () => {
    const tiers = tiersByDistance(FOREST_GLADES, [0, -34]);
    for (let t = 1; t <= 9; t++) expect(tiers.filter((x) => x === t).length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...tiers.map((_, i) => tiers.filter((x) => x === tiers[i]).length))).toBeLessThanOrEqual(3);
  });
});

import { describe, expect, it } from "vitest";
import { MAP_IDS, getMap, isWalkable, portalNear } from "./map";
import { BODY_RADIUS, findPath, findSmoothPath, lineClear, pointClear, positionAlongPath, type Vec2 } from "./pathfinding";
import { validateCharacterName, validateEmail, validatePassword } from "./character";
import { normalizeChatText, parseClientMessage } from "./protocol";

const town = getMap("town");

describe("findPath", () => {
  it("returns a walkable path that avoids blocked tiles", () => {
    const path = findPath(town, [20, 20], [26, 5]);
    expect(path).not.toBeNull();
    for (const [x, y] of path!) expect(isWalkable(town, x, y)).toBe(true);
    expect(path![0]).toEqual([20, 20]);
    expect(path![path!.length - 1]).toEqual([26, 5]);
  });

  it("returns null for a blocked target", () => {
    expect(findPath(town, [20, 20], [26, 10])).toBeNull();
  });

  it("does not cut corners between blocked tiles", () => {
    const path = findPath(town, [17, 17], [19, 19])!;
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1]!;
      const [bx, by] = path[i]!;
      if (ax !== bx && ay !== by) {
        expect(isWalkable(town, bx, ay)).toBe(true);
        expect(isWalkable(town, ax, by)).toBe(true);
      }
    }
  });
});

describe("positionAlongPath", () => {
  it("interpolates and stops at the end", () => {
    const path: Vec2[] = [[0.5, 0.5], [2.5, 0.5]];
    expect(positionAlongPath(path, 250, 4)).toEqual({ x: 1.5, y: 0.5, moving: true });
    expect(positionAlongPath(path, 10_000, 4)).toEqual({ x: 2.5, y: 0.5, moving: false });
  });
});

describe("parseClientMessage", () => {
  it("rejects malformed input", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "move", x: "1.5", y: 2, fx: 0, fy: 0, seq: 1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "join", id: "abcdefgh", name: "a" }))).toBeNull();
  });
  it("accepts a valid move", () => {
    const move = { t: "move", x: 3, y: 4, fx: 1, fy: 2, seq: 7 };
    expect(parseClientMessage(JSON.stringify(move))).toEqual(move);
  });
  it("rejects a move without a start tile or sequence", () => {
    expect(parseClientMessage(JSON.stringify({ t: "move", x: 3, y: 4 }))).toBeNull();
  });
});

describe("validation", () => {
  it("normalizes valid names and accepts Vietnamese diacritics", () => {
    expect(validateCharacterName("  Lý   Tiêu Dao ")).toBe("Lý Tiêu Dao");
    expect(validateCharacterName("A")).toBeNull();
    expect(validateCharacterName("a".repeat(17))).toBeNull();
    expect(validateCharacterName("<script>")).toBeNull();
  });
  it("validates email and password", () => {
    expect(validateEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(validateEmail("not-an-email")).toBeNull();
    expect(validatePassword("short")).toBeNull();
    expect(validatePassword("longenough")).toBe("longenough");
  });
});

describe("maps and portals", () => {
  for (const id of MAP_IDS) {
    it(`${id}: spawn, portals and arrival tiles are walkable and connected`, () => {
      const map = getMap(id);
      expect(isWalkable(map, map.spawn[0], map.spawn[1])).toBe(true);
      for (const p of map.portals) {
        expect(isWalkable(map, p.x, p.y)).toBe(true);
        expect(findPath(map, map.spawn, [p.x, p.y])).not.toBeNull();
        const dest = getMap(p.toMap);
        expect(isWalkable(dest, p.toX, p.toY)).toBe(true);
        // Arrival tile must be connected to the destination's own portals and spawn.
        expect(findPath(dest, [p.toX, p.toY], dest.spawn)).not.toBeNull();
        for (const q of dest.portals) expect(findPath(dest, [p.toX, p.toY], [q.x, q.y])).not.toBeNull();
        // Arriving must not immediately trigger a portal.
        expect(portalNear(dest, p.toX + 0.5, p.toY + 0.5)).toBeUndefined();
      }
    });
  }
  it("every portal has a return portal", () => {
    for (const id of MAP_IDS) {
      for (const p of getMap(id).portals) {
        expect(getMap(p.toMap).portals.some((q) => q.toMap === id)).toBe(true);
      }
    }
  });
});

describe("chat parsing", () => {
  it("normalizes text and rejects empty messages", () => {
    expect(normalizeChatText("  xin   chào\n\tđạo hữu ")).toBe("xin chào đạo hữu");
    expect(normalizeChatText("   ")).toBeNull();
    expect([...(normalizeChatText("a".repeat(500)) ?? "")].length).toBe(120);
    expect(parseClientMessage(JSON.stringify({ t: "chat", text: "chào" }))).toEqual({ t: "chat", text: "chào" });
    expect(parseClientMessage(JSON.stringify({ t: "chat", text: 5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "portal" }))).toEqual({ t: "portal" });
  });
});

describe("free movement", () => {
  const length = (path: Vec2[]) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i]![0], p[1] - path[i]![1]), 0);

  it("goes in one straight segment to the exact click point when the line is clear", () => {
    // The case from the bug report: from (0,0)-ish to (1,3) must be one diagonal, not tile hops.
    const path = findSmoothPath(town, [10.5, 10.5], [11.37, 13.82])!;
    expect(path).toEqual([[10.5, 10.5], [11.37, 13.82]]);
  });

  it("keeps the exact destination instead of snapping to a tile centre", () => {
    const path = findSmoothPath(town, [20.5, 20.5], [26.13, 5.77])!;
    expect(path.at(-1)).toEqual([26.13, 5.77]);
  });

  it("bends only around obstacles, stays clear of blocked tiles and is never longer than the tile path", () => {
    const from: Vec2 = [16.5, 19.5];
    const to: Vec2 = [23.5, 19.5]; // the pillars at (18,18) and (21,18) are in the way of some lines
    const path = findSmoothPath(town, from, to)!;
    for (let i = 1; i < path.length; i++) expect(lineClear(town, path[i - 1]!, path[i]!)).toBe(true);
    const tiles = findPath(town, [16, 19], [23, 19])!;
    expect(length(path)).toBeLessThanOrEqual(length(tiles.map((t) => [t[0] + 0.5, t[1] + 0.5] as Vec2)) + 1e-6);
    expect(path.length).toBeLessThanOrEqual(tiles.length);
  });

  it("routes around the pond with few waypoints", () => {
    const path = findSmoothPath(town, [22.5, 10.5], [32.5, 10.5])!; // pond covers x 24..30, y 8..13
    expect(path.length).toBeGreaterThan(2);
    expect(path.length).toBeLessThan(6);
    for (let i = 1; i < path.length; i++) expect(lineClear(town, path[i - 1]!, path[i]!)).toBe(true);
  });

  it("rejects a blocked destination and moves a wall-hugging one to its tile centre", () => {
    expect(findSmoothPath(town, [20.5, 20.5], [26.5, 10.5])).toBeNull(); // inside the pond
    // The pond's blocked tiles end at x=30, so tile 31 is walkable but x=31.05 is inside the body radius of the edge.
    const path = findSmoothPath(town, [33.5, 8.5], [31.05, 8.5])!;
    expect(path.at(-1)).toEqual([31.5, 8.5]);
  });

  it("clearance checks use the body radius", () => {
    expect(pointClear(town, 24 - BODY_RADIUS - 0.01, 10.5)).toBe(true); // just left of the pond (x >= 24)
    expect(pointClear(town, 24 - BODY_RADIUS + 0.05, 10.5)).toBe(false);
  });

  it("works on the forest map with scattered obstacles (every segment clear, destination exact)", () => {
    const forest = getMap("forest");
    const start: Vec2 = [20.5, 3.5];
    const goal: Vec2 = [44.3, 24.7];
    const path = findSmoothPath(forest, start, goal)!;
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(goal);
    for (let i = 1; i < path.length; i++) expect(lineClear(forest, path[i - 1]!, path[i]!)).toBe(true);
  });
});

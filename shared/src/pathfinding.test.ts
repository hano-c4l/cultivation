import { describe, expect, it } from "vitest";
import { MAP_IDS, getMap, isWalkable, portalNear } from "./map";
import { findPath, positionAlongPath } from "./pathfinding";
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
    const path: [number, number][] = [[0, 0], [2, 0]];
    expect(positionAlongPath(path, 250, 4)).toEqual({ x: 1.5, y: 0.5, moving: true });
    expect(positionAlongPath(path, 10_000, 4)).toEqual({ x: 2.5, y: 0.5, moving: false });
  });
});

describe("parseClientMessage", () => {
  it("rejects malformed input", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "move", x: 1.5, y: 2, fx: 0, fy: 0, seq: 1 }))).toBeNull();
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

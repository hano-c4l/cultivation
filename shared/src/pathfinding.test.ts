import { describe, expect, it } from "vitest";
import { getMap, isWalkable } from "./map";
import { findPath, positionAlongPath } from "./pathfinding";
import { parseClientMessage } from "./protocol";

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
    expect(parseClientMessage(JSON.stringify({ t: "join", id: "x", name: "a" }))).toBeNull();
  });
  it("accepts a valid move", () => {
    const move = { t: "move", x: 3, y: 4, fx: 1, fy: 2, seq: 7 };
    expect(parseClientMessage(JSON.stringify(move))).toEqual(move);
  });
  it("rejects a move without a start tile or sequence", () => {
    expect(parseClientMessage(JSON.stringify({ t: "move", x: 3, y: 4 }))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { validateCharacterName, validateEmail, validatePassword } from "./character";
import {
  BODY_RADIUS,
  CELLS_PER_TILE,
  MAP_IDS,
  getMap,
  isCellWalkable,
  isStandable,
  isWalkable,
  lineClear,
  nearestStandablePoint,
  pointClear,
  pointWalkable,
  portalNear,
  type Vec2,
} from "./map";
import { findNavPath, findSmoothPath, positionAlongPath } from "./pathfinding";
import { normalizeChatText, parseClientMessage } from "./protocol";

const town = getMap("town");
const forest = getMap("forest");

const length = (path: Vec2[]) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i]![0], p[1] - path[i]![1]), 0);
const everySegmentClear = (map: ReturnType<typeof getMap>, path: Vec2[]) =>
  path.slice(1).every((p, i) => lineClear(map, path[i]!, p));

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
    expect(parseClientMessage(JSON.stringify({ t: "move", x: 1.5, y: 2, fx: 0, fy: 0, seq: 1.5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "join", id: "abcdefgh", name: "a" }))).toBeNull();
  });
  it("accepts a valid move with continuous coordinates", () => {
    const move = { t: "move", x: 3.25, y: 4.5, fx: 1.1, fy: 2.7, seq: 7 };
    expect(parseClientMessage(JSON.stringify(move))).toEqual(move);
  });
  it("rejects a move without a start position or sequence", () => {
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

describe("collision grid", () => {
  it("uses sub-tile cells: a round pillar blocks only part of its tile", () => {
    // Pillar disc at (18.5, 18.5) r=0.45: the middle is blocked, the tile corner is open ground.
    expect(pointWalkable(town, 18.5, 18.5)).toBe(false);
    expect(pointWalkable(town, 18.05, 18.05)).toBe(true);
    const blocked = Array.from({ length: CELLS_PER_TILE * CELLS_PER_TILE }, (_, i) =>
      isCellWalkable(town, 18 * CELLS_PER_TILE + (i % CELLS_PER_TILE), 18 * CELLS_PER_TILE + Math.floor(i / CELLS_PER_TILE)),
    ).filter((open) => !open).length;
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(CELLS_PER_TILE * CELLS_PER_TILE);
  });

  it("body radius keeps clearance: clear just outside the pillar, blocked when the body touches it", () => {
    // Pillar edge is at x = 18.5 + 0.45 = 18.95 (cells snap to 0.25); a body centred at 19.30 is clear.
    expect(pointClear(town, 19.3, 18.5)).toBe(true);
    expect(pointClear(town, 19.1, 18.5)).toBe(false);
    expect(isStandable(town, 19.3, 18.5)).toBe(true);
  });

  it("a thin non tile-aligned fence blocks movement across it", () => {
    // Fence at x in [33, 33.3), y in [20, 28.5).
    expect(lineClear(town, [31.5, 24.5], [35.5, 24.5])).toBe(false);
    expect(lineClear(town, [31.5, 29.5], [35.5, 29.5])).toBe(true); // below the fence end
  });

  it("clicks on or next to obstacles resolve to the nearest standable point", () => {
    const p = nearestStandablePoint(town, 18.5, 18.5)!; // inside the pillar
    expect(p).not.toBeNull();
    expect(isStandable(town, p[0], p[1])).toBe(true);
    expect(Math.hypot(p[0] - 18.5, p[1] - 18.5)).toBeLessThan(1.5);
    expect(nearestStandablePoint(town, 27.5, 10.5)).toBeNull(); // middle of the pond, nothing standable nearby
  });
});

describe("free movement", () => {
  it("goes in one straight segment to the exact click point when the line is clear", () => {
    const path = findSmoothPath(town, [10.5, 10.5], [11.37, 13.82])!;
    expect(path).toEqual([[10.5, 10.5], [11.37, 13.82]]);
  });

  it("keeps the exact destination instead of snapping to a tile centre", () => {
    const path = findSmoothPath(town, [20.5, 20.5], [26.13, 5.77])!;
    expect(path.at(-1)).toEqual([26.13, 5.77]);
  });

  it("walks around a round pillar with a short, clear detour", () => {
    const from: Vec2 = [16.5, 18.5];
    const to: Vec2 = [20.5, 18.5]; // the pillar at (18.5, 18.5) is in the way
    const path = findSmoothPath(town, from, to)!;
    expect(path.length).toBeGreaterThan(2);
    expect(path.length).toBeLessThan(6);
    expect(everySegmentClear(town, path)).toBe(true);
    // Hugging a round pillar costs well under a tile hop detour (>= 4.8) on a 4 tile trip.
    expect(length(path)).toBeLessThan(4.9);
  });

  it("routes around the round pond with few waypoints", () => {
    const path = findSmoothPath(town, [21.5, 10.5], [33.5, 10.5])!; // pond disc r=3.6 at (27.5, 10.5)
    expect(path.length).toBeGreaterThan(2);
    expect(path.length).toBeLessThan(8);
    expect(everySegmentClear(town, path)).toBe(true);
  });

  it("rejects a destination deep inside an obstacle", () => {
    expect(findSmoothPath(town, [20.5, 20.5], [27.5, 10.5])).toBeNull();
  });

  it("moves a wall-hugging destination to the nearest standable point", () => {
    const path = findSmoothPath(town, [21.5, 10.5], [23.95, 10.5])!; // right against the pond edge
    const end = path.at(-1)!;
    expect(isStandable(town, end[0], end[1])).toBe(true);
    expect(Math.hypot(end[0] - 23.95, end[1] - 10.5)).toBeLessThan(0.8);
  });

  it("works on the forest map with scattered trees (every segment clear, destination exact)", () => {
    const start: Vec2 = [20.5, 3.5];
    const goal: Vec2 = [44.3, 24.7];
    const path = findSmoothPath(forest, start, goal)!;
    expect(path[0]).toEqual(start);
    expect(path.at(-1)).toEqual(goal);
    expect(everySegmentClear(forest, path)).toBe(true);
  });

  it("finds a route across the whole forest quickly enough for the server and client to run per click", () => {
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) expect(findSmoothPath(forest, [20.5, 3.5], [44.3 + i * 0.01, 24.7])).not.toBeNull();
    const perCall = (performance.now() - t0) / 5;
    expect(perCall).toBeLessThan(150);
  });

  it("nav path cells are all standable", () => {
    const cells = findNavPath(forest, [20.5, 3.5], [44.5, 24.5])!;
    expect(cells.every(([x, y]) => pointClear(forest, x, y, BODY_RADIUS))).toBe(true);
  });
});

describe("maps and portals", () => {
  for (const id of MAP_IDS) {
    it(`${id}: spawn, portals and arrival points are open ground and connected`, () => {
      const map = getMap(id);
      expect(isWalkable(map, map.spawn[0], map.spawn[1])).toBe(true);
      for (const p of map.portals) {
        expect(isWalkable(map, p.x, p.y)).toBe(true);
        expect(findSmoothPath(map, [map.spawn[0] + 0.5, map.spawn[1] + 0.5], [p.x + 0.5, p.y + 0.5])).not.toBeNull();
        const dest = getMap(p.toMap);
        expect(isWalkable(dest, p.toX, p.toY)).toBe(true);
        const arrival: Vec2 = [p.toX + 0.5, p.toY + 0.5];
        expect(findSmoothPath(dest, arrival, [dest.spawn[0] + 0.5, dest.spawn[1] + 0.5])).not.toBeNull();
        for (const q of dest.portals) expect(findSmoothPath(dest, arrival, [q.x + 0.5, q.y + 0.5])).not.toBeNull();
        // Arriving must not immediately trigger a portal.
        expect(portalNear(dest, arrival[0], arrival[1])).toBeUndefined();
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
    // No channel means map chat, so clients cached from before the channels existed keep working.
    expect(parseClientMessage(JSON.stringify({ t: "chat", text: "chào" }))).toEqual({ t: "chat", channel: "map", text: "chào" });
    expect(parseClientMessage(JSON.stringify({ t: "chat", text: 5 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "world", text: "chào" }))).toEqual({ t: "chat", channel: "world", text: "chào" });
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "guild", text: "chào" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "whisper", to: "  Lão Tổ ", text: "chào" }))).toEqual({
      t: "chat",
      channel: "whisper",
      text: "chào",
      to: "Lão Tổ",
    });
    // System announcements parse like any chat; whether the sender may use them is the server's decision.
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "system", text: "bảo trì" }))).toEqual({ t: "chat", channel: "system", text: "bảo trì" });
    // A whisper needs a usable recipient.
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "whisper", text: "chào" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "whisper", to: "   ", text: "chào" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "whisper", to: "x".repeat(40), text: "chào" }))).toBeNull();
    // `to` is ignored outside whispers.
    expect(parseClientMessage(JSON.stringify({ t: "chat", channel: "map", to: "ai đó", text: "chào" }))).toEqual({ t: "chat", channel: "map", text: "chào" });
    expect(parseClientMessage(JSON.stringify({ t: "portal" }))).toEqual({ t: "portal" });
  });
});

describe("bag and mail messages", () => {
  const parse = (m: unknown) => parseClientMessage(JSON.stringify(m));
  it("accepts well-formed bag commands and refuses malformed ones", () => {
    expect(parse({ t: "inv_use", tab: 0, cell: 5 })).toEqual({ t: "inv_use", tab: 0, cell: 5 });
    expect(parse({ t: "inv_use", tab: 0, cell: 128 })).toBeNull(); // past the end of a tab
    expect(parse({ t: "inv_use", tab: 10, cell: 0 })).toBeNull(); // past the largest bag
    expect(parse({ t: "inv_use", tab: -1, cell: 0 })).toBeNull();
    expect(parse({ t: "inv_use", tab: 0.5, cell: 0 })).toBeNull();
    expect(parse({ t: "inv_use", tab: 0 })).toBeNull();
    expect(parse({ t: "inv_drop", tab: 1, cell: 3 })).toEqual({ t: "inv_drop", tab: 1, cell: 3 });
    expect(parse({ t: "inv_drop", tab: 1, cell: 3, qty: 5 })).toEqual({ t: "inv_drop", tab: 1, cell: 3, qty: 5 });
    expect(parse({ t: "inv_drop", tab: 1, cell: 3, qty: 0 })).toBeNull();
    expect(parse({ t: "inv_drop", tab: 1, cell: 3, qty: "5" })).toBeNull();
    expect(parse({ t: "inv_move", from: { tab: 0, cell: 1 }, to: { tab: 1, cell: 2 } })).toEqual({
      t: "inv_move",
      from: { tab: 0, cell: 1 },
      to: { tab: 1, cell: 2 },
    });
    expect(parse({ t: "inv_move", from: { tab: 0, cell: 1 } })).toBeNull();
    expect(parse({ t: "inv_move", from: { tab: 0, cell: 1 }, to: { tab: 0, cell: 999 } })).toBeNull();
    expect(parse({ t: "inv_sort", mode: "rarity" })).toEqual({ t: "inv_sort", mode: "rarity" });
    expect(parse({ t: "inv_sort", mode: "price" })).toBeNull();
    expect(parse({ t: "inv_sort" })).toBeNull();
    expect(parse({ t: "inv_split", tab: 0, cell: 3, qty: 5 })).toEqual({ t: "inv_split", tab: 0, cell: 3, qty: 5 });
    expect(parse({ t: "inv_split", tab: 0, cell: 3, qty: 0 })).toBeNull();
    expect(parse({ t: "inv_split", tab: 0, cell: 3 })).toBeNull();
    expect(parse({ t: "inv_split", tab: 0, cell: 200, qty: 1 })).toBeNull();
    expect(parse({ t: "mail_claim", id: "abc" })).toEqual({ t: "mail_claim", id: "abc" });
    expect(parse({ t: "mail_claim", id: "" })).toBeNull();
    expect(parse({ t: "mail_claim", id: 5 })).toBeNull();
  });
});

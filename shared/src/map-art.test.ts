import { afterEach, describe, expect, it } from "vitest";
import { CELLS_PER_TILE, DEFAULT_TUNING, SMALL_BLOB_CELLS, getMap, guardLookOf, hash2, isCellWalkable, mapArtOf, npcLookOf, obstacleBlobs, obstacleStyleOf, resetTuning, setTuning, validTuningGroup } from "./index";

afterEach(() => resetTuning());

describe("obstacle blobs", () => {
  it("every blocked cell inside the rectangle belongs to exactly one blob and counts add up", () => {
    const map = getMap("forest");
    const { blobs, blobOf } = obstacleBlobs(map);
    const cw = map.width * CELLS_PER_TILE;
    let assigned = 0;
    for (let i = 0; i < blobOf.length; i++) {
      const id = blobOf[i] as number;
      if (id === -1) continue;
      assigned++;
      expect(isCellWalkable(map, i % cw, Math.floor(i / cw))).toBe(false);
    }
    expect(assigned).toBe(blobs.reduce((s, b) => s + b.cells, 0));
    expect(blobs.length).toBeGreaterThan(100); // the forest has hundreds of trees and a rim
  });

  it("separates small spots (trees, rocks) from the large ones (the rim) and gives each a stable variant", () => {
    const { blobs } = obstacleBlobs(getMap("forest"));
    const small = blobs.filter((b) => b.small);
    const large = blobs.filter((b) => !b.small);
    expect(small.length).toBeGreaterThan(50);
    expect(large.length).toBeGreaterThan(0);
    for (const b of small) {
      expect(b.cells).toBeLessThan(SMALL_BLOB_CELLS);
      expect(b.variant).toBeGreaterThanOrEqual(0);
      expect(b.variant).toBeLessThan(4);
    }
    expect(obstacleBlobs(getMap("forest")).blobs.map((b) => b.variant)).toEqual(blobs.map((b) => b.variant));
  });

  it("the hash is deterministic and spreads over the variants", () => {
    expect(hash2(3.5, 7.25)).toBe(hash2(3.5, 7.25));
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(hash2(i * 1.7, i * 0.3) % 4);
    expect(seen.size).toBe(4);
  });
});

describe("map art and NPC looks", () => {
  it("a map without an entry is drawn plain; the defaults style the maps the code builds", () => {
    expect(mapArtOf("no_such_map")).toEqual({ ground: "plain", obstacle: "plain", mix: ["plain"] });
    expect(mapArtOf("forest")).toMatchObject({ ground: "grass", obstacle: "tree" });
    setTuning({ mapArt: { maps: { forest: { ground: "snow", obstacle: "crystal" } } } });
    expect(mapArtOf("forest")).toEqual({ ground: "snow", obstacle: "crystal", mix: ["crystal"] });
  });

  it("an NPC look follows id, then id without its number, then kind; a waygate has none", () => {
    expect(npcLookOf({ id: "elder", kind: "quest" })).toEqual({ body: "male", outfit: "ranger" });
    expect(npcLookOf({ id: "smith2", kind: "smith" })).toEqual({ body: "male", weapon: "riu" }); // by kind: smith has no entry of its own
    expect(npcLookOf({ id: "path_kiem", kind: "quest" })?.weapon).toBe("kiem");
    expect(npcLookOf({ id: "stranger", kind: "merchant" })).toEqual({ body: "male" });
    expect(npcLookOf({ id: "waygate", kind: "waygate" })).toBeNull();
    setTuning({ npcLooks: { byKind: {}, byId: { smith: { body: "female" } } } });
    expect(npcLookOf({ id: "smith2", kind: "smith" })).toEqual({ body: "female" });
    expect(npcLookOf({ id: "nobody", kind: "quest" })).toEqual({ body: "male" });
  });

  it("a map with a mix draws more than one look, always the same one for the same spot", () => {
    const art = mapArtOf("forest");
    expect(art.mix.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const style = obstacleStyleOf(art, { x: i * 1.7, y: i * 0.9 });
      expect(art.mix).toContain(style);
      expect(obstacleStyleOf(art, { x: i * 1.7, y: i * 0.9 })).toBe(style);
      seen.add(style);
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it("an entry stored before the mix existed gets the default mix of its map; an unknown or plain map stays plain", () => {
    setTuning({ mapArt: { maps: { cave: { ground: "stone", obstacle: "pillar" }, x: { ground: "snow", obstacle: "rock" } } } });
    expect(mapArtOf("cave").mix).toEqual(DEFAULT_TUNING.mapArt.maps.cave?.mix);
    expect(mapArtOf("x").mix).toEqual(["rock"]);
    expect(mapArtOf("nowhere").mix).toEqual(["plain"]);
  });

  it("a guard has a look, big and armed, even when the stored table has none", () => {
    expect(guardLookOf().scale).toBeGreaterThan(1);
    expect(guardLookOf().weapon).toBeTruthy();
    setTuning({ npcLooks: { byKind: {}, byId: {} } });
    expect(guardLookOf()).toEqual(DEFAULT_TUNING.npcLooks.byKind.guard);
  });

  it("validates both groups", () => {
    expect(validTuningGroup("mapArt", DEFAULT_TUNING.mapArt)).toBe(true);
    expect(validTuningGroup("mapArt", { maps: { a: { ground: "lava", obstacle: "tree" } } })).toBe(true);
    expect(validTuningGroup("mapArt", { maps: { a: { ground: "nope", obstacle: "tree" } } })).toBe(false);
    expect(validTuningGroup("mapArt", { maps: { a: { ground: "lava", obstacle: "tree", mix: ["tree", "bush"] } } })).toBe(true);
    expect(validTuningGroup("mapArt", { maps: { a: { ground: "lava", obstacle: "tree", mix: [] } } })).toBe(false);
    expect(validTuningGroup("mapArt", { maps: { a: { ground: "lava", obstacle: "tree", mix: ["nope"] } } })).toBe(false);
    expect(validTuningGroup("npcLooks", { byKind: { guard: { body: "male", scale: 9 } }, byId: {} })).toBe(false);
    expect(validTuningGroup("mapArt", { maps: { "Bad Key": { ground: "lava", obstacle: "tree" } } })).toBe(false);
    expect(validTuningGroup("npcLooks", DEFAULT_TUNING.npcLooks)).toBe(true);
    expect(validTuningGroup("npcLooks", { byKind: { quest: { body: "alien" } }, byId: {} })).toBe(false);
    expect(validTuningGroup("npcLooks", { byKind: {}, byId: { x: { body: "male", outfit: "Ranger!" } } })).toBe(false);
  });
});

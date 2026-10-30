import { afterEach, describe, expect, it } from "vitest";
import { CELLS_PER_TILE, DEFAULT_TUNING, bigLookOf, SMALL_BLOB_CELLS, getMap, guardLookOf, hash2, isCellWalkable, mapArtOf, flightStyleOf, monsterModelOf, monsterTintOf, MONSTERS, npcLookOf, obstacleBlobs, obstacleStyleOf, resetTuning, setTuning, validTuningGroup } from "./index";

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
    expect(mapArtOf("no_such_map")).toEqual({ ground: "plain", obstacle: "plain", big: "wall", mix: ["plain"] });
    expect(mapArtOf("forest")).toMatchObject({ ground: "grass", obstacle: "tree" });
    setTuning({ mapArt: { maps: { forest: { ground: "snow", obstacle: "crystal" } } } });
    expect(mapArtOf("forest")).toEqual({ ground: "snow", obstacle: "crystal", big: "wall", mix: ["crystal"] });
  });

  it("a map of the game that a stored table does not list is drawn as the code says, and the towns draw their big blocks as houses", () => {
    setTuning({ mapArt: { maps: { forest: { ground: "grass", obstacle: "tree" } } } }); // a table saved before the later maps existed
    expect(mapArtOf("town3")).toMatchObject({ ground: "stone", obstacle: "rock", big: "house" });
    expect(mapArtOf("hoathan").obstacle).toBe("crystal");
    expect(mapArtOf("forest").big).toBe("wall");
    expect(bigLookOf({ big: "house" }, { radius: 3, fill: 0.95 })).toBe("house");
    expect(bigLookOf({ big: "house" }, { radius: 3, fill: 0.79 })).toBe("water"); // a round spot is a pond
    expect(bigLookOf({ big: "house" }, { radius: 6, fill: 0.5 })).toBe("house"); // a building turned on the diamond grid
    expect(bigLookOf({ big: "house" }, { radius: 40, fill: 0.5 })).toBe("wall"); // the rim of the map
    expect(bigLookOf({ big: "wall" }, { radius: 3, fill: 0.95 })).toBe("wall");
  });

  it("an NPC look follows id, then id without its number, then kind; a waygate has none", () => {
    expect(npcLookOf({ id: "elder", kind: "quest" })).toEqual(DEFAULT_TUNING.npcLooks.byId.elder);
    expect(npcLookOf({ id: "smith2", kind: "smith" })).toEqual(DEFAULT_TUNING.npcLooks.byKind.smith); // by kind: smith has no entry of its own
    expect(npcLookOf({ id: "path_kiem", kind: "quest" })?.weapon).toBe("kiem");
    expect(npcLookOf({ id: "stranger", kind: "merchant" })).toEqual(DEFAULT_TUNING.npcLooks.byKind.merchant);
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

  it("a big spot is never a bush or a stump while the mix has other looks", () => {
    const art = mapArtOf("forest");
    for (let i = 0; i < 200; i++) expect(["bush", "stump"]).not.toContain(obstacleStyleOf(art, { x: i * 1.3, y: i * 0.7, radius: 1.4 }));
    expect(obstacleStyleOf({ ground: "grass", obstacle: "tree", mix: ["bush"], big: "wall" }, { x: 1, y: 2, radius: 2 })).toBe("bush");
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

  it("every species has a model and every element a tint, even from a table stored before they existed", () => {
    setTuning({ monsterModels: {} });
    for (const id of Object.keys(MONSTERS).filter((k) => k !== "ve_binh")) expect(monsterModelOf(id), id).toBeTruthy(); // a guard is a player body
    for (const e of ["kim", "moc", "thuy", "hoa", "tho", "loi", "bang", "phong"]) expect(monsterTintOf(e), e).toBeTypeOf("number");
    expect(monsterTintOf("nope")).toBeUndefined();
    expect(validTuningGroup("monsterTints", DEFAULT_TUNING.monsterTints)).toBe(true);
    expect(validTuningGroup("monsterTints", { hoa: "red" })).toBe(false);
  });

  it("a rider has a flight look, validated, even from a table stored before it existed", () => {
    expect(flightStyleOf()).toBe(DEFAULT_TUNING.flightLooks.default);
    setTuning({ flightLooks: { default: "lotus" } });
    expect(flightStyleOf()).toBe("lotus");
    expect(validTuningGroup("flightLooks", DEFAULT_TUNING.flightLooks)).toBe(true);
    expect(validTuningGroup("flightLooks", { default: "jetpack" })).toBe(false);
  });

  it("every NPC and the guard wear a xianxia robe with a colour and a formation circle", () => {
    const looks = [...Object.values(DEFAULT_TUNING.npcLooks.byKind), ...Object.values(DEFAULT_TUNING.npcLooks.byId)];
    for (const l of looks) {
      expect(l.tint, JSON.stringify(l)).toMatch(/^#[0-9a-f]{6}$/);
      expect(l.aura, JSON.stringify(l)).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(validTuningGroup("npcLooks", { byKind: { quest: { body: "male", tint: "green" } }, byId: {} })).toBe(false);
    expect(validTuningGroup("npcLooks", { byKind: { quest: { body: "male", tint: "#aabbcc", aura: "#112233" } }, byId: {} })).toBe(true);
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

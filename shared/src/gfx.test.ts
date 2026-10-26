import { describe, expect, it } from "vitest";
import { DIRECTION_VECTORS, EMPTY_MANIFEST, GFX_ANIMS, animKey, atlasesForMap, directionOf, frameName, headingAlongPath, validateManifest } from "./gfx";
import type { Vec2 } from "./map";
import shipped from "../../client/public/gfx/manifest.json";
import renderConfig from "../../tools/render/sprite-config.json";
import weaponTable from "../../tools/render/weapons.json";
import { WEAPON_TYPES } from "./equipment-data";

const good = () => ({
  version: 3,
  atlases: { char_base: { image: "char_base.webp", data: "char_base.json" }, forest: { image: "forest.png", data: "forest.json" } },
  sprites: {
    player: {
      atlas: "char_base",
      frame: { w: 96, h: 96 },
      anchor: { x: 48, y: 90 },
      anims: { idle: { frames: 4, fps: 6, loop: true }, run: { frames: 8, fps: 12, loop: true } },
    },
  },
  maps: { "*": ["char_base"], forest: ["forest"] },
});

describe("directionOf", () => {
  it("maps each tile-space heading to its index", () => {
    DIRECTION_VECTORS.forEach(([x, y], i) => expect(directionOf(x, y)).toBe(i));
    expect(directionOf(3, 3)).toBe(0); // the length does not matter
    expect(directionOf(0, 0)).toBeNull();
  });

  it("is split at 22.5 degrees on the ground", () => {
    // Between 0 (45 degrees) and 7 (0 degrees) the border is 22.5 degrees.
    expect(directionOf(Math.cos(0.38), Math.sin(0.38))).toBe(7); // 21.8 degrees
    expect(directionOf(Math.cos(0.41), Math.sin(0.41))).toBe(0); // 23.5 degrees
  });

  it("classifies a walk along a tile axis by the ground, not the screen", () => {
    // Tile (1, 0.5) is 26.6 degrees on the ground: direction 0 side of the border, although on screen it looks like "right-down".
    expect(directionOf(1, 0.5)).toBe(0);
    expect(directionOf(1, 0.3)).toBe(7);
  });
});

describe("headingAlongPath", () => {
  const path: Vec2[] = [
    [0, 0],
    [4, 0],
    [4, 4],
  ];
  it("follows the current segment", () => {
    expect(headingAlongPath(path, 500, 2)).toBe(7);
    expect(headingAlongPath(path, 3000, 2)).toBe(1);
  });
  it("is null when still", () => {
    expect(headingAlongPath(path, 100000, 2)).toBeNull();
    expect(headingAlongPath([[1, 1]], 0, 2)).toBeNull();
  });
});

describe("names", () => {
  it("builds frame and animation keys", () => {
    expect(frameName("run", 3, 5)).toBe("run_3_05");
    expect(animKey("player", "idle", 0)).toBe("player:idle:0");
  });
});

describe("validateManifest", () => {
  it("accepts a good manifest and the empty one", () => {
    const r = validateManifest({ ...good(), sprites: { player: { ...good().sprites.player, head: 65 } } });
    expect(r.ok && r.manifest.sprites.player?.head).toBe(65);
    expect(validateManifest(EMPTY_MANIFEST).ok).toBe(true);
  });

  it("lists the atlases of a map: the common ones and its own", () => {
    const r = validateManifest(good());
    if (!r.ok) throw new Error(r.error);
    expect(atlasesForMap(r.manifest, "forest").sort()).toEqual(["char_base", "forest"]);
    expect(atlasesForMap(r.manifest, "town")).toEqual(["char_base"]);
    expect(atlasesForMap(EMPTY_MANIFEST, "town")).toEqual([]);
  });

  const bad: [string, (m: ReturnType<typeof good>) => unknown][] = [
    ["not an object", () => []],
    ["negative version", (m) => ({ ...m, version: -1 })],
    ["path escaping the folder", (m) => ({ ...m, atlases: { ...m.atlases, evil: { image: "../x.webp", data: "x.json" } } })],
    ["absolute url", (m) => ({ ...m, atlases: { ...m.atlases, evil: { image: "https://x.test/a.webp", data: "x.json" } } })],
    ["wrong extension", (m) => ({ ...m, atlases: { ...m.atlases, evil: { image: "a.svg", data: "x.json" } } })],
    ["sprite on a missing atlas", (m) => ({ ...m, sprites: { p: { ...m.sprites.player, atlas: "nope" } } })],
    ["anchor outside the frame", (m) => ({ ...m, sprites: { p: { ...m.sprites.player, anchor: { x: 200, y: 0 } } } })],
    ["unknown animation", (m) => ({ ...m, sprites: { p: { ...m.sprites.player, anims: { dance: { frames: 1, fps: 1, loop: true } } } } })],
    ["zero frames", (m) => ({ ...m, sprites: { p: { ...m.sprites.player, anims: { idle: { frames: 0, fps: 6, loop: true } } } } })],
    ["map with a missing atlas", (m) => ({ ...m, maps: { forest: ["ghost"] } })],
    ["head taller than the frame", (m) => ({ ...m, sprites: { p: { ...m.sprites.player, head: 500 } } })],
    ["bad sprite key", (m) => ({ ...m, sprites: { "Bad Key": m.sprites.player } })],
  ];
  for (const [name, mutate] of bad) {
    it(`rejects ${name}`, () => {
      expect(validateManifest(mutate(good())).ok).toBe(false);
    });
  }
});

describe("the shipped manifest", () => {
  it("is valid, so a broken manifest can never be deployed", () => {
    const r = validateManifest(shipped);
    if (!r.ok) throw new Error(r.error);
    expect(r.manifest.version).toBeGreaterThanOrEqual(0);
  });
});

describe("the render config", () => {
  it("renders the directions the game reads: the same vectors in the same order", () => {
    expect(renderConfig.directions).toEqual(DIRECTION_VECTORS.map((v) => [...v]));
  });

  it("agrees with the shipped manifest about the frame box and the feet anchor, for every sprite", () => {
    const sprites = (shipped as { sprites: Record<string, { frame: { w: number; h: number }; anchor: { x: number; y: number } }> }).sprites;
    for (const [key, sprite] of Object.entries(sprites)) {
      expect(sprite.frame, key).toEqual({ w: renderConfig.frame, h: renderConfig.frame });
      expect(sprite.anchor, key).toEqual({ x: renderConfig.anchor[0], y: renderConfig.anchor[1] });
    }
  });

  it("asks only for animations the manifest knows, with frames that fit one atlas page", () => {
    const names = Object.keys(renderConfig.anims);
    expect(names.sort()).toEqual([...GFX_ANIMS].sort());
    const total = Object.values(renderConfig.anims).reduce((n, a) => n + a.frames, 0) * renderConfig.directions.length;
    const cols = Math.floor(renderConfig.atlasMaxPx / renderConfig.frame);
    expect(Math.ceil(total / cols) * renderConfig.frame).toBeLessThanOrEqual(renderConfig.atlasMaxPx);
  });
});

describe("bodyOf", () => {
  it("draws a character with the body of the first word of the gender", async () => {
    const { bodyOf } = await import("./gender");
    expect(bodyOf("male")).toBe("male");
    expect(bodyOf("male_wears_female")).toBe("male");
    expect(bodyOf("female")).toBe("female");
    expect(bodyOf("female_wears_male")).toBe("female");
  });
});

describe("the weapon table", () => {
  it("only draws families the game has, and every sprite of the manifest named weapon.<family>.<body> belongs to a known family", () => {
    for (const family of Object.keys(weaponTable.weapons)) expect(WEAPON_TYPES as readonly string[], family).toContain(family);
    for (const key of Object.keys((shipped as { sprites: Record<string, unknown> }).sprites)) {
      const m = /^weapon.([a-z]+).(male|female)$/.exec(key);
      if (m) expect(Object.keys(weaponTable.weapons), key).toContain(m[1]);
    }
  });
});

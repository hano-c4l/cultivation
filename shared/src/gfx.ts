import { positionAlongPath } from "./pathfinding";
import type { Vec2 } from "./map";

/**
 * The sprite manifest (phase 4a): which atlases exist, which sprites they hold and which atlases a map needs. The manifest is a static file shipped with
 * the client (`client/public/gfx/manifest.json`). Which sprite a monster / item / NPC uses is NOT decided here: that mapping is game data and goes through
 * `spriteKeyFor` in the client (D1 override in 4c/4e).
 *
 * Conventions locked here (docs/PHASE4.md "4a"):
 * - Frame box GFX_FRAME_SIZE x GFX_FRAME_SIZE px, anchored at the feet (the anchor is a pixel position in the box).
 * - 8 directions, indexed as in DIRECTION_VECTORS (0 = down the screen, clockwise).
 * - Atlas = Phaser "JSON hash" + one image of at most GFX_ATLAS_MAX_PX on a side; a frame is named by `frameName`.
 */
export const GFX_FRAME_SIZE = 96;
export const GFX_ATLAS_MAX_PX = 2048;
export const GFX_DIRECTIONS = 8;
export const GFX_ANIMS = ["idle", "run", "attack", "thrust", "cast", "hit", "die"] as const;
export type GfxAnimName = (typeof GFX_ANIMS)[number];

/** Atlas id "*" lists the atlases loaded on every map (the players, the common effects). */
export const GFX_ALL_MAPS = "*";

export interface GfxAnim {
  frames: number;
  fps: number;
  loop: boolean;
}

export interface GfxSprite {
  atlas: string;
  /** Size of one frame box in px. */
  frame: { w: number; h: number };
  /** Where the feet are inside the frame box, in px from its top-left corner. */
  anchor: { x: number; y: number };
  /** How many px the top of the head is above the feet, at scale 1: where the name goes (the anchor's height when omitted). */
  head?: number;
  /** Draw scale on screen (1 when omitted). */
  scale?: number;
  anims: Partial<Record<GfxAnimName, GfxAnim>>;
}

export interface GfxAtlas {
  /** Paths relative to the manifest's folder. */
  image: string;
  data: string;
}

export interface GfxManifest {
  /** Bumped on every change so browsers do not keep an old atlas. */
  version: number;
  atlases: Record<string, GfxAtlas>;
  sprites: Record<string, GfxSprite>;
  /** Map id (or GFX_ALL_MAPS) -> the atlases that map needs. */
  maps: Record<string, string[]>;
}

export const EMPTY_MANIFEST: GfxManifest = { version: 0, atlases: {}, sprites: {}, maps: {} };

/**
 * The tile-space heading of each direction index. Ground (tile) space, not screen pixels: the renderer turns the model in 45-degree steps on the
 * ground, and on screen those steps are not evenly spaced (tile (1,0) is only 26.6 degrees below horizontal). 0 is straight down the screen.
 */
export const DIRECTION_VECTORS: readonly Vec2[] = [
  [1, 1], // 0 down
  [0, 1], // 1 down-left
  [-1, 1], // 2 left
  [-1, 0], // 3 up-left
  [-1, -1], // 4 up
  [0, -1], // 5 up-right
  [1, -1], // 6 right
  [1, 0], // 7 down-right
];

/** The direction index (0-7) of a movement of (dx, dy) tiles; null when there is no movement. */
export function directionOf(dx: number, dy: number): number | null {
  if (Math.hypot(dx, dy) < 1e-6) return null;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const idx = Math.round((deg - 45) / 45);
  return ((idx % GFX_DIRECTIONS) + GFX_DIRECTIONS) % GFX_DIRECTIONS;
}

/** The direction an actor is heading along its path right now (the current segment, so a decaying visual offset never flips it); null when still. */
export function headingAlongPath(path: readonly Vec2[], elapsedMs: number, speed: number): number | null {
  const a = positionAlongPath(path, elapsedMs, speed);
  if (!a.moving) return null;
  const b = positionAlongPath(path, elapsedMs + 80, speed);
  return directionOf(b.x - a.x, b.y - a.y);
}

/** The name of a frame inside an atlas: `run_3_05` is the animation `run`, direction 3, frame 5. */
export function frameName(anim: GfxAnimName, dir: number, index: number): string {
  return `${anim}_${dir}_${String(index).padStart(2, "0")}`;
}

/** The Phaser animation key of one sprite, animation and direction. */
export function animKey(spriteKey: string, anim: GfxAnimName, dir: number): string {
  return `${spriteKey}:${anim}:${dir}`;
}

/** The atlases a map needs: those every map needs plus its own. */
export function atlasesForMap(manifest: GfxManifest, mapId: string): string[] {
  const ids = new Set<string>([...(manifest.maps[GFX_ALL_MAPS] ?? []), ...(manifest.maps[mapId] ?? [])]);
  return [...ids].filter((id) => manifest.atlases[id] !== undefined);
}

const ID = /^[a-z0-9_]{1,40}$/;
const SPRITE_KEY = /^[a-z0-9_.]{1,60}$/;
const MAP_KEY = /^(\*|[a-z0-9_]{1,40})$/;
/** A relative path with no way out of the folder and no scheme (so a manifest can never point the loader at another origin). */
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,80}\.(webp|png|json)$/;
const MAX_ENTRIES = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

export type ManifestResult = { ok: true; manifest: GfxManifest } | { ok: false; error: string };

/** Checks (and copies) a parsed manifest. The first problem found is returned; a client then ignores the whole manifest. */
export function validateManifest(raw: unknown): ManifestResult {
  const fail = (error: string): ManifestResult => ({ ok: false, error });
  if (!isObj(raw)) return fail("manifest is not an object");
  if (!isInt(raw.version, 0, 2 ** 31)) return fail("version");
  if (!isObj(raw.atlases) || !isObj(raw.sprites) || !isObj(raw.maps)) return fail("atlases, sprites and maps must be objects");
  if (Object.keys(raw.atlases).length > MAX_ENTRIES || Object.keys(raw.sprites).length > MAX_ENTRIES) return fail("too many entries");

  const atlases: Record<string, GfxAtlas> = {};
  for (const [id, a] of Object.entries(raw.atlases)) {
    if (!ID.test(id)) return fail(`atlas id ${id}`);
    if (!isObj(a) || typeof a.image !== "string" || typeof a.data !== "string") return fail(`atlas ${id}`);
    if (!SAFE_PATH.test(a.image) || !/\.(webp|png)$/.test(a.image) || !SAFE_PATH.test(a.data) || !a.data.endsWith(".json") || a.image.includes("..") || a.data.includes("..")) {
      return fail(`atlas ${id}: unsafe path`);
    }
    atlases[id] = { image: a.image, data: a.data };
  }

  const sprites: Record<string, GfxSprite> = {};
  for (const [key, s] of Object.entries(raw.sprites)) {
    if (!SPRITE_KEY.test(key)) return fail(`sprite key ${key}`);
    if (!isObj(s) || typeof s.atlas !== "string" || !atlases[s.atlas]) return fail(`sprite ${key}: atlas`);
    const frame = s.frame;
    const anchor = s.anchor;
    if (!isObj(frame) || !isInt(frame.w, 1, GFX_ATLAS_MAX_PX) || !isInt(frame.h, 1, GFX_ATLAS_MAX_PX)) return fail(`sprite ${key}: frame`);
    if (!isObj(anchor) || !isInt(anchor.x, 0, frame.w) || !isInt(anchor.y, 0, frame.h)) return fail(`sprite ${key}: anchor`);
    if (s.head !== undefined && !isInt(s.head, 1, frame.h)) return fail(`sprite ${key}: head`);
    if (s.scale !== undefined && !(typeof s.scale === "number" && s.scale > 0 && s.scale <= 8)) return fail(`sprite ${key}: scale`);
    if (!isObj(s.anims)) return fail(`sprite ${key}: anims`);
    const anims: Partial<Record<GfxAnimName, GfxAnim>> = {};
    for (const [name, an] of Object.entries(s.anims)) {
      if (!(GFX_ANIMS as readonly string[]).includes(name)) return fail(`sprite ${key}: unknown animation ${name}`);
      if (!isObj(an) || !isInt(an.frames, 1, 64) || !isInt(an.fps, 1, 60) || typeof an.loop !== "boolean") return fail(`sprite ${key}: animation ${name}`);
      anims[name as GfxAnimName] = { frames: an.frames, fps: an.fps, loop: an.loop };
    }
    sprites[key] = { atlas: s.atlas, frame: { w: frame.w, h: frame.h }, anchor: { x: anchor.x, y: anchor.y }, ...(s.head !== undefined ? { head: s.head as number } : {}), ...(s.scale !== undefined ? { scale: s.scale as number } : {}), anims };
  }

  const maps: Record<string, string[]> = {};
  for (const [mapId, list] of Object.entries(raw.maps)) {
    if (!MAP_KEY.test(mapId)) return fail(`map key ${mapId}`);
    if (!Array.isArray(list) || list.length > 200) return fail(`map ${mapId}`);
    for (const id of list) if (typeof id !== "string" || !atlases[id]) return fail(`map ${mapId}: unknown atlas ${String(id)}`);
    maps[mapId] = list as string[];
  }
  return { ok: true, manifest: { version: raw.version, atlases, sprites, maps } };
}

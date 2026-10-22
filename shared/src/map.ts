/** Isometric tile size in pixels (2:1 ratio). Locked by the asset spec. */
export const TILE_W = 64;
export const TILE_H = 32;

/**
 * Collision resolution: every tile is split into CELLS_PER_TILE x CELLS_PER_TILE collision cells, so obstacles
 * (trees, pillars, ponds, fences) do not have to be aligned to tiles. Tiles remain the unit of rendering,
 * spawning and portals; movement and collision use the fine grid.
 */
export const CELLS_PER_TILE = 4;

export const MAP_IDS = ["town", "forest", "cave", "town2", "kimdan", "nguyenanh"] as const;
export type MapId = (typeof MAP_IDS)[number];

export function isMapId(value: string): value is MapId {
  return (MAP_IDS as readonly string[]).includes(value);
}

/** A point in continuous tile units: tile (i, j) spans [i, i+1) x [j, j+1), its centre is (i+0.5, j+0.5). */
export type Vec2 = [number, number];

/** Stepping on a portal tile (server-verified) moves the character to `toMap` at `toX,toY`. */
export interface Portal {
  x: number;
  y: number;
  toMap: MapId;
  toX: number;
  toY: number;
}

/** A non-player character standing at a fixed spot. Names and talk live in the client locale. */
export interface NpcSpot {
  id: string;
  /** What the NPC does: sells and buys (merchant), gives quests (quest), upgrades gear (smith) or carries one to another town (waygate: a teleport array drawn on the ground, nothing to stand beside). */
  kind: "merchant" | "quest" | "smith" | "waygate";
  /** Position in tile units (continuous). */
  x: number;
  y: number;
}

/** How close (tiles) a player must be for the server to accept a command to an NPC. */
export const NPC_INTERACT_RADIUS = 3;

/**
 * The playable area is a rectangle ON SCREEN (the isometric view of the square tile grid would be a diamond): `halfW` and `halfH` are its half
 * width and half height in "screen units" of 32 px. A tile (x, y) of a size x size grid lies at screen unit px = x - y (horizontal, 0 at the middle)
 * and py = (x + y - size) / 2 (vertical, 0 at the middle). The grid must hold the rectangle: size >= halfW + 2 * halfH. Cells outside the rectangle
 * are void (blocked, never drawn); a band of wall just inside its edge keeps characters off the border.
 */
export interface PlayRect {
  halfW: number;
  halfH: number;
}

export interface MapData {
  id: MapId;
  /** Size in tiles (the grid is square: width === height). */
  width: number;
  height: number;
  /** The rectangle on screen the map plays in (see PlayRect). */
  rect: PlayRect;
  /** The safe town a character goes back to after dying here (a town maps to itself). */
  home: MapId;
  /** Colours of the ground (the two checker tones) and of the obstacles, 0xRRGGBB. */
  palette: { groundA: number; groundB: number; obstacle: number };
  /** Fine collision grid, row-major, (width * CELLS_PER_TILE) x (height * CELLS_PER_TILE): 1 = walkable, 0 = blocked. */
  collision: Uint8Array;
  spawn: [number, number];
  /** Safe maps disable PvP (phase 2) and monster spawns. */
  safe: boolean;
  /** Cultivation realm the map is meant for (index into REALMS); null for the safe town. Monsters scale from it. */
  realm: number | null;
  /** A safe town's guards are built as if for this realm's maps (they stand at the gates of the maps around it). */
  guardRealm?: number;
  portals: Portal[];
  npcs: NpcSpot[];
}

/** Distance (tiles) within which the server accepts a portal activation. */
export const PORTAL_RADIUS = 1.2;
/** Collision radius of a character in tiles. Paths keep this much clearance from blocked cells. */
export const BODY_RADIUS = 0.25;
/** Slack between the radius used for planning and the one used to validate standing positions (2-decimal rounding). */
export const CLEAR_TOLERANCE = 0.02;

/** Tile position (continuous) of the screen unit (px, py) on a square grid of `size` tiles: the inverse of the mapping in PlayRect. */
export function screenToTile(size: number, px: number, py: number): Vec2 {
  return [(size + 2 * py + px) / 2, (size + 2 * py - px) / 2];
}

/** Screen unit (px, py) of a tile position on a square grid of `size` tiles. */
export function tileToScreenUnit(size: number, x: number, y: number): Vec2 {
  return [x - y, (x + y - size) / 2];
}

/** Tile position of the screen unit (px, py) on a map. */
export function mapPoint(map: { width: number }, px: number, py: number): Vec2 {
  return screenToTile(map.width, px, py);
}

/** Whether a position lies inside the map's rectangle (the void outside it is blocked and never drawn). */
export function inPlayRect(map: MapData, x: number, y: number): boolean {
  const [px, py] = tileToScreenUnit(map.width, x, y);
  return Math.abs(px) <= map.rect.halfW && Math.abs(py) <= map.rect.halfH;
}

/** The map's rectangle in world pixels as the renderer lays it out (the tile (x, y) is drawn at ((x - y) * TILE_W / 2, (x + y) * TILE_H / 2)). */
export function playRectPixels(map: MapData): { x0: number; y0: number; x1: number; y1: number } {
  const unit = TILE_W / 2;
  const cy = (map.width * TILE_H) / 2;
  return { x0: -map.rect.halfW * unit, y0: cy - map.rect.halfH * unit, x1: map.rect.halfW * unit, y1: cy + map.rect.halfH * unit };
}

/** Walkability of one fine collision cell; outside the map counts as blocked. */
export function isCellWalkable(map: MapData, cx: number, cy: number): boolean {
  const cw = map.width * CELLS_PER_TILE;
  if (cx < 0 || cy < 0 || cx >= cw || cy >= map.height * CELLS_PER_TILE) return false;
  return map.collision[cy * cw + cx] === 1;
}

/** Walkability of the infinitely small point (x, y) in tile units. */
export function pointWalkable(map: MapData, x: number, y: number): boolean {
  return isCellWalkable(map, Math.floor(x * CELLS_PER_TILE), Math.floor(y * CELLS_PER_TILE));
}

/** True when a body of `radius` centred on (x, y) overlaps only walkable cells. */
export function pointClear(map: MapData, x: number, y: number, radius = BODY_RADIUS): boolean {
  const eps = 1e-9;
  const x0 = Math.floor((x - radius + eps) * CELLS_PER_TILE);
  const x1 = Math.floor((x + radius - eps) * CELLS_PER_TILE);
  const y0 = Math.floor((y - radius + eps) * CELLS_PER_TILE);
  const y1 = Math.floor((y + radius - eps) * CELLS_PER_TILE);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (!isCellWalkable(map, cx, cy)) return false;
  return true;
}

/** True when a character may be standing at (x, y): like pointClear but tolerant of coordinate rounding. */
export function isStandable(map: MapData, x: number, y: number): boolean {
  return pointClear(map, x, y, BODY_RADIUS - CLEAR_TOLERANCE);
}

/** Spacing between collision samples along a segment, in tiles (well below a collision cell). */
const SAMPLE_STEP = 0.1;

/** True when the body can slide along the straight segment a -> b without touching a blocked cell. */
export function lineClear(map: MapData, a: Vec2, b: Vec2, radius = BODY_RADIUS): boolean {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(dist / SAMPLE_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!pointClear(map, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, radius)) return false;
  }
  return true;
}

/**
 * The standable point closest to (x, y) within `maxDist` tiles, or null. Used to resolve clicks on or next to
 * obstacles into somewhere the character can actually walk to.
 */
export function nearestStandablePoint(map: MapData, x: number, y: number, maxDist = 1.5): Vec2 | null {
  if (isStandable(map, x, y)) return [x, y];
  const step = 1 / (CELLS_PER_TILE * 2);
  let best: Vec2 | null = null;
  let bestD = maxDist * maxDist;
  const n = Math.ceil(maxDist / step);
  for (let iy = -n; iy <= n; iy++) {
    for (let ix = -n; ix <= n; ix++) {
      const px = x + ix * step;
      const py = y + iy * step;
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < bestD && isStandable(map, px, py)) {
        best = [px, py];
        bestD = d;
      }
    }
  }
  return best;
}

/** True when the tile's centre is open ground (used for spawns, portals and tests). */
export function isWalkable(map: MapData, tx: number, ty: number): boolean {
  return pointClear(map, tx + 0.5, ty + 0.5);
}

/** Small deterministic PRNG so client and server generate identical placeholder maps. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builder for the fine collision grid. All coordinates are tile units (floats allowed) unless a method says "screen". Shapes only use
 * comparisons and +,-,* so every JS engine produces the identical grid (no trig, no pow).
 */
class Grid {
  // Plain fields (no parameter properties) so Node's type-stripping can import this file in tools/.
  readonly width: number;
  readonly height: number;
  readonly cw: number;
  readonly ch: number;
  readonly cells: Uint8Array;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cw = width * CELLS_PER_TILE;
    this.ch = height * CELLS_PER_TILE;
    this.cells = new Uint8Array(this.cw * this.ch).fill(1);
  }
  private setCell(cx: number, cy: number, walkable: boolean): void {
    if (cx >= 0 && cy >= 0 && cx < this.cw && cy < this.ch) this.cells[cy * this.cw + cx] = walkable ? 1 : 0;
  }
  /** Fills every cell whose centre satisfies `inside`, scanning only the given bounding box. */
  private fill(x0: number, y0: number, x1: number, y1: number, walkable: boolean, inside: (px: number, py: number) => boolean): void {
    const cx0 = Math.max(0, Math.floor(x0 * CELLS_PER_TILE));
    const cx1 = Math.min(this.cw - 1, Math.ceil(x1 * CELLS_PER_TILE));
    const cy0 = Math.max(0, Math.floor(y0 * CELLS_PER_TILE));
    const cy1 = Math.min(this.ch - 1, Math.ceil(y1 * CELLS_PER_TILE));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = (cx + 0.5) / CELLS_PER_TILE;
        const py = (cy + 0.5) / CELLS_PER_TILE;
        if (inside(px, py)) this.setCell(cx, cy, walkable);
      }
    }
  }
  /** Rectangle [x0, x1) x [y0, y1) in tile units. */
  rect(x0: number, y0: number, x1: number, y1: number, walkable: boolean): void {
    this.fill(x0, y0, x1, y1, walkable, (px, py) => px >= x0 && px < x1 && py >= y0 && py < y1);
  }
  disc(cx: number, cy: number, r: number, walkable: boolean): void {
    this.fill(cx - r, cy - r, cx + r, cy + r, walkable, (px, py) => (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r);
  }
  /** Rectangle with its four corners cut at 45 degrees by `cut` tiles. */
  chamfered(x0: number, y0: number, x1: number, y1: number, cut: number, walkable: boolean): void {
    this.fill(x0, y0, x1, y1, walkable, (px, py) => {
      if (px < x0 || px >= x1 || py < y0 || py >= y1) return false;
      const dx = Math.min(px - x0, x1 - px);
      const dy = Math.min(py - y0, y1 - py);
      return dx + dy >= cut;
    });
  }
  /** Tile position of a screen unit (see PlayRect). */
  at(px: number, py: number): Vec2 {
    return screenToTile(this.width, px, py);
  }
  /** A rectangle ON SCREEN: screen units [px0, px1) x [py0, py1). */
  srect(px0: number, py0: number, px1: number, py1: number, walkable: boolean): void {
    const corners = [this.at(px0, py0), this.at(px1, py0), this.at(px0, py1), this.at(px1, py1)];
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const size = this.width;
    this.fill(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), walkable, (x, y) => {
      const sx = x - y;
      const sy = (x + y - size) / 2;
      return sx >= px0 && sx < px1 && sy >= py0 && sy < py1;
    });
  }
  /** A blocked disc at a screen position (a pillar, a statue). */
  blockAt(px: number, py: number, r: number): void {
    const [x, y] = this.at(px, py);
    this.disc(x, y, r, false);
  }
  /** Blocks everything outside the rectangle plus a band of `bandX` / `bandY` screen units inside its edge (walls and void). */
  frame(halfW: number, halfH: number, bandX = 2, bandY = 1.5): void {
    const size = this.width;
    this.fill(0, 0, this.width, this.height, false, (x, y) => {
      const sx = x - y;
      const sy = (x + y - size) / 2;
      return !(sx >= -halfW + bandX && sx < halfW - bandX && sy >= -halfH + bandY && sy < halfH - bandY);
    });
  }
  /** Blocks only what lies outside the rectangle (used last, after gates were carved through the wall band). */
  clipToRect(halfW: number, halfH: number): void {
    const size = this.width;
    this.fill(0, 0, this.width, this.height, false, (x, y) => {
      const sx = x - y;
      const sy = (x + y - size) / 2;
      return !(sx >= -halfW && sx < halfW && sy >= -halfH && sy < halfH);
    });
  }
  /** Scatters `count` blocked discs (trees, rocks) of random radius at random, non tile-aligned positions inside the screen rectangle. */
  scatterDiscs(seed: number, count: number, rMin: number, rMax: number, halfW: number, halfH: number): void {
    const rand = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const r = rMin + rand() * (rMax - rMin);
      const px = (rand() * 2 - 1) * (halfW - 3);
      const py = (rand() * 2 - 1) * (halfH - 2);
      this.blockAt(px, py, r);
    }
  }
}

/** The tile (integer coordinates) at screen unit (px, py) of a map of this size: where a portal stands, or where a character arrives. */
function portalTile(size: number, px: number, py: number): { x: number; y: number } {
  const [x, y] = screenToTile(size, px, py);
  return { x: Math.floor(x), y: Math.floor(y) };
}
function spot(size: number, px: number, py: number): [number, number] {
  const t = portalTile(size, px, py);
  return [t.x, t.y];
}

/**
 * Where monster groups stand, in screen units: an even lattice over the map (two rows each side of the road, the outer rows shifted by half a step the
 * way bricks are laid), so no stretch of the map is left empty and no two groups stand close. `skip` leaves out spots that would sit on a lane or a gate.
 * Written as a function so the layout is the same wherever it is read from (the map builder carves a glade at each spot, the monster list stands a group on it).
 */
function latticeGlades(cols: readonly number[], inner: number, outer: number, shift: number, maxPx: number, skip: (px: number, py: number) => boolean = () => false): readonly (readonly [number, number])[] {
  const out: Array<readonly [number, number]> = [];
  for (const py of [-outer, -inner, inner, outer]) {
    // The outer rows are shifted, the upper one to the right and the lower one to the left, so the gaps at the two ends balance out.
    const dx = Math.abs(py) === outer ? (py < 0 ? shift : -shift) : 0;
    for (const c of cols) {
      const px = c + dx;
      if (Math.abs(px) > maxPx || skip(px, py)) continue;
      out.push([px, py]);
    }
  }
  return out;
}

/** Where monster groups stand on each combat map, in screen units (see CLUSTERS in monsters.ts, which gives each its bậc and species by distance from the arrival). */
export const FOREST_GLADES: readonly (readonly [number, number])[] = latticeGlades([-52, -26, 0, 26, 52], 13, 27, 13, 62, (px, py) => py === -13 && px === 0); // the lane from the north gate runs through the middle
export const KIMDAN_GLADES: readonly (readonly [number, number])[] = latticeGlades([-52, -26, 0, 26, 52], 13, 27, 13, 62);
export const NGUYENANH_GLADES: readonly (readonly [number, number])[] = latticeGlades([-54, -27, 0, 27, 54], 14, 29, 13, 66);
export const CAVE_CHAMBERS: readonly (readonly [number, number])[] = [-70, -50, -30, -10, 10, 30, 50, 70].flatMap((px) => [[px, -13], [px, 13]] as const);

const TOWN_RECT: PlayRect = { halfW: 45, halfH: 22.5 };
const TOWN_SIZE = TOWN_RECT.halfW + 2 * TOWN_RECT.halfH;
const FOREST_RECT: PlayRect = { halfW: 75, halfH: 37.5 };
const FOREST_SIZE = FOREST_RECT.halfW + 2 * FOREST_RECT.halfH;
const CAVE_RECT: PlayRect = { halfW: 90, halfH: 25 };
const CAVE_SIZE = CAVE_RECT.halfW + 2 * CAVE_RECT.halfH;
const KIMDAN_RECT: PlayRect = { halfW: 80, halfH: 40 };
const KIMDAN_SIZE = KIMDAN_RECT.halfW + 2 * KIMDAN_RECT.halfH;
const NGUYENANH_RECT: PlayRect = { halfW: 85, halfH: 42.5 };
const NGUYENANH_SIZE = NGUYENANH_RECT.halfW + 2 * NGUYENANH_RECT.halfH;

/** Placeholder maps. Later maps will be authored in Tiled and baked into this same shape. */

/** What both towns share: the first town grid was a 40 x 40 diamond; its layout is kept as it was, moved to the middle of the new grid (tile offset 25). */
const TOWN_OFFSET = 25;
function townGround(g: Grid): void {
  const o = TOWN_OFFSET;
  g.disc(27.5 + o, 10.5 + o, 3.6, false); // round pond
  g.chamfered(8 + o, 22 + o, 15.5 + o, 27.5 + o, 1.0, false); // building with cut corners
  g.chamfered(22 + o, 28 + o, 28.5 + o, 32.5 + o, 0.8, false); // building with cut corners
  for (const [x, y] of [[18.5, 18.5], [21.5, 18.5], [18.5, 21.5], [21.5, 21.5]] as const) g.disc(x + o, y + o, 0.45, false); // pillars
  g.rect(10 + o, 10 + o, 16.5 + o, 10.3 + o, false); // thin fence, not tile aligned
  g.rect(33 + o, 20 + o, 33.3 + o, 28.5 + o, false); // thin fence, not tile aligned
  g.disc(23.5 + o, 17.5 + o, 0.4, false); // the merchant's stall: nobody stands on the NPC
  g.disc(16.5 + o, 17.5 + o, 0.4, false); // the quest giver
  for (const x of [22.5, 25.5, 28.5]) g.disc(x + o, 24.5 + o, 0.4, false); // the three hướng tu masters
  // New ground around it: buildings in the four corners of the rectangle and a few more pillars.
  g.srect(-40, -17, -30, -9, false);
  g.srect(28, -18, 38, -10, false);
  g.srect(-39, 8, -29, 15, false);
  g.srect(30, 9, 40, 16, false);
  for (const [px, py] of [[-12, -14], [12, -14], [-12, 14], [12, 14]] as const) g.blockAt(px, py, 0.6);
}

function buildTown(): MapData {
  const { halfW, halfH } = TOWN_RECT;
  const g = new Grid(TOWN_SIZE, TOWN_SIZE);
  townGround(g);
  const o = TOWN_OFFSET;
  g.frame(halfW, halfH);
  g.srect(-3, 15, 3, halfH, true); // lane to the south gate (through the wall band)
  g.clipToRect(halfW, halfH);
  const gate = portalTile(TOWN_SIZE, 0, 20);
  const arrive = spot(FOREST_SIZE, 0, -34);
  return {
    id: "town",
    width: TOWN_SIZE,
    height: TOWN_SIZE,
    rect: TOWN_RECT,
    home: "town",
    palette: { groundA: 0x3d5a3a, groundB: 0x38553a, obstacle: 0x5a4a3a },
    collision: g.cells,
    spawn: [20 + o, 20 + o],
    safe: true,
    realm: null,
    portals: [{ ...gate, toMap: "forest", toX: arrive[0], toY: arrive[1] }],
    npcs: [
      { id: "merchant", kind: "merchant", x: 23.5 + o, y: 17.5 + o },
      { id: "elder", kind: "quest", x: 16.5 + o, y: 17.5 + o },
      { id: "smith", kind: "smith", x: 15.5 + o, y: 20.5 + o },
      { id: "waygate", kind: "waygate", x: 20.5 + o, y: 20.5 + o },
      { id: "path_kiem", kind: "quest", x: 22.5 + o, y: 24.5 + o },
      { id: "path_thuat", kind: "quest", x: 25.5 + o, y: 24.5 + o },
      { id: "path_dan", kind: "quest", x: 28.5 + o, y: 24.5 + o },
    ],
  };
}

/** The second town, beside the Kim Đan and Nguyên Anh maps: the same ground as the first, a west gate to the cave and two east gates. */
function buildTown2(): MapData {
  const { halfW, halfH } = TOWN_RECT;
  const g = new Grid(TOWN_SIZE, TOWN_SIZE);
  townGround(g);
  const o = TOWN_OFFSET;
  g.frame(halfW, halfH);
  g.srect(-halfW, -3, -14, 3, true); // lane to the west gate (the cave)
  g.srect(14, -11, halfW, -5, true); // lane to the Kim Đan gate
  g.srect(14, 5, halfW, 11, true); // lane to the Nguyên Anh gate
  g.clipToRect(halfW, halfH);
  const west = portalTile(TOWN_SIZE, -43, 0);
  const kim = portalTile(TOWN_SIZE, 43, -8);
  const nguyen = portalTile(TOWN_SIZE, 43, 8);
  const toKim = spot(KIMDAN_SIZE, -76, 0);
  const toNguyen = spot(NGUYENANH_SIZE, -81, 0);
  const toCave = spot(CAVE_SIZE, 84, 0);
  return {
    id: "town2",
    width: TOWN_SIZE,
    height: TOWN_SIZE,
    rect: TOWN_RECT,
    home: "town2",
    palette: { groundA: 0x4a5560, groundB: 0x444f5a, obstacle: 0x6b5a4a },
    collision: g.cells,
    spawn: [20 + o, 20 + o],
    safe: true,
    realm: null,
    guardRealm: 2,
    portals: [
      { ...west, toMap: "cave", toX: toCave[0], toY: toCave[1] },
      { ...kim, toMap: "kimdan", toX: toKim[0], toY: toKim[1] },
      { ...nguyen, toMap: "nguyenanh", toX: toNguyen[0], toY: toNguyen[1] },
    ],
    npcs: [
      { id: "merchant2", kind: "merchant", x: 23.5 + o, y: 17.5 + o },
      { id: "elder2", kind: "quest", x: 16.5 + o, y: 17.5 + o },
      { id: "smith2", kind: "smith", x: 15.5 + o, y: 20.5 + o },
      { id: "waygate2", kind: "waygate", x: 20.5 + o, y: 20.5 + o },
      // The same three masters as the first town, with the same ids: their quests and rewards are the same wherever they stand.
      { id: "path_kiem", kind: "quest", x: 22.5 + o, y: 24.5 + o },
      { id: "path_thuat", kind: "quest", x: 25.5 + o, y: 24.5 + o },
      { id: "path_dan", kind: "quest", x: 28.5 + o, y: 24.5 + o },
    ],
  };
}

function buildForest(): MapData {
  const { halfW, halfH } = FOREST_RECT;
  const g = new Grid(FOREST_SIZE, FOREST_SIZE);
  g.scatterDiscs(1337, 1300, 0.3, 0.55, halfW, halfH); // trees
  g.frame(halfW, halfH);
  g.srect(-8, -halfH, 8, -28, true); // clearing at the north gate (arrival from town)
  g.srect(-2, -halfH, 2, 2, true); // lane south from the gate to the crossroads
  g.srect(-halfW + 3, -2, halfW, 2, true); // the east-west road, to the east gate and the cave
  g.srect(halfW - 8, -6, halfW, 6, true); // clearing at the east gate
  for (const [px, py] of FOREST_GLADES) g.srect(px - 8, py - 5, px + 8, py + 5, true); // a glade under each monster group
  g.clipToRect(halfW, halfH);
  const north = portalTile(FOREST_SIZE, 0, -36);
  const east = portalTile(FOREST_SIZE, 73, 0);
  const fromTown = spot(FOREST_SIZE, 0, -34);
  const toTown = spot(TOWN_SIZE, 0, 18);
  const toCave = spot(CAVE_SIZE, -84, 0);
  return {
    id: "forest",
    width: FOREST_SIZE,
    height: FOREST_SIZE,
    rect: FOREST_RECT,
    home: "town",
    palette: { groundA: 0x3d5a3a, groundB: 0x38553a, obstacle: 0x5a4a3a },
    collision: g.cells,
    spawn: fromTown,
    safe: false,
    realm: 0,
    portals: [
      { ...north, toMap: "town", toX: toTown[0], toY: toTown[1] },
      { ...east, toMap: "cave", toX: toCave[0], toY: toCave[1] },
    ],
    npcs: [],
  };
}

function buildCave(): MapData {
  const { halfW, halfH } = CAVE_RECT;
  const g = new Grid(CAVE_SIZE, CAVE_SIZE);
  g.scatterDiscs(4242, 900, 0.4, 1.0, halfW, halfH); // rocks
  g.frame(halfW, halfH);
  g.srect(-halfW + 3, -4, halfW - 3, 4, true); // main corridor
  g.srect(-halfW, -6, -halfW + 12, 6, true); // clearing at the west gate (arrival from forest)
  g.srect(halfW - 12, -6, halfW, 6, true); // clearing at the east gate (to the second town)
  for (const [px, py] of CAVE_CHAMBERS) {
    g.srect(px - 9, py - 6, px + 9, py + 6, true); // a chamber under each monster group
    g.srect(px - 2, Math.min(py, 0), px + 2, Math.max(py, 0), true); // a passage from the chamber to the corridor
  }
  g.clipToRect(halfW, halfH);
  const west = portalTile(CAVE_SIZE, -88, 0);
  const east = portalTile(CAVE_SIZE, 88, 0);
  const toForest = spot(FOREST_SIZE, 69, 0);
  const toTown2 = spot(TOWN_SIZE, -40, 0);
  const arrive = spot(CAVE_SIZE, -84, 0);
  return {
    id: "cave",
    width: CAVE_SIZE,
    height: CAVE_SIZE,
    rect: CAVE_RECT,
    home: "town",
    palette: { groundA: 0x4a4540, groundB: 0x433e39, obstacle: 0x2e2a28 },
    collision: g.cells,
    spawn: arrive,
    safe: false,
    realm: 1,
    portals: [
      { ...west, toMap: "forest", toX: toForest[0], toY: toForest[1] },
      { ...east, toMap: "town2", toX: toTown2[0], toY: toTown2[1] },
    ],
    npcs: [],
  };
}

/** A big open combat map: a gate on the west edge, a road east along the middle and a glade under each monster group. */
function buildOpenMap(id: "kimdan" | "nguyenanh", rect: PlayRect, size: number, seed: number, obstacles: number, rMin: number, rMax: number, glades: readonly (readonly [number, number])[], realm: number, palette: MapData["palette"]): MapData {
  const { halfW, halfH } = rect;
  const g = new Grid(size, size);
  g.scatterDiscs(seed, obstacles, rMin, rMax, halfW, halfH);
  g.frame(halfW, halfH);
  g.srect(-halfW, -6, -halfW + 14, 6, true); // clearing at the gate (arrival from the town)
  g.srect(-halfW + 3, -2, halfW - 3, 2, true); // the road east along the middle
  for (const [px, py] of glades) g.srect(px - 8, py - 5, px + 8, py + 5, true); // a glade under each monster group
  g.clipToRect(halfW, halfH);
  const gate = portalTile(size, -halfW + 2, 0);
  const toTown = spot(TOWN_SIZE, 40, id === "kimdan" ? -8 : 8);
  return {
    id,
    width: size,
    height: size,
    rect,
    home: "town2",
    palette,
    collision: g.cells,
    spawn: spot(size, -halfW + 6, 0),
    safe: false,
    realm,
    portals: [{ ...gate, toMap: "town2", toX: toTown[0], toY: toTown[1] }],
    npcs: [],
  };
}

/**
 * What is known about a map without building it (building one fills hundreds of thousands of collision cells, so a map is built the first time
 * it is asked for, not when the module loads: every Worker isolate and every page load imports this file).
 */
export const MAP_SIZE: Readonly<Record<MapId, number>> = { town: TOWN_SIZE, forest: FOREST_SIZE, cave: CAVE_SIZE, town2: TOWN_SIZE, kimdan: KIMDAN_SIZE, nguyenanh: NGUYENANH_SIZE };
/** The realm of each map (null for a town), the same as MapData.realm. */
export const MAP_REALM: Readonly<Record<MapId, number | null>> = { town: null, forest: 0, cave: 1, town2: null, kimdan: 2, nguyenanh: 3 };

const BUILDERS: Readonly<Record<MapId, () => MapData>> = {
  town: buildTown,
  forest: buildForest,
  cave: buildCave,
  town2: buildTown2,
  kimdan: () => buildOpenMap("kimdan", KIMDAN_RECT, KIMDAN_SIZE, 7001, 1300, 0.35, 0.8, KIMDAN_GLADES, 2, { groundA: 0x5b3a30, groundB: 0x553529, obstacle: 0x2a1a16 }),
  nguyenanh: () => buildOpenMap("nguyenanh", NGUYENANH_RECT, NGUYENANH_SIZE, 9001, 1400, 0.35, 0.8, NGUYENANH_GLADES, 3, { groundA: 0x3a4f63, groundB: 0x35495c, obstacle: 0x1d2b38 }),
};
const built = new Map<MapId, MapData>();

/** Every NPC id on any map (quests name their giver and talk targets from this set; a test checks it against the maps). */
export const MAPS_NPC_IDS: ReadonlySet<string> = new Set(["merchant", "elder", "smith", "path_kiem", "path_thuat", "path_dan", "merchant2", "elder2", "smith2", "waygate", "waygate2"]);

export function getMap(id: MapId): MapData {
  let map = built.get(id);
  if (!map) built.set(id, (map = BUILDERS[id]()));
  return map;
}

/** The NPC with this id when it is within NPC_INTERACT_RADIUS of a continuous position. */
export function npcNear(map: MapData, id: string, x: number, y: number): NpcSpot | undefined {
  return map.npcs.find((n) => n.id === id && Math.hypot(x - n.x, y - n.y) <= NPC_INTERACT_RADIUS);
}

/** The portal whose tile is within PORTAL_RADIUS of a continuous position, if any. */
export function portalNear(map: MapData, x: number, y: number): Portal | undefined {
  return map.portals.find((p) => Math.hypot(x - (p.x + 0.5), y - (p.y + 0.5)) <= PORTAL_RADIUS);
}

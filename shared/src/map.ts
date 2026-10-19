/** Isometric tile size in pixels (2:1 ratio). Locked by the asset spec. */
export const TILE_W = 64;
export const TILE_H = 32;

/**
 * Collision resolution: every tile is split into CELLS_PER_TILE x CELLS_PER_TILE collision cells, so obstacles
 * (trees, pillars, ponds, fences) do not have to be aligned to tiles. Tiles remain the unit of rendering,
 * spawning and portals; movement and collision use the fine grid.
 */
export const CELLS_PER_TILE = 4;

export const MAP_IDS = ["town", "forest", "cave"] as const;
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
  /** What the NPC does: sells and buys (merchant) or gives quests (quest). */
  kind: "merchant" | "quest";
  /** Position in tile units (continuous). */
  x: number;
  y: number;
}

/** How close (tiles) a player must be for the server to accept a command to an NPC. */
export const NPC_INTERACT_RADIUS = 3;

export interface MapData {
  id: MapId;
  /** Size in tiles. */
  width: number;
  height: number;
  /** Fine collision grid, row-major, (width * CELLS_PER_TILE) x (height * CELLS_PER_TILE): 1 = walkable, 0 = blocked. */
  collision: Uint8Array;
  spawn: [number, number];
  /** Safe maps disable PvP (phase 2) and monster spawns. */
  safe: boolean;
  /** Cultivation realm the map is meant for (index into REALMS); null for the safe town. Monsters scale from it. */
  realm: number | null;
  portals: Portal[];
  npcs: NpcSpot[];
}

/** Distance (tiles) within which the server accepts a portal activation. */
export const PORTAL_RADIUS = 1.2;
/** Collision radius of a character in tiles. Paths keep this much clearance from blocked cells. */
export const BODY_RADIUS = 0.25;
/** Slack between the radius used for planning and the one used to validate standing positions (2-decimal rounding). */
export const CLEAR_TOLERANCE = 0.02;

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
 * Builder for the fine collision grid. All coordinates are tile units (floats allowed). Shapes only use
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
  /** Blocks the outermost ring of tiles. */
  wall(): void {
    this.rect(0, 0, this.width, 1, false);
    this.rect(0, this.height - 1, this.width, this.height, false);
    this.rect(0, 0, 1, this.height, false);
    this.rect(this.width - 1, 0, this.width, this.height, false);
  }
  /** Scatters `count` blocked discs (trees, rocks) of random radius at random, non tile-aligned positions. */
  scatterDiscs(seed: number, count: number, rMin: number, rMax: number): void {
    const rand = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const r = rMin + rand() * (rMax - rMin);
      const x = 1.5 + rand() * (this.width - 3);
      const y = 1.5 + rand() * (this.height - 3);
      this.disc(x, y, r, false);
    }
  }
}

/** Placeholder maps. Later maps will be authored in Tiled and baked into this same shape. */
function buildTown(): MapData {
  const g = new Grid(40, 40);
  g.disc(27.5, 10.5, 3.6, false); // round pond
  g.chamfered(8, 22, 15.5, 27.5, 1.0, false); // building with cut corners
  g.chamfered(22, 28, 28.5, 32.5, 0.8, false); // building with cut corners
  for (const [x, y] of [[18.5, 18.5], [21.5, 18.5], [18.5, 21.5], [21.5, 21.5]] as const) g.disc(x, y, 0.45, false); // pillars
  g.rect(10, 10, 16.5, 10.3, false); // thin fence, not tile aligned
  g.rect(33, 20, 33.3, 28.5, false); // thin fence, not tile aligned
  g.disc(23.5, 17.5, 0.4, false); // the merchant's stall: nobody stands on the NPC
  g.disc(16.5, 17.5, 0.4, false); // the quest giver
  g.wall();
  g.rect(18, 33, 23, 39, true); // lane to the south gate
  return {
    id: "town",
    width: 40,
    height: 40,
    collision: g.cells,
    spawn: [20, 20],
    safe: true,
    realm: null,
    portals: [{ x: 20, y: 38, toMap: "forest", toX: 20, toY: 3 }],
    npcs: [
      { id: "merchant", kind: "merchant", x: 23.5, y: 17.5 },
      { id: "elder", kind: "quest", x: 16.5, y: 17.5 },
    ],
  };
}

function buildForest(): MapData {
  const g = new Grid(48, 48);
  g.scatterDiscs(1337, 260, 0.3, 0.55); // trees
  g.wall();
  g.rect(18, 1, 23, 7, true); // clearing at the north gate (arrival from town)
  g.rect(19, 1, 22, 25, true); // lane south from the gate
  g.rect(3, 23, 47, 26, true); // lane east to the cave
  g.rect(42, 22, 47, 27, true); // clearing at the east gate
  return {
    id: "forest",
    width: 48,
    height: 48,
    collision: g.cells,
    spawn: [20, 3],
    safe: false,
    realm: 0,
    portals: [
      { x: 20, y: 1, toMap: "town", toX: 20, toY: 36 },
      { x: 46, y: 24, toMap: "cave", toX: 3, toY: 20 },
    ],
    npcs: [],
  };
}

function buildCave(): MapData {
  const g = new Grid(40, 30);
  g.scatterDiscs(4242, 110, 0.4, 1.0); // rocks
  g.wall();
  g.rect(1, 18, 39, 23, true); // main corridor
  g.rect(1, 18, 7, 23, true); // clearing at the west gate (arrival from forest)
  return {
    id: "cave",
    width: 40,
    height: 30,
    collision: g.cells,
    spawn: [3, 20],
    safe: false,
    realm: 1,
    portals: [{ x: 1, y: 20, toMap: "forest", toX: 44, toY: 24 }],
    npcs: [],
  };
}

const MAPS: Record<MapId, MapData> = { town: buildTown(), forest: buildForest(), cave: buildCave() };

/** Every NPC id on any map (quests name their giver and talk targets from this set). */
export const MAPS_NPC_IDS: ReadonlySet<string> = new Set(Object.values(MAPS).flatMap((m) => m.npcs.map((n) => n.id)));

export function getMap(id: MapId): MapData {
  return MAPS[id];
}

/** The NPC with this id when it is within NPC_INTERACT_RADIUS of a continuous position. */
export function npcNear(map: MapData, id: string, x: number, y: number): NpcSpot | undefined {
  return map.npcs.find((n) => n.id === id && Math.hypot(x - n.x, y - n.y) <= NPC_INTERACT_RADIUS);
}

/** The portal whose tile is within PORTAL_RADIUS of a continuous position, if any. */
export function portalNear(map: MapData, x: number, y: number): Portal | undefined {
  return map.portals.find((p) => Math.hypot(x - (p.x + 0.5), y - (p.y + 0.5)) <= PORTAL_RADIUS);
}

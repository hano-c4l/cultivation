/** Isometric tile size in pixels (2:1 ratio). Locked by the asset spec. */
export const TILE_W = 64;
export const TILE_H = 32;

export const MAP_IDS = ["town", "forest", "cave"] as const;
export type MapId = (typeof MAP_IDS)[number];

export function isMapId(value: string): value is MapId {
  return (MAP_IDS as readonly string[]).includes(value);
}

/** Stepping on a portal tile (server-verified) moves the character to `toMap` at `toX,toY`. */
export interface Portal {
  x: number;
  y: number;
  toMap: MapId;
  toX: number;
  toY: number;
}

export interface MapData {
  id: MapId;
  width: number;
  height: number;
  /** Row-major walkability grid: 1 = walkable, 0 = blocked. */
  walkable: Uint8Array;
  spawn: [number, number];
  /** Safe maps disable PvP (phase 2) and monster spawns. */
  safe: boolean;
  portals: Portal[];
}

/** Distance (tiles) within which the server accepts a portal activation. */
export const PORTAL_RADIUS = 1.2;

export function isWalkable(map: MapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.walkable[y * map.width + x] === 1;
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

class Grid {
  // Plain fields (no parameter properties) so Node's type-stripping can import this file in tools/.
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Uint8Array(width * height).fill(1);
  }
  set(x: number, y: number, walkable: boolean): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.cells[y * this.width + x] = walkable ? 1 : 0;
  }
  rect(x0: number, y0: number, x1: number, y1: number, walkable: boolean): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, walkable);
  }
  wall(): void {
    this.rect(0, 0, this.width - 1, 0, false);
    this.rect(0, this.height - 1, this.width - 1, this.height - 1, false);
    this.rect(0, 0, 0, this.height - 1, false);
    this.rect(this.width - 1, 0, this.width - 1, this.height - 1, false);
  }
  /** Scatters blocked tiles with the given density using a seeded PRNG. */
  scatter(seed: number, density: number): void {
    const rand = mulberry32(seed);
    for (let y = 1; y < this.height - 1; y++) for (let x = 1; x < this.width - 1; x++) if (rand() < density) this.set(x, y, false);
  }
}

/** Placeholder maps. Later maps will be authored in Tiled and baked into this same shape. */
function buildTown(): MapData {
  const g = new Grid(40, 40);
  g.wall();
  g.rect(24, 8, 30, 13, false); // pond
  g.rect(8, 22, 14, 26, false); // building
  g.rect(22, 28, 27, 31, false); // building
  for (const [x, y] of [[18, 18], [21, 18], [18, 21], [21, 21]] as const) g.set(x, y, false); // pillars
  g.rect(18, 33, 22, 38, true); // lane to the south gate
  return {
    id: "town",
    width: 40,
    height: 40,
    walkable: g.cells,
    spawn: [20, 20],
    safe: true,
    portals: [{ x: 20, y: 38, toMap: "forest", toX: 20, toY: 3 }],
  };
}

function buildForest(): MapData {
  const g = new Grid(48, 48);
  g.scatter(1337, 0.14);
  g.wall();
  g.rect(18, 1, 22, 6, true); // clearing at the north gate (arrival from town)
  g.rect(19, 1, 21, 24, true); // lane south from the gate
  g.rect(3, 23, 46, 25, true); // lane east to the cave
  g.rect(42, 22, 46, 26, true); // clearing at the east gate
  return {
    id: "forest",
    width: 48,
    height: 48,
    walkable: g.cells,
    spawn: [20, 3],
    safe: false,
    portals: [
      { x: 20, y: 1, toMap: "town", toX: 20, toY: 36 },
      { x: 46, y: 24, toMap: "cave", toX: 3, toY: 20 },
    ],
  };
}

function buildCave(): MapData {
  const g = new Grid(40, 30);
  g.scatter(4242, 0.18);
  g.wall();
  g.rect(1, 18, 38, 22, true); // main corridor
  g.rect(1, 18, 6, 22, true); // clearing at the west gate (arrival from forest)
  return {
    id: "cave",
    width: 40,
    height: 30,
    walkable: g.cells,
    spawn: [3, 20],
    safe: false,
    portals: [{ x: 1, y: 20, toMap: "forest", toX: 44, toY: 24 }],
  };
}

const MAPS: Record<MapId, MapData> = { town: buildTown(), forest: buildForest(), cave: buildCave() };

export function getMap(id: MapId): MapData {
  return MAPS[id];
}

/** The portal whose tile is within PORTAL_RADIUS of a continuous position, if any. */
export function portalNear(map: MapData, x: number, y: number): Portal | undefined {
  return map.portals.find((p) => Math.hypot(x - (p.x + 0.5), y - (p.y + 0.5)) <= PORTAL_RADIUS);
}

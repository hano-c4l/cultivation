/** Isometric tile size in pixels (2:1 ratio). Locked by the asset spec. */
export const TILE_W = 64;
export const TILE_H = 32;

export interface MapData {
  id: string;
  width: number;
  height: number;
  /** Row-major walkability grid: 1 = walkable, 0 = blocked. */
  walkable: Uint8Array;
  spawn: [number, number];
}

export const MAP_IDS = ["town"] as const;
export type MapId = (typeof MAP_IDS)[number];

export function isMapId(value: string): value is MapId {
  return (MAP_IDS as readonly string[]).includes(value);
}

export function isWalkable(map: MapData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.walkable[y * map.width + x] === 1;
}

/**
 * Placeholder map generated deterministically so client and server agree.
 * Later maps will be authored in Tiled and baked into this same shape.
 */
function buildTown(): MapData {
  const width = 40;
  const height = 40;
  const walkable = new Uint8Array(width * height).fill(1);
  const block = (x: number, y: number) => {
    walkable[y * width + x] = 0;
  };
  // Outer wall.
  for (let i = 0; i < width; i++) {
    block(i, 0);
    block(i, height - 1);
  }
  for (let j = 0; j < height; j++) {
    block(0, j);
    block(width - 1, j);
  }
  // Pond.
  for (let y = 8; y < 14; y++) for (let x = 24; x < 31; x++) block(x, y);
  // Building blocks with a gap to walk around.
  for (let y = 22; y < 27; y++) for (let x = 8; x < 15; x++) block(x, y);
  for (let y = 28; y < 32; y++) for (let x = 22; x < 28; x++) block(x, y);
  // A few pillars.
  for (const [x, y] of [[18, 18], [21, 18], [18, 21], [21, 21]] as const) block(x, y);
  return { id: "town", width, height, walkable, spawn: [20, 20] };
}

const MAPS: Record<MapId, MapData> = { town: buildTown() };

export function getMap(id: MapId): MapData {
  return MAPS[id];
}

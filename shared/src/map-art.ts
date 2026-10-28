import { CELLS_PER_TILE, inPlayRect, isCellWalkable, type MapData } from "./map";
import { tuning } from "./tuning";

import type { GroundStyle, ObstacleStyle } from "./art-styles";

export interface MapArt {
  ground: GroundStyle;
  obstacle: ObstacleStyle;
}

/** The art of a map, from the tuning `mapArt` (an id without an entry is drawn plain, like a map an admin just made). */
export function mapArtOf(mapId: string): MapArt {
  const entry = tuning().mapArt.maps[mapId];
  return { ground: entry?.ground ?? "plain", obstacle: entry?.obstacle ?? "plain" };
}

/** A blocked spot smaller than this many collision cells (about ten tiles) is a tree, a rock or a pillar; anything larger is a wall, a building or the rim of the map. */
export const SMALL_BLOB_CELLS = 160;

export interface Blob {
  /** Collision cells in it. */
  cells: number;
  /** Where its middle is, in tile units. */
  x: number;
  y: number;
  /** Half of the longer side of its bounding box, in tiles (how big a tree or rock to draw). */
  radius: number;
  small: boolean;
  /** 0..3, picked by a hash of the position: the same spot always looks the same, on every device. */
  variant: number;
}

export interface Obstacles {
  blobs: Blob[];
  /** For each collision cell (row-major like `collision`): the index in `blobs` of the blocked spot it belongs to, or -1 for a walkable cell or the void outside the playable rectangle. */
  blobOf: Int32Array;
}

/** A small deterministic hash of two numbers (for choosing a variant that never changes between loads). */
export function hash2(a: number, b: number): number {
  let h = Math.imul(Math.round(a * 4) | 0, 0x45d9f3b) ^ Math.imul(Math.round(b * 4) | 0, 0x119de1f3);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Splits the blocked collision cells inside the playable rectangle into connected spots (4-neighbour). Small spots become trees or rocks; large ones
 * stay flat walls. It reads the collision grid only, so a map an admin built from the recipe tools gets the same treatment with no extra data.
 */
export function obstacleBlobs(map: MapData): Obstacles {
  const cw = map.width * CELLS_PER_TILE;
  const ch = map.height * CELLS_PER_TILE;
  const blobOf = new Int32Array(cw * ch).fill(-1);
  const blocked = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < cw && y < ch && !isCellWalkable(map, x, y) && inPlayRect(map, (x + 0.5) / CELLS_PER_TILE, (y + 0.5) / CELLS_PER_TILE);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let y0 = 0; y0 < ch; y0++) {
    for (let x0 = 0; x0 < cw; x0++) {
      if (blobOf[y0 * cw + x0] !== -1 || !blocked(x0, y0)) continue;
      const id = blobs.length;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      blobOf[y0 * cw + x0] = id;
      stack.push(x0, y0);
      while (stack.length) {
        const y = stack.pop() as number;
        const x = stack.pop() as number;
        n++;
        sx += x;
        sy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (blobOf[ny * cw + nx] === -1 && blocked(nx, ny)) {
            blobOf[ny * cw + nx] = id;
            stack.push(nx, ny);
          }
        }
      }
      const x = (sx / n + 0.5) / CELLS_PER_TILE;
      const y = (sy / n + 0.5) / CELLS_PER_TILE;
      blobs.push({ cells: n, x, y, radius: Math.max(maxX - minX + 1, maxY - minY + 1) / 2 / CELLS_PER_TILE, small: n < SMALL_BLOB_CELLS, variant: hash2(x, y) % 4 });
    }
  }
  return { blobs, blobOf };
}

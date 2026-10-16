import { isWalkable, type MapData } from "./map";

export type Tile = [number, number];

const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Movement speed in tiles per second (base value, later derived from stats). */
export const BASE_SPEED = 4;

/** A* over the walkability grid, 8-directional, no corner cutting. Returns tiles including start and goal. */
export function findPath(map: MapData, from: Tile, to: Tile): Tile[] | null {
  if (!isWalkable(map, to[0], to[1]) || !isWalkable(map, from[0], from[1])) return null;
  if (from[0] === to[0] && from[1] === to[1]) return [from];

  const w = map.width;
  const key = (x: number, y: number) => y * w + x;
  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - to[0]);
    const dy = Math.abs(y - to[1]);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  // Binary heap of [f, key].
  const heap: Array<[number, number]> = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): [number, number] | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0 && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };

  const startKey = key(from[0], from[1]);
  const goalKey = key(to[0], to[1]);
  g.set(startKey, 0);
  push([heuristic(from[0], from[1]), startKey]);

  while (heap.length > 0) {
    const [, current] = pop()!;
    if (closed.has(current)) continue;
    if (current === goalKey) break;
    closed.add(current);
    const cx = current % w;
    const cy = (current - cx) / w;
    const cg = g.get(current)!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(map, nx, ny)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!isWalkable(map, cx + dx, cy) || !isWalkable(map, cx, cy + dy))) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = cg + (diagonal ? SQRT2 : 1);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, current);
        push([ng + heuristic(nx, ny), nk]);
      }
    }
  }

  if (!parent.has(goalKey)) return null;
  const path: Tile[] = [];
  for (let k: number | undefined = goalKey; k !== undefined; k = parent.get(k)) {
    const x = k % w;
    path.push([x, (k - x) / w]);
  }
  return path.reverse();
}

/** A point in continuous tile units: tile (i, j) spans [i, i+1) x [j, j+1), its center is (i+0.5, j+0.5). */
export type Vec2 = [number, number];

export interface PathPosition {
  /** Continuous position in tile units (tile centers are at integer + 0.5). */
  x: number;
  y: number;
  moving: boolean;
}

/** Interpolated position after `elapsedMs` of walking along `path` (continuous waypoints) at `speed` tiles/second. */
export function positionAlongPath(path: readonly Vec2[], elapsedMs: number, speed: number): PathPosition {
  const first = path[0];
  if (!first) return { x: 0.5, y: 0.5, moving: false };
  let remaining = Math.max(0, (elapsedMs / 1000) * speed);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= len) {
      const t = len === 0 ? 1 : remaining / len;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, moving: true };
    }
    remaining -= len;
  }
  const last = path[path.length - 1]!;
  return { x: last[0], y: last[1], moving: false };
}

/** Collision radius of a character in tiles. Paths keep this much clearance from blocked tiles. */
export const BODY_RADIUS = 0.25;
/** Spacing between collision samples along a segment, in tiles (must be well below BODY_RADIUS). */
const SAMPLE_STEP = 0.1;
/** How many waypoints ahead the smoother looks, bounding its cost on long A* paths. */
const SMOOTH_LOOKAHEAD = 48;

export function tileCenter(tile: Tile): Vec2 {
  return [tile[0] + 0.5, tile[1] + 0.5];
}

/** True when a body of BODY_RADIUS centred on (x, y) overlaps only walkable tiles (checked at its four corners). */
export function pointClear(map: MapData, x: number, y: number, radius = BODY_RADIUS): boolean {
  return (
    isWalkable(map, Math.floor(x - radius), Math.floor(y - radius)) &&
    isWalkable(map, Math.floor(x + radius), Math.floor(y - radius)) &&
    isWalkable(map, Math.floor(x - radius), Math.floor(y + radius)) &&
    isWalkable(map, Math.floor(x + radius), Math.floor(y + radius))
  );
}

/** True when the body can slide along the straight segment a -> b without touching a blocked tile. */
export function lineClear(map: MapData, a: Vec2, b: Vec2, radius = BODY_RADIUS): boolean {
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(dist / SAMPLE_STEP));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!pointClear(map, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, radius)) return false;
  }
  return true;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Free-movement path from an exact position to an exact destination.
 * Goes straight when the line is clear; otherwise runs A* on the tile grid and pulls the string
 * (greedy line-of-sight shortcuts) so the result has as few, as long segments as possible.
 * Returns null when the destination tile is blocked or unreachable.
 */
export function findSmoothPath(map: MapData, from: Vec2, to: Vec2): Vec2[] | null {
  const fromTile: Tile = [Math.floor(from[0]), Math.floor(from[1])];
  const toTile: Tile = [Math.floor(to[0]), Math.floor(to[1])];
  if (!isWalkable(map, toTile[0], toTile[1])) return null;
  // A destination hugging a wall (inside the body radius) is moved to the centre of its tile.
  const end: Vec2 = pointClear(map, to[0], to[1]) ? [round2(to[0]), round2(to[1])] : tileCenter(toTile);
  const start: Vec2 = [round2(from[0]), round2(from[1])];

  if (lineClear(map, start, end)) return start[0] === end[0] && start[1] === end[1] ? [start] : [start, end];

  const tiles = findPath(map, fromTile, toTile);
  if (!tiles) return null;
  // Waypoints: exact start, centres of the intermediate tiles, exact end.
  const points: Vec2[] = [start, ...tiles.slice(1, -1).map(tileCenter), end];

  const out: Vec2[] = [start];
  let i = 0;
  while (i < points.length - 1) {
    let j = Math.min(points.length - 1, i + SMOOTH_LOOKAHEAD);
    // Adjacent A* waypoints are always passable at tile granularity, so j = i + 1 is accepted unconditionally.
    while (j > i + 1 && !lineClear(map, points[i]!, points[j]!)) j--;
    out.push(points[j]!);
    i = j;
  }
  return out;
}

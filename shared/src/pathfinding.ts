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

export interface PathPosition {
  /** Continuous position in tile units (tile centers are at integer + 0.5). */
  x: number;
  y: number;
  moving: boolean;
}

/** Interpolated position after `elapsedMs` of walking along `path` at `speed` tiles/second. */
export function positionAlongPath(path: readonly Tile[], elapsedMs: number, speed: number): PathPosition {
  const first = path[0];
  if (!first) return { x: 0.5, y: 0.5, moving: false };
  let remaining = Math.max(0, (elapsedMs / 1000) * speed);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= len) {
      const t = len === 0 ? 1 : remaining / len;
      return { x: a[0] + (b[0] - a[0]) * t + 0.5, y: a[1] + (b[1] - a[1]) * t + 0.5, moving: true };
    }
    remaining -= len;
  }
  const last = path[path.length - 1]!;
  return { x: last[0] + 0.5, y: last[1] + 0.5, moving: false };
}

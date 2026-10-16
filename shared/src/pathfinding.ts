import {
  BODY_RADIUS,
  CELLS_PER_TILE,
  isStandable,
  lineClear,
  nearestStandablePoint,
  pointClear,
  type MapData,
  type Vec2,
} from "./map";

export type Tile = [number, number];

const SQRT2 = Math.SQRT2;
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Movement speed in tiles per second (base value, later derived from stats). */
export const BASE_SPEED = 4;

export function tileCenter(tile: Tile): Vec2 {
  return [tile[0] + 0.5, tile[1] + 0.5];
}

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

/** Navigation grids per map: a fine cell is navigable when a whole body centred on it is clear of obstacles. */
const navCache = new WeakMap<MapData, Uint8Array>();

function navGrid(map: MapData): Uint8Array {
  let nav = navCache.get(map);
  if (!nav) {
    const cw = map.width * CELLS_PER_TILE;
    const ch = map.height * CELLS_PER_TILE;
    nav = new Uint8Array(cw * ch);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const x = (cx + 0.5) / CELLS_PER_TILE;
        const y = (cy + 0.5) / CELLS_PER_TILE;
        nav[cy * cw + cx] = pointClear(map, x, y, BODY_RADIUS) ? 1 : 0;
      }
    }
    navCache.set(map, nav);
  }
  return nav;
}

/** The navigable cell nearest to a point, searching a few cells around it. Returns [cx, cy] or null. */
function nearestNavCell(map: MapData, nav: Uint8Array, p: Vec2, searchCells = 6): [number, number] | null {
  const cw = map.width * CELLS_PER_TILE;
  const ch = map.height * CELLS_PER_TILE;
  const ox = Math.floor(p[0] * CELLS_PER_TILE);
  const oy = Math.floor(p[1] * CELLS_PER_TILE);
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let dy = -searchCells; dy <= searchCells; dy++) {
    for (let dx = -searchCells; dx <= searchCells; dx++) {
      const cx = ox + dx;
      const cy = oy + dy;
      if (cx < 0 || cy < 0 || cx >= cw || cy >= ch || nav[cy * cw + cx] !== 1) continue;
      const d = ((cx + 0.5) / CELLS_PER_TILE - p[0]) ** 2 + ((cy + 0.5) / CELLS_PER_TILE - p[1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [cx, cy];
      }
    }
  }
  return best;
}

/**
 * A* over the navigation grid (8-directional, no corner cutting). Returns the centres of the cells from the
 * cell nearest `from` to the cell nearest `to`, or null when there is no route.
 */
export function findNavPath(map: MapData, from: Vec2, to: Vec2): Vec2[] | null {
  const nav = navGrid(map);
  const cw = map.width * CELLS_PER_TILE;
  const ch = map.height * CELLS_PER_TILE;
  const s = nearestNavCell(map, nav, from);
  const e = nearestNavCell(map, nav, to);
  if (!s || !e) return null;
  const start = s[1] * cw + s[0];
  const goal = e[1] * cw + e[0];
  const size = cw * ch;

  const g = new Float32Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const gx = e[0];
  const gy = e[1];
  const heuristic = (cx: number, cy: number) => {
    const dx = Math.abs(cx - gx);
    const dy = Math.abs(cy - gy);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  // Binary min-heap on f with parallel arrays.
  const heapF: number[] = [];
  const heapI: number[] = [];
  const push = (f: number, idx: number) => {
    let i = heapF.length;
    heapF.push(f);
    heapI.push(idx);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p]! <= heapF[i]!) break;
      [heapF[p], heapF[i]] = [heapF[i]!, heapF[p]!];
      [heapI[p], heapI[i]] = [heapI[i]!, heapI[p]!];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heapI[0]!;
    const lastF = heapF.pop()!;
    const lastI = heapI.pop()!;
    if (heapF.length > 0) {
      heapF[0] = lastF;
      heapI[0] = lastI;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heapF.length && heapF[l]! < heapF[m]!) m = l;
        if (r < heapF.length && heapF[r]! < heapF[m]!) m = r;
        if (m === i) break;
        [heapF[m], heapF[i]] = [heapF[i]!, heapF[m]!];
        [heapI[m], heapI[i]] = [heapI[i]!, heapI[m]!];
        i = m;
      }
    }
    return top;
  };

  g[start] = 0;
  push(heuristic(s[0], s[1]), start);
  while (heapF.length > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % cw;
    const cy = (cur - cx) / cw;
    const cg = g[cur]!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
      const ni = ny * cw + nx;
      if (nav[ni] !== 1 || closed[ni]) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (nav[cy * cw + nx] !== 1 || nav[ny * cw + cx] !== 1)) continue;
      const ng = cg + (diagonal ? SQRT2 : 1);
      if (ng < g[ni]!) {
        g[ni] = ng;
        parent[ni] = cur;
        push(ng + heuristic(nx, ny), ni);
      }
    }
  }
  if (parent[goal] === -1 && goal !== start) return null;

  const cells: Vec2[] = [];
  for (let i = goal; i !== -1; i = parent[i]!) {
    const cx = i % cw;
    cells.push([(cx + 0.5) / CELLS_PER_TILE, ((i - cx) / cw + 0.5) / CELLS_PER_TILE]);
    if (i === start) break;
  }
  return cells.reverse();
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Drops the middle point of runs that go in the same direction, keeping only the corners of a cell path. */
function corners(cells: Vec2[]): Vec2[] {
  if (cells.length <= 2) return cells;
  const out: Vec2[] = [cells[0]!];
  for (let i = 1; i < cells.length - 1; i++) {
    const a = cells[i - 1]!;
    const b = cells[i]!;
    const c = cells[i + 1]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  out.push(cells[cells.length - 1]!);
  return out;
}

/**
 * Free-movement path from an exact position to an exact destination.
 * - A destination inside or against an obstacle is moved to the nearest standable point (within 1.5 tiles).
 * - Goes straight when the line is clear; otherwise A* on the fine navigation grid, reduced to its corners and
 *   then pulled taut with line-of-sight shortcuts, so the result has as few, as long segments as possible.
 * Returns null when no destination is available nearby or it is unreachable.
 */
export function findSmoothPath(map: MapData, from: Vec2, to: Vec2): Vec2[] | null {
  const dest = nearestStandablePoint(map, to[0], to[1]);
  if (!dest) return null;
  const end: Vec2 = [round2(dest[0]), round2(dest[1])];
  // A character that somehow stands inside an obstacle (old data) is first moved to the nearest free point.
  const standing = isStandable(map, from[0], from[1]) ? from : nearestStandablePoint(map, from[0], from[1]);
  if (!standing) return null;
  const start: Vec2 = [round2(standing[0]), round2(standing[1])];

  if (lineClear(map, start, end)) return start[0] === end[0] && start[1] === end[1] ? [start] : [start, end];

  const cells = findNavPath(map, start, end);
  if (!cells) return null;
  // Keep the first and last cell centres so the exact start/end connect to the grid by a sub-cell hop.
  const points: Vec2[] = [start, ...corners(cells), end];

  const out: Vec2[] = [start];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    // Consecutive corners come from a nav-clear A* chain, so j = i + 1 is accepted unconditionally.
    while (j > i + 1 && !lineClear(map, points[i]!, points[j]!)) j--;
    out.push(points[j]!);
    i = j;
  }
  return out;
}

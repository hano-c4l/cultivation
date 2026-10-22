import { tileToScreenUnit, type MapData, type Vec2 } from "./map";

/**
 * Area of interest. On a combat map the server only tells a player about the players and monsters near them (their screen plus a margin),
 * so a crowded map does not flood every client. Distances are measured on screen, in screen units of 32 px (see PlayRect): the half size of
 * the window the biggest screens show is about 40 x 23 units. An entity comes into view inside AOI_ENTER and goes out of view only beyond the
 * larger AOI_LEAVE (hysteresis, so one standing on the edge does not flicker). The boss is always in view (one per map, announced to all).
 */
export const AOI_ENTER = { x: 52, y: 32 } as const;
export const AOI_LEAVE = { x: 58, y: 36 } as const;

/** Whether `other` lies within the box `half` (screen units) around `from`, both tile positions on a map of this size. */
export function withinView(mapSize: number, from: Vec2, other: Vec2, half: { x: number; y: number }): boolean {
  const [ax, ay] = tileToScreenUnit(mapSize, from[0], from[1]);
  const [bx, by] = tileToScreenUnit(mapSize, other[0], other[1]);
  return Math.abs(ax - bx) <= half.x && Math.abs(ay - by) <= half.y;
}

export interface ViewEntity {
  id: string;
  pos: Vec2;
  /** Always seen by everyone (the map boss). */
  always?: boolean;
}

/**
 * Updates what one viewer knows. `known` holds the ids it has been told about; `entities` is everything that exists now. Returns what to tell it:
 * the ids that came into view and the ids that went out of view or no longer exist. The viewer itself is never listed.
 */
export function diffView(map: Pick<MapData, "width">, viewerId: string, viewerPos: Vec2, known: Set<string>, entities: readonly ViewEntity[]): { enter: string[]; leave: string[] } {
  const enter: string[] = [];
  const leave: string[] = [];
  const alive = new Set<string>();
  for (const e of entities) {
    if (e.id === viewerId) continue;
    alive.add(e.id);
    const has = known.has(e.id);
    const inView = e.always === true || withinView(map.width, viewerPos, e.pos, has ? AOI_LEAVE : AOI_ENTER);
    if (inView && !has) {
      known.add(e.id);
      enter.push(e.id);
    } else if (!inView && has) {
      known.delete(e.id);
      leave.push(e.id);
    }
  }
  for (const id of [...known]) {
    if (!alive.has(id)) {
      known.delete(id);
      leave.push(id);
    }
  }
  return { enter, leave };
}

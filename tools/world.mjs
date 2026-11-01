// Positions of the maps for the smoke scripts, taken from the shared map data (so they follow the layout). Tile centres unless noted.
import { CAVE_CHAMBERS, FOREST_GLADES, NPC_INTERACT_RADIUS, getMap, mapPoint, nearestStandablePoint } from "../shared/src/map.ts";

const c = ([x, y]) => [x + 0.5, y + 0.5];
export const town = getMap("town");
export const forest = getMap("forest");
export const cave = getMap("cave");
/** The town layout moved by this many tiles when its grid grew; every old town coordinate is that much further. */
export const T = 25;
export const TOWN_SPAWN = c(town.spawn);
/** The town's portal to the forest, and where one arrives in the town from the forest. */
export const TOWN_GATE = c([town.portals[0].x, town.portals[0].y]);
export const TOWN_ARRIVAL = c([forest.portals[0].toX, forest.portals[0].toY]);
export const FOREST_ARRIVAL = c(forest.spawn);
export const FOREST_N_GATE = c([forest.portals[0].x, forest.portals[0].y]);
export const FOREST_E_GATE = c([forest.portals[1].x, forest.portals[1].y]);
export const FOREST_E_ARRIVAL = c([cave.portals[0].toX, cave.portals[0].toY]);
export const CAVE_ARRIVAL = c(cave.spawn);
const nearestTo = (list, origin) => [...list].sort((a, b) => Math.hypot(a[0] - origin[0], a[1] - origin[1]) - Math.hypot(b[0] - origin[0], b[1] - origin[1]))[0];
/** The first group of monsters of the forest (the nearest to where one arrives: bậc 1), the spot just below it inside its glade (a few tiles from the nearest of them). */
const firstGlade = nearestTo(FOREST_GLADES, [0, -34]);
export const FOREST_WOLVES = mapPoint(forest, firstGlade[0], firstGlade[1]);
export const FOREST_BY_WOLVES = mapPoint(forest, firstGlade[0], firstGlade[1] + 4);
/** The same for the cave: the chamber nearest to the arrival, and a spot in it towards the corridor. */
const firstChamber = nearestTo(CAVE_CHAMBERS, [-84, 0]);
export const CAVE_BY_BATS = mapPoint(cave, firstChamber[0], firstChamber[1] + (firstChamber[1] < 0 ? 4 : -4));
/** Two tiles beside the first town's blacksmith (it stands a few tiles from the spawn, which is the teleport array in the middle of the town). */
const townSmith = town.npcs.find((n) => n.id === "smith");
export const TOWN_SMITH_NEAR = [townSmith.x + 2, townSmith.y];
export const TOWN_WAYGATE = (() => {
  const n = town.npcs.find((x) => x.kind === "waygate");
  return [n.x, n.y];
})();
/** A spot a player can stand on within reach of the town NPC `id` (the houses around the NPCs block the ground, so "two tiles below" is often a wall). Throws when there is none. */
export function townNear(id, npcs = town.npcs) {
  // Pass the `npcs` of the welcome message: a local database can hold NPC positions that differ from the code's defaults (the admin moves NPCs).
  const n = npcs.find((x) => x.id === id);
  if (!n) throw new Error(`no NPC ${id} in the town`);
  for (const [dx, dy] of [[0, 2], [2, 0], [0, -2], [-2, 0], [2, 2], [-2, 2], [2, -2], [-2, -2]]) {
    const p = nearestStandablePoint(town, n.x + dx, n.y + dy, 1.2);
    if (p && Math.hypot(p[0] - n.x, p[1] - n.y) <= NPC_INTERACT_RADIUS - 0.5) return p;
  }
  throw new Error(`nowhere to stand beside ${id}`);
}

/**
 * Sends `msg` (an `npc_open`) again until the NPC answers with a message of type `type`: a walk through the town takes as long as the route around the houses does, and until the
 * character is within reach the answer is an `inv_error far`. `c` is a client of a smoke script ({ log, send, wait }). Gives up after `ms`.
 */
export async function openWhenThere(c, msg, type, ms = 30_000) {
  const end = Date.now() + ms;
  for (;;) {
    const from = c.log.length;
    c.send(msg);
    try {
      return await c.wait((m) => m.t === type, 1500, type, from);
    } catch (err) {
      if (Date.now() > end) throw err;
    }
  }
}

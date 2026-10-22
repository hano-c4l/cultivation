// Positions of the maps for the smoke scripts, taken from the shared map data (so they follow the layout). Tile centres unless noted.
import { getMap, mapPoint } from "../shared/src/map.ts";

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
/** Just below the first group of monsters of the forest (inside its glade, a few tiles from the nearest of them), and the middle of that group. */
export const FOREST_BY_WOLVES = mapPoint(forest, -16, -18);
export const FOREST_WOLVES = mapPoint(forest, -16, -22);
export const FOREST_BOSS = mapPoint(forest, 20, 9);
export const CAVE_BY_BATS = mapPoint(cave, -70, 9);

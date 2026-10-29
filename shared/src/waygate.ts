import { onMapRecipe, type MapId } from "./map";
import { tuning } from "./tuning";

/**
 * The teleport array (Truyền Tống Trận) in the middle of each main town: it takes a character to any other main town for Linh Thạch. The price
 * grows with the distance between the two towns on the world map, so more towns later need only a position here. The numbers (a base and a
 * price per unit of distance) are tuning (`waygate`). Placeholder values.
 */
const CODE_TOWNS: readonly MapId[] = ["town", "town2", "town3"];
export type WaygateTown = MapId;
/** The main towns in force: the code's two, plus every safe map whose recipe gives a `world` position (3l, a town an admin added). Changed in place by `onMapRecipe`. */
export const WAYGATE_TOWNS: MapId[] = [...CODE_TOWNS];

/** Where each main town lies on the world map (arbitrary units; the cave and the forest lie between the first two, Vạn Cổ Hàn Uyên between the last two, about 100 apart). */
export const TOWN_WORLD_POS: Record<string, readonly [number, number]> = { town: [0, 0], town2: [100, 0], town3: [200, 0] };

onMapRecipe((id, recipe) => {
  if ((CODE_TOWNS as readonly string[]).includes(id)) return;
  const i = WAYGATE_TOWNS.indexOf(id);
  if (recipe && recipe.safe && recipe.world) {
    TOWN_WORLD_POS[id] = recipe.world;
    if (i < 0) WAYGATE_TOWNS.push(id);
  } else if (i >= 0) {
    WAYGATE_TOWNS.splice(i, 1);
    delete TOWN_WORLD_POS[id];
  }
});

export function isWaygateTown(v: unknown): v is WaygateTown {
  return typeof v === "string" && (WAYGATE_TOWNS as readonly string[]).includes(v);
}

/** The distance between two main towns on the world map. */
export function townDistance(a: WaygateTown, b: WaygateTown): number {
  const [ax, ay] = TOWN_WORLD_POS[a] ?? [0, 0];
  const [bx, by] = TOWN_WORLD_POS[b] ?? [0, 0];
  return Math.hypot(ax - bx, ay - by);
}

/** What the array charges for a trip from one main town to another. */
export function waygatePrice(from: WaygateTown, to: WaygateTown): number {
  const t = tuning().waygate;
  return Math.max(1, Math.round(t.base + t.perUnit * townDistance(from, to)));
}

export interface WaygateDest {
  map: WaygateTown;
  price: number;
}

/** Every main town but this one, with its price, nearest first. */
export function waygateDestinations(from: WaygateTown): WaygateDest[] {
  return WAYGATE_TOWNS.filter((t) => t !== from)
    .map((map) => ({ map, price: waygatePrice(from, map) }))
    .sort((a, b) => a.price - b.price);
}

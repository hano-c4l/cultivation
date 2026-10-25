import { buildFromRecipe, inPlayRect, nearestStandablePoint, type MapRecipe, type Vec2 } from "./map";
import { findSmoothPath } from "./pathfinding";

/**
 * What the server cannot check when saving (it does not build the grid): from the spawn point, the gates, the boss spot and the monster groups must be
 * reachable on the ground this recipe builds. Run here, in the browser, with the game's own builder and path finder. Returns the points that are not.
 */
export function mapRouteProblems(recipe: MapRecipe): string[] {
  const map = buildFromRecipe(recipe);
  const ground = (x: number, y: number): Vec2 | null => {
    const q = nearestStandablePoint(map, x + 0.5, y + 0.5, 3);
    return q && inPlayRect(map, q[0], q[1]) ? q : null;
  };
  const start = ground(recipe.spawn[0], recipe.spawn[1]);
  if (!start) return ["điểm sinh nằm trong vật cản"];
  const out: string[] = [];
  const check = (label: string, x: number, y: number) => {
    const to = ground(x, y);
    if (!to) out.push(`${label} nằm trong vật cản`);
    else if (!findSmoothPath(map, start, to)) out.push(`${label}: không có đường đi từ điểm sinh`);
  };
  for (const p of recipe.portals) check(`cổng (${p.x}, ${p.y})`, p.x, p.y);
  const c = recipe.content;
  if (c?.bossSpot) check("chỗ boss", c.bossSpot[0], c.bossSpot[1]);
  for (const g of (c?.groups ?? []).slice(0, 12)) check(`bãi quái (${Math.round(g.x)}, ${Math.round(g.y)})`, g.x, g.y);
  return out;
}

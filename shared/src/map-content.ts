import { CODE_MAP_IDS, codeMapRecipe, type CodeMapId, type MapContent, type MapRecipe } from "./map";
import { CODE_BOSS_SPOTS } from "./boss";
import { CODE_CLUSTERS, CODE_GUARDS } from "./monsters";

/** The monster groups, guards and boss spot the code gives a map (what a recipe's `content` holds when it was taken from the code). */
export function codeMapContent(id: CodeMapId): MapContent {
  const spot = CODE_BOSS_SPOTS[id];
  return {
    groups: (CODE_CLUSTERS[id] ?? []).map((g) => ({ tier: g.tier, kind: g.kind, x: g.x, y: g.y, radius: g.radius, count: g.count })),
    guards: (CODE_GUARDS[id] ?? []).map((g): [number, number] => [g[0], g[1]]),
    bossSpot: spot ? [spot[0], spot[1]] : null,
  };
}

/** The recipe of a map as the code has it, content included: the seed of the D1 rows. */
export function fullCodeMapRecipe(id: CodeMapId): MapRecipe {
  return { ...codeMapRecipe(id), content: codeMapContent(id) };
}

export { CODE_MAP_IDS };

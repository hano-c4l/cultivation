import { MAP_IDS, codeMapRecipe, setMapRecipe, validMapRecipe, type MapId, type MapRecipe } from "@game/shared";

/**
 * The maps in D1 (table `map_recipes`, migration 0043): seeded from the code's maps the first time they are read (only maps that have no row; an edited row is
 * never replaced; a row nobody edited is only a copy for the admin screen), cached per isolate and re-read when `config_versions.maps` changes. Reading installs each recipe (setMapRecipe stores it; the grid is built
 * when the map is first asked for). A row that does not validate leaves that map as the code has it; D1 down serves the last copy.
 */
const TTL_MS = 30_000;
let cache: { version: number; checkedAt: number } | null = null;

export interface MapRow {
  map_id: string;
  def: string;
  updated_at: number;
  /** Null while the row is the seed: a map nobody edited is the code's (so a change to the code builders still reaches it, and the clients are sent nothing). */
  updated_by: string | null;
}

async function seed(db: D1Database, missing: MapId[]): Promise<void> {
  const now = Date.now();
  await db.batch(missing.map((id) => db.prepare("INSERT OR IGNORE INTO map_recipes (map_id, def, updated_at) VALUES (?, ?, ?)").bind(id, JSON.stringify(codeMapRecipe(id)), now)));
}

/** The recipe a row holds, or null when it does not validate or names another map. */
export function parseRecipe(row: Pick<MapRow, "map_id" | "def">): MapRecipe | null {
  try {
    const r: unknown = JSON.parse(row.def);
    return validMapRecipe(r) && r.id === row.map_id ? r : null;
  } catch {
    return null;
  }
}

async function load(db: D1Database): Promise<number> {
  const known = new Set((await db.prepare("SELECT map_id FROM map_recipes").all<{ map_id: string }>()).results.map((r) => r.map_id));
  const missing = MAP_IDS.filter((id) => !known.has(id));
  if (missing.length > 0) await seed(db, missing);
  const [versionRow, rows] = await Promise.all([
    db.prepare("SELECT version FROM config_versions WHERE name = 'maps'").first<{ version: number }>(),
    db.prepare("SELECT map_id, def, updated_at, updated_by FROM map_recipes").all<MapRow>(),
  ]);
  const seen = new Set<string>();
  for (const row of rows.results) {
    seen.add(row.map_id);
    if (row.updated_by === null) {
      if ((MAP_IDS as readonly string[]).includes(row.map_id)) setMapRecipe(null, row.map_id as MapId);
      continue;
    }
    const recipe = parseRecipe(row);
    if (recipe) setMapRecipe(recipe);
    else {
      console.error(`map ${row.map_id} recipe is invalid`);
      if ((MAP_IDS as readonly string[]).includes(row.map_id)) setMapRecipe(null, row.map_id as MapId);
    }
  }
  return versionRow?.version ?? 0;
}

/** Installs the maps in force (cached). Never throws. */
export async function getMapRecipes(db: D1Database, now = Date.now()): Promise<void> {
  if (cache && now - cache.checkedAt < TTL_MS) return;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'maps'").first<{ version: number }>();
      if ((v?.version ?? 0) === cache.version) {
        cache.checkedAt = now;
        return;
      }
    }
    cache = { version: await load(db), checkedAt: now };
  } catch (err) {
    console.error("maps unavailable", err);
  }
}

export function resetMapsCache(): void {
  cache = null;
}

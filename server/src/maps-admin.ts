import { MAP_IDS, MAP_SIZE, codeMapRecipe, validMapRecipe, type MapId, type MapRecipe } from "@game/shared";
import { logStatement } from "./admin-log";
import { getMapRecipes, parseRecipe, resetMapsCache, type MapRow } from "./maps";

/**
 * The admin side of the maps (docs/PHASE3.md 3l-a): each map's recipe (colours, home town, spawn, gates and the steps that build its obstacles). The size, the
 * playing rectangle, the realm and the safe flag are tied to the monsters, the guards and the rooms, so they are shown but not changed here. A save is one
 * batch guarded by the `updated_at` the admin saw, with the `config_versions.maps` bump and the admin log row. Nothing is built while saving (a Worker route must
 * not fill hundreds of thousands of cells): the checks are on the numbers.
 */
export const MAP_LOG_SCREEN = "Bản đồ";

export interface MapListItem {
  id: string;
  size: number;
  realm: number | null;
  safe: boolean;
  home: string;
  portals: number;
  ops: number;
  edited: boolean;
  updatedAt: number;
  updatedBy: string | null;
}

async function rows(db: D1Database): Promise<MapRow[]> {
  await getMapRecipes(db); // seeds the rows the first time
  return (await db.prepare("SELECT map_id, def, updated_at, updated_by FROM map_recipes ORDER BY map_id").all<MapRow>()).results;
}

export async function listMaps(db: D1Database): Promise<MapListItem[]> {
  const out: MapListItem[] = [];
  for (const r of await rows(db)) {
    const rec = parseRecipe(r);
    if (!rec) continue;
    out.push({ id: r.map_id, size: rec.size, realm: rec.realm, safe: rec.safe, home: rec.home, portals: rec.portals.length, ops: rec.ops.length, edited: r.updated_by !== null, updatedAt: r.updated_at, updatedBy: r.updated_by });
  }
  return out;
}

export async function getMapAdmin(db: D1Database, id: string): Promise<{ recipe: MapRecipe; updatedAt: number; edited: boolean; maps: string[] } | null> {
  const r = (await rows(db)).find((x) => x.map_id === id);
  const recipe = r ? parseRecipe(r) : null;
  return r && recipe ? { recipe, updatedAt: r.updated_at, edited: r.updated_by !== null, maps: [...MAP_IDS] } : null;
}

export type MapResult = { ok: true; updatedAt: number } | { ok: false; error: "invalid" | "unchanged" | "not_found" | "version_conflict" | "locked" | "busy"; problems?: string[] };

/** Whether a tile lies inside the playing rectangle of a map of this size (the rectangle is on screen, see PlayRect). */
function insideRect(size: number, rect: { halfW: number; halfH: number }, x: number, y: number): boolean {
  const px = x + 0.5 - (y + 0.5);
  const py = (x + 0.5 + (y + 0.5) - size) / 2;
  return px >= -rect.halfW && px < rect.halfW && py >= -rect.halfH && py < rect.halfH;
}

const LOCKED = ["id", "size", "rect", "realm", "safe", "guardRealm"];

/** Problems that only the numbers can show: the locked fields, a spawn or gate outside the rectangle, a gate to nowhere. */
export function recipeProblems(before: MapRecipe, after: MapRecipe): string[] {
  const out: string[] = [];
  if (after.id !== before.id) out.push("id");
  if (after.size !== before.size) out.push("size");
  if (JSON.stringify(after.rect) !== JSON.stringify(before.rect)) out.push("rect");
  if (after.realm !== before.realm) out.push("realm");
  if (after.safe !== before.safe) out.push("safe");
  if (after.guardRealm !== before.guardRealm) out.push("guardRealm");
  if (!insideRect(after.size, after.rect, after.spawn[0], after.spawn[1])) out.push("spawn outside the playing area");
  for (const p of after.portals) {
    if (!insideRect(after.size, after.rect, p.x, p.y)) out.push(`gate (${p.x}, ${p.y}) outside the playing area`);
    if (p.toMap === after.id) out.push(`gate (${p.x}, ${p.y}) leads to the same map`);
    const target = MAP_SIZE[p.toMap];
    if (p.toX >= target || p.toY >= target) out.push(`gate (${p.x}, ${p.y}) arrives outside ${p.toMap}`);
  }
  return out;
}

function describe(before: MapRecipe, after: MapRecipe): string[] {
  const changed: string[] = [];
  if (JSON.stringify(before.palette) !== JSON.stringify(after.palette)) changed.push("màu");
  if (before.home !== after.home) changed.push(`thành về ${before.home} → ${after.home}`);
  if (JSON.stringify(before.spawn) !== JSON.stringify(after.spawn)) changed.push("điểm sinh");
  if (JSON.stringify(before.portals) !== JSON.stringify(after.portals)) changed.push("cổng");
  if (JSON.stringify(before.ops) !== JSON.stringify(after.ops)) changed.push(`bước dựng (${before.ops.length} → ${after.ops.length})`);
  return changed;
}

const bump = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'maps'").bind(at);

async function write(db: D1Database, id: string, updatedAt: number, def: string, by: string | null, logger: string, stamp: number, content: string, now: number): Promise<MapResult> {
  try {
    await db.batch([
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM map_recipes WHERE map_id = ? AND updated_at = ?)").bind(id, updatedAt),
      db.prepare("UPDATE map_recipes SET def = ?, updated_at = ?, updated_by = ? WHERE map_id = ?").bind(def, stamp, by, id),
      bump(db, stamp),
      logStatement(db, { adminEmail: logger, screen: MAP_LOG_SCREEN, content }, now),
    ]);
  } catch (err) {
    if (String(err).includes("inv_guard") && !(await db.prepare("SELECT 1 AS x FROM map_recipes WHERE map_id = ? AND updated_at = ?").bind(id, updatedAt).first())) return { ok: false, error: "version_conflict" };
    console.error("map save failed", err);
    return { ok: false, error: "busy" };
  }
  resetMapsCache();
  return { ok: true, updatedAt: stamp };
}

export async function saveMap(db: D1Database, adminEmail: string, posted: unknown, updatedAt: number, now = Date.now()): Promise<MapResult> {
  if (!validMapRecipe(posted)) return { ok: false, error: "invalid", problems: ["structure"] };
  const current = await getMapAdmin(db, posted.id);
  if (!current) return { ok: false, error: "not_found" };
  if (current.updatedAt !== updatedAt) return { ok: false, error: "version_conflict" };
  const problems = recipeProblems(current.recipe, posted);
  const locked = problems.filter((p) => LOCKED.includes(p));
  if (locked.length > 0) return { ok: false, error: "locked", problems: locked };
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const changed = describe(current.recipe, posted);
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  const stamp = Math.max(now, updatedAt + 1);
  return write(db, posted.id, updatedAt, JSON.stringify(posted), adminEmail, adminEmail, stamp, `Sửa bản đồ ${posted.id}: ${changed.join(", ")}`, now);
}

/** Puts a map back to the code's (the row becomes the seed again). */
export async function resetMap(db: D1Database, adminEmail: string, id: string, updatedAt: number, now = Date.now()): Promise<MapResult> {
  if (!(MAP_IDS as readonly string[]).includes(id)) return { ok: false, error: "not_found" };
  const current = await getMapAdmin(db, id);
  if (!current) return { ok: false, error: "not_found" };
  if (current.updatedAt !== updatedAt) return { ok: false, error: "version_conflict" };
  if (!current.edited) return { ok: false, error: "unchanged" };
  const stamp = Math.max(now, updatedAt + 1);
  return write(db, id, updatedAt, JSON.stringify(codeMapRecipe(id as MapId)), null, adminEmail, stamp, `Đưa bản đồ ${id} về bản của code`, now);
}

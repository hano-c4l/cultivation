import { CODE_MAP_IDS, GUARD_KIND, MAP_ID_PATTERN, MAP_IDS, MAP_SIZE, codeMapContent, validMapName, fullCodeMapRecipe, getMonsterDef, validMapRecipe, type CodeMapId, type MapContent, type MapRecipe } from "@game/shared";
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
  name: string | null;
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
  return (await db.prepare("SELECT map_id, def, updated_at, updated_by, name_vi FROM map_recipes ORDER BY map_id").all<MapRow>()).results;
}

export async function listMaps(db: D1Database): Promise<MapListItem[]> {
  const out: MapListItem[] = [];
  for (const r of await rows(db)) {
    const rec = parseRecipe(r);
    if (!rec) continue;
    out.push({ id: r.map_id, name: r.name_vi, size: rec.size, realm: rec.realm, safe: rec.safe, home: rec.home, portals: rec.portals.length, ops: rec.ops.length, edited: r.updated_by !== null, updatedAt: r.updated_at, updatedBy: r.updated_by });
  }
  return out;
}

const isCode = (id: string): id is CodeMapId => (CODE_MAP_IDS as readonly string[]).includes(id);

/** The content a recipe stands for: its own, or the code's for a map of the code (a recipe without `content` uses the code's). */
export function effectiveContent(recipe: MapRecipe): MapContent | undefined {
  return recipe.content ?? (isCode(recipe.id) ? codeMapContent(recipe.id) : undefined); // not fullCodeMapRecipe: that builds the whole grid, which a Worker route must not do
}

export async function getMapAdmin(db: D1Database, id: string): Promise<{ recipe: MapRecipe; name: string | null; updatedAt: number; edited: boolean; maps: string[]; code: boolean } | null> {
  const r = (await rows(db)).find((x) => x.map_id === id);
  const recipe = r ? parseRecipe(r) : null;
  if (!r || !recipe) return null;
  const content = effectiveContent(recipe);
  return { recipe: content ? { ...recipe, content } : recipe, name: r.name_vi, updatedAt: r.updated_at, edited: r.updated_by !== null, maps: [...MAP_IDS], code: isCode(id) };
}

export type MapResult = { ok: true; updatedAt: number } | { ok: false; error: "invalid" | "unchanged" | "not_found" | "version_conflict" | "locked" | "busy"; problems?: string[] };

/** Whether a tile lies inside the playing rectangle of a map of this size (the rectangle is on screen, see PlayRect). */
function insideRect(size: number, rect: { halfW: number; halfH: number }, x: number, y: number): boolean {
  const px = x + 0.5 - (y + 0.5);
  const py = (x + 0.5 + (y + 0.5) - size) / 2;
  return px >= -rect.halfW && px < rect.halfW && py >= -rect.halfH && py < rect.halfH;
}

const LOCKED = ["id", "size", "rect", "realm", "safe", "guardRealm", "world"];

/** Problems that only the numbers can show: the locked fields, a spawn or gate outside the rectangle, a gate to nowhere. */
export function recipeProblems(before: MapRecipe, after: MapRecipe, pending: Record<string, number> = {}): string[] {
  const out: string[] = [];
  if (after.id !== before.id) out.push("id");
  if (after.size !== before.size) out.push("size");
  if (JSON.stringify(after.rect) !== JSON.stringify(before.rect)) out.push("rect");
  if (after.realm !== before.realm) out.push("realm");
  if (after.safe !== before.safe) out.push("safe");
  if (after.guardRealm !== before.guardRealm) out.push("guardRealm");
  // The array's world position belongs to a town an admin added; the code's towns have theirs in the code.
  if (JSON.stringify(after.world) !== JSON.stringify(before.world) && (isCode(after.id) || !after.safe)) out.push("world");
  if (!insideRect(after.size, after.rect, after.spawn[0], after.spawn[1])) out.push("spawn outside the playing area");
  for (const p of after.portals) {
    if (!insideRect(after.size, after.rect, p.x, p.y)) out.push(`gate (${p.x}, ${p.y}) outside the playing area`);
    if (p.toMap === after.id) out.push(`gate (${p.x}, ${p.y}) leads to the same map`);
    const target = MAP_SIZE[p.toMap] ?? pending[p.toMap];
    if (target === undefined) out.push(`gate (${p.x}, ${p.y}) leads to ${p.toMap}, which is not a map`);
    else if (p.toX >= target || p.toY >= target) out.push(`gate (${p.x}, ${p.y}) arrives outside ${p.toMap}`);
  }
  return out;
}

function describe(before: MapRecipe, after: MapRecipe): string[] {
  const changed: string[] = [];
  if (JSON.stringify(before.palette) !== JSON.stringify(after.palette)) changed.push("màu");
  if (before.home !== after.home) changed.push(`thành về ${before.home} → ${after.home}`);
  if (JSON.stringify(before.spawn) !== JSON.stringify(after.spawn)) changed.push("điểm sinh");
  if (JSON.stringify(before.world) !== JSON.stringify(after.world)) changed.push("vị trí trên bản đồ thế giới (Truyền Tống Trận)");
  if (JSON.stringify(before.portals) !== JSON.stringify(after.portals)) changed.push("cổng");
  if (JSON.stringify(before.ops) !== JSON.stringify(after.ops)) changed.push(`bước dựng (${before.ops.length} → ${after.ops.length})`);
  if (JSON.stringify(effectiveContent(before)?.groups) !== JSON.stringify(effectiveContent(after)?.groups)) changed.push("bãi quái");
  if (JSON.stringify(effectiveContent(before)?.guards) !== JSON.stringify(effectiveContent(after)?.guards)) changed.push("vệ binh");
  if (JSON.stringify(effectiveContent(before)?.bossSpot) !== JSON.stringify(effectiveContent(after)?.bossSpot)) changed.push("chỗ boss");
  return changed;
}

const bump = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'maps'").bind(at);

async function write(db: D1Database, id: string, updatedAt: number, def: string, by: string | null, logger: string, stamp: number, content: string, now: number, name?: string | null): Promise<MapResult> {
  try {
    await db.batch([
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM map_recipes WHERE map_id = ? AND updated_at = ?)").bind(id, updatedAt),
      db.prepare("UPDATE map_recipes SET def = ?, updated_at = ?, updated_by = ? WHERE map_id = ?").bind(def, stamp, by, id),
      ...(name !== undefined ? [db.prepare("UPDATE map_recipes SET name_vi = ? WHERE map_id = ?").bind(name, id)] : []),
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

/** `name`: undefined leaves the display name as it is, null clears it. */
export async function saveMap(db: D1Database, adminEmail: string, posted: unknown, updatedAt: number, now = Date.now(), name?: string | null): Promise<MapResult> {
  if (!validMapRecipe(posted)) return { ok: false, error: "invalid", problems: ["structure"] };
  const current = await getMapAdmin(db, posted.id);
  if (!current) return { ok: false, error: "not_found" };
  if (current.updatedAt !== updatedAt) return { ok: false, error: "version_conflict" };
  const problems = [...recipeProblems(current.recipe, posted), ...contentProblems(posted)];
  const locked = problems.filter((p) => LOCKED.includes(p));
  if (locked.length > 0) return { ok: false, error: "locked", problems: locked };
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  if (name !== undefined && name !== null && !validMapName(name)) return { ok: false, error: "invalid", problems: ["name"] };
  const changed = describe(current.recipe, posted);
  const nameChanged = name !== undefined && name !== current.name;
  if (nameChanged) changed.push(`tên ${current.name ?? "(không)"} → ${name ?? "(không)"}`);
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  const stamp = Math.max(now, updatedAt + 1);
  if (describe(current.recipe, posted).length === 0) {
    // Only the name changed: the layout row (and so whether the map is the code's) stays as it is.
    try {
      await db.batch([
        db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM map_recipes WHERE map_id = ? AND updated_at = ?)").bind(posted.id, updatedAt),
        db.prepare("UPDATE map_recipes SET name_vi = ?, updated_at = ? WHERE map_id = ?").bind(name ?? null, stamp, posted.id),
        bump(db, stamp),
        logStatement(db, { adminEmail, screen: MAP_LOG_SCREEN, content: `Sửa bản đồ ${posted.id}: ${changed.join(", ")}` }, now),
      ]);
    } catch (err) {
      if (String(err).includes("inv_guard")) return { ok: false, error: "version_conflict" };
      console.error("map rename failed", err);
      return { ok: false, error: "busy" };
    }
    resetMapsCache();
    return { ok: true, updatedAt: stamp };
  }
  // Content equal to the code's is stored as "the code's" (no content), so a later change to the code's data still reaches the map.
  const store: MapRecipe = isCode(posted.id) && JSON.stringify(posted.content) === JSON.stringify(codeMapContent(posted.id)) ? { ...posted, content: undefined } : posted;
  return write(db, posted.id, updatedAt, JSON.stringify(store), adminEmail, adminEmail, stamp, `Sửa bản đồ ${posted.id}: ${changed.join(", ")}`, now, nameChanged ? (name ?? null) : undefined);
}

/** The species of a group must exist and must not be the guard; a map that is a safe town has no groups. */
export function contentProblems(r: MapRecipe): string[] {
  const out: string[] = [];
  for (const g of r.content?.groups ?? []) {
    const def = getMonsterDef(g.kind);
    if (!def || g.kind === GUARD_KIND) out.push(`group: unknown species ${g.kind}`);
  }
  if (r.safe && (r.content?.groups.length ?? 0) > 0) out.push("a safe town has no monster groups");
  return out;
}

const CARVE_W = 6;
const CARVE_H = 4;

/** Inserts a carved clearing (screen units around a tile) before the last step, which is the cut to the playing rectangle: gates and arrivals are never inside a wall. */
function withClearings(r: MapRecipe, tiles: Array<[number, number]>): MapRecipe {
  const ops = [...r.ops];
  const last = ops.at(-1);
  const insertAt = last?.op === "clip" ? ops.length - 1 : ops.length;
  const carves = tiles.map(([x, y]) => {
    const px = x + 0.5 - (y + 0.5);
    const py = (x + 0.5 + (y + 0.5) - r.size) / 2;
    return { op: "srect" as const, px0: px - CARVE_W, py0: py - CARVE_H, px1: px + CARVE_W, py1: py + CARVE_H, walkable: true };
  });
  ops.splice(insertAt, 0, ...carves);
  return { ...r, ops };
}

export interface CreateMapInput {
  id: string;
  /** The display name players read (required: a new map has none in the client). */
  name: string;
  /** The map whose ground, size, colours and (unless a safe town) monsters the new one starts from. */
  template: string;
  realm: number | null;
  /** Gate on the new map and where it arrives on `back.map`; and the gate on `back.map` and where it arrives on the new map. */
  gate: { x: number; y: number; toX: number; toY: number };
  back: { map: string; x: number; y: number; toX: number; toY: number };
  /** A safe town only: where it lies on the world map, which makes it a destination of the Truyền Tống Trận (fee by distance). */
  world?: [number, number];
}

/**
 * Makes a new map from a template, joined to an existing map by a gate each way (a map nobody can enter or leave is no map). The two rows (the new one, and
 * the existing map that gets the gate back) are written in one batch. Nothing is built here; clearings are carved at the gates and the arrival so they are
 * never inside a wall, but whether the ground between them and the rest is open is for the preview to show.
 */
export async function createMap(db: D1Database, adminEmail: string, posted: unknown, now = Date.now()): Promise<MapResult & { id?: string }> {
  const o = posted as Partial<CreateMapInput> | null;
  const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
  if (!o || typeof o.id !== "string" || !validMapName(o.name) || typeof o.template !== "string" || !o.gate || !o.back || typeof o.back.map !== "string" || ![o.gate.x, o.gate.y, o.gate.toX, o.gate.toY, o.back.x, o.back.y, o.back.toX, o.back.toY].every(int) || !(o.realm === null || int(o.realm))) return { ok: false, error: "invalid", problems: ["body"] };
  if (!MAP_ID_PATTERN.test(o.id) || isCode(o.id)) return { ok: false, error: "invalid", problems: ["id"] };
  if ((await rows(db)).some((r) => r.map_id === o.id)) return { ok: false, error: "invalid", problems: ["exists"] };
  const template = await getMapAdmin(db, o.template);
  const target = await getMapAdmin(db, o.back.map);
  if (!template || !target) return { ok: false, error: "not_found" };
  const safe = o.realm === null;
  const spawn: [number, number] = [o.back.toX, o.back.toY];
  const base: MapRecipe = {
    ...template.recipe,
    id: o.id,
    realm: o.realm,
    safe,
    home: safe ? o.id : target.recipe.home,
    spawn,
    portals: [{ x: o.gate.x, y: o.gate.y, toMap: o.back.map, toX: o.gate.toX, toY: o.gate.toY }],
    content: { groups: safe ? [] : (template.recipe.content?.groups ?? []).map((g) => ({ ...g })), guards: [], bossSpot: safe ? null : (template.recipe.content?.bossSpot ?? null) },
  };
  delete (base as { guardRealm?: number }).guardRealm;
  delete (base as { world?: [number, number] }).world;
  if (o.world !== undefined) {
    if (!safe || !Array.isArray(o.world) || o.world.length !== 2) return { ok: false, error: "invalid", problems: ["world"] };
    base.world = [o.world[0]!, o.world[1]!];
  }
  const fresh = withClearings(base, [[o.gate.x, o.gate.y], spawn]);
  const back = { x: o.back.x, y: o.back.y, toMap: o.id, toX: spawn[0], toY: spawn[1] };
  // The other map keeps using the code's monsters, guards and boss spot unless it had its own: the copy shown for editing is not stored back.
  const targetContent = isCode(o.back.map) && JSON.stringify(target.recipe.content) === JSON.stringify(codeMapContent(o.back.map)) ? undefined : target.recipe.content;
  const backRecipe = withClearings({ ...target.recipe, content: targetContent, portals: [...target.recipe.portals, back] }, [[back.x, back.y]]);
  const problems = [...recipeProblems(fresh, fresh), ...recipeProblems(backRecipe, backRecipe, { [o.id]: fresh.size }), ...contentProblems(fresh)];
  // The gate of the new map arrives on the other map, and the other map's gate arrives here: both arrivals must be inside the maps they name.
  if (o.gate.toX >= target.recipe.size || o.gate.toY >= target.recipe.size) problems.push("arrival outside the target map");
  if (!validMapRecipe(fresh) || !validMapRecipe(backRecipe)) problems.push("structure");
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const stamp = Math.max(now, target.updatedAt + 1);
  try {
    await db.batch([
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE EXISTS (SELECT 1 FROM map_recipes WHERE map_id = ?)").bind(o.id),
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM map_recipes WHERE map_id = ? AND updated_at = ?)").bind(o.back.map, target.updatedAt),
      db.prepare("INSERT INTO map_recipes (map_id, def, updated_at, updated_by, name_vi) VALUES (?, ?, ?, ?, ?)").bind(o.id, JSON.stringify(fresh), stamp, adminEmail, o.name),
      db.prepare("UPDATE map_recipes SET def = ?, updated_at = ?, updated_by = ? WHERE map_id = ?").bind(JSON.stringify(backRecipe), stamp, adminEmail, o.back.map),
      bump(db, stamp),
      logStatement(db, { adminEmail, screen: MAP_LOG_SCREEN, content: `Thêm bản đồ ${o.id} «${o.name}» (từ ${o.template}, ${safe ? "thành an toàn" : `cảnh giới ${o.realm}`}), nối với ${o.back.map} hai chiều` }, now),
    ]);
  } catch (err) {
    if (String(err).includes("inv_guard")) return { ok: false, error: "version_conflict" };
    console.error("map create failed", err);
    return { ok: false, error: "busy" };
  }
  resetMapsCache();
  return { ok: true, updatedAt: stamp, id: o.id };
}

/** Deletes a map an admin added (never one of the code's). Refused while anything still points at it: a character standing there, a gate of another map, an NPC. */
export async function deleteMap(db: D1Database, adminEmail: string, id: string, updatedAt: number, now = Date.now()): Promise<MapResult> {
  if (isCode(id)) return { ok: false, error: "locked", problems: ["code"] };
  const current = await getMapAdmin(db, id);
  if (!current) return { ok: false, error: "not_found" };
  if (current.updatedAt !== updatedAt) return { ok: false, error: "version_conflict" };
  const problems: string[] = [];
  const there = await db.prepare("SELECT COUNT(*) AS n FROM characters WHERE map_id = ? AND deleted_at IS NULL").bind(id).first<{ n: number }>();
  if ((there?.n ?? 0) > 0) problems.push(`${there!.n} nhân vật đang đứng ở bản đồ này`);
  for (const r of await rows(db)) {
    const rec = parseRecipe(r);
    if (rec && r.map_id !== id && (rec.portals.some((p) => p.toMap === id) || rec.home === id)) problems.push(`bản đồ ${r.map_id} còn cổng hoặc thành về trỏ tới`);
  }
  const { results: questRows } = await db.prepare("SELECT id, def FROM quests WHERE tomb = 0 AND deleted_at IS NULL").all<{ id: string; def: string }>();
  for (const q of questRows) {
    try {
      const def = JSON.parse(q.def) as { objective?: { kind?: string; map?: string } };
      if (def.objective?.kind === "kill" && def.objective.map === id) problems.push(`nhiệm vụ ${q.id} còn yêu cầu hạ quái ở bản đồ này`);
    } catch {
      // a broken definition names no map
    }
  }
  const npcs = await db.prepare("SELECT COUNT(*) AS n FROM npc_spots WHERE map_id = ?").bind(id).first<{ n: number }>();
  if ((npcs?.n ?? 0) > 0) problems.push(`${npcs!.n} NPC đứng ở bản đồ này`);
  const boss = await db.prepare("SELECT COUNT(*) AS n FROM world_boss WHERE map_id = ?").bind(id).first<{ n: number }>();
  if ((boss?.n ?? 0) > 0) problems.push("còn boss đang giữ chỗ");
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const stamp = Math.max(now, updatedAt + 1);
  try {
    await db.batch([
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM map_recipes WHERE map_id = ? AND updated_at = ?)").bind(id, updatedAt),
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE EXISTS (SELECT 1 FROM characters WHERE map_id = ? AND deleted_at IS NULL)").bind(id),
      db.prepare("DELETE FROM map_recipes WHERE map_id = ?").bind(id),
      bump(db, stamp),
      logStatement(db, { adminEmail, screen: MAP_LOG_SCREEN, content: `Xóa bản đồ ${id}` }, now),
    ]);
  } catch (err) {
    if (String(err).includes("inv_guard")) return { ok: false, error: "version_conflict" };
    console.error("map delete failed", err);
    return { ok: false, error: "busy" };
  }
  resetMapsCache();
  return { ok: true, updatedAt: stamp };
}

/** Puts a map back to the code's (the row becomes the seed again). */
export async function resetMap(db: D1Database, adminEmail: string, id: string, updatedAt: number, now = Date.now()): Promise<MapResult> {
  if (!(CODE_MAP_IDS as readonly string[]).includes(id)) return { ok: false, error: "not_found" }; // a map the code does not know has no code version to go back to
  const current = await getMapAdmin(db, id);
  if (!current) return { ok: false, error: "not_found" };
  if (current.updatedAt !== updatedAt) return { ok: false, error: "version_conflict" };
  if (!current.edited) return { ok: false, error: "unchanged" };
  const stamp = Math.max(now, updatedAt + 1);
  return write(db, id, updatedAt, JSON.stringify(fullCodeMapRecipe(id as CodeMapId)), null, adminEmail, stamp, `Đưa bản đồ ${id} về bản của code`, now);
}

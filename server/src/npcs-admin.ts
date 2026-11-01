import { MAP_IDS, NPC_INTERACT_RADIUS, NPC_KINDS, SELL_RATE, getMap, inPlayRect, nearestStandablePoint, startingNpcs, type MapId, type NpcSpot } from "@game/shared";
import { logStatement } from "./admin-log";
import { getMerchants, resetMerchantsCache } from "./merchants";
import { getNpcs, resetNpcsCache } from "./npcs";

/**
 * The admin side of the NPCs (docs/PHASE3.md 3k): where each one stands and what it is called (table `npc_spots`). An NPC is identified by its map and id and
 * keeps its kind for good (the kind decides which window it opens); a save changes its name, its place, whether it is in play and its order. Each save is one
 * batch guarded by the `updated_at` the admin saw, with the `config_versions.npcs` bump and the admin log row.
 *
 * Taking an NPC out of play (disabling or deleting) is refused (`in_use`, with the list) while a quest still names it as its giver or as someone to talk to,
 * unless the same id also stands on another map. An NPC the game starts with is only ever disabled (its row stays, so the seeding does not put it back); one an
 * admin added can be deleted, taking its merchant record with it.
 */
export const NPC_LOG_SCREEN = "NPC";
export const NAME_MAX = 40;
/** Kinds an admin can add: a waygate needs its own destinations (waygate.ts), so only the existing ones stand. */
export const ADDABLE_KINDS: readonly NpcSpot["kind"][] = ["merchant", "quest", "smith", "alchemist", "waygate"];

interface Row {
  npc_id: string;
  map_id: string;
  kind: string;
  name_vi: string;
  x: number;
  y: number;
  sort: number;
  enabled: number;
  updated_at: number;
}

export interface NpcListItem {
  id: string;
  mapId: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  sort: number;
  enabled: boolean;
  updatedAt: number;
  /** The game starts with this NPC (it can be disabled but not deleted). */
  seed: boolean;
  /** Has a merchant record (a stock): merchants, alchemists and the blacksmiths that trade. */
  hasStock: boolean;
  /** Quests that name it as their giver or as someone to talk to. */
  quests: string[];
}

/** Makes sure the NPC table and the merchant records exist (both are seeded from the code the first time they are read). */
async function seeded(db: D1Database): Promise<void> {
  await Promise.all([getNpcs(db), getMerchants(db)]);
}

const seedKey = (mapId: string, id: string) => `${mapId}:${id}`;

async function questUsers(db: D1Database): Promise<Map<string, string[]>> {
  const { results } = await db.prepare("SELECT id, def FROM quests WHERE tomb = 0 AND deleted_at IS NULL").all<{ id: string; def: string }>();
  const out = new Map<string, string[]>();
  const add = (npc: string, quest: string) => out.set(npc, [...(out.get(npc) ?? []), quest]);
  for (const r of results) {
    try {
      const def = JSON.parse(r.def) as { giver?: string; objective?: { kind?: string; npc?: string } };
      if (def.giver) add(def.giver, r.id);
      if (def.objective?.kind === "talk" && def.objective.npc) add(def.objective.npc, r.id);
    } catch {
      // a broken definition names nobody
    }
  }
  return out;
}

export async function listNpcs(db: D1Database): Promise<NpcListItem[]> {
  await seeded(db);
  const [{ results }, users, merchants] = await Promise.all([
    db.prepare("SELECT npc_id, map_id, kind, name_vi, x, y, sort, enabled, updated_at FROM npc_spots ORDER BY map_id, sort, npc_id").all<Row>(),
    questUsers(db),
    db.prepare("SELECT npc_id FROM shop_merchants").all<{ npc_id: string }>(),
  ]);
  const seeds = new Set(startingNpcs().map((n) => seedKey(n.mapId, n.id)));
  const stocked = new Set(merchants.results.map((m) => m.npc_id));
  return results.map((r) => ({
    id: r.npc_id,
    mapId: r.map_id,
    kind: r.kind,
    name: r.name_vi,
    x: r.x,
    y: r.y,
    sort: r.sort,
    enabled: r.enabled === 1,
    updatedAt: r.updated_at,
    seed: seeds.has(seedKey(r.map_id, r.npc_id)),
    hasStock: stocked.has(r.npc_id),
    quests: users.get(r.npc_id) ?? [],
  }));
}

export interface NpcMeta {
  maps: Array<{ id: string; size: number; realm: number | null; safe: boolean }>;
  kinds: string[];
  addable: string[];
  limits: { name: number };
  /** NPCs the quest screen can give a quest to are the ones of kind "quest". */
  interactRadius: number;
}

export function npcMeta(): NpcMeta {
  return {
    maps: MAP_IDS.map((id) => {
      const m = getMap(id);
      return { id, size: m.width, realm: m.realm, safe: m.safe };
    }),
    kinds: [...NPC_KINDS],
    addable: [...ADDABLE_KINDS],
    limits: { name: NAME_MAX },
    interactRadius: NPC_INTERACT_RADIUS,
  };
}

export interface NpcInput {
  id: string;
  mapId: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  sort: number;
  enabled: boolean;
}

export type NpcResult = { ok: true; updatedAt: number } | { ok: false; error: "invalid" | "unchanged" | "exists" | "not_found" | "version_conflict" | "in_use" | "locked" | "busy"; problems?: string[] };

function clean(posted: unknown): NpcInput | string {
  if (typeof posted !== "object" || posted === null) return "body";
  const o = posted as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== "string" || !/^[a-z0-9_]{1,24}$/.test(id)) return "id";
  if (typeof o.mapId !== "string" || !(MAP_IDS as readonly string[]).includes(o.mapId)) return "mapId";
  if (typeof o.kind !== "string" || !(NPC_KINDS as readonly string[]).includes(o.kind)) return "kind";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (name.length < 1 || name.length > NAME_MAX) return "name";
  const x = o.x;
  const y = o.y;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return "position";
  const sort = o.sort;
  if (typeof sort !== "number" || !Number.isInteger(sort) || sort < 0 || sort > 1000) return "sort";
  if (typeof o.enabled !== "boolean") return "enabled";
  return { id, mapId: o.mapId, kind: o.kind, name, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, sort, enabled: o.enabled };
}

/** Why a spot cannot hold an NPC, or null: inside the playing area, and somewhere a player can stand within reach of it (the town builders block the ground under an NPC). */
export function spotProblem(mapId: string, kind: string, x: number, y: number): string | null {
  const map = getMap(mapId as MapId);
  if (x >= map.width || y >= map.height || !inPlayRect(map, x, y)) return "outside";
  if (kind === "waygate") return null; // an array drawn on the ground: nothing to stand beside
  return nearestStandablePoint(map, x, y, NPC_INTERACT_RADIUS - 0.5) ? null : "unreachable";
}

const bumpNpcs = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'npcs'").bind(at);
const bumpShop = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'shop'").bind(at);

/** The quests still naming this NPC when it is the last one of its id in play. Empty when it may leave. */
async function usedBy(db: D1Database, mapId: string, id: string, kind: string): Promise<string[]> {
  const out: string[] = [];
  const sameElsewhere = await db.prepare("SELECT 1 AS x FROM npc_spots WHERE npc_id = ? AND map_id != ? AND enabled = 1 LIMIT 1").bind(id, mapId).first();
  if (!sameElsewhere) out.push(...((await questUsers(db)).get(id) ?? []));
  // The last alchemist in play: brewings waiting to be collected would have nobody to collect them from.
  if (kind === "alchemist") {
    const [others, waiting] = await Promise.all([
      db.prepare("SELECT 1 AS x FROM npc_spots WHERE kind = 'alchemist' AND enabled = 1 AND NOT (map_id = ? AND npc_id = ?) LIMIT 1").bind(mapId, id).first(),
      db.prepare("SELECT COUNT(*) AS n FROM brew_jobs WHERE craft = 'alchemy' AND collected_at IS NULL").first<{ n: number }>(),
    ]);
    if (!others && (waiting?.n ?? 0) > 0) out.push(`${waiting!.n} mẻ đan đang chờ nhận (không còn Đan Sư nào để nhận)`);
  }
  // The last blacksmith in play: forgings (Luyện khí) waiting to be collected would have nobody to collect them from.
  if (kind === "smith") {
    const [others, waiting] = await Promise.all([
      db.prepare("SELECT 1 AS x FROM npc_spots WHERE kind = 'smith' AND enabled = 1 AND NOT (map_id = ? AND npc_id = ?) LIMIT 1").bind(mapId, id).first(),
      db.prepare("SELECT COUNT(*) AS n FROM brew_jobs WHERE craft = 'forge' AND collected_at IS NULL").first<{ n: number }>(),
    ]);
    if (!others && (waiting?.n ?? 0) > 0) out.push(`${waiting!.n} mẻ luyện khí đang chờ nhận (không còn Thợ Rèn nào để nhận)`);
  }
  return out;
}

/** Creates (`isNew`) or changes an NPC. `updatedAt` is the token of the row the admin was looking at (ignored for a new one). */
export async function saveNpc(db: D1Database, adminEmail: string, posted: unknown, isNew: boolean, updatedAt: number, now = Date.now()): Promise<NpcResult> {
  const input = clean(posted);
  if (typeof input === "string") return { ok: false, error: "invalid", problems: [input] };
  const problem = spotProblem(input.mapId, input.kind, input.x, input.y);
  if (problem) return { ok: false, error: "invalid", problems: [problem] };
  await seeded(db);
  const row = await db.prepare("SELECT npc_id, map_id, kind, name_vi, x, y, sort, enabled, updated_at FROM npc_spots WHERE map_id = ? AND npc_id = ?").bind(input.mapId, input.id).first<Row>();
  const stamp = Math.max(now, updatedAt + 1);
  if (isNew) {
    if (row) return { ok: false, error: "exists" };
    if (!ADDABLE_KINDS.includes(input.kind as NpcSpot["kind"])) return { ok: false, error: "invalid", problems: ["kind"] };
    // One merchant record per id (its key is the NPC id alone): a merchant, alchemist or smith with a stock cannot stand in two towns.
    if (input.kind !== "quest" && input.kind !== "smith" && input.kind !== "waygate" && (await db.prepare("SELECT 1 AS x FROM shop_merchants WHERE npc_id = ?").bind(input.id).first())) return { ok: false, error: "exists" };
    const statements = [
      db.prepare("INSERT INTO npc_spots (npc_id, map_id, kind, name_vi, x, y, sort, enabled, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(input.id, input.mapId, input.kind, input.name, input.x, input.y, input.sort, input.enabled ? 1 : 0, stamp, adminEmail),
      bumpNpcs(db, stamp),
    ];
    if (input.kind === "merchant" || input.kind === "alchemist") {
      const buys = input.kind === "alchemist" ? JSON.stringify(["pill", "material"]) : null;
      statements.push(db.prepare("INSERT INTO shop_merchants (npc_id, map_id, name_vi, sell_rate, buys, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(input.id, input.mapId, input.name, SELL_RATE, buys, stamp, adminEmail), bumpShop(db, stamp));
    }
    statements.push(logStatement(db, { adminEmail, screen: NPC_LOG_SCREEN, content: `Thêm NPC «${input.name}» (${input.id}, ${input.kind}) ở ${input.mapId} (${input.x}, ${input.y})` }, now));
    try {
      await db.batch(statements);
    } catch (err) {
      return String(err).includes("UNIQUE") || String(err).includes("PRIMARY") ? { ok: false, error: "exists" } : fail(err);
    }
    reset();
    return { ok: true, updatedAt: stamp };
  }
  if (!row) return { ok: false, error: "not_found" };
  if (row.updated_at !== updatedAt) return { ok: false, error: "version_conflict" };
  if (row.kind !== input.kind) return { ok: false, error: "locked", problems: ["kind"] };
  const changed: string[] = [];
  if (row.name_vi !== input.name) changed.push("tên");
  if (row.x !== input.x || row.y !== input.y) changed.push("vị trí");
  if (row.sort !== input.sort) changed.push("thứ tự");
  if ((row.enabled === 1) !== input.enabled) changed.push(input.enabled ? "bật" : "tắt");
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  if (!input.enabled && row.enabled === 1) {
    const users = await usedBy(db, input.mapId, input.id, row.kind);
    if (users.length > 0) return { ok: false, error: "in_use", problems: users };
  }
  const statements = [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM npc_spots WHERE map_id = ? AND npc_id = ? AND updated_at = ?)").bind(input.mapId, input.id, updatedAt),
    db.prepare("UPDATE npc_spots SET name_vi = ?, x = ?, y = ?, sort = ?, enabled = ?, updated_at = ?, updated_by = ? WHERE map_id = ? AND npc_id = ?").bind(input.name, input.x, input.y, input.sort, input.enabled ? 1 : 0, stamp, adminEmail, input.mapId, input.id),
    bumpNpcs(db, stamp),
  ];
  if (row.name_vi !== input.name) statements.push(db.prepare("UPDATE shop_merchants SET name_vi = ? WHERE npc_id = ? AND map_id = ?").bind(input.name, input.id, input.mapId), bumpShop(db, stamp));
  statements.push(logStatement(db, { adminEmail, screen: NPC_LOG_SCREEN, content: `Sửa NPC «${input.name}» (${input.id}) ở ${input.mapId}: ${changed.join(", ")}` }, now));
  try {
    await db.batch(statements);
  } catch (err) {
    return await staleOrFail(db, input.mapId, input.id, updatedAt, err);
  }
  reset();
  return { ok: true, updatedAt: stamp };
}

/** Deletes an NPC the admin added. One the game starts with cannot be deleted (disable it instead). */
export async function deleteNpc(db: D1Database, adminEmail: string, mapId: string, id: string, updatedAt: number, now = Date.now()): Promise<NpcResult> {
  await seeded(db);
  const row = await db.prepare("SELECT npc_id, map_id, kind, name_vi, x, y, sort, enabled, updated_at FROM npc_spots WHERE map_id = ? AND npc_id = ?").bind(mapId, id).first<Row>();
  if (!row) return { ok: false, error: "not_found" };
  if (row.updated_at !== updatedAt) return { ok: false, error: "version_conflict" };
  if (startingNpcs().some((n) => n.mapId === mapId && n.id === id)) return { ok: false, error: "locked", problems: ["seed"] };
  const users = await usedBy(db, mapId, id, row.kind);
  if (users.length > 0) return { ok: false, error: "in_use", problems: users };
  const stamp = Math.max(now, updatedAt + 1);
  const statements = [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM npc_spots WHERE map_id = ? AND npc_id = ? AND updated_at = ?)").bind(mapId, id, updatedAt),
    db.prepare("DELETE FROM npc_spots WHERE map_id = ? AND npc_id = ?").bind(mapId, id),
    bumpNpcs(db, stamp),
    db.prepare("DELETE FROM shop_stock WHERE npc_id = ? AND EXISTS (SELECT 1 FROM shop_merchants WHERE npc_id = ? AND map_id = ?)").bind(id, id, mapId),
    db.prepare("DELETE FROM shop_merchants WHERE npc_id = ? AND map_id = ?").bind(id, mapId),
    bumpShop(db, stamp),
    logStatement(db, { adminEmail, screen: NPC_LOG_SCREEN, content: `Xóa NPC «${row.name_vi}» (${id}) ở ${mapId}` }, now),
  ];
  try {
    await db.batch(statements);
  } catch (err) {
    return await staleOrFail(db, mapId, id, updatedAt, err);
  }
  reset();
  return { ok: true, updatedAt: stamp };
}

function reset(): void {
  resetNpcsCache();
  resetMerchantsCache();
}

function fail(err: unknown): NpcResult {
  console.error("npc save failed", err);
  return { ok: false, error: "busy" };
}

/** The first statement of a batch fails when the row changed since the admin looked: that is a stale token, anything else is a real failure. */
async function staleOrFail(db: D1Database, mapId: string, id: string, updatedAt: number, err: unknown): Promise<NpcResult> {
  if (String(err).includes("inv_guard") && (await db.prepare("SELECT 1 AS x FROM npc_spots WHERE map_id = ? AND npc_id = ? AND updated_at = ?").bind(mapId, id, updatedAt).first()) === null) return { ok: false, error: "version_conflict" };
  return fail(err);
}

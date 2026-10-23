import { MAP_IDS, NPC_KINDS, setAllNpcs, startingNpcs, type NpcSpot } from "@game/shared";

/**
 * Where the NPCs stand and what they are called, in D1 (table `npc_spots`, migration 0032): seeded from the NPCs the map builders place the first
 * time they are read (only NPCs that have no row yet; edited, disabled or deleted rows are never put back), cached per isolate and re-read when
 * `config_versions.npcs` changes. Installing them (setAllNpcs) is what the commands and the `welcome` message use. A row that does not validate is
 * skipped; D1 down serves the last copy or the NPCs of the map builders.
 */
const TTL_MS = 30_000;
type Spot = NpcSpot & { mapId: string };
let cache: { value: Spot[]; version: number; checkedAt: number } | null = null;

interface Row {
  npc_id: string;
  map_id: string;
  kind: string;
  name_vi: string;
  x: number;
  y: number;
}

async function seed(db: D1Database, missing: Spot[]): Promise<void> {
  const rows = missing.map((n, i) => ({ id: n.id, map: n.mapId, kind: n.kind, name: n.name ?? n.id, x: n.x, y: n.y, s: i }));
  await db
    .prepare(
      "INSERT OR IGNORE INTO npc_spots (npc_id, map_id, kind, name_vi, x, y, sort, updated_at) SELECT json_extract(value, '$.id'), json_extract(value, '$.map'), json_extract(value, '$.kind'), json_extract(value, '$.name'), json_extract(value, '$.x'), json_extract(value, '$.y'), json_extract(value, '$.s'), ? FROM json_each(?)",
    )
    .bind(Date.now(), JSON.stringify(rows))
    .run();
}

function valid(r: Row): boolean {
  return (
    /^[a-z0-9_]{1,24}$/.test(r.npc_id) &&
    (MAP_IDS as readonly string[]).includes(r.map_id) &&
    (NPC_KINDS as readonly string[]).includes(r.kind) &&
    typeof r.name_vi === "string" &&
    r.name_vi.length >= 1 &&
    r.name_vi.length <= 40 &&
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    r.x >= 0 &&
    r.y >= 0
  );
}

async function load(db: D1Database): Promise<{ value: Spot[]; version: number }> {
  const known = new Set((await db.prepare("SELECT map_id, npc_id FROM npc_spots").all<{ map_id: string; npc_id: string }>()).results.map((r) => `${r.map_id}:${r.npc_id}`));
  const missing = startingNpcs().filter((n) => !known.has(`${n.mapId}:${n.id}`));
  if (missing.length > 0) await seed(db, missing);
  const [versionRow, rows] = await Promise.all([
    db.prepare("SELECT version FROM config_versions WHERE name = 'npcs'").first<{ version: number }>(),
    db.prepare("SELECT npc_id, map_id, kind, name_vi, x, y FROM npc_spots WHERE enabled = 1 ORDER BY map_id, sort, npc_id").all<Row>(),
  ]);
  const value: Spot[] = [];
  for (const r of rows.results) {
    if (!valid(r)) {
      console.error(`npc ${r.npc_id} is invalid`);
      continue;
    }
    value.push({ id: r.npc_id, mapId: r.map_id, kind: r.kind as NpcSpot["kind"], x: r.x, y: r.y, name: r.name_vi });
  }
  setAllNpcs(value);
  return { value, version: versionRow?.version ?? 0 };
}

/** The NPCs in force (cached). Never throws: with no copy and D1 down the NPCs of the map builders stay in force. */
export async function getNpcs(db: D1Database, now = Date.now()): Promise<Spot[]> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.value;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'npcs'").first<{ version: number }>();
      if ((v?.version ?? 0) === cache.version) {
        cache.checkedAt = now;
        return cache.value;
      }
    }
    const fresh = await load(db);
    cache = { ...fresh, checkedAt: now };
    return fresh.value;
  } catch (err) {
    console.error("npcs unavailable", err);
    return cache?.value ?? [];
  }
}

export function resetNpcsCache(): void {
  cache = null;
}

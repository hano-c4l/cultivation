import { allDefaultMasterEntries, DEFAULT_GEAR_SET_NAMES, EQUIP_KINDS, GENDERED_KINDS, REALMS, rollForType, setGearSetNames, STAGES_PER_REALM, validMasterStats, masterKey, type EquipKind, type EquipStyle, type MasterStats, type RolledStats } from "@game/shared";

/**
 * The gear master table in D1 (migration 0027): stat ranges for every kind, style, realm and bậc, and the names of the gear sets.
 * Seeded from the code defaults the first time it is read (INSERT OR IGNORE, so edited rows are never overwritten), cached per isolate
 * and re-read when `config_versions.gear_master` changes. A D1 failure serves the last copy, or the defaults when there is none.
 */
export interface GearMaster {
  stats: ReadonlyMap<string, MasterStats>;
  setNames: string[][];
}

const TTL_MS = 30_000;
let cache: { master: GearMaster; version: number; checkedAt: number } | null = null;

const stylesOf = (kind: EquipKind): readonly EquipStyle[] => (GENDERED_KINDS.has(kind) ? ["m", "f"] : ["u"]);

function defaults(): GearMaster {
  const stats = new Map<string, MasterStats>();
  for (const e of allDefaultMasterEntries(REALMS.length, STAGES_PER_REALM, stylesOf, EQUIP_KINDS)) stats.set(masterKey(e.kind, e.style, e.realm, e.tier), e.stats);
  return { stats, setNames: DEFAULT_GEAR_SET_NAMES.map((r) => [...r]) };
}

/**
 * Writes the code defaults into the tables where rows are missing. Few statements on purpose (D1 counts every statement of a batch against
 * the per-call query limit, 50 on the Free plan): rows travel as JSON and are unpacked with json_each.
 */
async function seed(db: D1Database): Promise<void> {
  const d = defaults();
  const now = Date.now();
  const masterRows = [...d.stats.entries()].map(([key, stats]) => {
    const [kind, style, realm, tier] = key.split(".");
    return { k: key, kind, style, realm: Number(realm), tier: Number(tier), stats: JSON.stringify(stats) };
  });
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < masterRows.length; i += 150) {
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO equipment_master (item_key, kind, style, realm, tier, stats, updated_at) " +
            "SELECT json_extract(value, '$.k'), json_extract(value, '$.kind'), json_extract(value, '$.style'), json_extract(value, '$.realm'), json_extract(value, '$.tier'), json_extract(value, '$.stats'), ? FROM json_each(?)",
        )
        .bind(now, JSON.stringify(masterRows.slice(i, i + 150))),
    );
  }
  const sets = d.setNames.flatMap((names, realm) => names.map((name, t) => ({ realm, tier: t + 1, name })));
  statements.push(
    db
      .prepare("INSERT OR IGNORE INTO equipment_sets (realm, tier, name_vi, updated_at) SELECT json_extract(value, '$.realm'), json_extract(value, '$.tier'), json_extract(value, '$.name'), ? FROM json_each(?)")
      .bind(now, JSON.stringify(sets)),
  );
  await db.batch(statements);
}

async function load(db: D1Database): Promise<{ master: GearMaster; version: number }> {
  const read = () =>
    Promise.all([
      db.prepare("SELECT version FROM config_versions WHERE name = 'gear_master'").first<{ version: number }>(),
      db.prepare("SELECT item_key, stats FROM equipment_master").all<{ item_key: string; stats: string }>(),
      db.prepare("SELECT realm, tier, name_vi FROM equipment_sets").all<{ realm: number; tier: number; name_vi: string }>(),
    ]);
  let [versionRow, masterRows, setRows] = await read();
  const expected = defaults();
  if (masterRows.results.length < expected.stats.size || setRows.results.length < expected.setNames.flat().length) {
    await seed(db);
    [versionRow, masterRows, setRows] = await read();
  }
  const out = defaults(); // anything the tables do not hold (or hold broken) falls back to the default
  for (const r of masterRows.results) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.stats);
    } catch {
      continue;
    }
    if (validMasterStats(parsed) && Object.keys(parsed).length > 0) (out.stats as Map<string, MasterStats>).set(r.item_key, parsed);
  }
  for (const r of setRows.results) if (out.setNames[r.realm] && r.tier >= 1 && r.tier <= STAGES_PER_REALM) out.setNames[r.realm]![r.tier - 1] = r.name_vi;
  return { master: out, version: versionRow?.version ?? 0 };
}

/** The current master table (cached). Never throws: with no copy at all and D1 down it returns the code defaults. */
export async function getGearMaster(db: D1Database, now = Date.now()): Promise<GearMaster> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.master;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'gear_master'").first<{ version: number }>();
      if ((v?.version ?? 0) === cache.version) {
        cache.checkedAt = now;
        return cache.master;
      }
    }
    const fresh = await load(db);
    cache = { ...fresh, checkedAt: now };
    setGearSetNames(fresh.master.setNames);
    return fresh.master;
  } catch (err) {
    console.error("gear master unavailable", err);
    if (cache) return cache.master;
    return defaults();
  }
}

/** Rolls the stats for a new piece of `type` (undefined when the type is not rolled). */
export async function rollGear(db: D1Database, type: string, rand: () => number = Math.random): Promise<RolledStats | undefined> {
  const master = await getGearMaster(db);
  return rollForType(type, rand, (key) => master.stats.get(key));
}

/** Test hook. */
export function resetGearMasterCache(): void {
  cache = null;
}

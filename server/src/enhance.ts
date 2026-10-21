import { DEFAULT_ENHANCE_TABLE, setEnhanceTable, validEnhanceLevel, type EnhanceLevelDef } from "@game/shared";

/**
 * The blacksmith's upgrade rules in D1 (table `enhance_levels`, migration 0028): seeded from the code defaults the first time they are
 * read (INSERT OR IGNORE, so edited rows stay), cached per isolate and re-read when `config_versions.enhance` changes. A D1 failure serves
 * the last copy or the defaults. Reading also installs the rows into the shared table (setEnhanceTable), which the stat maths uses.
 */
const TTL_MS = 30_000;
let cache: { rows: EnhanceLevelDef[]; version: number; checkedAt: number } | null = null;

interface Row {
  level: number;
  success_pct: number;
  stat_pct: number;
  fail_bonus_pct: number;
  drop_on_fail: number;
  materials: number;
  linh_mult: number;
}

async function seed(db: D1Database): Promise<void> {
  const rows = DEFAULT_ENHANCE_TABLE.map((r) => ({ level: r.level, s: r.successPct, p: r.statPct, f: r.failBonusPct, d: r.dropOnFail ? 1 : 0, m: r.materials, l: r.linhMult }));
  await db
    .prepare(
      "INSERT OR IGNORE INTO enhance_levels (level, success_pct, stat_pct, fail_bonus_pct, drop_on_fail, materials, linh_mult, updated_at) " +
        "SELECT json_extract(value, '$.level'), json_extract(value, '$.s'), json_extract(value, '$.p'), json_extract(value, '$.f'), json_extract(value, '$.d'), json_extract(value, '$.m'), json_extract(value, '$.l'), ? FROM json_each(?)",
    )
    .bind(Date.now(), JSON.stringify(rows))
    .run();
}

async function load(db: D1Database): Promise<{ rows: EnhanceLevelDef[]; version: number }> {
  const read = () =>
    Promise.all([
      db.prepare("SELECT version FROM config_versions WHERE name = 'enhance'").first<{ version: number }>(),
      db.prepare("SELECT level, success_pct, stat_pct, fail_bonus_pct, drop_on_fail, materials, linh_mult FROM enhance_levels ORDER BY level").all<Row>(),
    ]);
  let [versionRow, res] = await read();
  if (res.results.length < DEFAULT_ENHANCE_TABLE.length) {
    await seed(db);
    [versionRow, res] = await read();
  }
  const rows = res.results.map<Partial<EnhanceLevelDef>>((r) => ({
    level: r.level,
    successPct: r.success_pct,
    statPct: r.stat_pct,
    failBonusPct: r.fail_bonus_pct,
    dropOnFail: r.drop_on_fail === 1,
    materials: r.materials,
    linhMult: r.linh_mult,
  }));
  setEnhanceTable(rows);
  // What is served is what the shared table now holds (a broken row fell back to its default).
  const merged = DEFAULT_ENHANCE_TABLE.map((def) => {
    const r = rows.find((x) => x.level === def.level);
    return validEnhanceLevel(r) ? { ...r } : def;
  });
  return { rows: merged, version: versionRow?.version ?? 0 };
}

/** The current rules (cached). Never throws: with no copy and D1 down it returns the defaults. */
export async function getEnhanceTable(db: D1Database, now = Date.now()): Promise<EnhanceLevelDef[]> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.rows;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'enhance'").first<{ version: number }>();
      if ((v?.version ?? 0) === cache.version) {
        cache.checkedAt = now;
        return cache.rows;
      }
    }
    const fresh = await load(db);
    cache = { ...fresh, checkedAt: now };
    return fresh.rows;
  } catch (err) {
    console.error("enhance table unavailable", err);
    return cache?.rows ?? [...DEFAULT_ENHANCE_TABLE];
  }
}

/** The extra success chance (percent) built up by failed upgrades, for the given pieces of a character (only those with some). */
export async function loadPity(db: D1Database, characterId: string): Promise<Record<string, number>> {
  const { results } = await db
    .prepare("SELECT id, enhance_bonus FROM item_instances WHERE owner_character_id = ? AND enhance_bonus > 0")
    .bind(characterId)
    .all<{ id: string; enhance_bonus: number }>();
  return Object.fromEntries(results.map((r) => [r.id, r.enhance_bonus]));
}

export function resetEnhanceCache(): void {
  cache = null;
}

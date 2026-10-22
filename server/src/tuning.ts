import { DEFAULT_TUNING, setTuning, TUNING_GROUPS, tuning, type Tuning } from "@game/shared";

/**
 * The 2j balance numbers in D1 (table `game_tuning`, migration 0030): seeded from the code defaults the first time they are read
 * (INSERT OR IGNORE, so edited rows stay), cached per isolate and re-read when `config_versions.tuning` changes. A D1 failure serves the
 * last copy or the defaults. Reading also installs the groups into the shared tuning (setTuning), which the game maths uses. A group an
 * admin saved with `updated_at` and a new `config_versions.tuning` is picked up within the cache time.
 */
const TTL_MS = 30_000;
let cache: { value: Tuning; version: number; checkedAt: number } | null = null;

async function seed(db: D1Database): Promise<void> {
  const rows = TUNING_GROUPS.map((name) => ({ n: name, v: JSON.stringify(DEFAULT_TUNING[name]) }));
  await db
    .prepare("INSERT OR IGNORE INTO game_tuning (name, value, updated_at) SELECT json_extract(value, '$.n'), json_extract(value, '$.v'), ? FROM json_each(?)")
    .bind(Date.now(), JSON.stringify(rows))
    .run();
}

async function load(db: D1Database): Promise<{ value: Tuning; version: number }> {
  const read = () =>
    Promise.all([
      db.prepare("SELECT version FROM config_versions WHERE name = 'tuning'").first<{ version: number }>(),
      db.prepare("SELECT name, value FROM game_tuning").all<{ name: string; value: string }>(),
    ]);
  let [versionRow, res] = await read();
  if (res.results.length < TUNING_GROUPS.length) {
    await seed(db);
    [versionRow, res] = await read();
  }
  const parsed: Record<string, unknown> = {};
  for (const r of res.results) {
    try {
      parsed[r.name] = JSON.parse(r.value);
    } catch {
      console.error(`tuning group ${r.name} is not JSON`);
    }
  }
  setTuning(parsed);
  return { value: tuning() as Tuning, version: versionRow?.version ?? 0 };
}

/** The current numbers (cached). Never throws: with no copy and D1 down it installs and returns the defaults. */
export async function getTuning(db: D1Database, now = Date.now()): Promise<Tuning> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.value;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'tuning'").first<{ version: number }>();
      if ((v?.version ?? 0) === cache.version) {
        cache.checkedAt = now;
        return cache.value;
      }
    }
    const fresh = await load(db);
    cache = { ...fresh, checkedAt: now };
    return fresh.value;
  } catch (err) {
    console.error("tuning unavailable", err);
    return cache?.value ?? (tuning() as Tuning);
  }
}

export function resetTuningCache(): void {
  cache = null;
}

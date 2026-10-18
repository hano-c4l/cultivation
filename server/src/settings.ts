import { SETTINGS, settingDef, validSettingValue } from "@game/shared";

/** Overrides rarely change, so each isolate keeps them for a short while instead of reading D1 on every purchase. */
const CACHE_MS = 30_000;
let cache: { at: number; values: Map<string, number> } | null = null;

async function load(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db.prepare("SELECT key, value FROM game_settings").all<{ key: string; value: string }>();
  const values = new Map<string, number>();
  for (const r of results) {
    const n = Number(r.value);
    if (validSettingValue(r.key, n)) values.set(r.key, n);
  }
  return values;
}

/** The value of a setting: the stored override when valid, otherwise the default. Never throws: a D1 error serves the last copy or the default. */
export async function getSetting(db: D1Database, key: string, now = Date.now()): Promise<number> {
  const def = settingDef(key);
  if (!def) throw new Error(`unknown setting ${key}`);
  if (!cache || now - cache.at > CACHE_MS) {
    try {
      cache = { at: now, values: await load(db) };
    } catch (err) {
      console.error("settings read failed", err);
      if (!cache) return def.default;
    }
  }
  return cache.values.get(key) ?? def.default;
}

/** Every setting with its effective value (the admin screen). Reads D1 directly. */
export async function allSettings(db: D1Database): Promise<Array<{ key: string; labelVi: string; value: number; default: number; min: number; max: number }>> {
  const values = await load(db);
  return SETTINGS.map((s) => ({ key: s.key, labelVi: s.labelVi, value: values.get(s.key) ?? s.default, default: s.default, min: s.min, max: s.max }));
}

/** Stores an override. The caller has checked `validSettingValue`. */
export async function setSetting(db: D1Database, key: string, value: number, actor: string, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT INTO game_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(key, String(value), now, actor)
    .run();
  cache = null;
}

/** Test hook. */
export function resetSettingsCache(): void {
  cache = null;
}

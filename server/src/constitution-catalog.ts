import { validateCatalog, type ConstitutionCatalog, type ConstitutionDef, type ConstitutionEffect, type EffectMode, type TargetKind } from "@game/shared";

/**
 * Reads the constitution catalogue from D1 (tables of migration 0008). The read is validated with the same
 * validateCatalog the future admin write path must pass, so a half-edited catalogue is never served.
 *
 * The future write path: replace the whole catalogue in ONE batch that also bumps config_versions, guarded by an
 * `expectedVersion` (a mismatch is rejected so two admins cannot overwrite each other), after validateCatalog passed.
 */
export async function loadConstitutionCatalog(db: D1Database): Promise<ConstitutionCatalog> {
  const [versionRow, cons, tiers, effects] = await Promise.all([
    db.prepare("SELECT version FROM config_versions WHERE name = 'constitutions'").first<{ version: number }>(),
    db
      .prepare("SELECT id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order FROM constitutions ORDER BY sort_order, id")
      .all<{ id: string; name_vi: string; desc_vi: string; roll_weight: number; is_default: number; enabled: number; sort_order: number }>(),
    db
      .prepare("SELECT constitution_id, tier, name_vi, roll_weight FROM constitution_tiers ORDER BY constitution_id, tier")
      .all<{ constitution_id: string; tier: number; name_vi: string; roll_weight: number }>(),
    db
      .prepare("SELECT constitution_id, tier, stat, target_kind, target_tag, mode, value FROM constitution_effects ORDER BY constitution_id, tier, id")
      .all<{ constitution_id: string; tier: number; stat: string; target_kind: string; target_tag: string; mode: string; value: number }>(),
  ]);
  const constitutions: ConstitutionDef[] = cons.results.map((c) => ({
    id: c.id,
    nameVi: c.name_vi,
    descVi: c.desc_vi,
    rollWeight: c.roll_weight,
    isDefault: c.is_default === 1,
    enabled: c.enabled === 1,
    sortOrder: c.sort_order,
    tiers: tiers.results
      .filter((t) => t.constitution_id === c.id)
      .map((t) => ({
        tier: t.tier,
        nameVi: t.name_vi,
        rollWeight: t.roll_weight,
        effects: effects.results
          .filter((e) => e.constitution_id === c.id && e.tier === t.tier)
          .map<ConstitutionEffect>((e) => ({ stat: e.stat, targetKind: e.target_kind as TargetKind, targetTag: e.target_tag, mode: e.mode as EffectMode, value: e.value })),
      })),
  }));
  const catalog: ConstitutionCatalog = { version: versionRow?.version ?? 0, constitutions };
  const problems = validateCatalog(catalog);
  if (problems.length > 0) throw new Error(`constitution catalogue is invalid: ${problems.join("; ")}`);
  return catalog;
}

const TTL_MS = 30_000;
let cache: { catalog: ConstitutionCatalog; checkedAt: number } | null = null;

/**
 * The current catalogue, cached per isolate. After the TTL one cheap query checks the version and the catalogue is only
 * re-read when it changed. If D1 fails the last good copy is served; with none the error propagates, so character
 * creation never rolls from a made-up catalogue (a disabled constitution must not be rolled by accident).
 */
export async function getConstitutionCatalog(db: D1Database, now = Date.now()): Promise<ConstitutionCatalog> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.catalog;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'constitutions'").first<{ version: number }>();
      if (v && v.version === cache.catalog.version) {
        cache.checkedAt = now;
        return cache.catalog;
      }
    }
    const catalog = await loadConstitutionCatalog(db);
    cache = { catalog, checkedAt: now };
    return catalog;
  } catch (err) {
    if (cache) {
      console.error("constitution catalogue reload failed, serving the last good copy", err);
      cache.checkedAt = now - TTL_MS + 5_000; // try again in 5 seconds
      return cache.catalog;
    }
    throw err;
  }
}

/** Test hook: forget the cached catalogue. */
export function resetConstitutionCatalogCache(): void {
  cache = null;
}

export type SaveCatalogResult = { ok: true; version: number } | { ok: false; error: "invalid" | "version_conflict" | "missing_constitution" | "default_changed" | "too_large"; problems?: string[] };

/**
 * The admin write path: replaces the whole catalogue in ONE batch that also bumps `config_versions`. The first statement of the batch makes the version
 * NULL (a NOT NULL violation, so the whole batch rolls back) when the stored version is not `expectedVersion`, which keeps two admins from overwriting
 * each other even if they save at the same moment. Rules (see shared/src/constitutions.ts): the catalogue must pass validateCatalog, no constitution of
 * the stored one may disappear (characters refer to the id: use `enabled: false` instead), and the default constitution stays the same one.
 */
/** D1 allows 50 statements in one batch (Free plan); the save keeps a margin under it. */
export const MAX_SAVE_STATEMENTS = 45;

export async function saveConstitutionCatalog(db: D1Database, expectedVersion: number, next: ConstitutionCatalog, now = Date.now(), extra: D1PreparedStatement[] = []): Promise<SaveCatalogResult> {
  let problems: string[];
  try {
    problems = validateCatalog(next);
  } catch {
    problems = ["the catalogue is not shaped like a catalogue"]; // a body that is not a catalogue at all
  }
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const current = await loadConstitutionCatalog(db);
  if (current.version !== expectedVersion) return { ok: false, error: "version_conflict" };
  const nextIds = new Set(next.constitutions.map((c) => c.id));
  if (current.constitutions.some((c) => !nextIds.has(c.id))) return { ok: false, error: "missing_constitution" };
  const oldDefault = current.constitutions.find((c) => c.isDefault)?.id;
  if (next.constitutions.find((c) => c.isDefault)?.id !== oldDefault) return { ok: false, error: "default_changed" };

  // Few statements, not one per row: D1 counts every statement of a batch as a query against the per-invocation limit (50 on the Free plan), and
  // the default catalogue alone has dozens of rows. Rows go in multi-row INSERTs, chunked under the 100 bound parameters a statement may have.
  const statements: D1PreparedStatement[] = [
    db
      .prepare("UPDATE config_versions SET version = CASE WHEN version = ? THEN version + 1 ELSE NULL END, updated_at = ? WHERE name = 'constitutions'")
      .bind(expectedVersion, now),
    db.prepare("DELETE FROM constitution_effects"),
    db.prepare("DELETE FROM constitution_tiers"),
  ];
  const insertRows = (head: string, columns: number, rows: unknown[][], tail = "") => {
    const per = Math.floor(100 / columns);
    for (let at = 0; at < rows.length; at += per) {
      const chunk = rows.slice(at, at + per);
      const marks = `(${Array(columns).fill("?").join(", ")})`;
      statements.push(db.prepare(`${head} VALUES ${chunk.map(() => marks).join(", ")}${tail}`).bind(...chunk.flat()));
    }
  };
  insertRows(
    "INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order)",
    7,
    next.constitutions.map((c) => [c.id, c.nameVi, c.descVi, c.rollWeight, c.isDefault ? 1 : 0, c.enabled ? 1 : 0, c.sortOrder]),
    " ON CONFLICT(id) DO UPDATE SET name_vi = excluded.name_vi, desc_vi = excluded.desc_vi, roll_weight = excluded.roll_weight, enabled = excluded.enabled, sort_order = excluded.sort_order",
  );
  insertRows(
    "INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight)",
    4,
    next.constitutions.flatMap((c) => c.tiers.map((t) => [c.id, t.tier, t.nameVi, t.rollWeight])),
  );
  insertRows(
    "INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value)",
    7,
    next.constitutions.flatMap((c) => c.tiers.flatMap((t) => t.effects.map((e) => [c.id, t.tier, e.stat, e.targetKind, e.targetTag, e.mode, e.value]))),
  );
  statements.push(...extra);
  if (statements.length > MAX_SAVE_STATEMENTS) return { ok: false, error: "too_large", problems: [`the catalogue needs ${statements.length} statements, more than one batch may hold (${MAX_SAVE_STATEMENTS})`] };
  try {
    await db.batch(statements);
  } catch (err) {
    // The guard statement fails when someone saved between our read and the batch.
    if (String(err).includes("config_versions")) return { ok: false, error: "version_conflict" };
    throw err;
  }
  resetConstitutionCatalogCache();
  return { ok: true, version: expectedVersion + 1 };
}

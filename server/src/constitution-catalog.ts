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

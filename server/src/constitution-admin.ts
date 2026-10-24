import { CONSTITUTION_STATS, isSkillId, type ConstitutionCatalog, type ConstitutionDef } from "@game/shared";
import { logStatement } from "./admin-log";
import { loadConstitutionCatalog, saveConstitutionCatalog, type SaveCatalogResult } from "./constitution-catalog";

/**
 * The admin side of the constitutions (docs/PHASE3.md 3i): who holds each one, and a save that refuses a change of nothing, writes a log line saying
 * which constitution changed and how, and warns about effects the game does not use yet. A skill an effect targets must exist, which is checked here and
 * not in `validateCatalog` (the loader runs that one, so a skill removed from the code later would reject the whole catalogue).
 */
export const CONSTITUTION_LOG_SCREEN = "Thiên phú";

/** Characters per constitution and tier. */
export async function constitutionHolders(db: D1Database): Promise<Array<{ id: string; tier: number; count: number }>> {
  const { results } = await db.prepare("SELECT constitution AS id, constitution_tier AS tier, COUNT(*) AS count FROM characters GROUP BY constitution, constitution_tier").all<{ id: string; tier: number; count: number }>();
  return results;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** What changed in one constitution, as short Vietnamese words for the log; empty when it is the same. */
export function describeConstitutionChange(before: ConstitutionDef | undefined, after: ConstitutionDef): string[] {
  if (!before) return ["mới"];
  const out: string[] = [];
  if (before.nameVi !== after.nameVi) out.push("tên");
  if (before.descVi !== after.descVi) out.push("mô tả");
  if (before.rollWeight !== after.rollWeight) out.push("tỉ lệ tung");
  if (before.enabled !== after.enabled) out.push(after.enabled ? "bật" : "tắt");
  if (before.sortOrder !== after.sortOrder) out.push("thứ tự");
  if (before.tiers.length !== after.tiers.length) out.push(`số cấp ${before.tiers.length} → ${after.tiers.length}`);
  if (!sameJson(before.tiers.map((t) => [t.nameVi, t.rollWeight]), after.tiers.map((t) => [t.nameVi, t.rollWeight]))) out.push("tên và tỉ lệ các cấp");
  if (!sameJson(before.tiers.map((t) => t.effects), after.tiers.map((t) => t.effects))) out.push("hiệu ứng");
  return out;
}

export type ConstitutionSaveResult = SaveCatalogResult | { ok: false; error: "unchanged" | "unknown_skill"; problems?: string[] };

/** Effects that are new or changed in the saved constitutions and sit on a stat the game does not use yet ("chưa có tác dụng"): saved, but the admin is told. */
export function unusedEffects(before: ConstitutionCatalog, after: ConstitutionCatalog, only: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const c of after.constitutions) {
    if (!only.has(c.id)) continue;
    const old = before.constitutions.find((x) => x.id === c.id);
    for (const t of c.tiers) {
      const had = new Set((old?.tiers[t.tier - 1]?.effects ?? []).map((e) => JSON.stringify(e)));
      for (const e of t.effects) if (!had.has(JSON.stringify(e)) && CONSTITUTION_STATS[e.stat] && !CONSTITUTION_STATS[e.stat]!.applied) out.push(`${c.nameVi}, cấp ${t.tier}: ${CONSTITUTION_STATS[e.stat]!.nameVi}`);
    }
  }
  return [...new Set(out)];
}

export async function saveConstitutionAdmin(db: D1Database, adminEmail: string, expectedVersion: number, next: ConstitutionCatalog, now = Date.now()): Promise<ConstitutionSaveResult & { warnings?: string[] }> {
  const current = await loadConstitutionCatalog(db);
  const changes: string[] = [];
  const changedIds = new Set<string>();
  if (Array.isArray(next.constitutions)) {
    for (const c of next.constitutions) {
      const what = describeConstitutionChange(current.constitutions.find((x) => x.id === c.id), c);
      if (what.length > 0) {
        changes.push(`«${c.nameVi}» (${c.id}): ${what.join(", ")}`);
        changedIds.add(c.id);
      }
    }
  }
  if (changes.length === 0 && current.version === expectedVersion) return { ok: false, error: "unchanged" };
  const missingSkill: string[] = [];
  // Only the constitutions being saved: a stale target left in another one must not block every save.
  for (const c of next.constitutions ?? []) for (const t of changedIds.has(c.id) ? c.tiers ?? [] : []) for (const e of t.effects ?? []) if (e.targetKind === "skill" && !isSkillId(e.targetTag)) missingSkill.push(`${c.id} cấp ${t.tier}: kỹ năng ${e.targetTag} không tồn tại`);
  if (missingSkill.length > 0) return { ok: false, error: "unknown_skill", problems: missingSkill };
  const log = logStatement(db, { adminEmail, screen: CONSTITUTION_LOG_SCREEN, content: `Lưu thể chất ${changes.join("; ")}` }, now);
  const result = await saveConstitutionCatalog(db, expectedVersion, next, now, [log]);
  return result.ok ? { ...result, warnings: unusedEffects(current, next, changedIds) } : result;
}

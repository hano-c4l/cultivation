import { SKILLS, SKILL_FX_KINDS, SKILL_TEMPLATES, applySkillOverride, baseSkill, effectiveSkill, isSkillTemplateId, rootTemplateOf, skillGrade, validTuningGroup, type SkillDef, type SkillKind, type SkillNumbers, type SkillTemplate, type Tuning } from "@game/shared";
import { logStatement } from "./admin-log";
import { getTuning, resetTuningCache } from "./tuning";

/**
 * The admin side of the skills (docs/PHASE3.md 3h). The skills themselves are written in the code (root skills from templates, one per realm; gear, path and
 * learned skills); what an admin changes is kept in the tuning group `skillOverrides` (the table `game_tuning`), which the game already merges in `getSkill` and
 * which reaches the client with the tuning. An entry is under a skill id, or under the id of a root template (then it applies to that skill in every realm,
 * and an entry under the full id wins). The group is validated as a whole by `validTuningGroup` (structure only); which skills exist and which fields fit
 * a kind of skill are checked here, when an admin saves. Creating skills and new shapes (cone, circle, homing, conditions) are not here yet.
 */
export const SKILL_LOG_SCREEN = "Kỹ năng";
export const SKILL_NAME_MAX = 40;
export const SKILL_DESC_MAX = 200;

type Overrides = Tuning["skillOverrides"];

/** The fields an override may carry for each kind of skill. */
const FIELDS_OF_KIND: Record<SkillKind, ReadonlyArray<keyof SkillNumbers>> = {
  attack: ["nameVi", "descVi", "power", "mpCost", "cooldownMs", "range", "fx"],
  heal: ["nameVi", "descVi", "power", "mpCost", "cooldownMs"],
  buff: ["nameVi", "descVi", "power", "mpCost", "cooldownMs", "buffDurationMs"],
  teleport: ["nameVi", "descVi", "mpCost", "cooldownMs", "range"],
  passive: ["nameVi", "descVi", "power"],
};

/** The bounds of the numbers (power depends on the kind: an attack multiplies the caster's attack, a heal is a share of the maximum HP, a buff or passive a share of a stat). */
function boundsProblem(kind: SkillKind, f: Partial<SkillNumbers>): string | null {
  const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
  const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const power = { attack: [0.1, 30], heal: [0.01, 0.9], buff: [0.01, 1.5], passive: [0.01, 1.5], teleport: [0, 0] }[kind];
  if (f.power !== undefined && !num(f.power, power[0]!, power[1]!)) return `power must be between ${power[0]} and ${power[1]}`;
  if (f.mpCost !== undefined && !int(f.mpCost, 0, 10_000)) return "mpCost must be a whole number from 0 to 10000";
  if (f.cooldownMs !== undefined && !int(f.cooldownMs, 500, 3_600_000)) return "cooldownMs must be a whole number from 500 to 3600000";
  if (f.range !== undefined && !num(f.range, 1, 30)) return "range must be between 1 and 30 tiles";
  if (f.buffDurationMs !== undefined && !int(f.buffDurationMs, 1000, 600_000)) return "buffDurationMs must be a whole number from 1000 to 600000";
  if (f.nameVi !== undefined && !(typeof f.nameVi === "string" && f.nameVi.trim().length >= 1 && [...f.nameVi].length <= SKILL_NAME_MAX)) return `the name must be 1 to ${SKILL_NAME_MAX} characters`;
  if (f.descVi !== undefined && !(typeof f.descVi === "string" && f.descVi.trim().length >= 1 && [...f.descVi].length <= SKILL_DESC_MAX)) return `the description must be 1 to ${SKILL_DESC_MAX} characters`;
  if (f.fx !== undefined && !(SKILL_FX_KINDS as readonly string[]).includes(f.fx)) return "fx must be melee or ranged";
  return null;
}

interface Row {
  value: string;
  updated_at: number;
}

async function readOverrides(db: D1Database): Promise<{ overrides: Overrides; token: number }> {
  await getTuning(db); // seeds the group the first time
  const row = await db.prepare("SELECT value, updated_at FROM game_tuning WHERE name = 'skillOverrides'").first<Row>();
  let overrides: Overrides = {};
  try {
    const parsed: unknown = row ? JSON.parse(row.value) : {};
    if (validTuningGroup("skillOverrides", parsed)) overrides = parsed as Overrides;
  } catch {
    // an unreadable row counts as no overrides (the game does the same)
  }
  return { overrides, token: row?.updated_at ?? 0 };
}

export interface SkillListEntry {
  id: string;
  /** A root skill template (the entry applies to every realm), otherwise one skill. */
  template: boolean;
  kind: SkillKind;
  source: string;
  element: string | null;
  realm: number | null;
  /** The skill as the code writes it: what "mặc định" means. */
  base: Pick<SkillDef, "nameVi" | "descVi" | "power" | "mpCost" | "cooldownMs" | "range"> & { buffDurationMs?: number; fx?: string };
  /** This skill's own entry in the overrides, if any. */
  override: Partial<SkillNumbers> | null;
  /** The entry of its root template that also applies, if any. */
  templateOverride: Partial<SkillNumbers> | null;
  /** The numbers after the overrides, and what they come to for a character of the skill's own realm at the first mastery level (an example). */
  effective: { nameVi: string; power: number; mpCost: number; cooldownMs: number; range: number; buffDurationMs?: number };
  example: { power: number; mpCost: number; cooldownMs: number } | null;
  fields: ReadonlyArray<keyof SkillNumbers>;
}

/** A root template written as a skill (realm 0), to show and to compare with. */
function templateAsSkill(t: SkillTemplate): SkillDef {
  return { id: t.id, nameVi: t.nameVi, descVi: t.descVi, kind: t.kind, source: "root", element: null, realm: 0, mpCost: t.mpCost, cooldownMs: t.cooldownMs, range: t.range, power: t.power, ...(t.buff ? { buff: t.buff } : {}) };
}

function entryOf(def: SkillDef, overrides: Overrides, template: boolean): SkillListEntry {
  const tpl = template ? undefined : rootTemplateOf(def.id);
  const own = overrides[def.id] ?? null;
  const shared = tpl ? overrides[tpl] ?? null : null;
  const eff = applySkillOverride(def, { ...shared, ...own });
  return {
    id: def.id,
    template,
    kind: def.kind,
    source: def.source,
    element: def.element,
    realm: template ? null : def.realm,
    base: { nameVi: def.nameVi, descVi: def.descVi, power: def.power, mpCost: def.mpCost, cooldownMs: def.cooldownMs, range: def.range, ...(def.buff ? { buffDurationMs: def.buff.durationMs } : {}) },
    override: own,
    templateOverride: shared,
    effective: { nameVi: eff.nameVi, power: eff.power, mpCost: eff.mpCost, cooldownMs: eff.cooldownMs, range: eff.range, ...(eff.buff ? { buffDurationMs: eff.buff.durationMs } : {}) },
    example: template ? null : effectiveSkill(eff, { realm: def.realm, grade: skillGrade(def, 0), level: 0 }),
    fields: FIELDS_OF_KIND[def.kind],
  };
}

export async function listSkills(db: D1Database): Promise<{ skills: SkillListEntry[]; token: number; limits: { name: number; description: number }; fx: readonly string[] }> {
  const { overrides, token } = await readOverrides(db);
  const templates: SkillListEntry[] = SKILL_TEMPLATES.map((t) => entryOf(templateAsSkill(t), overrides, true));
  return { skills: [...templates, ...SKILLS.map((s) => entryOf(s, overrides, false))], token, limits: { name: SKILL_NAME_MAX, description: SKILL_DESC_MAX }, fx: SKILL_FX_KINDS };
}

export type SkillSaveResult =
  | { ok: true; updatedAt: number; changed: string[]; reset: boolean }
  | { ok: false; error: "unknown_skill" | "invalid" | "unchanged" | "version_conflict"; problems?: string[] };

const LABELS: Record<keyof SkillNumbers, string> = { nameVi: "tên", descVi: "mô tả", power: "sức mạnh", mpCost: "MP", cooldownMs: "hồi chiêu", range: "tầm", buffDurationMs: "thời gian buff", fx: "hiệu ứng" };

/**
 * Sets (`fields`) or clears (`null`) the entry under `key`. `token` is the `updated_at` of the `skillOverrides` row the admin saw: a mismatch rolls the whole
 * batch back (the CASE writes NULL into a NOT NULL column). Fields equal to what the code gives are left out, so an entry holds only real changes.
 */
export async function saveSkillOverride(db: D1Database, adminEmail: string, key: string, fields: Record<string, unknown> | null, token: number, now = Date.now()): Promise<SkillSaveResult> {
  const tpl = isSkillTemplateId(key) ? SKILL_TEMPLATES.find((t) => t.id === key) : undefined;
  const base: SkillDef | undefined = baseSkill(key) ?? (tpl ? templateAsSkill(tpl) : undefined);
  if (!base) return { ok: false, error: "unknown_skill" };
  const { overrides, token: current } = await readOverrides(db);
  if (current !== token) return { ok: false, error: "version_conflict" };

  let entry: Partial<SkillNumbers> | null = null;
  if (fields !== null) {
    const allowed = FIELDS_OF_KIND[base.kind];
    const unknown = Object.keys(fields).filter((k) => !allowed.includes(k as keyof SkillNumbers));
    if (unknown.length > 0) return { ok: false, error: "invalid", problems: [`${unknown.join(", ")} does not apply to a ${base.kind} skill`] };
    const given: Partial<SkillNumbers> = { ...(fields as Partial<SkillNumbers>) };
    for (const k of ["nameVi", "descVi"] as const) if (typeof given[k] === "string") given[k] = given[k]!.normalize("NFC").trim();
    const problem = boundsProblem(base.kind, given);
    if (problem) return { ok: false, error: "invalid", problems: [problem] };
    // What the skill is without its own entry: the code's numbers, with the entry of its root template over them (a field equal to that is not a change of this skill).
    const tplKey = rootTemplateOf(key);
    const ref = tplKey && overrides[tplKey] ? applySkillOverride(base, overrides[tplKey]!) : base;
    const baseValue: Partial<Record<keyof SkillNumbers, unknown>> = { nameVi: ref.nameVi, descVi: ref.descVi, power: ref.power, mpCost: ref.mpCost, cooldownMs: ref.cooldownMs, range: ref.range, buffDurationMs: ref.buff?.durationMs, fx: ref.fx };
    const real: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(given)) if (v !== undefined && v !== baseValue[k as keyof SkillNumbers]) real[k] = v;
    entry = Object.keys(real).length > 0 ? (real as Partial<SkillNumbers>) : null;
  }
  const before = overrides[key];
  if (JSON.stringify(before ?? null) === JSON.stringify(entry)) return { ok: false, error: "unchanged" };
  const next: Overrides = { ...overrides };
  if (entry) next[key] = entry;
  else delete next[key];
  if (!validTuningGroup("skillOverrides", next)) return { ok: false, error: "invalid", problems: ["the result is not a valid group"] };
  const stamp = Math.max(now, token + 1);
  const changed = entry ? (Object.keys(entry) as Array<keyof SkillNumbers>).map((k) => LABELS[k]) : [];
  try {
    await db.batch([
      db.prepare("UPDATE game_tuning SET value = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE name = 'skillOverrides'").bind(token, JSON.stringify(next), stamp, adminEmail),
      db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'tuning'").bind(stamp),
      logStatement(db, { adminEmail, screen: SKILL_LOG_SCREEN, content: entry ? `Sửa kỹ năng «${base.nameVi}» (${key}): ${changed.join(", ")}` : `Đưa kỹ năng «${base.nameVi}» (${key}) về mặc định` }, now),
    ]);
  } catch (err) {
    if (String(err).includes("game_tuning")) return { ok: false, error: "version_conflict" };
    throw err;
  }
  resetTuningCache();
  return { ok: true, updatedAt: stamp, changed, reset: entry === null };
}

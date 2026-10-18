/**
 * Thể chất (constitution): a second axis next to the spiritual root. Most characters have the ordinary Phàm Thể; a few
 * are born with a special one, and each special constitution has its own ladder of tiers (cấp bậc). Rolled once at
 * creation (later also obtainable from special items).
 *
 * The catalogue (constitutions, tier names, roll weights, effects) is DATA: it lives in D1 (migration 0008, seeded from
 * DEFAULT_CATALOG) so an admin screen can manage it later. This file holds the types, the vocabulary an effect may use,
 * the validation every write must pass, and the pure functions that roll and read a catalogue. All names and numbers in
 * DEFAULT_CATALOG are placeholder game-design values (docs/STATUS.md).
 *
 * Lifecycle rules (enforced by validateCatalog and by the future write path):
 *  - a constitution id never changes and a constitution is never deleted (characters reference the id);
 *  - `enabled: false` stops it being rolled at creation; characters who already have it keep it and its effects;
 *  - if tiers are removed, a character above the new highest tier is read as that tier (clampConstitutionTier).
 */

export type EffectMode = "percent" | "flat";
/** Who an effect is about: everything, skills of an element, skills of a weapon family, or one specific skill. */
export type TargetKind = "all" | "element" | "weapon" | "skill";

export interface ConstitutionEffect {
  /** A key of CONSTITUTION_STATS. */
  stat: string;
  targetKind: TargetKind;
  /** Element id ("moc"), weapon family ("kiem") or skill id; "" for `all`. */
  targetTag: string;
  mode: EffectMode;
  /** Amount in percent points (mode "percent") or in the stat's own unit (mode "flat"). */
  value: number;
}

export interface ConstitutionTier {
  /** 1-based, contiguous. */
  tier: number;
  nameVi: string;
  /** Out of 100: chance of this tier given the constitution. The tiers of one constitution sum to 100. */
  rollWeight: number;
  /** The tier's COMPLETE list of effects: a higher tier does not inherit from a lower one (no hidden stacking). */
  effects: ConstitutionEffect[];
}

export interface ConstitutionDef {
  /** Stored in characters.constitution; never changes. */
  id: string;
  nameVi: string;
  descVi: string;
  /** Out of 10000 rolls: chance of being born with it. Ignored for the default constitution (it takes the remainder). */
  rollWeight: number;
  isDefault: boolean;
  /** false: no longer rolled for new characters; existing holders keep it. */
  enabled: boolean;
  sortOrder: number;
  tiers: ConstitutionTier[];
}

export interface ConstitutionCatalog {
  /** Bumped by every admin save; rooms reload when it changes. */
  version: number;
  constitutions: ConstitutionDef[];
}

// ---------------------------------------------------------------------------------------------------------------------
// Vocabulary: what an effect may change and about whom. Kept in code (not SQL CHECKs) so adding a stat needs no migration.
// ---------------------------------------------------------------------------------------------------------------------

export interface StatMeta {
  nameVi: string;
  targets: readonly TargetKind[];
  modes: readonly EffectMode[];
  /** false while the game does not use the stat yet (the admin screen shows "chưa có tác dụng"). */
  applied: boolean;
}

const SKILL_TARGETS: readonly TargetKind[] = ["all", "element", "weapon", "skill"];

export const CONSTITUTION_STATS: Readonly<Record<string, StatMeta>> = {
  /** Damage of skills; with an element/weapon/skill target it only affects matching skills. Needs skills (phase 2c). */
  skill_damage: { nameVi: "Sát thương kỹ năng", targets: SKILL_TARGETS, modes: ["percent"], applied: true },
  /** How fast matching skills are mastered (thuần thục). */
  skill_mastery: { nameVi: "Độ thuần thục kỹ năng", targets: SKILL_TARGETS, modes: ["percent"], applied: false },
  /** All outgoing damage, including the auto-attack. */
  damage_dealt: { nameVi: "Sát thương gây ra", targets: ["all"], modes: ["percent"], applied: false },
  /** Movement is server-authoritative: speed can only change when a new path starts (see docs/STATUS.md). */
  move_speed: { nameVi: "Tốc độ di chuyển", targets: ["all"], modes: ["percent"], applied: false },
  exp_gain: { nameVi: "Kinh nghiệm nhận được", targets: ["all"], modes: ["percent"], applied: false },
  drop_rate: { nameVi: "Tỉ lệ rơi đồ", targets: ["all"], modes: ["percent"], applied: false },
  max_hp: { nameVi: "Sinh lực tối đa", targets: ["all"], modes: ["percent", "flat"], applied: false },
  attack: { nameVi: "Công kích", targets: ["all"], modes: ["percent", "flat"], applied: false },
  defense: { nameVi: "Phòng thủ", targets: ["all"], modes: ["percent", "flat"], applied: false },
  crit_rate: { nameVi: "Tỉ lệ chí mạng", targets: ["all"], modes: ["flat"], applied: false },
  dodge_rate: { nameVi: "Tỉ lệ né tránh", targets: ["all"], modes: ["flat"], applied: false },
};

/** Elements an effect can target: the five (ngũ hành) plus the variant elements planned for phase 2c. */
export const ELEMENT_TAGS: readonly string[] = ["kim", "moc", "thuy", "hoa", "tho", "loi", "bang", "phong"];
export const WEAPON_TAGS: readonly string[] = ["kiem", "dao", "thuong", "riu", "cung", "quyen", "phap_khi"];
/** A skill id: lowercase letters, digits and underscore. Whether the skill exists is checked when skills exist. */
export const SKILL_TAG_PATTERN = /^[a-z0-9_]{1,32}$/;

export const DEFAULT_CONSTITUTION = "pham_the";
export const CONSTITUTION_ROLL_RANGE = 10_000;
export const CONSTITUTION_TIER_ROLL_RANGE = 100;
export const MAX_CONSTITUTION_TIERS = 12;

function validEffect(e: ConstitutionEffect): string | null {
  const meta = CONSTITUTION_STATS[e.stat];
  if (!meta) return `unknown stat "${e.stat}"`;
  if (!meta.targets.includes(e.targetKind)) return `stat ${e.stat} cannot target "${e.targetKind}"`;
  if (!meta.modes.includes(e.mode)) return `stat ${e.stat} does not allow mode "${e.mode}"`;
  if (!Number.isFinite(e.value)) return `stat ${e.stat} has a non-numeric value`;
  if (e.targetKind === "all" && e.targetTag !== "") return `stat ${e.stat} targets all but has a tag`;
  if (e.targetKind === "element" && !ELEMENT_TAGS.includes(e.targetTag)) return `unknown element "${e.targetTag}"`;
  if (e.targetKind === "weapon" && !WEAPON_TAGS.includes(e.targetTag)) return `unknown weapon family "${e.targetTag}"`;
  if (e.targetKind === "skill" && !SKILL_TAG_PATTERN.test(e.targetTag)) return `bad skill id "${e.targetTag}"`;
  return null;
}

/**
 * Everything a catalogue must satisfy before it may be saved or used. Returns the list of problems (empty: valid).
 * The future admin write path runs this on the server before writing; the loader runs it on what it read.
 */
export function validateCatalog(catalog: ConstitutionCatalog): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  let defaults = 0;
  let specialWeight = 0;
  for (const c of catalog.constitutions) {
    if (!/^[a-z0-9_]{1,32}$/.test(c.id)) problems.push(`constitution id "${c.id}" is not lowercase letters, digits or underscore`);
    if (ids.has(c.id)) problems.push(`duplicate constitution id "${c.id}"`);
    ids.add(c.id);
    if (!c.nameVi.trim()) problems.push(`${c.id}: empty name`);
    if (!Number.isInteger(c.rollWeight) || c.rollWeight < 0) problems.push(`${c.id}: roll weight must be a non-negative integer`);
    if (c.isDefault) {
      defaults++;
      if (!c.enabled) problems.push(`${c.id}: the default constitution cannot be disabled`);
    } else if (c.enabled) {
      specialWeight += c.rollWeight;
    }
    if (c.tiers.length < 1 || c.tiers.length > MAX_CONSTITUTION_TIERS) problems.push(`${c.id}: needs 1 to ${MAX_CONSTITUTION_TIERS} tiers`);
    let weightSum = 0;
    c.tiers.forEach((t, i) => {
      if (t.tier !== i + 1) problems.push(`${c.id}: tiers must be numbered 1, 2, 3, … in order (found ${t.tier} at position ${i + 1})`);
      if (!t.nameVi.trim()) problems.push(`${c.id} tier ${t.tier}: empty name`);
      if (!Number.isInteger(t.rollWeight) || t.rollWeight < 0) problems.push(`${c.id} tier ${t.tier}: roll weight must be a non-negative integer`);
      weightSum += t.rollWeight;
      const seen = new Set<string>();
      for (const e of t.effects) {
        const bad = validEffect(e);
        if (bad) problems.push(`${c.id} tier ${t.tier}: ${bad}`);
        const key = `${e.stat}|${e.targetKind}|${e.targetTag}|${e.mode}`;
        if (seen.has(key)) problems.push(`${c.id} tier ${t.tier}: duplicate effect ${key}`);
        seen.add(key);
      }
    });
    if (c.tiers.length > 0 && weightSum !== CONSTITUTION_TIER_ROLL_RANGE) problems.push(`${c.id}: tier weights sum to ${weightSum}, not ${CONSTITUTION_TIER_ROLL_RANGE}`);
  }
  if (defaults !== 1) problems.push(`there must be exactly one default constitution (found ${defaults})`);
  if (specialWeight > CONSTITUTION_ROLL_RANGE) problems.push(`special constitutions weigh ${specialWeight}, more than ${CONSTITUTION_ROLL_RANGE}`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a catalogue
// ---------------------------------------------------------------------------------------------------------------------

function sorted(catalog: ConstitutionCatalog): ConstitutionDef[] {
  return [...catalog.constitutions].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** The constitution with this id, or the default one for an unknown id (a deleted or never-seen id must not break reads). */
export function getConstitution(catalog: ConstitutionCatalog, id: string): ConstitutionDef {
  return catalog.constitutions.find((c) => c.id === id) ?? catalog.constitutions.find((c) => c.isDefault) ?? (catalog.constitutions[0] as ConstitutionDef);
}

export function isConstitutionId(catalog: ConstitutionCatalog, v: unknown): v is string {
  return typeof v === "string" && catalog.constitutions.some((c) => c.id === v);
}

/** Tier numbers run from 1 to the constitution's highest tier; anything else is clamped into range. */
export function clampConstitutionTier(catalog: ConstitutionCatalog, id: string, tier: number): number {
  const max = getConstitution(catalog, id).tiers.length;
  return Math.min(Math.max(Math.trunc(Number.isFinite(tier) ? tier : 1), 1), Math.max(max, 1));
}

export function constitutionTierName(catalog: ConstitutionCatalog, id: string, tier: number): string {
  const def = getConstitution(catalog, id);
  return def.tiers[clampConstitutionTier(catalog, id, tier) - 1]?.nameVi ?? def.nameVi;
}

export interface RolledConstitution {
  id: string;
  /** 1-based tier. */
  tier: number;
}

/**
 * Maps two uniform integer rolls to a constitution: `roll` in 0..9999 picks one of the ENABLED special constitutions by
 * weight, in sort order (the default takes whatever is left); `tierRoll` in 0..99 picks the tier by its weights.
 */
export function rollConstitution(catalog: ConstitutionCatalog, roll: number, tierRoll: number): RolledConstitution {
  const fallback = getConstitution(catalog, DEFAULT_CONSTITUTION);
  let picked = catalog.constitutions.find((c) => c.isDefault) ?? fallback;
  let acc = 0;
  for (const c of sorted(catalog)) {
    if (c.isDefault || !c.enabled || c.rollWeight <= 0) continue;
    acc += c.rollWeight;
    if (roll < acc) {
      picked = c;
      break;
    }
  }
  let tierAcc = 0;
  for (const t of picked.tiers) {
    tierAcc += t.rollWeight;
    if (tierRoll < tierAcc) return { id: picked.id, tier: t.tier };
  }
  return { id: picked.id, tier: picked.tiers.length || 1 };
}

/** The effects of a character's constitution at their tier. Only the stats flagged `applied` in CONSTITUTION_STATS act on the game so far. */
export function constitutionEffects(catalog: ConstitutionCatalog, id: string, tier: number): ConstitutionEffect[] {
  const def = getConstitution(catalog, id);
  return def.tiers[clampConstitutionTier(catalog, id, tier) - 1]?.effects ?? [];
}

export interface EffectContext {
  /** Elements of the skill being used, e.g. ["moc"]. */
  elements?: readonly string[];
  /** Weapon families of the skill, e.g. ["kiem"]. */
  weapons?: readonly string[];
  skill?: string;
}

/** Sums the effects on one stat that apply in this context: "all" effects always, targeted ones only when they match. */
export function modifierTotal(effects: readonly ConstitutionEffect[], stat: string, ctx: EffectContext = {}): { percent: number; flat: number } {
  let percent = 0;
  let flat = 0;
  for (const e of effects) {
    if (e.stat !== stat) continue;
    const hit =
      e.targetKind === "all" ||
      (e.targetKind === "element" && (ctx.elements ?? []).includes(e.targetTag)) ||
      (e.targetKind === "weapon" && (ctx.weapons ?? []).includes(e.targetTag)) ||
      (e.targetKind === "skill" && ctx.skill === e.targetTag);
    if (!hit) continue;
    if (e.mode === "percent") percent += e.value;
    else flat += e.value;
  }
  return { percent, flat };
}

// ---------------------------------------------------------------------------------------------------------------------
// Default catalogue (the seed of migration 0008)
// ---------------------------------------------------------------------------------------------------------------------

type Spec = { stat: string; targetKind: TargetKind; targetTag: string; per: number };

/** Spells the old "each tier adds the tier-1 amount again" rule out as explicit values per tier. */
function tiers(names: readonly string[], weights: readonly number[], specs: readonly Spec[]): ConstitutionTier[] {
  return names.map((nameVi, i) => ({
    tier: i + 1,
    nameVi,
    rollWeight: weights[i]!,
    effects: specs.map((s) => ({ stat: s.stat, targetKind: s.targetKind, targetTag: s.targetTag, mode: "percent" as const, value: s.per * (i + 1) })),
  }));
}

export const DEFAULT_CATALOG: ConstitutionCatalog = {
  version: 1,
  constitutions: [
    {
      id: "kiem_the",
      nameVi: "Kiếm Thể",
      descVi: "Sinh ra đã hợp với kiếm đạo: tăng sát thương và độ thuần thục của các kỹ năng kiếm.",
      rollWeight: 150,
      isDefault: false,
      enabled: true,
      sortOrder: 10,
      tiers: tiers(["Kiếm Thể", "Tiên Thiên Kiếm Thể", "Đại Đạo Kiếm Thể"], [70, 25, 5], [
        { stat: "skill_damage", targetKind: "weapon", targetTag: "kiem", per: 8 },
        { stat: "skill_mastery", targetKind: "weapon", targetTag: "kiem", per: 10 },
      ]),
    },
    {
      id: "loi_the",
      nameVi: "Lôi Thể",
      descVi: "Thân thể dẫn lôi: tăng sát thương và độ thuần thục của các kỹ năng hệ Lôi.",
      rollWeight: 150,
      isDefault: false,
      enabled: true,
      sortOrder: 20,
      tiers: tiers(["Lôi Thể", "Cửu Thiên Lôi Thể"], [80, 20], [
        { stat: "skill_damage", targetKind: "element", targetTag: "loi", per: 8 },
        { stat: "skill_mastery", targetKind: "element", targetTag: "loi", per: 10 },
      ]),
    },
    {
      id: "thuy_linh_the",
      nameVi: "Thủy Linh Thể",
      descVi: "Thân hợp với thủy khí: tăng sát thương và độ thuần thục của các kỹ năng hệ Thủy.",
      rollWeight: 200,
      isDefault: false,
      enabled: true,
      sortOrder: 30,
      tiers: tiers(["Thủy Linh Thể", "Huyền Thủy Linh Thể"], [80, 20], [
        { stat: "skill_damage", targetKind: "element", targetTag: "thuy", per: 8 },
        { stat: "skill_mastery", targetKind: "element", targetTag: "thuy", per: 10 },
      ]),
    },
    {
      id: "trong_dong",
      nameVi: "Trọng Đồng",
      descVi: "Đôi mắt đặc biệt nhìn thấu hư thực: tăng độ thuần thục của mọi kỹ năng.",
      rollWeight: 100,
      isDefault: false,
      enabled: true,
      sortOrder: 40,
      tiers: tiers(["Trọng Đồng", "Chí Tôn Trọng Đồng"], [85, 15], [
        { stat: "skill_damage", targetKind: "all", targetTag: "", per: 3 },
        { stat: "skill_mastery", targetKind: "all", targetTag: "", per: 12 },
      ]),
    },
    {
      id: "tien_cot",
      nameVi: "Tiên Cốt",
      descVi: "Xương cốt có tiên khí: tăng nhẹ sát thương của mọi kỹ năng và độ thuần thục.",
      rollWeight: 80,
      isDefault: false,
      enabled: true,
      sortOrder: 50,
      tiers: tiers(["Tiên Cốt"], [100], [
        { stat: "skill_damage", targetKind: "all", targetTag: "", per: 6 },
        { stat: "skill_mastery", targetKind: "all", targetTag: "", per: 6 },
      ]),
    },
    {
      id: "thanh_the",
      nameVi: "Thánh Thể",
      descVi: "Thể chất hiếm có bậc nhất: tăng sát thương và độ thuần thục của mọi kỹ năng.",
      rollWeight: 20,
      isDefault: false,
      enabled: true,
      sortOrder: 60,
      tiers: tiers(["Thánh Thể", "Đại Thánh Thể", "Tiên Thể"], [80, 17, 3], [
        { stat: "skill_damage", targetKind: "all", targetTag: "", per: 10 },
        { stat: "skill_mastery", targetKind: "all", targetTag: "", per: 10 },
      ]),
    },
    {
      id: DEFAULT_CONSTITUTION,
      nameVi: "Phàm Thể",
      descVi: "Thể chất bình thường, không có gì đặc biệt.",
      rollWeight: 0,
      isDefault: true,
      enabled: true,
      sortOrder: 1000,
      tiers: [{ tier: 1, nameVi: "Phàm Thể", rollWeight: 100, effects: [] }],
    },
  ],
};

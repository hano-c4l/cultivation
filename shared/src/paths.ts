import { pathSubFactor, getSkill, maxSkillLevel, skillGrade, type SkillContext, type SkillDef } from "./skills";
import { REALMS } from "./progression-data";

/**
 * Hướng tu (cultivation paths, phase 2d-B). From Trúc Cơ a character can take up paths by spending a path item (an NPC quest
 * will give it later; for now a button hands it out). The first path taken is the **chủ tu** (main), the next ones (at most two)
 * are **phụ tu** (sub). The chủ tu can be swapped with a phụ tu and any path can be dropped, for Linh Thạch by the levels (pathSwapCost, pathDropCost). Every number is a placeholder
 * (docs/PHASE2.md, 2d-B): the stats and the skills of a path are stronger as the chủ tu than as a phụ tu, and each phụ tu slows
 * the EXP gained: x 1 / (1 + PATH_EXP_K · number of phụ tu).
 */
export const PATH_IDS = ["kiem", "thuat", "dan"] as const;
export type PathId = (typeof PATH_IDS)[number];

export function isPathId(v: unknown): v is PathId {
  return typeof v === "string" && (PATH_IDS as readonly string[]).includes(v);
}

/** What a path adds, in percent, when it is the chủ tu. As a phụ tu every value is multiplied by `pathSubFactor()`. */
export interface PathBonus {
  /** Percent of attack and defense, and of the maximum MP. */
  attackPct: number;
  defensePct: number;
  maxMpPct: number;
  /** Percent more damage from attack skills while a weapon of the kiếm family is wielded. */
  weaponSkillPct: number;
  /** Percent more damage from attack skills that need no weapon (the skills by element). */
  elementSkillPct: number;
  /** Percent more healing from healing pills. */
  potionHealPct: number;
  /** Percent more mastery points from a Ngộ Đạo Đan. */
  masteryPct: number;
}

export interface PathLevelDef {
  nameVi: string;
  skills: readonly [string, string];
}

export interface PathDef {
  id: PathId;
  nameVi: string;
  descVi: string;
  /** The item that is spent to take up the path. */
  item: string;
  itemNameVi: string;
  /** The levels of the path (cấp hướng tu): each has a name and two skills (SkillDef.source "path"). A character starts at the first level; when both its skills reach the top mastery level the path goes up one and gives the two skills of the next. */
  levels: readonly PathLevelDef[];
  /** What the path adds as the chủ tu. */
  bonus: PathBonus;
}

const NONE: PathBonus = { attackPct: 0, defensePct: 0, maxMpPct: 0, weaponSkillPct: 0, elementSkillPct: 0, potionHealPct: 0, masteryPct: 0 };

export const PATHS: Readonly<Record<PathId, PathDef>> = {
  kiem: {
    id: "kiem",
    nameVi: "Kiếm tu",
    descVi: "Lấy kiếm làm đạo: tăng công kích và sát thương kỹ năng khi cầm kiếm.",
    item: "path_item_kiem",
    itemNameVi: "Kiếm Tu Lệnh",
    levels: [
      { nameVi: "Kiếm Tâm", skills: ["kt_kiem_khi", "kt_lien_hoan"] },
      { nameVi: "Kiếm Ý", skills: ["kt_kiem_y", "kt_kiem_vu"] },
      { nameVi: "Nhân Kiếm Hợp Nhất", skills: ["kt_hop_nhat", "kt_than_kiem"] },
    ],
    bonus: { ...NONE, attackPct: 10, weaponSkillPct: 15 },
  },
  thuat: {
    id: "thuat",
    nameVi: "Thuật tu",
    descVi: "Lấy pháp thuật làm đạo: tăng linh lực tối đa và sát thương kỹ năng theo hệ.",
    item: "path_item_thuat",
    itemNameVi: "Thuật Tu Lệnh",
    levels: [
      { nameVi: "Học Thuật", skills: ["tt_phap_an", "tt_linh_an"] },
      { nameVi: "Pháp Sư", skills: ["tt_phap_tran", "tt_linh_hai"] },
      { nameVi: "Đại Pháp Sư", skills: ["tt_dai_phap", "tt_hoi_linh"] },
    ],
    bonus: { ...NONE, maxMpPct: 20, elementSkillPct: 12 },
  },
  dan: {
    id: "dan",
    nameVi: "Đan tu",
    descVi: "Lấy luyện đan làm đạo: tăng phòng thủ, hồi máu từ đan dược và điểm thuần thục từ Ngộ Đạo Đan.",
    item: "path_item_dan",
    itemNameVi: "Đan Tu Lệnh",
    levels: [
      { nameVi: "Học Đồ", skills: ["dt_hoi_xuan", "dt_duong_nguyen"] },
      { nameVi: "Đan Sư", skills: ["dt_dan_khi", "dt_hoi_duong"] },
      { nameVi: "Đan Tông", skills: ["dt_dai_hoi", "dt_kim_than"] },
    ],
    bonus: { ...NONE, defensePct: 8, potionHealPct: 30, masteryPct: 25 },
  },
};

/** At most this many phụ tu next to the chủ tu. */
export const MAX_SUB_PATHS = 2;
/** The first realm that may take a path (Trúc Cơ). */
export const PATH_MIN_REALM = 1;
/** Linh Thạch each phụ tu costs (the first, the second); the chủ tu costs only its item. */
export const SUB_PATH_COST: readonly number[] = [20_000, 50_000];
/** The EXP gained is multiplied by 1 / (1 + PATH_EXP_K · phụ tu). */
export const PATH_EXP_K = 0.25;
export { pathSubFactor };

/** The paths a character has: the chủ tu and the phụ tu in the order they were taken. */
export interface PathState {
  main: PathId | null;
  subs: PathId[];
  /** Level of each path taken (cấp hướng tu, 0 is the first); a path not listed is at level 0. */
  levels?: Partial<Record<PathId, number>>;
}

export const NO_PATHS: PathState = { main: null, subs: [] };

/** The level of a path (0 when it is not listed). */
export function pathLevel(s: PathState, id: PathId): number {
  const lv = s.levels?.[id] ?? 0;
  return Math.min(Math.max(Math.trunc(lv), 0), PATHS[id].levels.length - 1);
}

export function pathLevelName(s: PathState, id: PathId): string {
  return PATHS[id].levels[pathLevel(s, id)]?.nameVi ?? "";
}

/** Every skill a path gives up to and including `level` (the skills of the lower levels stay). */
export function pathSkillsUpTo(id: PathId, level: number): string[] {
  return PATHS[id].levels.slice(0, level + 1).flatMap((l) => [...l.skills]);
}

/** Every skill of a path at any level (to take them away when the path is dropped). */
export function allPathSkills(id: PathId): string[] {
  return pathSkillsUpTo(id, PATHS[id].levels.length - 1);
}

/**
 * Stored as "main:sub1:sub2", each part "id" or "id.level" (level 0 is left out); anything malformed counts as no paths. A
 * "kiem.2:dan" is a Kiếm tu at level 2 with a phụ tu Đan tu at level 0.
 */
export function parsePaths(raw: string | null | undefined): PathState {
  const parts = (raw ?? "").split(":");
  const read = (part: string | undefined): { id: PathId; level: number } | null => {
    const [id, lv] = (part ?? "").split(".");
    if (!isPathId(id)) return null;
    const level = lv === undefined ? 0 : Number(lv);
    return { id, level: Number.isInteger(level) && level > 0 ? Math.min(level, PATHS[id].levels.length - 1) : 0 };
  };
  const first = read(parts[0]);
  if (!first) return { main: null, subs: [] };
  const levels: Partial<Record<PathId, number>> = {};
  if (first.level > 0) levels[first.id] = first.level;
  const subs: PathId[] = [];
  for (const part of parts.slice(1)) {
    if (subs.length >= MAX_SUB_PATHS) break;
    const r = read(part);
    if (r && r.id !== first.id && !subs.includes(r.id)) {
      subs.push(r.id);
      if (r.level > 0) levels[r.id] = r.level;
    }
  }
  return { main: first.id, subs, ...(Object.keys(levels).length > 0 ? { levels } : {}) };
}

export function serializePaths(s: PathState): string {
  if (!s.main) return "";
  return [s.main, ...s.subs].map((id) => (pathLevel(s, id) > 0 ? `${id}.${pathLevel(s, id)}` : id)).join(":");
}

/** The rows of the paths table for a state: path, slot (0 chủ tu, 1 and 2 phụ tu) and level. */
export function pathRows(s: PathState): Array<{ path: PathId; slot: number; level: number }> {
  if (!s.main) return [];
  return [s.main, ...s.subs].map((path, slot) => ({ path, slot, level: pathLevel(s, path) }));
}

function withLevels(main: PathId | null, subs: PathId[], from: PathState): PathState {
  const levels: Partial<Record<PathId, number>> = {};
  for (const id of main ? [main, ...subs] : []) if (pathLevel(from, id) > 0) levels[id] = pathLevel(from, id);
  return { main, subs, ...(Object.keys(levels).length > 0 ? { levels } : {}) };
}

/** Linh Thạch to make a phụ tu the chủ tu (the old chủ tu takes its place): by the higher of the two levels. */
export const PATH_SWAP_COST_BASE = 20_000;
/** Linh Thạch to drop a path: by its level, double for the chủ tu. */
export const PATH_DROP_COST_BASE = 30_000;

export function pathSwapCost(s: PathState, sub: PathId): number {
  return PATH_SWAP_COST_BASE * (1 + Math.max(s.main ? pathLevel(s, s.main) : 0, pathLevel(s, sub)));
}

export function pathDropCost(s: PathState, id: PathId): number {
  return PATH_DROP_COST_BASE * (1 + pathLevel(s, id)) * (s.main === id ? 2 : 1);
}

/** The paths after a phụ tu becomes the chủ tu: the old chủ tu goes into the slot it left. Null when `sub` is not a phụ tu. */
export function afterSwap(s: PathState, sub: PathId): PathState | null {
  if (!s.main || !s.subs.includes(sub)) return null;
  return withLevels(sub, s.subs.map((p) => (p === sub ? (s.main as PathId) : p)), s);
}

/** The paths after dropping one: the first phụ tu becomes the chủ tu when the chủ tu goes. Null when the character does not have it. */
export function afterDrop(s: PathState, id: PathId): PathState | null {
  if (pathRole(s, id) === null) return null;
  if (s.main === id) return withLevels(s.subs[0] ?? null, s.subs.slice(1), s);
  return withLevels(s.main, s.subs.filter((p) => p !== id), s);
}

/** Whether a path at `level` has both skills of that level at the top mastery level (so it may go up), given each skill's mastery level. */
export function pathLevelReady(id: PathId, level: number, masteryOf: (skillId: string) => number | undefined): boolean {
  const here = PATHS[id].levels[level];
  if (!here || level + 1 >= PATHS[id].levels.length) return false;
  return here.skills.every((sk) => {
    const def = getSkill(sk);
    const lv = masteryOf(sk);
    return !!def && lv !== undefined && lv >= maxSkillLevel(skillGrade(def, 0));
  });
}

export type PathRole = "main" | "sub";

export function pathRole(s: PathState, id: PathId): PathRole | null {
  if (s.main === id) return "main";
  return s.subs.includes(id) ? "sub" : null;
}

/** Slot a new path would take: 0 for the chủ tu, 1 and 2 for the phụ tu; null when the paths are full or it is already taken. */
export function nextPathSlot(s: PathState, id: PathId): number | null {
  if (pathRole(s, id)) return null;
  if (!s.main) return 0;
  return s.subs.length < MAX_SUB_PATHS ? 1 + s.subs.length : null;
}

/** Linh Thạch the next path costs (0 for the chủ tu). */
export function pathCost(s: PathState): number {
  return s.main ? (SUB_PATH_COST[s.subs.length] ?? SUB_PATH_COST[SUB_PATH_COST.length] ?? 0) : 0;
}

export type PathError = "level" | "have" | "full" | "no_item" | "funds" | "busy" | "invalid" | "claimed" | "bag_full" | "no_path" | "admin";

/** Whether a character of this realm with these paths may take `id` (the item and the Linh Thạch are checked apart). */
export function checkPathChoice(s: PathState, id: PathId, realm: number): PathError | null {
  if (realm < PATH_MIN_REALM) return "level";
  if (pathRole(s, id)) return "have";
  return nextPathSlot(s, id) === null ? "full" : null;
}

/** The sum of what all of a character's paths add (a phụ tu counts `pathSubFactor()` as much). */
export function pathBonuses(s: PathState): PathBonus {
  const t: PathBonus = { ...NONE };
  const add = (id: PathId, k: number) => {
    const b = PATHS[id].bonus;
    for (const key of Object.keys(t) as Array<keyof PathBonus>) t[key] += b[key] * k;
  };
  if (s.main) add(s.main, 1);
  for (const id of s.subs) add(id, pathSubFactor());
  return t;
}

/** EXP multiplier of the paths: 1 / (1 + k · phụ tu). */
export function pathExpFactor(s: PathState): number {
  return 1 / (1 + PATH_EXP_K * s.subs.length);
}

/**
 * Derived stats with the paths added: attack, defense and maximum MP by percent, and the EXP bonus changed so that the percentage
 * shown matches the factor (the fight multiplies the EXP by it). One function for the fight and for the character panel.
 */
export function withPaths<T extends { attack: number; defense: number; maxMp: number; expBonus: number }>(d: T, s: PathState): T {
  const b = pathBonuses(s);
  return {
    ...d,
    attack: Math.floor(d.attack * (1 + b.attackPct / 100)),
    defense: Math.floor(d.defense * (1 + b.defensePct / 100)),
    maxMp: Math.floor(d.maxMp * (1 + b.maxMpPct / 100)),
    expBonus: Math.round(((1 + d.expBonus / 100) * pathExpFactor(s) - 1) * 100),
  };
}

/** Percent added to the damage of a skill by the paths (weapon-family skills need a kiếm in hand; skills by element need no weapon). */
export function pathSkillDamagePct(s: PathState, skill: SkillDef, wielded: string | null): number {
  if (skill.kind !== "attack") return 0;
  const b = pathBonuses(s);
  let pct = 0;
  if (wielded === "kiem") pct += b.weaponSkillPct;
  if (skill.weapon === undefined) pct += b.elementSkillPct;
  return pct;
}

/**
 * The realm, grade, mastery level and role a skill is used at: what effectiveSkill needs. Path skills follow the character's
 * realm (so they never go stale) and their strength depends on the role of their path; root, learned and gear skills as before.
 */
export function skillContextFor(
  def: SkillDef,
  who: { rootGrade: number; realm: number; level: number; paths?: PathState; gear?: { realm: number; tier: number; grade: number } },
): SkillContext {
  if (def.source === "path") {
    const role = def.path && isPathId(def.path) && who.paths ? pathRole(who.paths, def.path) : null;
    return { realm: Math.min(who.realm, REALMS.length - 1), grade: skillGrade(def, who.rootGrade), level: who.level, ...(role ? { role } : {}) };
  }
  if (def.source === "gear") return { realm: who.gear ? who.gear.realm : def.realm, ...(who.gear ? { tier: who.gear.tier } : {}), grade: skillGrade(def, who.rootGrade, who.gear?.grade), level: 0 };
  return { realm: def.realm, grade: skillGrade(def, who.rootGrade), level: who.level };
}

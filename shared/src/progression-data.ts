/**
 * Tunable progression data (realms, EXP curve, base stats). Logic lives in progression.ts; change numbers here.
 * Display names are Vietnamese data fields (nameVi), not hard-coded in UI code.
 */
import type { SpiritualRoot } from "./character";

export interface RealmDef {
  /** Stored in characters.realm (0 = first realm). */
  id: number;
  key: string;
  nameVi: string;
  /** Two-letter tag for small labels, e.g. "LK" in "LK3" (Luyện Khí 3). */
  shortVi: string;
  /** EXP needed to leave stage 1 of this realm; later stages grow by STAGE_EXP_GROWTH. */
  expBase: number;
  /** Potential points granted on reaching each new stage in this realm. */
  pointsPerStage: number;
}

export const STAGES_PER_REALM = 9;

/**
 * How many same-bậc normal monsters a player must kill to finish a stage: KILLS_BASE at Luyện Khí tầng 1, growing by
 * KILLS_GROWTH per level across realms (about 49 at tầng 5, about 100 at Trúc Cơ tầng 2). Monster EXP is derived from this
 * (see monsterBaseExp), so tune the pace here. EXP numbers are x10 of the first version so per-kill values stay integers.
 */
export const KILLS_BASE = 30;
export const KILLS_GROWTH = 1.13;
/**
 * EXP multiplier per realm a monster is below the player (a high-level player farming a low map). 1 = no extra
 * penalty (the slower pace of low monsters is the only cost); lower it if farming low maps turns out too good.
 */
export const LOW_MAP_EXP_MULT = 1;
export const STAGE_EXP_GROWTH = 1.35;
/**
 * At stage 9 a full EXP bar does not stop the EXP: it keeps filling past the stage's need, by up to OVERFLOW_EXP_MAX of the
 * need (the overflow). The overflow raises the chance of a breakthrough: nothing below BREAKTHROUGH_OVERFLOW_FROM of the need,
 * BREAKTHROUGH_OVERFLOW_FROM_BONUS points at that mark, growing evenly to BREAKTHROUGH_OVERFLOW_MAX_BONUS points at OVERFLOW_EXP_MAX.
 * Starting a breakthrough uses the overflow up (like a pill), whatever the outcome.
 */
export const OVERFLOW_EXP_MAX = 1;
export const BREAKTHROUGH_OVERFLOW_FROM = 0.5;
export const BREAKTHROUGH_OVERFLOW_FROM_BONUS = 5;
export const BREAKTHROUGH_OVERFLOW_MAX_BONUS = 15;

export const REALMS: readonly RealmDef[] = [
  { id: 0, key: "luyen_khi", nameVi: "Luyện Khí", shortVi: "LK", expBase: 1_000, pointsPerStage: 5 },
  { id: 1, key: "truc_co", nameVi: "Trúc Cơ", shortVi: "TC", expBase: 20_000, pointsPerStage: 6 },
  { id: 2, key: "kim_dan", nameVi: "Kim Đan", shortVi: "KĐ", expBase: 400_000, pointsPerStage: 8 },
  { id: 3, key: "nguyen_anh", nameVi: "Nguyên Anh", shortVi: "NA", expBase: 8_000_000, pointsPerStage: 10 },
];

export interface RootGradeDef {
  /** Stored in characters.root_grade (0 = lowest). */
  id: number;
  key: string;
  nameVi: string;
  /** Out of 100: the grade is rolled once at creation; weights sum to 100. */
  weight: number;
  /** Percent added to EXP gained (can be negative); adds to the element-count bonus (ROOT_COUNTS). */
  expBonusPct: number;
  /** Extra potential points granted at creation. Keep in sync with migration 0004. */
  bonusPoints: number;
  /** Percent added to the damage of attacks in one of the character's own elements (skills and the basic attack). */
  elementDamagePct: number;
}

/** Spiritual root quality (phẩm cấp linh căn), independent of the elements and their number (ROOT_COUNTS). */
export const ROOT_GRADES: readonly RootGradeDef[] = [
  { id: 0, key: "ha", nameVi: "Hạ phẩm linh căn", weight: 50, expBonusPct: -10, bonusPoints: 0, elementDamagePct: 0 },
  { id: 1, key: "trung", nameVi: "Trung phẩm linh căn", weight: 30, expBonusPct: 5, bonusPoints: 1, elementDamagePct: 5 },
  { id: 2, key: "thuong", nameVi: "Thượng phẩm linh căn", weight: 13, expBonusPct: 15, bonusPoints: 2, elementDamagePct: 10 },
  { id: 3, key: "dia", nameVi: "Địa linh căn", weight: 5, expBonusPct: 30, bonusPoints: 4, elementDamagePct: 20 },
  { id: 4, key: "thien", nameVi: "Thiên linh căn", weight: 2, expBonusPct: 50, bonusPoints: 6, elementDamagePct: 30 },
];

export interface RootCountDef {
  /** How many of the five elements the character has (1..5). */
  count: number;
  key: string;
  nameVi: string;
  /** Out of 100: the count is rolled once at creation; weights sum to 100. */
  weight: number;
  /** Percent added to EXP gained (can be negative). The count changes how fast cultivation goes, never the damage. */
  expBonusPct: number;
}

/** Number of elements of the spiritual root (đơn, song, tam, tứ, ngũ linh căn). Fewer is purer (faster), more is broader (more skills). */
export const ROOT_COUNTS: readonly RootCountDef[] = [
  { count: 1, key: "don", nameVi: "Đơn linh căn", weight: 20, expBonusPct: 10 },
  { count: 2, key: "song", nameVi: "Song linh căn", weight: 48, expBonusPct: 0 },
  { count: 3, key: "tam", nameVi: "Tam linh căn", weight: 25, expBonusPct: -15 },
  { count: 4, key: "tu", nameVi: "Tứ linh căn", weight: 5, expBonusPct: -30 },
  { count: 5, key: "ngu", nameVi: "Ngũ linh căn", weight: 2, expBonusPct: -40 },
];

/** Potential points a new character can spend right away (there is no EXP source before combat). */
export const STARTING_POTENTIAL_POINTS = 5;

export const STAT_KEYS = ["canCot", "thanPhap", "ngoTinh", "linhLuc", "thanThuc", "phucDuyen"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type BaseStats = Record<StatKey, number>;

export interface StatDef {
  key: StatKey;
  /** characters table column. */
  column: string;
  nameVi: string;
}

export const STAT_DEFS: readonly StatDef[] = [
  { key: "canCot", column: "stat_can_cot", nameVi: "Căn cốt" },
  { key: "thanPhap", column: "stat_than_phap", nameVi: "Thân pháp" },
  { key: "ngoTinh", column: "stat_ngo_tinh", nameVi: "Ngộ tính" },
  { key: "linhLuc", column: "stat_linh_luc", nameVi: "Linh lực" },
  { key: "thanThuc", column: "stat_than_thuc", nameVi: "Thần thức" },
  { key: "phucDuyen", column: "stat_phuc_duyen", nameVi: "Phúc duyên" },
];

export const BASE_STAT_START = 5;
export const ROOT_STAT_BONUS = 2;
/** The stat each spiritual root favours at creation. Keep in sync with migration 0003. */
export const ROOT_FAVOURED_STAT: Record<SpiritualRoot, StatKey> = {
  kim: "thanPhap",
  moc: "phucDuyen",
  thuy: "thanThuc",
  hoa: "linhLuc",
  tho: "canCot",
};

/** Largest allocation accepted in one request, per stat and in total. */
export const MAX_ALLOCATE_PER_STAT = 200;

/** Element multipliers (ngũ hành). Overcoming = tương khắc, generating = tương sinh. */
export const ELEMENT_OVERCOME_MULT = 1.3;
export const ELEMENT_OVERCOME_BY_MULT = 0.75;
export const ELEMENT_GENERATE_MULT = 1.05;

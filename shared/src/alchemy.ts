/**
 * Brewing at the alchemist (Đan Sư): the player hands over materials and Linh Thạch, and the pills are ready after a while. The recipes are DATA
 * (the `alchemy` group of `game_tuning`, edited at /admin/npcs/alchemy); these are the ones the game starts with. Placeholder numbers.
 */
export interface BrewRecipe {
  /** Stable id, a-z 0-9 _ (jobs keep it). */
  id: string;
  nameVi: string;
  /** The pill (or other item) made and how many of it. */
  output: string;
  qty: number;
  /** Materials taken from the bag when the brewing starts. */
  inputs: Array<{ item: string; qty: number }>;
  /** Linh Thạch taken when the brewing starts. */
  linhThach: number;
  /** Time until the result can be collected. */
  seconds: number;
  enabled: boolean;
  /** The trade level needed to use the recipe (absent: 1) and the trade exp a finished run gives (absent: 0). Only a group with `levels` has levels. */
  minLevel?: number;
  exp?: number;
}

export interface AlchemyCfg {
  /** Brewings one character can have going (waiting or ready to collect) at once. */
  maxJobs: number;
  /** Most batches of a recipe one brewing can make at once (absent: `DEFAULT_MAX_BATCH`). */
  maxBatch?: number;
  /** Each batch after the first adds this share of the recipe's time (absent: `DEFAULT_BATCH_TIME_STEP`): a brewing of n batches takes `seconds * (1 + (n - 1) * step)`, so a big run costs less time per pill. */
  batchTimeStep?: number;
  /**
   * Trade levels (the forge, 5e): `levels[i]` is the total trade exp needed for level `i + 2`, strictly increasing (level 1 needs none). Absent: no levels, every recipe is open.
   * The exp is kept per character and trade; a finished run gives the exp its recipe had when the run started.
   */
  levels?: number[];
  /**
   * Quality by level (the forge): a piece made by someone whose trade level is above the level the recipe asks for has its stats rolled towards the top of their range,
   * more with every level above (`perLevel`, see `biasedRoll`). Absent: the forge default; 0 turns it off.
   */
  quality?: { perLevel: number };
  recipes: BrewRecipe[];
}

/**
 * A uniform [0, 1) roll pushed towards 1 by `k` (the exponent grows to 1 + k): `1 - (1 - r)^(1 + k)`. k = 0 is the plain roll; the average goes from 0.5 to 1 - 1/(2 + k),
 * and the roll never leaves [0, 1], so a stat stays inside its master range.
 */
export function biasedRoll(rand: () => number, k: number): () => number {
  const e = 1 + Math.max(0, k);
  return () => 1 - Math.pow(1 - rand(), e);
}

/** The push of a piece forged at `level` from a recipe that asks for `minLevel` (0 when the group has no quality setting and is not the forge's). */
export function craftQualityBias(cfg: Pick<AlchemyCfg, "quality" | "levels">, level: number, minLevel: number, fallbackPerLevel = 0): number {
  const per = cfg.quality?.perLevel ?? fallbackPerLevel;
  return Math.max(0, per * Math.max(0, level - minLevel));
}

/** The trade level of a character with `exp` (1 when the group has no levels). */
export function craftLevelOf(cfg: Pick<AlchemyCfg, "levels">, exp: number): number {
  let level = 1;
  for (const need of cfg.levels ?? []) if (exp >= need) level++;
  return level;
}

/** The total exp of the next level, or null at the top (or when the group has no levels). */
export function craftNextExp(cfg: Pick<AlchemyCfg, "levels">, exp: number): number | null {
  return (cfg.levels ?? []).find((need) => exp < need) ?? null;
}

/** Whether a character of this trade level may use the recipe. */
export const canCraft = (recipe: Pick<BrewRecipe, "minLevel">, level: number): boolean => level >= (recipe.minLevel ?? 1);

/** The two trades that work like this: the alchemist's brewing and the forge of the blacksmith (docs/PHASE5.md, 5e). */
export type Craft = "alchemy" | "forge";

export const DEFAULT_MAX_BATCH = 10;
export const DEFAULT_BATCH_TIME_STEP = 0.3;

/** What a brewing of `n` batches of `recipe` takes and makes: materials, Linh Thạch and the result grow with n, the time less than that. */
export function scaleBrew(recipe: BrewRecipe, n: number, cfg: Pick<AlchemyCfg, "maxBatch" | "batchTimeStep">): BrewRecipe {
  const k = Math.max(1, Math.min(cfg.maxBatch ?? DEFAULT_MAX_BATCH, Math.trunc(n) || 1));
  const step = cfg.batchTimeStep ?? DEFAULT_BATCH_TIME_STEP;
  return { ...recipe, ...(recipe.exp !== undefined ? { exp: recipe.exp * k } : {}), qty: recipe.qty * k, inputs: recipe.inputs.map((i) => ({ ...i, qty: i.qty * k })), linhThach: recipe.linhThach * k, seconds: Math.max(1, Math.round(recipe.seconds * (1 + (k - 1) * step))) };
}

export const DEFAULT_ALCHEMY: AlchemyCfg = {
  maxJobs: 3,
  recipes: [
    { id: "linh_nguyen_dan", nameVi: "Luyện Linh Nguyên Đan", output: "linh_nguyen_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 10 }, { item: "yeu_dan", qty: 2 }], linhThach: 5_000, seconds: 60, enabled: true },
    { id: "bao_nguyen_dan", nameVi: "Luyện Bảo Nguyên Đan", output: "bao_nguyen_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 20 }, { item: "yeu_dan", qty: 5 }], linhThach: 20_000, seconds: 300, enabled: true },
    { id: "linh_tuyen_dan", nameVi: "Luyện Linh Tuyền Đan", output: "linh_tuyen_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 10 }, { item: "yeu_dan", qty: 2 }], linhThach: 5_000, seconds: 60, enabled: true },
    { id: "bao_linh_dan", nameVi: "Luyện Bảo Linh Đan", output: "bao_linh_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 20 }, { item: "yeu_dan", qty: 5 }], linhThach: 20_000, seconds: 300, enabled: true },
    { id: "thien_ngo_dan", nameVi: "Luyện Thiên Ngộ Đan", output: "thien_ngo_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 20 }, { item: "yeu_dan", qty: 10 }, { item: "thu_cot", qty: 10 }], linhThach: 50_000, seconds: 600, enabled: true },
    { id: "hu_huyet_dan", nameVi: "Luyện Hư Huyết Đan", output: "hu_huyet_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 40 }, { item: "yeu_dan", qty: 10 }, { item: "tl_ht", qty: 3 }], linhThach: 200_000, seconds: 600, enabled: true },
    { id: "hu_linh_dan", nameVi: "Luyện Hư Linh Đan", output: "hu_linh_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 40 }, { item: "yeu_dan", qty: 10 }, { item: "tl_ht", qty: 3 }], linhThach: 200_000, seconds: 600, enabled: true },
  ],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const ITEM_ID = /^[a-z0-9_.]{1,60}$/;

export function validBrewRecipe(r: unknown): r is BrewRecipe {
  if (!isObj(r)) return false;
  return (
    typeof r.id === "string" &&
    /^[a-z0-9_]{1,40}$/.test(r.id) &&
    typeof r.nameVi === "string" &&
    r.nameVi.length >= 1 &&
    r.nameVi.length <= 60 &&
    typeof r.output === "string" &&
    ITEM_ID.test(r.output) &&
    isInt(r.qty, 1, 999) &&
    Array.isArray(r.inputs) &&
    r.inputs.length >= 1 &&
    r.inputs.length <= 6 &&
    r.inputs.every((i) => isObj(i) && typeof i.item === "string" && ITEM_ID.test(i.item) && isInt(i.qty, 1, 9999)) &&
    new Set((r.inputs as Array<{ item: string }>).map((i) => i.item)).size === r.inputs.length &&
    isInt(r.linhThach, 0, 1_000_000_000) &&
    isInt(r.seconds, 1, 30 * 24 * 3600) &&
    typeof r.enabled === "boolean" &&
    (r.minLevel === undefined || isInt(r.minLevel, 1, 20)) &&
    (r.exp === undefined || isInt(r.exp, 0, 1_000_000))
  );
}

/** Whether a whole `alchemy` group is well formed (structure only; whether the items exist is checked when an admin saves). */
export function validAlchemy(v: unknown): v is AlchemyCfg {
  if (!isObj(v)) return false;
  return isInt(v.maxJobs, 1, 20) && (v.maxBatch === undefined || isInt(v.maxBatch, 1, 100)) && (v.batchTimeStep === undefined || (typeof v.batchTimeStep === "number" && v.batchTimeStep >= 0 && v.batchTimeStep <= 5)) && Array.isArray(v.recipes) && v.recipes.length <= 200 && v.recipes.every(validBrewRecipe) && new Set((v.recipes as BrewRecipe[]).map((r) => r.id)).size === v.recipes.length && validLevels(v) && validQuality(v.quality);
}

/** The quality setting is a small non-negative number. */
const validQuality = (q: unknown): boolean => q === undefined || (isObj(q) && typeof q.perLevel === "number" && q.perLevel >= 0 && q.perLevel <= 5);

/** The trade levels: strictly increasing positive exp (at most 19 levels above the first), and no recipe asks for a level the group cannot reach. */
function validLevels(v: Record<string, unknown>): boolean {
  const levels = v.levels;
  if (levels !== undefined) {
    if (!Array.isArray(levels) || levels.length > 19 || !levels.every((n) => isInt(n, 1, 1_000_000_000))) return false;
    for (let i = 1; i < levels.length; i++) if ((levels[i] as number) <= (levels[i - 1] as number)) return false;
  }
  const top = (Array.isArray(levels) ? levels.length : 0) + 1;
  return (v.recipes as BrewRecipe[]).every((r) => (r.minLevel ?? 1) <= top);
}

/** One brewing as the client sees it. */
export interface BrewJobView {
  id: string;
  recipe: string;
  output: string;
  qty: number;
  /** Server time (ms) it is ready. */
  readyAt: number;
}

/**
 * Forging at the blacksmith (Luyện khí, 5e): the same machinery as the alchemist (a recipe book in the tuning, materials and Linh Thạch taken at the start, the piece
 * collected when ready), but the result is a piece of GEAR (rolled from the master table when it is collected). One piece a run (gear does not stack), the id of a
 * gender-neutral kind, and a grade above what the blacksmith sells. All numbers are placeholders; the recipes are edited at /admin/npcs/forge.
 */
export const DEFAULT_FORGE: AlchemyCfg = {
  maxJobs: 2,
  maxBatch: 1,
  quality: { perLevel: 0.5 },
  // Level 2 after 30 exp (three rings), then 100, 250, 600 and 1400: each realm's recipe opens one level after the one before it, the pháp bảo at the levels of Kim Đan and Nguyên Anh.
  levels: [30, 100, 250, 600, 1400],
  recipes: [
    { id: "forge_ring_lk", nameVi: "Luyện Nhẫn Luyện Khí", output: "eq.ring.u.0.3.2", qty: 1, inputs: [{ item: "ren_lk", qty: 40 }], linhThach: 20_000, seconds: 600, enabled: true, minLevel: 1, exp: 10 },
    { id: "forge_belt_tc", nameVi: "Luyện Đai Lưng Trúc Cơ", output: "eq.belt.u.1.3.2", qty: 1, inputs: [{ item: "ren_tc", qty: 40 }], linhThach: 60_000, seconds: 900, enabled: true, minLevel: 2, exp: 20 },
    { id: "forge_boots_kd", nameVi: "Luyện Giày Kim Đan", output: "eq.boots.u.2.3.2", qty: 1, inputs: [{ item: "ren_kd", qty: 40 }], linhThach: 180_000, seconds: 1200, enabled: true, minLevel: 3, exp: 40 },
    { id: "forge_bonded_tc", nameVi: "Luyện Pháp Bảo Bản Mệnh Trúc Cơ", output: "eq.bonded.u.1.3.2", qty: 1, inputs: [{ item: "ren_tc", qty: 60 }], linhThach: 120_000, seconds: 1500, enabled: true, minLevel: 3, exp: 50 },
    { id: "forge_ring_na", nameVi: "Luyện Nhẫn Nguyên Anh", output: "eq.ring.u.3.3.2", qty: 1, inputs: [{ item: "ren_na", qty: 40 }], linhThach: 500_000, seconds: 1500, enabled: true, minLevel: 4, exp: 80 },
    { id: "forge_flight_kd", nameVi: "Luyện Pháp Bảo Phi Hành Kim Đan (hệ Kim)", output: "eq.flight.u.2.3.2.kim", qty: 1, inputs: [{ item: "ren_kd", qty: 60 }], linhThach: 300_000, seconds: 1800, enabled: true, minLevel: 4, exp: 100 },
    { id: "forge_belt_ht", nameVi: "Luyện Đai Lưng Hóa Thần", output: "eq.belt.u.4.3.2", qty: 1, inputs: [{ item: "ren_ht", qty: 40 }], linhThach: 1_500_000, seconds: 1800, enabled: true, minLevel: 5, exp: 160 },
    { id: "forge_boots_lh", nameVi: "Luyện Giày Luyện Hư", output: "eq.boots.u.5.3.2", qty: 1, inputs: [{ item: "ren_lh", qty: 40 }], linhThach: 4_000_000, seconds: 2100, enabled: true, minLevel: 6, exp: 320 },
  ],
};

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
}

export interface AlchemyCfg {
  /** Brewings one character can have going (waiting or ready to collect) at once. */
  maxJobs: number;
  /** Most batches of a recipe one brewing can make at once (absent: `DEFAULT_MAX_BATCH`). */
  maxBatch?: number;
  /** Each batch after the first adds this share of the recipe's time (absent: `DEFAULT_BATCH_TIME_STEP`): a brewing of n batches takes `seconds * (1 + (n - 1) * step)`, so a big run costs less time per pill. */
  batchTimeStep?: number;
  recipes: BrewRecipe[];
}

export const DEFAULT_MAX_BATCH = 10;
export const DEFAULT_BATCH_TIME_STEP = 0.3;

/** What a brewing of `n` batches of `recipe` takes and makes: materials, Linh Thạch and the result grow with n, the time less than that. */
export function scaleBrew(recipe: BrewRecipe, n: number, cfg: Pick<AlchemyCfg, "maxBatch" | "batchTimeStep">): BrewRecipe {
  const k = Math.max(1, Math.min(cfg.maxBatch ?? DEFAULT_MAX_BATCH, Math.trunc(n) || 1));
  const step = cfg.batchTimeStep ?? DEFAULT_BATCH_TIME_STEP;
  return { ...recipe, qty: recipe.qty * k, inputs: recipe.inputs.map((i) => ({ ...i, qty: i.qty * k })), linhThach: recipe.linhThach * k, seconds: Math.max(1, Math.round(recipe.seconds * (1 + (k - 1) * step))) };
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
    typeof r.enabled === "boolean"
  );
}

/** Whether a whole `alchemy` group is well formed (structure only; whether the items exist is checked when an admin saves). */
export function validAlchemy(v: unknown): v is AlchemyCfg {
  if (!isObj(v)) return false;
  return isInt(v.maxJobs, 1, 20) && (v.maxBatch === undefined || isInt(v.maxBatch, 1, 100)) && (v.batchTimeStep === undefined || (typeof v.batchTimeStep === "number" && v.batchTimeStep >= 0 && v.batchTimeStep <= 5)) && Array.isArray(v.recipes) && v.recipes.length <= 200 && v.recipes.every(validBrewRecipe) && new Set((v.recipes as BrewRecipe[]).map((r) => r.id)).size === v.recipes.length;
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

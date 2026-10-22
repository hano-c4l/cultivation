import type { MonsterRank } from "./monsters";

/**
 * Balance numbers of phase 2j that used to be code constants (blacksmith costs and ore drops, refining, the price of the Hộ Cấp Phù, the
 * boss's cone and healing). They live in D1 (table `game_tuning`, one JSON row per group; migration 0030) so an admin screen can edit them
 * later: the server seeds the rows from DEFAULT_TUNING, installs them with setTuning and sends them to the client with the windows that
 * show them. Every group is validated separately, and a missing or broken group keeps its default. All values are placeholders.
 */
export interface DropCfg {
  chance: number;
  min: number;
  max: number;
}

export interface Tuning {
  /** Tinh luyện: ore taken, Linh Thạch (as a share of `enhanceCost.linhBase` of the realm) and the chance each stat is rolled. */
  refine: { materials: number; linhShare: number; statChance: number };
  /** Chance and size of the smith's ore a kill drops, by monster rank. */
  oreDrop: Record<MonsterRank, DropCfg>;
  /** The same for the refining ore (rarer). */
  refineDrop: Record<MonsterRank, DropCfg>;
  /** The Hộ Cấp Phù (keeps a level on a failed step), sold for Tiên Ngọc. */
  keepLevel: { priceTienNgoc: number };
  /** Upgrade cost: Linh Thạch per unit of a step's `linhMult` by the realm of the piece, and the cap of the bonus built up by failures. */
  enhanceCost: { linhBase: number[]; maxPityPct: number };
  /** The boss's cone: damage multiple, cooldown, the share of HP below which it is used, range (tiles) and half its opening (degrees). */
  bossCone: { power: number; cdMs: number; below: number; range: number; halfAngleDeg: number };
  /** The boss heals this fraction of its maximum HP per second once it has walked home from a lost fight. */
  bossRegen: { perSecond: number };
}

export type TuningGroup = keyof Tuning;

export const DEFAULT_TUNING: Readonly<Tuning> = {
  refine: { materials: 2, linhShare: 1, statChance: 0.5 },
  oreDrop: {
    normal: { chance: 0.2, min: 1, max: 1 },
    rare1: { chance: 0.6, min: 1, max: 3 },
    rare2: { chance: 1, min: 2, max: 5 },
  },
  refineDrop: {
    normal: { chance: 0.04, min: 1, max: 1 },
    rare1: { chance: 0.15, min: 1, max: 2 },
    rare2: { chance: 0.4, min: 1, max: 3 },
  },
  keepLevel: { priceTienNgoc: 50 },
  enhanceCost: { linhBase: [100, 1_000, 10_000, 100_000], maxPityPct: 30 },
  bossCone: { power: 2.2, cdMs: 25_000, below: 0.25, range: 4.5, halfAngleDeg: 45 },
  bossRegen: { perSecond: 0.02 },
};

export const TUNING_GROUPS = Object.keys(DEFAULT_TUNING) as TuningGroup[];

/** Labels for the future admin screen. */
export const TUNING_LABELS_VI: Readonly<Record<TuningGroup, string>> = {
  refine: "Tinh luyện: nguyên liệu, Linh Thạch, tỉ lệ mỗi chỉ số",
  oreDrop: "Tỉ lệ và số lượng rơi Tinh Thiết theo loại quái",
  refineDrop: "Tỉ lệ và số lượng rơi Tinh Hoa theo loại quái",
  keepLevel: "Giá Hộ Cấp Phù (Tiên Ngọc)",
  enhanceCost: "Chi phí nâng cấp: Linh Thạch cơ bản theo cảnh giới, giới hạn cộng dồn thất bại",
  bossCone: "Kỹ năng nón của boss",
  bossRegen: "Tốc độ hồi máu của boss khi về chỗ cũ",
};

const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const int = (v: unknown, min: number, max: number): v is number => num(v, min, max) && Number.isInteger(v);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function validDrop(v: unknown): v is DropCfg {
  return obj(v) && num(v.chance, 0, 1) && int(v.min, 0, 999) && int(v.max, 0, 999) && (v.max as number) >= (v.min as number);
}

function validDrops(v: unknown): v is Record<MonsterRank, DropCfg> {
  return obj(v) && validDrop(v.normal) && validDrop(v.rare1) && validDrop(v.rare2);
}

/** Whether `value` is a well formed value for the group (used for rows read from D1 and for an admin save). */
export function validTuningGroup(group: string, value: unknown): boolean {
  if (!obj(value)) return false;
  switch (group) {
    case "refine":
      return int(value.materials, 0, 999) && num(value.linhShare, 0, 1000) && num(value.statChance, 0, 1);
    case "oreDrop":
    case "refineDrop":
      return validDrops(value);
    case "keepLevel":
      return int(value.priceTienNgoc, 0, 1_000_000);
    case "enhanceCost":
      return (
        Array.isArray(value.linhBase) &&
        value.linhBase.length === DEFAULT_TUNING.enhanceCost.linhBase.length &&
        value.linhBase.every((n) => int(n, 0, 1_000_000_000)) &&
        num(value.maxPityPct, 0, 100)
      );
    case "bossCone":
      return num(value.power, 0, 100) && int(value.cdMs, 0, 3_600_000) && num(value.below, 0, 1) && num(value.range, 0, 50) && num(value.halfAngleDeg, 0, 180);
    case "bossRegen":
      return num(value.perSecond, 0, 1);
    default:
      return false;
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

let live: Tuning = clone(DEFAULT_TUNING);

/** The numbers in force on this isolate (the defaults until setTuning installs rows). */
export function tuning(): Readonly<Tuning> {
  return live;
}

/** Installs live groups (`rows` maps a group name to its parsed JSON); a group not given, or given badly, keeps its default. */
export function setTuning(rows: Readonly<Record<string, unknown>> | null | undefined): void {
  const next = clone(DEFAULT_TUNING);
  for (const group of TUNING_GROUPS) {
    const v = rows?.[group];
    if (v !== undefined && validTuningGroup(group, v)) (next as unknown as Record<string, unknown>)[group] = clone(v);
  }
  live = next;
}

/** Back to the defaults (tests). */
export function resetTuning(): void {
  setTuning(null);
}

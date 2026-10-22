import type { BagItem, BagOp } from "./inventory";
import type { MonsterRank } from "./monsters";

/**
 * The blacksmith (Thợ Rèn): upgrades gear and pháp bảo from +0 to +ENHANCE_MAX and repairs durability. Every number here is a placeholder
 * ("giá trị tạm" in docs/PHASE2.md) and lives in a table so an admin screen can edit it later: the D1 table `enhance_levels` holds the live
 * rows (seeded from DEFAULT_ENHANCE_TABLE), the server installs them with setEnhanceTable, and the client gets them with the smith window.
 */
export const ENHANCE_MAX = 10;

export interface EnhanceLevelDef {
  /** The level an upgrade leads to (1..ENHANCE_MAX); the row is the step from level - 1. */
  level: number;
  /** Chance (percent) the step succeeds, before the bonus from earlier failures. */
  successPct: number;
  /** Percent of the piece's stats this level adds (levels add up: +1 is 10%, +2 is 20% ...). */
  statPct: number;
  /** Percent added to the next attempt's chance after each failure of this step, up to MAX_PITY_PCT. */
  failBonusPct: number;
  /** A failure of this step costs one level (unless a Hộ Cấp Phù is used). */
  dropOnFail: boolean;
  /** Pieces of the realm's ore this step takes. */
  materials: number;
  /** Linh Thạch of this step = ENHANCE_LINH_BASE[realm of the piece] x this. */
  linhMult: number;
}

/** The most a run of failures adds to the chance of the next attempt. */
export const MAX_PITY_PCT = 30;
/** Linh Thạch per unit of `linhMult`, by the realm of the piece. */
export const ENHANCE_LINH_BASE: readonly number[] = [100, 1_000, 10_000, 100_000];

export const DEFAULT_ENHANCE_TABLE: readonly EnhanceLevelDef[] = [
  { level: 1, successPct: 90, statPct: 10, failBonusPct: 5, dropOnFail: false, materials: 1, linhMult: 1 },
  { level: 2, successPct: 85, statPct: 10, failBonusPct: 5, dropOnFail: false, materials: 2, linhMult: 2 },
  { level: 3, successPct: 80, statPct: 10, failBonusPct: 5, dropOnFail: false, materials: 3, linhMult: 3 },
  { level: 4, successPct: 70, statPct: 10, failBonusPct: 5, dropOnFail: false, materials: 4, linhMult: 4 },
  { level: 5, successPct: 60, statPct: 10, failBonusPct: 5, dropOnFail: false, materials: 5, linhMult: 5 },
  { level: 6, successPct: 50, statPct: 10, failBonusPct: 5, dropOnFail: true, materials: 6, linhMult: 8 },
  { level: 7, successPct: 40, statPct: 10, failBonusPct: 5, dropOnFail: true, materials: 8, linhMult: 10 },
  { level: 8, successPct: 30, statPct: 10, failBonusPct: 5, dropOnFail: true, materials: 10, linhMult: 15 },
  { level: 9, successPct: 20, statPct: 10, failBonusPct: 5, dropOnFail: true, materials: 12, linhMult: 20 },
  { level: 10, successPct: 15, statPct: 10, failBonusPct: 5, dropOnFail: true, materials: 15, linhMult: 30 },
];

let table: readonly EnhanceLevelDef[] = DEFAULT_ENHANCE_TABLE;

export function enhanceTable(): readonly EnhanceLevelDef[] {
  return table;
}

/** Whether a row is well formed (used for rows read from D1 and for an admin save). */
export function validEnhanceLevel(r: Partial<EnhanceLevelDef> | null | undefined): r is EnhanceLevelDef {
  return (
    !!r &&
    Number.isInteger(r.level) && r.level! >= 1 && r.level! <= ENHANCE_MAX &&
    Number.isFinite(r.successPct) && r.successPct! >= 0 && r.successPct! <= 100 &&
    Number.isFinite(r.statPct) && r.statPct! >= 0 && r.statPct! <= 1000 &&
    Number.isFinite(r.failBonusPct) && r.failBonusPct! >= 0 && r.failBonusPct! <= 100 &&
    typeof r.dropOnFail === "boolean" &&
    Number.isInteger(r.materials) && r.materials! >= 0 && r.materials! <= 9999 &&
    Number.isFinite(r.linhMult) && r.linhMult! >= 0 && r.linhMult! <= 1_000_000
  );
}

/** Installs live rows (any level not given, or given badly, keeps its default). */
export function setEnhanceTable(rows: readonly Partial<EnhanceLevelDef>[] | null | undefined): void {
  table = DEFAULT_ENHANCE_TABLE.map((def) => {
    const r = rows?.find((x) => x?.level === def.level);
    return validEnhanceLevel(r) ? { ...r } : def;
  });
}

export function enhanceStep(level: number): EnhanceLevelDef | undefined {
  return table.find((r) => r.level === level);
}

/** Factor on all the stats of a piece at this upgrade level: 1 + the sum of the levels' statPct (the +1 of a piece is +10%, +2 is +20%). */
export function enhanceStatMult(level: number | undefined): number {
  if (!level || level <= 0) return 1;
  let pct = 0;
  for (const r of table) if (r.level <= Math.min(level, ENHANCE_MAX)) pct += r.statPct;
  return 1 + pct / 100;
}

/** The realm a piece counts as for the smith: its own, except the bonded artifact, which counts as the realm it has trained to (flat level index `lv`). */
export function smithRealmOf(info: { kind: string; realm: number }, trainedLevel: number | undefined, stagesPerRealm: number): number {
  return info.kind === "bonded" && trainedLevel !== undefined ? Math.floor(trainedLevel / stagesPerRealm) : info.realm;
}

/** The ore the smith needs for a piece of this realm, one kind for each realm (they only drop from monsters of that realm). */
export const SMITH_ORES: readonly string[] = ["ren_lk", "ren_tc", "ren_kd", "ren_na"];
export function smithOreFor(realm: number): string | undefined {
  return SMITH_ORES[realm];
}
/** The scroll that keeps the level on a failed step that would cost one (sold by the merchant for Tiên Ngọc). */
export const KEEP_LEVEL_ITEM = "ren_giu_cap";
export const KEEP_LEVEL_PRICE_TIEN_NGOC = 50;

export interface UpgradeCost {
  ore: string;
  materials: number;
  linhThach: number;
  /** Chance (percent, 0..100) with the bonus from earlier failures. */
  chancePct: number;
  step: EnhanceLevelDef;
}

/** What upgrading a piece of `realm` from `level` costs and its chance with `pity` percent of bonus; undefined at the top level or for an unknown realm. */
export function upgradeCost(realm: number, level: number, pity: number): UpgradeCost | undefined {
  const step = enhanceStep(level + 1);
  const ore = smithOreFor(realm);
  if (!step || !ore) return undefined;
  const base = ENHANCE_LINH_BASE[realm] ?? ENHANCE_LINH_BASE[ENHANCE_LINH_BASE.length - 1]!;
  return { ore, materials: step.materials, linhThach: Math.round(base * step.linhMult), chancePct: Math.min(100, step.successPct + Math.min(MAX_PITY_PCT, Math.max(0, pity))), step };
}

export interface UpgradeOutcome {
  success: boolean;
  /** The level after the attempt. */
  level: number;
  /** The extra chance kept for the next attempt (resets to 0 on success; grows with each failure up to MAX_PITY_PCT). */
  pity: number;
  /** A level was lost. */
  dropped: boolean;
  /** The scroll kept the level (it is only used up when it saved one). */
  scrollUsed: boolean;
}

/** Resolves one attempt from a uniform [0, 1) roll. */
export function resolveUpgrade(level: number, pity: number, chancePct: number, step: EnhanceLevelDef, useScroll: boolean, roll: number): UpgradeOutcome {
  if (roll * 100 < chancePct) return { success: true, level: level + 1, pity: 0, dropped: false, scrollUsed: false };
  const nextPity = Math.min(MAX_PITY_PCT, pity + step.failBonusPct);
  if (!step.dropOnFail || level <= 0) return { success: false, level, pity: nextPity, dropped: false, scrollUsed: false };
  if (useScroll) return { success: false, level, pity: nextPity, dropped: false, scrollUsed: true };
  return { success: false, level: level - 1, pity: nextPity, dropped: true, scrollUsed: false };
}

/** Takes `qty` of an item type out of the stacks of a bag (smallest first), as bag operations; null when there is not that much. */
export function planConsume(bag: readonly BagItem[], type: string, qty: number): BagOp[] | null {
  if (!Number.isInteger(qty) || qty < 0) return null;
  if (qty === 0) return [];
  const stacks = bag.filter((i) => i.type === type).sort((a, b) => a.qty - b.qty || a.tab - b.tab || a.cell - b.cell);
  if (stacks.reduce((n, s) => n + s.qty, 0) < qty) return null;
  const ops: BagOp[] = [];
  let left = qty;
  for (const s of stacks) {
    if (left === 0) break;
    const take = Math.min(left, s.qty);
    ops.push(take === s.qty ? { op: "remove", id: s.id, qty: s.qty } : { op: "setqty", id: s.id, from: s.qty, to: s.qty - take });
    left -= take;
  }
  return ops;
}

/** Chance and size of the ore a kill drops (only monsters of the map's own realm; guards drop nothing). */
export const ORE_DROP: Readonly<Record<MonsterRank, { chance: number; min: number; max: number }>> = {
  normal: { chance: 0.2, min: 1, max: 1 },
  rare1: { chance: 0.6, min: 1, max: 3 },
  rare2: { chance: 1, min: 2, max: 5 },
};

/** The ore dropped by one kill, or null. Draws exactly two numbers, after every other roll of the kill (so seeded sequences stay stable). */
export function rollOreDrop(mapRealm: number, rank: MonsterRank, rand: () => number, chanceMult = 1): { item: string; qty: number } | null {
  const chanceRoll = rand();
  const qtyRoll = rand();
  const ore = smithOreFor(mapRealm);
  const cfg = ORE_DROP[rank];
  if (!ore || chanceRoll >= cfg.chance * chanceMult) return null;
  return { item: ore, qty: cfg.min + Math.floor(qtyRoll * (cfg.max - cfg.min + 1)) };
}

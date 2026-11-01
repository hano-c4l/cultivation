/**
 * Direct trade between two players (docs/PHASE5.md, 5b): the numbers (the tuning group `trade`) and what the two windows show. Linh Thạch and Tiên Ngọc change hands besides
 * items, and only between two characters standing near each other in the same safe room. This file has no imports on purpose (the tuning defaults are built from it).
 */
export interface TradeCfg {
  /** The most items one side can put in (whole stacks). D1 allows 50 statements per batch and each item costs two, so more than 6 does not fit. */
  maxItems: number;
  /** How far apart (tiles) the two may stand. */
  range: number;
  /** How long an invitation can be answered, in seconds. */
  inviteSec: number;
  /** The most Linh Thạch one side can put in. */
  maxLinh: number;
  /** The most Tiên Ngọc one side can put in (absent in a stored row from before: 10 000 000). */
  maxTienNgoc?: number;
  /** The least time between two changes of one side's offer, in ms (each change is a stored write). */
  offerGapMs: number;
}

export const DEFAULT_TRADE: TradeCfg = { maxItems: 6, range: 8, inviteSec: 30, maxLinh: 1_000_000_000, maxTienNgoc: 10_000_000, offerGapMs: 400 };

export const TRADE_MAX_ITEMS_LIMIT = 6;

function inRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

export function validTrade(v: unknown): v is TradeCfg {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return inRange(c.maxItems, 1, TRADE_MAX_ITEMS_LIMIT) && inRange(c.range, 1, 30) && inRange(c.inviteSec, 5, 600) && inRange(c.maxLinh, 0, 1_000_000_000) && (c.maxTienNgoc === undefined || inRange(c.maxTienNgoc, 0, 1_000_000_000)) && inRange(c.offerGapMs, 0, 10_000);
}

/** Why a trade ended (the window closes and says so). */
export type TradeEnd = "done" | "cancelled" | "declined" | "expired" | "left" | "far" | "busy" | "gone" | "stale" | "funds" | "full";

/** Why a trade command was refused (the window stays open, or the invitation never went out). */
export type TradeError = "rate" | "invalid" | "far" | "unsafe" | "busy" | "self" | "murderer" | "stale" | "full" | "funds" | "limit" | "none" | "untradable";

/** One side of the window. `items` carry what a bag item carries (durability, upgrade, rolled stats) so both can read the stats before agreeing. */
export interface TradeSideView {
  items: Array<{ id: string; type: string; qty: number; carry: Record<string, unknown> }>;
  linh: number;
  tienNgoc: number;
  locked: boolean;
  confirmed: boolean;
}

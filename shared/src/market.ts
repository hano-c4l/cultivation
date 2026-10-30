/**
 * Vạn Bảo Lâu, the market NPC (docs/PHASE5.md, 5a): the numbers (the tuning group `market`) and the pure rules (tax, fee, the daily auction round).
 * Every town has its own market: a listing is seen and bought only in the town it was put up in. A listing is priced in Linh Thạch or in Tiên Ngọc. This file has no imports
 * on purpose (the tuning defaults are built from it).
 */
export interface MarketCfg {
  /** Share of a sale (percent) the market keeps; paid out of the seller's proceeds. */
  taxPct: number;
  /** Share of the asking price (percent) charged when putting a listing up, never returned. */
  listFeePct: number;
  /** The least listing fee, in Linh Thạch. */
  minListFee: number;
  /** The most open listings one character can have. */
  maxListings: number;
  /** How long a fixed-price listing stays up, in days. */
  fixedDays: number;
  /** A new bid must beat the top bid by at least this share (percent), and by at least 1. */
  bidStepPct: number;
  /** The amount the bid box starts with: the top bid plus this share (percent); the bidder can edit it. Absent in a stored row from before: 10. */
  bidSuggestPct?: number;
  /** The auction round: bids are taken from `openHour` until `closeHour` (hours of the local day, 0-23); the round closes at `closeHour`. */
  openHour: number;
  closeHour: number;
  /** Hours the local day is ahead of UTC (7: Vietnam). The day resets of the game are at the same local midnight. */
  tzHours: number;
  /** The dearest price a listing can ask, in Linh Thạch. */
  maxPrice: number;
  /** The same two numbers for a listing priced in Tiên Ngọc (a stored row from before has none: 1 and 10 000 000). */
  minListFeeTienNgoc?: number;
  maxPriceTienNgoc?: number;
  /** The town announcement of a listing, sent by the NPC: the least item grade that may be announced, its fee and the least time between two of one character's announcements. */
  promote: { minGrade: number; fee: number; cooldownSec: number };
}

export const DEFAULT_MARKET: MarketCfg = {
  taxPct: 10,
  listFeePct: 2,
  minListFee: 100,
  maxListings: 10,
  fixedDays: 7,
  bidStepPct: 5,
  bidSuggestPct: 10,
  openHour: 6,
  closeHour: 21,
  tzHours: 7,
  maxPrice: 1_000_000_000,
  minListFeeTienNgoc: 1,
  maxPriceTienNgoc: 10_000_000,
  promote: { minGrade: 3, fee: 50_000, cooldownSec: 60 },
};

export const MARKET_KINDS = ["fixed", "auction"] as const;

/** The two currencies a listing can be priced in (the buyer or bidder pays in the same one; Cống Hiến is locked and never traded). */
export const MARKET_CURRENCIES = ["linh_thach", "tien_ngoc"] as const;
export type MarketCurrency = (typeof MARKET_CURRENCIES)[number];
export const isMarketCurrency = (v: unknown): v is MarketCurrency => v === "linh_thach" || v === "tien_ngoc";

/** The dearest price a listing can ask in a currency. */
export const marketMaxPrice = (cfg: MarketCfg, currency: MarketCurrency): number => (currency === "tien_ngoc" ? (cfg.maxPriceTienNgoc ?? 10_000_000) : cfg.maxPrice);
export type MarketKind = (typeof MARKET_KINDS)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function inRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

export function validMarket(v: unknown): v is MarketCfg {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  const p = c.promote as Record<string, unknown> | undefined;
  return (
    inRange(c.taxPct, 0, 90) &&
    inRange(c.listFeePct, 0, 50) &&
    inRange(c.minListFee, 1, 1_000_000_000) &&
    inRange(c.maxListings, 1, 100) &&
    inRange(c.fixedDays, 1, 90) &&
    inRange(c.bidStepPct, 0, 100) &&
    (c.bidSuggestPct === undefined || inRange(c.bidSuggestPct, 0, 100)) &&
    inRange(c.openHour, 0, 23) &&
    inRange(c.closeHour, 1, 24) &&
    (c.openHour as number) < (c.closeHour as number) &&
    inRange(c.tzHours, -12, 14) &&
    inRange(c.maxPrice, 1, 1_000_000_000) &&
    (c.minListFeeTienNgoc === undefined || inRange(c.minListFeeTienNgoc, 1, 1_000_000_000)) &&
    (c.maxPriceTienNgoc === undefined || inRange(c.maxPriceTienNgoc, 1, 1_000_000_000)) &&
    typeof p === "object" &&
    p !== null &&
    inRange(p.minGrade, 1, 9) &&
    inRange(p.fee, 1, 1_000_000_000) &&
    inRange(p.cooldownSec, 0, 86_400)
  );
}

/** What the market keeps of a sale at `price`. */
export function marketTax(cfg: MarketCfg, price: number): number {
  return Math.floor((price * cfg.taxPct) / 100);
}

/** The fee charged for putting a listing up asking `price` (the start price of an auction). */
export function listingFee(cfg: MarketCfg, price: number, currency: MarketCurrency = "linh_thach"): number {
  const least = currency === "tien_ngoc" ? (cfg.minListFeeTienNgoc ?? 1) : cfg.minListFee;
  return Math.max(least, Math.floor((price * cfg.listFeePct) / 100));
}

/** The least bid on an auction: the start price while nobody has bid, else the top bid plus the step. */
export function minNextBid(cfg: MarketCfg, startPrice: number, topBid: number): number {
  if (topBid <= 0) return startPrice;
  return topBid + Math.max(1, Math.ceil((topBid * cfg.bidStepPct) / 100));
}

/** The amount a bid box starts with: the start price while nobody has bid, else the top bid raised by `bidSuggestPct` (never under the least next bid, never over the price cap). */
export function suggestedBid(cfg: MarketCfg, startPrice: number, topBid: number, currency: MarketCurrency = "linh_thach"): number {
  const least = minNextBid(cfg, startPrice, topBid);
  const cap = marketMaxPrice(cfg, currency);
  if (topBid <= 0) return Math.min(least, cap);
  return Math.min(cap, Math.max(least, Math.ceil((topBid * (100 + (cfg.bidSuggestPct ?? 10))) / 100)));
}

/** Milliseconds since the start of the local day (`tzHours` ahead of UTC) at `now`. */
function localDayMs(cfg: MarketCfg, now: number): number {
  const local = now + cfg.tzHours * HOUR_MS;
  return ((local % DAY_MS) + DAY_MS) % DAY_MS;
}

/** When the round an auction listed at `createdAt` ends: that day's closing hour, or the next day's when it is already past. */
export function auctionEndsAt(cfg: MarketCfg, createdAt: number): number {
  const into = localDayMs(cfg, createdAt);
  const close = cfg.closeHour * HOUR_MS;
  const base = createdAt - into + close; // today's closing instant
  return into < close ? base : base + DAY_MS;
}

/** Whether bids are taken at `now` (between the opening and the closing hour of the local day). */
export function auctionOpen(cfg: MarketCfg, now: number): boolean {
  const into = localDayMs(cfg, now);
  return into >= cfg.openHour * HOUR_MS && into < cfg.closeHour * HOUR_MS;
}

/** When a fixed-price listing put up at `createdAt` expires. */
export function fixedEndsAt(cfg: MarketCfg, createdAt: number): number {
  return createdAt + cfg.fixedDays * DAY_MS;
}

/** One listing as the client sees it. `item` carries the wear, rolled stats and upgrade level like a bag item. */
export interface MarketListingView {
  id: string;
  kind: MarketKind;
  /** What the price is in: the buyer or bidder pays in the same currency. */
  currency: MarketCurrency;
  sellerName: string;
  /** True: the character looking is the seller (no buying, a cancel button instead). */
  mine: boolean;
  type: string;
  qty: number;
  /** Fixed: the price. Auction: the start price. */
  price: number;
  /** Auction: the top bid so far (0: none) and whether the viewer is the top bidder. */
  topBid: number;
  topIsMe: boolean;
  /** The least a new bid must be (auction only). */
  nextBid: number;
  endsAt: number;
  /** Gear and upgraded items: the same fields a bag item carries (`dur`, `max`, `lv`, `xp`, `rs`, `en`). */
  carry: Record<string, unknown>;
}

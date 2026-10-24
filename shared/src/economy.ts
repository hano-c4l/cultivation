import type { MonsterRank } from "./monsters";
import { tuning } from "./tuning";

/** Currencies (PLAN section 1). Ids are stored in D1 and must match the CHECK constraints in migration 0005. */
export const CURRENCIES = ["linh_thach", "cong_hien", "tien_ngoc"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

export type Wallet = Record<Currency, number>;

export const EMPTY_WALLET: Readonly<Wallet> = { linh_thach: 0, cong_hien: 0, tien_ngoc: 0 };

/**
 * The groups money is totalled by (tables `<currency>_totals`: one row per character and group with the money in and out). A change is
 * put in a group by its reason (see `currencyGroupOf`); the groups are fixed here in code and the admin screens show these labels.
 */
export const CURRENCY_GROUPS = [
  { id: "farm", labelVi: "Farm (quái, boss, người chơi rơi)" },
  { id: "shop", labelVi: "Mua bán (thương nhân, đan sư)" },
  { id: "quest", labelVi: "Nhiệm vụ" },
  { id: "trade", labelVi: "Giao dịch người chơi" },
  { id: "enhance", labelVi: "Cường hoá (nâng cấp, tinh luyện, đột phá, sửa đồ, hướng tu)" },
  { id: "travel", labelVi: "Di chuyển (truyền tống)" },
  { id: "admin", labelVi: "Admin (chỉnh tay, gửi quà, điều chỉnh khi kiểm duyệt)" },
  { id: "other", labelVi: "Khác" },
] as const;

export type CurrencyGroup = (typeof CURRENCY_GROUPS)[number]["id"];

export function isCurrencyGroup(v: unknown): v is CurrencyGroup {
  return typeof v === "string" && CURRENCY_GROUPS.some((g) => g.id === v);
}

export function currencyGroupLabel(id: string): string {
  return CURRENCY_GROUPS.find((g) => g.id === id)?.labelVi ?? id;
}

/** The part of a reason before its first ":" ("shop_buy:ren_giu_cap:1" -> "shop_buy"): the code of the kind of change. */
export function reasonKind(reason: string): string {
  const i = reason.indexOf(":");
  return (i < 0 ? reason : reason.slice(0, i)).trim();
}

/**
 * Reason kind -> group. A kind matches an entry by equality, or by prefix for the entries ending in "*". Anything not listed is "other",
 * so a new reason works at once and only needs an entry here to leave "other" (docs/PHASE3.md lists the table).
 */
const GROUP_OF_KIND: ReadonlyArray<readonly [string, CurrencyGroup]> = [
  ["monster_drop", "farm"],
  ["shop_buy", "shop"],
  ["shop_sell", "shop"],
  ["alchemist_buy", "shop"],
  ["alchemist_sell", "shop"],
  ["quest", "quest"],
  ["trade", "trade"],
  ["market", "trade"],
  ["auction", "trade"],
  ["smith_upgrade", "enhance"],
  ["smith_refine", "enhance"],
  ["repair", "enhance"],
  ["breakthrough", "enhance"],
  ["path*", "enhance"],
  ["waygate", "travel"],
  ["admin*", "admin"],
];

/** The group a reason belongs to. */
export function currencyGroupOf(reason: string): CurrencyGroup {
  const kind = reasonKind(reason);
  for (const [pattern, group] of GROUP_OF_KIND) {
    if (pattern.endsWith("*") ? kind.startsWith(pattern.slice(0, -1)) : kind === pattern) return group;
  }
  return "other";
}

/** Largest single amount a ledger entry may carry; keeps balances far below 2^53. */
export const MAX_LEDGER_AMOUNT = 1_000_000_000;

/** Linh Thạch drops from monsters (numbers in the tuning, `drops.linh`). A zero drop writes nothing, so the chance also controls the D1 write rate. */

/**
 * Linh Thạch dropped by one kill, or 0. `level` is the flat level index of the monster's (realm, bậc);
 * `chanceRoll` and `spreadRoll` are uniform [0, 1) numbers so the result is deterministic under test.
 */
export function rollLinhThachDrop(level: number, rank: MonsterRank, chanceRoll: number, spreadRoll: number): number {
  const cfg = tuning().drops.linh;
  if (chanceRoll >= cfg.chance[rank]) return 0;
  const spread = 0.8 + 0.4 * spreadRoll;
  return Math.max(1, Math.round(cfg.base * cfg.growth ** level * cfg.amountMult[rank] * spread));
}

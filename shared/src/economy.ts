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
 * The reason group of a ledger reason: the part before the first ":" ("shop_buy:ren_giu_cap:1" -> "shop_buy"). Totals are kept per group
 * (tables `<currency>_totals`); migration 0036 builds the same groups in SQL, so the two must stay the same rule. Any new reason is its own
 * group with no migration.
 */
export function reasonGroup(reason: string): string {
  const i = reason.indexOf(":");
  const group = (i < 0 ? reason : reason.slice(0, i)).trim().slice(0, 40);
  return group || "other";
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

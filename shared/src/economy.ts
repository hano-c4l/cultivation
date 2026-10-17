/** Currencies (PLAN section 1). Ids are stored in D1 and must match the CHECK constraints in migration 0005. */
export const CURRENCIES = ["linh_thach", "cong_hien", "tien_ngoc"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

export type Wallet = Record<Currency, number>;

export const EMPTY_WALLET: Readonly<Wallet> = { linh_thach: 0, cong_hien: 0, tien_ngoc: 0 };

/** Largest single amount a ledger entry may carry; keeps balances far below 2^53. */
export const MAX_LEDGER_AMOUNT = 1_000_000_000;

/**
 * Linh Thạch drops from monsters. Placeholder game-design values (listed as "giá trị tạm" in docs/STATUS.md).
 * A zero drop writes nothing, so the chance also controls the D1 write rate.
 */
export const DROP_CHANCE = { normal: 0.3, rare1: 1, rare2: 1 } as const;
export const DROP_AMOUNT_MULT = { normal: 1, rare1: 4, rare2: 10 } as const;
const DROP_BASE = 2;
const DROP_GROWTH = 1.1;

/**
 * Linh Thạch dropped by one kill, or 0. `level` is the flat level index of the monster's (realm, bậc);
 * `chanceRoll` and `spreadRoll` are uniform [0, 1) numbers so the result is deterministic under test.
 */
export function rollLinhThachDrop(level: number, rank: keyof typeof DROP_CHANCE, chanceRoll: number, spreadRoll: number): number {
  if (chanceRoll >= DROP_CHANCE[rank]) return 0;
  const spread = 0.8 + 0.4 * spreadRoll;
  return Math.max(1, Math.round(DROP_BASE * DROP_GROWTH ** level * DROP_AMOUNT_MULT[rank] * spread));
}

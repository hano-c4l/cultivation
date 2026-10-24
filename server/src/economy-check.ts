import { CURRENCIES, type Currency } from "@game/shared";

/**
 * Reconciliation of the currency totals with the balances: for every character and currency, SUM(total_in) - SUM(total_out) over the
 * reason groups must equal `currency_balances.balance`. Both are written in the same batch from the same delta, so they only differ after
 * a bug or after somebody edited a table by hand: this is the quick check, and the history tables are for digging into the why.
 */

const TOTALS_TABLE: Record<Currency, string> = { tien_ngoc: "tien_ngoc_totals", linh_thach: "linh_thach_totals", cong_hien: "cong_hien_totals" };

export interface CheckMismatch {
  characterId: string;
  characterName: string | null;
  balance: number;
  /** What the totals add up to. */
  computed: number;
}

export interface CurrencyCheck {
  currency: Currency;
  /** Characters with a balance row or totals. */
  checked: number;
  mismatches: CheckMismatch[];
  /** Sum of all balances and of all totals (they differ by the same amount as the mismatches add up to). */
  balanceSum: number;
  computedSum: number;
}

export const CHECK_LIMIT = 100;

export async function checkCurrency(db: D1Database, currency: Currency): Promise<CurrencyCheck> {
  const totals = TOTALS_TABLE[currency];
  // A character may have a balance and no totals (edited by hand) or totals and no balance: both sides are listed.
  const both =
    `SELECT character_id, SUM(balance) AS balance, SUM(computed) AS computed FROM (` +
    `SELECT character_id, balance, 0 AS computed FROM currency_balances WHERE currency = ?1 ` +
    `UNION ALL SELECT character_id, 0, total_in - total_out FROM ${totals}) GROUP BY character_id`;
  const { results } = await db
    .prepare(`SELECT p.character_id, c.name AS name, p.balance, p.computed FROM (${both}) p LEFT JOIN characters c ON c.id = p.character_id WHERE p.balance <> p.computed ORDER BY ABS(p.balance - p.computed) DESC LIMIT ${CHECK_LIMIT}`)
    .bind(currency)
    .all<{ character_id: string; name: string | null; balance: number; computed: number }>();
  const sums = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(balance), 0) AS balance, COALESCE(SUM(computed), 0) AS computed FROM (${both})`)
    .bind(currency)
    .first<{ n: number; balance: number; computed: number }>();
  return {
    currency,
    checked: sums?.n ?? 0,
    mismatches: results.map((r) => ({ characterId: r.character_id, characterName: r.name, balance: r.balance, computed: r.computed })),
    balanceSum: sums?.balance ?? 0,
    computedSum: sums?.computed ?? 0,
  };
}

export async function checkAll(db: D1Database): Promise<CurrencyCheck[]> {
  const out: CurrencyCheck[] = [];
  for (const c of CURRENCIES) out.push(await checkCurrency(db, c));
  return out;
}

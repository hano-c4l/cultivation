import { CURRENCIES, EMPTY_WALLET, MAX_LEDGER_AMOUNT, reasonGroup, type Currency, type Wallet } from "@game/shared";
import { getSetting } from "./settings";

export interface CurrencyChange {
  characterId: string;
  currency: Currency;
  /** Non-zero integer; negative spends. */
  delta: number;
  /** Machine-readable cause, e.g. "monster_drop", "admin_grant", "mail_claim". Its group (the part before ":") is what the totals are kept by. */
  reason: string;
  /** Who caused it: "system", or an account id for admin actions. */
  actor: string;
  /**
   * Only for a change that can come back with the SAME key (an admin form, a mail claim, the retry of a drop, one teleport): the same key
   * twice is `duplicate` and changes nothing. Leave it out when every call is a new change by construction (a purchase, a repair): the
   * key table would only cost a write.
   */
  idempotencyKey?: string;
  /** How long the key is remembered, in ms; none = for good (use for a grant that must happen once ever, like a mail). */
  keyTtlMs?: number;
}

export type CurrencyResult =
  | { status: "applied"; balance: number }
  | { status: "duplicate" }
  | { status: "insufficient" };

/** The ledger tables written per currency: every Tiên Ngọc change, only the big Linh Thạch ones, no history for Cống Hiến. */
const TOTALS_TABLE: Record<Currency, string> = { tien_ngoc: "tien_ngoc_totals", linh_thach: "linh_thach_totals", cong_hien: "cong_hien_totals" };

/** True when a change is written to the currency's history table (the totals are always updated). */
export function isTraced(c: Pick<CurrencyChange, "currency" | "delta" | "actor">, linhThachTraceMin: number): boolean {
  if (c.currency === "tien_ngoc") return true;
  if (c.currency === "linh_thach") return Math.abs(c.delta) >= linhThachTraceMin || c.actor !== "system";
  return false;
}

/** The size from which a Linh Thạch change is written to its history (setting `linh_thach_trace_min`, cached for a short while). */
export function linhThachTraceMin(db: D1Database): Promise<number> {
  return getSetting(db, "linh_thach_trace_min");
}

/**
 * The statements of one currency change, to run in ONE batch (with whatever else must happen together, such as a move to another map):
 * the dedupe key (when given), the history row (when traced), the totals upsert for the reason group, the balance row and the balance
 * update, in that order; the balance UPDATE ... RETURNING is always the LAST one. A statement that changes zero rows does NOT roll a
 * batch back, so both failure modes are made to throw: the key table's PRIMARY KEY (duplicate) and the balance CHECK (balance >= 0,
 * which also catches a debit on a missing row). The batch then rolls back as a whole: totals, history and balance stay consistent.
 */
export function currencyStatements(db: D1Database, c: CurrencyChange, traceMin: number, now = Date.now()): D1PreparedStatement[] {
  if (!Number.isInteger(c.delta) || c.delta === 0 || Math.abs(c.delta) > MAX_LEDGER_AMOUNT) throw new Error("invalid ledger delta");
  const out: D1PreparedStatement[] = [];
  if (c.idempotencyKey) {
    out.push(db.prepare("INSERT INTO currency_dedupe (key, expires_at) VALUES (?, ?)").bind(c.idempotencyKey, c.keyTtlMs === undefined ? null : now + c.keyTtlMs));
  }
  if (isTraced(c, traceMin)) {
    const table = c.currency === "tien_ngoc" ? "tien_ngoc_ledger" : "linh_thach_ledger";
    out.push(db.prepare(`INSERT INTO ${table} (character_id, delta, reason, actor, created_at) VALUES (?, ?, ?, ?, ?)`).bind(c.characterId, c.delta, c.reason, c.actor, now));
  }
  out.push(
    db
      .prepare(
        `INSERT INTO ${TOTALS_TABLE[c.currency]} (character_id, grp, total_in, total_out, entries, updated_at) VALUES (?, ?, ?, ?, 1, ?) ` +
          "ON CONFLICT (character_id, grp) DO UPDATE SET total_in = total_in + excluded.total_in, total_out = total_out + excluded.total_out, entries = entries + 1, updated_at = excluded.updated_at",
      )
      .bind(c.characterId, reasonGroup(c.reason), c.delta > 0 ? c.delta : 0, c.delta < 0 ? -c.delta : 0, now),
    // Ensure the row exists (balance 0) so the UPDATE below always matches and its CHECK can fire. An upsert
    // would not do: SQLite checks the proposed INSERT row (a negative delta) before it resolves the conflict.
    db.prepare("INSERT OR IGNORE INTO currency_balances (character_id, currency, balance) VALUES (?, ?, 0)").bind(c.characterId, c.currency),
    db.prepare("UPDATE currency_balances SET balance = balance + ? WHERE character_id = ? AND currency = ? RETURNING balance").bind(c.delta, c.characterId, c.currency),
  );
  return out;
}

/** Applies one currency change as a single D1 batch (see currencyStatements); `extra` statements ride in the same batch. */
export async function applyCurrencyDelta(db: D1Database, c: CurrencyChange, extra: D1PreparedStatement[] = []): Promise<CurrencyResult> {
  try {
    const statements = currencyStatements(db, c, await linhThachTraceMin(db));
    const results = await db.batch<{ balance: number }>([...statements, ...extra]);
    // Logged so `wrangler tail` shows the real D1 write cost of a currency change (docs/PHASE1.md, economy notes).
    console.log("ledger rows_written", c.reason, results.reduce((n, r) => n + (r.meta?.rows_written ?? 0), 0));
    const balance = results[statements.length - 1]?.results[0]?.balance;
    if (typeof balance !== "number") throw new Error("balance update returned no row");
    return { status: "applied", balance };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("currency_dedupe.key")) return { status: "duplicate" };
    if (msg.includes("CHECK constraint failed") && msg.includes("balance")) return { status: "insufficient" };
    throw err;
  }
}

export async function getWallet(db: D1Database, characterId: string): Promise<Wallet> {
  const { results } = await db
    .prepare("SELECT currency, balance FROM currency_balances WHERE character_id = ?")
    .bind(characterId)
    .all<{ currency: Currency; balance: number }>();
  const wallet: Wallet = { ...EMPTY_WALLET };
  for (const row of results) if ((CURRENCIES as readonly string[]).includes(row.currency)) wallet[row.currency] = row.balance;
  return wallet;
}

export async function createItem(db: D1Database, ownerCharacterId: string, itemType: string): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO item_instances (id, owner_character_id, item_type, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, ownerCharacterId, itemType, Date.now())
    .run();
  return id;
}

export interface MailInput {
  characterId: string;
  subject: string;
  body?: string;
  currency?: Currency;
  amount?: number;
  itemId?: string;
}

export async function sendMail(db: D1Database, m: MailInput): Promise<string> {
  const amount = m.currency ? (m.amount ?? 0) : 0;
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO mailbox (id, character_id, subject, body, currency, amount, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, m.characterId, m.subject, m.body ?? "", m.currency ?? null, amount, m.itemId ?? null, Date.now())
    .run();
  return id;
}

export type ClaimResult = { status: "claimed"; balance: number | null } | { status: "already_claimed" } | { status: "not_found" };

/**
 * Claims one mail's currency attachment. Atomic through the ledger key `mail:<id>`: a second claim (even a
 * concurrent one) fails on the UNIQUE key and rolls back, so currency is never granted twice.
 */
export async function claimMail(db: D1Database, characterId: string, mailId: string): Promise<ClaimResult> {
  const mail = await db
    .prepare("SELECT currency, amount, claimed_at FROM mailbox WHERE id = ? AND character_id = ?")
    .bind(mailId, characterId)
    .first<{ currency: Currency | null; amount: number; claimed_at: number | null }>();
  if (!mail) return { status: "not_found" };
  if (mail.claimed_at !== null) return { status: "already_claimed" };
  const markClaimed = db.prepare("UPDATE mailbox SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL").bind(Date.now(), mailId);
  if (!mail.currency) {
    await markClaimed.run();
    return { status: "claimed", balance: null };
  }
  const r = await applyCurrencyDelta(
    db,
    { characterId, currency: mail.currency, delta: mail.amount, reason: "mail_claim", actor: "system", idempotencyKey: `mail:${mailId}` }, // no ttl: a mail's currency is claimed once ever
    [markClaimed],
  );
  if (r.status === "duplicate") return { status: "already_claimed" };
  if (r.status === "insufficient") throw new Error("claimMail: credit reported insufficient");
  return { status: "claimed", balance: r.balance };
}

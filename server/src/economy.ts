import { CURRENCIES, EMPTY_WALLET, MAX_LEDGER_AMOUNT, type Currency, type Wallet } from "@game/shared";

export interface CurrencyChange {
  characterId: string;
  currency: Currency;
  /** Non-zero integer; negative spends. */
  delta: number;
  /** Machine-readable cause, e.g. "monster_drop", "admin_grant", "mail_claim". */
  reason: string;
  /** Who caused it: "system", or an account id for admin actions. */
  actor: string;
  /** Unique per logical change. Retrying the same change with the same key never applies it twice. */
  idempotencyKey: string;
}

export type CurrencyResult =
  | { status: "applied"; balance: number }
  | { status: "duplicate" }
  | { status: "insufficient" };

/**
 * Applies one currency change as a single D1 batch: ledger INSERT, then balance update. A statement that changes
 * zero rows does NOT roll a batch back, so both failure modes are made to throw instead: the ledger's UNIQUE
 * idempotency key (duplicate) and the balance CHECK (balance >= 0, which also catches a debit on a missing row).
 * The batch then rolls back and the ledger and balance stay consistent.
 */
export async function applyCurrencyDelta(db: D1Database, c: CurrencyChange, extra: D1PreparedStatement[] = []): Promise<CurrencyResult> {
  if (!Number.isInteger(c.delta) || c.delta === 0 || Math.abs(c.delta) > MAX_LEDGER_AMOUNT) throw new Error("invalid ledger delta");
  if (!c.idempotencyKey) throw new Error("idempotency key required");
  try {
    const results = await db.batch<{ balance: number }>([
      db
        .prepare(
          "INSERT INTO currency_ledger (character_id, currency, delta, reason, actor, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(c.characterId, c.currency, c.delta, c.reason, c.actor, c.idempotencyKey, Date.now()),
      // Ensure the row exists (balance 0) so the UPDATE below always matches and its CHECK can fire. An upsert
      // would not do: SQLite checks the proposed INSERT row (a negative delta) before it resolves the conflict.
      db.prepare("INSERT OR IGNORE INTO currency_balances (character_id, currency, balance) VALUES (?, ?, 0)").bind(c.characterId, c.currency),
      db
        .prepare("UPDATE currency_balances SET balance = balance + ? WHERE character_id = ? AND currency = ? RETURNING balance")
        .bind(c.delta, c.characterId, c.currency),
      ...extra,
    ]);
    // Logged so `wrangler tail` shows the real D1 write cost of a ledger change (docs/STATUS.md, economy notes).
    console.log("ledger rows_written", c.reason, results.reduce((n, r) => n + (r.meta?.rows_written ?? 0), 0));
    const balance = results[2]?.results[0]?.balance;
    if (typeof balance !== "number") throw new Error("balance update returned no row");
    return { status: "applied", balance };
  } catch (err) {
    const msg = String(err);
    if (msg.includes("currency_ledger.idempotency_key")) return { status: "duplicate" };
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
    { characterId, currency: mail.currency, delta: mail.amount, reason: "mail_claim", actor: "system", idempotencyKey: `mail:${mailId}` },
    [markClaimed],
  );
  if (r.status === "duplicate") return { status: "already_claimed" };
  if (r.status === "insufficient") throw new Error("claimMail: credit reported insufficient");
  return { status: "claimed", balance: r.balance };
}

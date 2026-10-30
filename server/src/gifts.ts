import { GIFT_BATCH_ID, GIFT_BODY_MAX, GIFT_CURRENCIES, GIFT_MAX_RECIPIENTS, GIFT_SUBJECT_MAX, applyBag, firstFreeCell, giftProblem, parseGift, stackLimit, type BagOp, type Currency, type GiftAttachments, type Wallet } from "@game/shared";
import { currencyStatements, getWallet, linhThachTraceMin } from "./economy";
import { commitBagOps, type BagState } from "./inventory";

/**
 * Admin gifts (docs/PHASE3.md 3d): a mail per recipient with its attachments in `mailbox.gift`. The send is ONE batch (the history row, one
 * INSERT ... SELECT of all the mails, the recipient count), so a gift to the whole server is two statements; nothing is created for a player
 * until the mail is claimed.
 */
export const GIFT_LOG_SCREEN = "Gửi quà";

export type Audience = { kind: "all" } | { kind: "list"; characterIds: string[] };

export interface GiftInput {
  batchId: string;
  subject: string;
  body: string;
  audience: Audience;
  gift: GiftAttachments;
  /** Days until the mail expires; null: never. */
  expiresInDays: number | null;
}

export interface GiftBatch {
  id: string;
  createdAt: number;
  adminEmail: string;
  subject: string;
  body: string;
  audience: "list" | "all";
  recipients: number;
  attachments: GiftAttachments;
  expiresAt: number | null;
  claimed: number;
}

export type SendGiftResult =
  | { ok: true; recipients: number; duplicate: boolean }
  | { ok: false; error: "invalid_batch" | "invalid_text" | "invalid_gift" | "invalid_audience" | "invalid_expiry" | "no_recipients" };

const DAY_MS = 86_400_000;
const MAX_EXPIRY_DAYS = 3650;

/** Characters on the server now (what "the whole server" means at this moment). */
export async function countCharacters(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM characters WHERE deleted_at IS NULL").first<{ n: number }>())?.n ?? 0;
}

/** Looks up names (exact; SQLite folds only the case of A-Z) and ids of characters for the recipient picker: the ones found and the names that matched nobody. */
export async function resolveRecipients(db: D1Database, names: readonly string[]): Promise<{ found: Array<{ id: string; name: string }>; missing: string[] }> {
  const wanted = [...new Set(names.map((n) => n.normalize("NFC").trim()).filter((n) => n.length > 0 && n.length <= 40))].slice(0, GIFT_MAX_RECIPIENTS);
  if (wanted.length === 0) return { found: [], missing: [] };
  const { results } = await db
    .prepare("SELECT id, name FROM characters WHERE deleted_at IS NULL AND lower(name) IN (SELECT lower(value) FROM json_each(?))")
    .bind(JSON.stringify(wanted))
    .all<{ id: string; name: string }>();
  const have = new Set(results.map((r) => r.name.toLowerCase()));
  return { found: results, missing: wanted.filter((n) => !have.has(n.toLowerCase())) };
}

/** Sends a gift. The same `batchId` again changes nothing and answers with the first send's recipient count (a double click, a retry). */
export async function sendGift(db: D1Database, adminEmail: string, adminAccountId: string, input: GiftInput, now = Date.now()): Promise<SendGiftResult> {
  if (!GIFT_BATCH_ID.test(input.batchId)) return { ok: false, error: "invalid_batch" };
  const subject = input.subject.normalize("NFC").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
  const body = input.body.normalize("NFC").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
  if (subject.length === 0 || [...subject].length > GIFT_SUBJECT_MAX || [...body].length > GIFT_BODY_MAX) return { ok: false, error: "invalid_text" };
  if (giftProblem(input.gift) !== null) return { ok: false, error: "invalid_gift" };
  const days = input.expiresInDays;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS)) return { ok: false, error: "invalid_expiry" };
  const audience = input.audience;
  if (audience.kind === "list" && (audience.characterIds.length === 0 || audience.characterIds.length > GIFT_MAX_RECIPIENTS || audience.characterIds.some((id) => typeof id !== "string" || id.length === 0 || id.length > 64))) {
    return { ok: false, error: "invalid_audience" };
  }
  const existing = await db.prepare("SELECT recipients FROM gift_batches WHERE id = ?").bind(input.batchId).first<{ recipients: number }>();
  if (existing) return { ok: true, recipients: existing.recipients, duplicate: true };

  const gift: GiftAttachments = {
    ...(input.gift.linh_thach ? { linh_thach: input.gift.linh_thach } : {}),
    ...(input.gift.cong_hien ? { cong_hien: input.gift.cong_hien } : {}),
    ...(input.gift.tien_ngoc ? { tien_ngoc: input.gift.tien_ngoc } : {}),
    items: input.gift.items.map((i) => ({ type: i.type, qty: i.qty })),
    by: adminAccountId,
  };
  const expiresAt = days === null ? null : now + days * DAY_MS;
  const from = `${input.batchId}:`;
  const to = `${input.batchId};`; // ';' is the character after ':' so [from, to) holds exactly this batch's mail ids
  const mailInsert =
    "INSERT INTO mailbox (id, character_id, subject, body, created_at, expires_at, gift) SELECT ?1 || ':' || c.id, c.id, ?2, ?3, ?4, ?5, ?6 FROM characters c" +
    (audience.kind === "list" ? " WHERE c.id IN (SELECT value FROM json_each(?7))" : " WHERE c.deleted_at IS NULL");
  const args: unknown[] = [input.batchId, subject, body, now, expiresAt, JSON.stringify(gift)];
  if (audience.kind === "list") args.push(JSON.stringify([...new Set(audience.characterIds)]));
  const summary = [
    gift.linh_thach ? `${gift.linh_thach} Linh Thạch` : null,
    gift.cong_hien ? `${gift.cong_hien} Cống Hiến` : null,
    gift.tien_ngoc ? `${gift.tien_ngoc} Tiên Ngọc` : null,
    ...gift.items.map((i) => `${i.type} × ${i.qty}`),
  ]
    .filter(Boolean)
    .join(", ");
  try {
    await db.batch([
      db
        .prepare("INSERT INTO gift_batches (id, created_at, admin_email, subject, body, audience, recipients, attachments, expires_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(input.batchId, now, adminEmail, subject, body, audience.kind, JSON.stringify(gift), expiresAt),
      db.prepare(mailInsert).bind(...args),
      db
        .prepare("UPDATE gift_batches SET recipients = (SELECT COUNT(*) FROM mailbox WHERE id >= ?1 AND id < ?2) WHERE id = ?3")
        .bind(from, to, input.batchId),
      // A gift that reached nobody leaves nothing behind: this guard throws (NOT NULL) and the whole batch rolls back.
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE (SELECT recipients FROM gift_batches WHERE id = ?) = 0").bind(input.batchId),
      // The log row needs the count, so it reads it from the batch row written just before.
      db
        .prepare("INSERT INTO admin_log (at, admin_email, screen, content) SELECT ?1, ?2, ?3, substr(?4 || recipients || ' nhân vật (' || ?5 || ')', 1, 500) FROM gift_batches WHERE id = ?6")
        .bind(now, adminEmail.slice(0, 120), GIFT_LOG_SCREEN, `Gửi quà «${subject.slice(0, 60)}» cho ${audience.kind === "all" ? "toàn bộ server: " : ""}`, summary, input.batchId),
    ]);
  } catch (err) {
    if (String(err).includes("inv_guard")) return { ok: false, error: "no_recipients" };
    if (String(err).includes("gift_batches.id")) {
      const again = await db.prepare("SELECT recipients FROM gift_batches WHERE id = ?").bind(input.batchId).first<{ recipients: number }>();
      return { ok: true, recipients: again?.recipients ?? 0, duplicate: true };
    }
    throw err;
  }
  const row = await db.prepare("SELECT recipients FROM gift_batches WHERE id = ?").bind(input.batchId).first<{ recipients: number }>();
  return { ok: true, recipients: row?.recipients ?? 0, duplicate: false };
}

/** The ids of the characters of a batch (to tell the ones online): a range on the primary key. */
export async function batchCharacterIds(db: D1Database, batchId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT character_id FROM mailbox WHERE id >= ? AND id < ?")
    .bind(`${batchId}:`, `${batchId};`)
    .all<{ character_id: string }>();
  return results.map((r) => r.character_id);
}

/** The latest sends, newest first, with how many of the mails were claimed. */
export async function listGiftBatches(db: D1Database, page: number, size: number): Promise<{ rows: GiftBatch[]; total: number }> {
  const total = (await db.prepare("SELECT COUNT(*) AS n FROM gift_batches").first<{ n: number }>())?.n ?? 0;
  const { results } = await db
    .prepare(
      "SELECT b.id, b.created_at, b.admin_email, b.subject, b.body, b.audience, b.recipients, b.attachments, b.expires_at, " +
        "(SELECT COUNT(*) FROM mailbox m WHERE m.id >= b.id || ':' AND m.id < b.id || ';' AND m.claimed_at IS NOT NULL) AS claimed " +
        "FROM gift_batches b ORDER BY b.created_at DESC, b.id LIMIT ? OFFSET ?",
    )
    .bind(size, (page - 1) * size)
    .all<{ id: string; created_at: number; admin_email: string; subject: string; body: string; audience: "list" | "all"; recipients: number; attachments: string; expires_at: number | null; claimed: number }>();
  return {
    total,
    rows: results.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      adminEmail: r.admin_email,
      subject: r.subject,
      body: r.body,
      audience: r.audience,
      recipients: r.recipients,
      attachments: parseGift(r.attachments) ?? { items: [] },
      expiresAt: r.expires_at,
      claimed: r.claimed,
    })),
  };
}

export type ClaimGiftResult =
  | { status: "claimed"; ops: BagOp[]; wallet: Wallet; given: GiftAttachments }
  | { status: "bag_full" | "expired" | "already_claimed" | "not_found" | "stale" };

/**
 * Claims an admin gift: the currencies and every item, or nothing. One batch: the guard (the mail must still be unclaimed and unexpired, which is
 * what makes the claim exclusive, so the currency entries need no dedupe key), the item rows, the currency entries (reason `admin_gift`, group Admin,
 * actor the sending admin) and the claimed mark. If an item no longer exists or the items do not fit the bag, nothing changes.
 */
export async function claimGiftMail(db: D1Database, characterId: string, mailId: string, bag: BagState, now = Date.now()): Promise<ClaimGiftResult> {
  const mail = await db
    .prepare("SELECT gift, claimed_at, expires_at FROM mailbox WHERE id = ? AND character_id = ?")
    .bind(mailId, characterId)
    .first<{ gift: string | null; claimed_at: number | null; expires_at: number | null }>();
  const gift = parseGift(mail?.gift);
  if (!mail || !gift) return { status: "not_found" };
  if (mail.claimed_at !== null) return { status: "already_claimed" };
  if (mail.expires_at !== null && mail.expires_at <= now) return { status: "expired" };
  if (giftProblem(gift, true) !== null) return { status: "not_found" }; // an item left the catalogue: it cannot be given

  // Plan the items against a copy of the bag: merge into a stack with room, otherwise the first free cell.
  const ops: BagOp[] = [];
  let working = { items: bag.items.map((i) => ({ ...i })), equipped: bag.equipped.map((e) => ({ ...e })) };
  for (const it of gift.items) {
    const limit = stackLimit(it.type);
    const room = limit > 1 ? working.items.find((i) => i.type === it.type && limit - i.qty >= it.qty) : undefined;
    let op: BagOp;
    if (room) op = { op: "setqty", id: room.id, from: room.qty, to: room.qty + it.qty };
    else {
      const free = firstFreeCell(working.items, bag.tabs);
      if (!free) return { status: "bag_full" };
      op = { op: "add", id: crypto.randomUUID(), type: it.type, tab: free.tab, cell: free.cell, qty: it.qty };
    }
    ops.push(op);
    working = applyBag(working, [op]);
  }

  const traceMin = await linhThachTraceMin(db);
  const extra: D1PreparedStatement[] = [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM mailbox WHERE id = ? AND character_id = ? AND claimed_at IS NULL AND (expires_at IS NULL OR expires_at > ?))").bind(mailId, characterId, now),
    db.prepare("UPDATE mailbox SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL").bind(now, mailId),
  ];
  for (const currency of GIFT_CURRENCIES) {
    const amount = gift[currency];
    if (amount) extra.push(...currencyStatements(db, { characterId, currency: currency as Currency, delta: amount, reason: typeof gift.reason === "string" && /^[a-z_]{1,24}(:[a-z_]{1,24})?$/.test(gift.reason) ? gift.reason : "admin_gift", actor: gift.by ?? "system" }, traceMin, now));
  }
  const res = await commitBagOps(db, characterId, ops, { extra, now });
  if (res !== "ok") return { status: "stale" };
  return { status: "claimed", ops, wallet: await getWallet(db, characterId), given: gift };
}

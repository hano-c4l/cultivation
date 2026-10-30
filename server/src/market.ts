import {
  auctionEndsAt,
  auctionOpen,
  fixedEndsAt,
  getItemDef,
  listingFee,
  marketMaxPrice,
  marketTax,
  minNextBid,
  stackLimit,
  type BagOp,
  type MarketCfg,
  type MarketCurrency,
  type MarketError,
  type MarketKind,
  type MarketListingView,
} from "@game/shared";
import { applyCurrencyDelta } from "./economy";
import { guard, wearOf, type BagState } from "./inventory";

/**
 * Vạn Bảo Lâu, the market (docs/PHASE5.md, 5a). A listing is one item taken out of the seller's bag and kept in escrow (the item row stays with the
 * seller in no cell and no slot; the listing points at it). Every move is ONE D1 batch whose preconditions are guard statements that throw, so a
 * second buyer (or a stale read) rolls the whole batch back, money included; what leaves a listing is delivered by mail, so the bag of a character in
 * another room is never touched from here. A listing is priced in Linh Thạch or Tiên Ngọc. A listing is seen and bought only in the town it was put up in.
 */
export interface ListingRow {
  id: string;
  town: string;
  kind: MarketKind;
  currency: MarketCurrency;
  seller_id: string;
  item_id: string;
  item_type: string;
  qty: number;
  price: number;
  top_bid: number;
  top_bidder_id: string | null;
  fee_paid: number;
  status: string;
  created_at: number;
  ends_at: number;
  promoted_at: number | null;
}

/** The item name for a mail subject. */
const nameOf = (type: string): string => getItemDef(type)?.nameVi ?? type;

/**
 * A mail with no expiry. An item rides on the mail itself (`item_id`: the room claims it into the bag). Linh Thạch rides as a gift (`gift`, id `market:<uuid>`: the
 * ':' sends the claim down the gift path, which creates the currency under the given reason when the player claims it), because the plain `currency` columns of a
 * mail are not offered to players in the game.
 */
function mailStatement(db: D1Database, to: string, subject: string, now: number, att: { amount?: number; currency?: MarketCurrency; itemId?: string; reason?: "market:sale" | "market:refund" }): D1PreparedStatement {
  const amount = att.amount ?? 0;
  const gift = amount > 0 ? JSON.stringify({ [att.currency ?? "linh_thach"]: amount, items: [], reason: att.reason ?? "market:sale" }) : null;
  return db
    .prepare("INSERT INTO mailbox (id, character_id, subject, body, item_id, gift, expires_at, created_at) VALUES (?, ?, ?, '', ?, ?, NULL, ?)")
    .bind(gift ? `market:${crypto.randomUUID()}` : crypto.randomUUID(), to, subject, att.itemId ?? null, gift, now);
}

/** The acting character must exist, not be deleted and not be under an admin's review. */
export const actorGuard = (db: D1Database, id: string, now: number): D1PreparedStatement =>
  db
    .prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM characters WHERE id = ? AND deleted_at IS NULL AND (review_until IS NULL OR review_until <= ?))")
    .bind(id, now);

/** The listing must still be open (and, when given, still be as the caller read it). */
function listingGuard(db: D1Database, id: string, extra = "", args: unknown[] = []): D1PreparedStatement {
  return db.prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM market_listings WHERE id = ? AND status = 'active'${extra})`).bind(id, ...args);
}

/** True for the errors of a failed guard (the state changed under the caller); anything else is a bug and is rethrown. */
function isGuardFailure(err: unknown): boolean {
  return /inv_guard|idx_market_|market_listings|CHECK constraint|idx_items_/.test(String(err));
}

export async function getListing(db: D1Database, id: string): Promise<ListingRow | null> {
  return db.prepare("SELECT id, town, kind, currency, seller_id, item_id, item_type, qty, price, top_bid, top_bidder_id, fee_paid, status, created_at, ends_at, promoted_at FROM market_listings WHERE id = ?").bind(id).first<ListingRow>();
}

/** The open listings of one town as the client sees them (newest first, at most 300). Expired ones are settled before this is called. */
export async function listingViews(db: D1Database, cfg: MarketCfg, town: string, viewerId: string): Promise<MarketListingView[]> {
  const { results } = await db
    .prepare(
      "SELECT l.id, l.kind, l.currency, l.seller_id, l.item_type, l.qty, l.price, l.top_bid, l.top_bidder_id, l.ends_at, c.name AS seller_name, " +
        "i.durability, i.max_durability, i.refine_level, i.refine_exp, i.rolled_stats, i.enhance_level " +
        "FROM market_listings l JOIN characters c ON c.id = l.seller_id JOIN item_instances i ON i.id = l.item_id " +
        "WHERE l.town = ? AND l.status = 'active' ORDER BY l.created_at DESC, l.id LIMIT 300",
    )
    .bind(town)
    .all<{ id: string; kind: MarketKind; currency: MarketCurrency; seller_id: string; item_type: string; qty: number; price: number; top_bid: number; top_bidder_id: string | null; ends_at: number; seller_name: string; durability: number | null; max_durability: number | null; refine_level: number | null; refine_exp: number | null; rolled_stats: string | null; enhance_level: number | null }>();
  return results.map((r) => ({
    id: r.id,
    kind: r.kind,
    currency: r.currency,
    sellerName: r.seller_name,
    mine: r.seller_id === viewerId,
    type: r.item_type,
    qty: r.qty,
    price: r.price,
    topBid: r.top_bid,
    topIsMe: r.top_bidder_id === viewerId,
    nextBid: r.kind === "auction" ? minNextBid(cfg, r.price, r.top_bid) : 0,
    endsAt: r.ends_at,
    carry: { ...wearOf(r) },
  }));
}

export type PostResult = { status: "ok"; id: string; fee: number; currency: MarketCurrency; balance: number; ops: BagOp[] } | { status: MarketError };

/**
 * Puts the stack at (tab, cell) up: `qty` of it leaves the bag (the whole row, or a new row split off a stack) and the fee is paid, in one batch.
 * `ops` are the changes to apply to the room's cached bag after it went through.
 */
export async function postListing(
  db: D1Database,
  cfg: MarketCfg,
  p: { sellerId: string; town: string; kind: MarketKind; currency: MarketCurrency; bag: BagState; tab: number; cell: number; qty: number; price: number; now: number },
): Promise<PostResult> {
  const item = p.bag.items.find((i) => i.tab === p.tab && i.cell === p.cell);
  const def = item ? getItemDef(item.type) : undefined;
  if (!item || !def || def.disabled || p.qty < 1 || p.qty > item.qty || p.price < 1 || p.price > marketMaxPrice(cfg, p.currency)) return { status: "invalid" };
  if (stackLimit(item.type) === 1 && p.qty !== 1) return { status: "invalid" };
  const open = await db.prepare("SELECT COUNT(*) AS c FROM market_listings WHERE seller_id = ? AND status = 'active'").bind(p.sellerId).first<{ c: number }>();
  if ((open?.c ?? 0) >= cfg.maxListings) return { status: "limit" };
  const id = crypto.randomUUID();
  const fee = listingFee(cfg, p.price, p.currency);
  const whole = p.qty === item.qty;
  const listedItem = whole ? item.id : crypto.randomUUID();
  const extra: D1PreparedStatement[] = [
    actorGuard(db, p.sellerId, p.now),
    db
      .prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE (SELECT COUNT(*) FROM market_listings WHERE seller_id = ? AND status = 'active') >= ?")
      .bind(p.sellerId, cfg.maxListings),
    guard(db, p.sellerId, item.id, { qty: item.qty, tab: p.tab, cell: p.cell, slot: null }),
  ];
  let ops: BagOp[];
  if (whole) {
    extra.push(db.prepare("UPDATE item_instances SET bag_tab = NULL, cell = NULL WHERE id = ? AND owner_character_id = ?").bind(item.id, p.sellerId));
    ops = [{ op: "remove", id: item.id, qty: item.qty }];
  } else {
    extra.push(
      db.prepare("UPDATE item_instances SET qty = ? WHERE id = ? AND owner_character_id = ?").bind(item.qty - p.qty, item.id, p.sellerId),
      db.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, created_at) VALUES (?, ?, ?, ?, ?)").bind(listedItem, p.sellerId, item.type, p.qty, p.now),
    );
    ops = [{ op: "setqty", id: item.id, from: item.qty, to: item.qty - p.qty }];
  }
  const endsAt = p.kind === "auction" ? auctionEndsAt(cfg, p.now) : fixedEndsAt(cfg, p.now);
  extra.push(
    db
      .prepare("INSERT INTO market_listings (id, town, kind, currency, seller_id, item_id, item_type, qty, price, fee_paid, created_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, p.town, p.kind, p.currency, p.sellerId, listedItem, item.type, p.qty, p.price, fee, p.now, endsAt),
  );
  try {
    const r = await applyCurrencyDelta(db, { characterId: p.sellerId, currency: p.currency, delta: -fee, reason: "market_fee", actor: "system" }, extra);
    if (r.status === "insufficient") return { status: "funds" };
    if (r.status !== "applied") return { status: "busy" };
    return { status: "ok", id, fee, currency: p.currency, balance: r.balance, ops };
  } catch (err) {
    if (isGuardFailure(err)) return { status: "busy" }; // the bag or the listing count changed since it was read
    throw err;
  }
}

/** The statements that hand a closed listing's goods over: the item to `buyerId`, the proceeds (price less tax) to the seller, and the sales row. */
function saleStatements(db: D1Database, cfg: MarketCfg, l: ListingRow, buyerId: string, price: number, now: number): D1PreparedStatement[] {
  const tax = marketTax(cfg, price);
  const name = nameOf(l.item_type);
  return [
    guard(db, l.seller_id, l.item_id, { tab: null, cell: null, slot: null }),
    db.prepare("UPDATE item_instances SET owner_character_id = ? WHERE id = ? AND owner_character_id = ?").bind(buyerId, l.item_id, l.seller_id),
    mailStatement(db, buyerId, `Vạn Bảo Lâu: đã mua ${name}${l.qty > 1 ? ` x${l.qty}` : ""}`, now, { itemId: l.item_id }),
    mailStatement(db, l.seller_id, `Vạn Bảo Lâu: bán được ${name}${l.qty > 1 ? ` x${l.qty}` : ""}`, now, { amount: price - tax, currency: l.currency }),
    db
      .prepare("INSERT INTO market_sales (id, listing_id, town, kind, currency, seller_id, buyer_id, item_type, qty, price, tax, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), l.id, l.town, l.kind, l.currency, l.seller_id, buyerId, l.item_type, l.qty, price, tax, now),
    db.prepare("UPDATE market_listings SET status = 'sold', closed_at = ? WHERE id = ? AND status = 'active'").bind(now, l.id),
  ];
}

/** The statements that take a listing off without a sale: the item goes back to the seller by mail, and an outbid-style refund goes to a standing top bidder. */
function returnStatements(db: D1Database, l: ListingRow, status: "cancelled" | "expired" | "unsold", now: number): D1PreparedStatement[] {
  const out = [
    guard(db, l.seller_id, l.item_id, { tab: null, cell: null, slot: null }),
    mailStatement(db, l.seller_id, `Vạn Bảo Lâu: ${status === "cancelled" ? "gỡ" : "hết hạn"} ${nameOf(l.item_type)}${l.qty > 1 ? ` x${l.qty}` : ""}`, now, { itemId: l.item_id }),
    db.prepare("UPDATE market_listings SET status = ?, closed_at = ? WHERE id = ? AND status = 'active'").bind(status, now, l.id),
  ];
  if (l.top_bidder_id && l.top_bid > 0) out.push(mailStatement(db, l.top_bidder_id, `Vạn Bảo Lâu: hoàn tiền đặt giá ${nameOf(l.item_type)}`, now, { amount: l.top_bid, currency: l.currency, reason: "market:refund" }));
  return out;
}

export type TradeResult = { status: "ok"; balance: number; currency: MarketCurrency; notify: string[] } | { status: MarketError };

/** Buys a fixed-price listing of `town`: the price is taken from the buyer and the goods are handed over in one batch. */
export async function buyFixed(db: D1Database, cfg: MarketCfg, p: { buyerId: string; town: string; id: string; now: number }): Promise<TradeResult> {
  const l = await getListing(db, p.id);
  if (!l || l.status !== "active" || l.town !== p.town || l.kind !== "fixed") return { status: "gone" };
  if (l.seller_id === p.buyerId) return { status: "mine" };
  if (l.ends_at <= p.now) return { status: "gone" };
  const extra = [
    actorGuard(db, p.buyerId, p.now),
    listingGuard(db, l.id, " AND kind = 'fixed' AND town = ? AND price = ? AND ends_at > ?", [p.town, l.price, p.now]),
    ...saleStatements(db, cfg, l, p.buyerId, l.price, p.now),
  ];
  try {
    const r = await applyCurrencyDelta(db, { characterId: p.buyerId, currency: l.currency, delta: -l.price, reason: `market_buy:${l.item_type}`, actor: "system" }, extra);
    if (r.status === "insufficient") return { status: "funds" };
    if (r.status !== "applied") return { status: "busy" };
    return { status: "ok", balance: r.balance, currency: l.currency, notify: [l.seller_id, p.buyerId] };
  } catch (err) {
    if (isGuardFailure(err)) return { status: "gone" };
    throw err;
  }
}

/** Bids on an auction of `town`: the amount is paid now and the previous top bidder gets theirs back by mail, in one batch. */
export async function placeBid(db: D1Database, cfg: MarketCfg, p: { bidderId: string; town: string; id: string; amount: number; now: number }): Promise<TradeResult> {
  const l = await getListing(db, p.id);
  if (!l || l.status !== "active" || l.town !== p.town || l.kind !== "auction" || l.ends_at <= p.now) return { status: "gone" };
  // The seller may bid on their own auction (to buy it back, or to egg others on); the proceeds of a sale to themselves are taxed like any other.
  if (l.top_bidder_id === p.bidderId) return { status: "top" };
  if (!auctionOpen(cfg, p.now)) return { status: "closed" };
  if (p.amount < minNextBid(cfg, l.price, l.top_bid) || p.amount > marketMaxPrice(cfg, l.currency)) return { status: "low" };
  const extra = [
    actorGuard(db, p.bidderId, p.now),
    // The top bid must still be the one the amount was checked against, or two bids of the same size could both win.
    listingGuard(db, l.id, " AND kind = 'auction' AND town = ? AND top_bid = ? AND ends_at > ?", [p.town, l.top_bid, p.now]),
    db.prepare("UPDATE market_listings SET top_bid = ?, top_bidder_id = ? WHERE id = ? AND status = 'active'").bind(p.amount, p.bidderId, l.id),
  ];
  if (l.top_bidder_id) extra.push(mailStatement(db, l.top_bidder_id, `Vạn Bảo Lâu: bị vượt giá, hoàn tiền ${nameOf(l.item_type)}`, p.now, { amount: l.top_bid, currency: l.currency, reason: "market:refund" }));
  try {
    const r = await applyCurrencyDelta(db, { characterId: p.bidderId, currency: l.currency, delta: -p.amount, reason: `auction_bid:${l.item_type}`, actor: "system" }, extra);
    if (r.status === "insufficient") return { status: "funds" };
    if (r.status !== "applied") return { status: "busy" };
    return { status: "ok", balance: r.balance, currency: l.currency, notify: l.top_bidder_id ? [l.top_bidder_id] : [] };
  } catch (err) {
    if (isGuardFailure(err)) return { status: "gone" };
    throw err;
  }
}

/**
 * The seller takes a listing down: a fixed one any time; an auction only while its round is not open (listed at night, taken back before the opening hour). From the
 * opening hour on, an auction stays until it closes, and goes back to the seller by mail only when nobody bid. The item comes back by mail.
 */
export async function cancelListing(db: D1Database, cfg: MarketCfg, p: { sellerId: string; town: string; id: string; now: number }): Promise<{ status: "ok"; notify: string[] } | { status: MarketError }> {
  const l = await getListing(db, p.id);
  if (!l || l.status !== "active" || l.town !== p.town) return { status: "gone" };
  if (l.seller_id !== p.sellerId) return { status: "mine" };
  if (l.kind === "auction" && (l.top_bid > 0 || auctionOpen(cfg, p.now))) return { status: "closed" };
  try {
    await db.batch([actorGuard(db, p.sellerId, p.now), listingGuard(db, l.id, " AND top_bid = ?", [l.top_bid]), ...returnStatements(db, l, "cancelled", p.now)]);
    return { status: "ok", notify: [l.seller_id] };
  } catch (err) {
    if (isGuardFailure(err)) return { status: "gone" };
    throw err;
  }
}

/** Charges the announcement fee for one of the seller's own listings. The caller sends the town message when this says ok. */
export async function promoteListing(
  db: D1Database,
  cfg: MarketCfg,
  p: { sellerId: string; town: string; id: string; now: number },
): Promise<{ status: "ok"; balance: number; listing: ListingRow } | { status: MarketError }> {
  const l = await getListing(db, p.id);
  if (!l || l.status !== "active" || l.town !== p.town) return { status: "gone" };
  if (l.seller_id !== p.sellerId) return { status: "mine" };
  if ((getItemDef(l.item_type)?.grade ?? 0) < cfg.promote.minGrade) return { status: "grade" };
  const last = await db.prepare("SELECT MAX(promoted_at) AS at FROM market_listings WHERE seller_id = ?").bind(p.sellerId).first<{ at: number | null }>();
  if (last?.at && p.now - last.at < cfg.promote.cooldownSec * 1000) return { status: "cooldown" };
  const extra = [
    actorGuard(db, p.sellerId, p.now),
    listingGuard(db, l.id),
    db.prepare("UPDATE market_listings SET promoted_at = ? WHERE id = ? AND status = 'active'").bind(p.now, l.id),
  ];
  try {
    const r = await applyCurrencyDelta(db, { characterId: p.sellerId, currency: "linh_thach", delta: -cfg.promote.fee, reason: "market_promote", actor: "system" }, extra);
    if (r.status === "insufficient") return { status: "funds" };
    if (r.status !== "applied") return { status: "busy" };
    return { status: "ok", balance: r.balance, listing: l };
  } catch (err) {
    if (isGuardFailure(err)) return { status: "gone" };
    throw err;
  }
}

/**
 * Closes every listing that has run out of time: a fixed one nobody bought goes back to the seller, an auction without a bid too, and an auction with a
 * bid is sold to the top bidder (proceeds less tax to the seller). Lazy: called when someone opens the market or logs in, never from an alarm. Each
 * listing is its own batch guarded on being still open and due, so two callers settling at once close it once. Returns the characters who got mail.
 */
export async function settleDue(db: D1Database, cfg: MarketCfg, now: number, limit = 25): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id, town, kind, currency, seller_id, item_id, item_type, qty, price, top_bid, top_bidder_id, fee_paid, status, created_at, ends_at, promoted_at FROM market_listings WHERE status = 'active' AND ends_at <= ? ORDER BY ends_at LIMIT ?")
    .bind(now, limit)
    .all<ListingRow>();
  const notify = new Set<string>();
  for (const l of results) {
    const sold = l.kind === "auction" && l.top_bidder_id !== null && l.top_bid > 0;
    const statements = [
      listingGuard(db, l.id, " AND ends_at <= ?", [now]),
      ...(sold ? saleStatements(db, cfg, l, l.top_bidder_id!, l.top_bid, now) : returnStatements(db, l, l.kind === "auction" ? "unsold" : "expired", now)),
    ];
    try {
      await db.batch(statements);
      notify.add(l.seller_id);
      if (sold) notify.add(l.top_bidder_id!);
    } catch (err) {
      if (!isGuardFailure(err)) throw err; // another caller closed it first
    }
  }
  return [...notify];
}

/**
 * Takes down every open listing of a character (their deletion): the items go back by mail and a standing top bidder is refunded. Returns who got mail.
 * An auction with a bid is cancelled too; the seller loses nothing but the fee.
 */
export async function closeListingsOf(db: D1Database, sellerId: string, now: number): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id, town, kind, currency, seller_id, item_id, item_type, qty, price, top_bid, top_bidder_id, fee_paid, status, created_at, ends_at, promoted_at FROM market_listings WHERE seller_id = ? AND status = 'active'")
    .bind(sellerId)
    .all<ListingRow>();
  const notify = new Set<string>();
  for (const l of results) {
    try {
      await db.batch([listingGuard(db, l.id, " AND top_bid = ?", [l.top_bid]), ...returnStatements(db, l, "cancelled", now)]);
      notify.add(l.seller_id);
      if (l.top_bidder_id) notify.add(l.top_bidder_id);
    } catch (err) {
      if (!isGuardFailure(err)) throw err;
    }
  }
  return [...notify];
}

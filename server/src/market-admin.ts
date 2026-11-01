import { getItemDef } from "@game/shared";
import { logStatement } from "./admin-log";
import { takeDownListing } from "./market";

/**
 * The admin side of Vạn Bảo Lâu and of direct trades (docs/PHASE5.md, 5a and 5b leftovers): the listings (open or all), the closed sales and the trade log, read-only, plus taking
 * one open listing down. A takedown goes through the same statements as a seller's cancel (the item comes back by mail, a top bidder is refunded) and is written to the admin log.
 */
export const MARKET_ADMIN_ROWS = 200;
export const MARKET_LOG_SCREEN = "Chợ · Vạn Bảo Lâu";

const nameOf = (type: string): string => getItemDef(type)?.nameVi ?? type;

export interface AdminListing {
  id: string;
  town: string;
  kind: string;
  currency: string;
  sellerId: string;
  seller: string | null;
  itemType: string;
  itemName: string;
  qty: number;
  price: number;
  topBid: number;
  topBidder: string | null;
  status: string;
  createdAt: number;
  endsAt: number;
  closedAt: number | null;
}

export interface AdminSale {
  id: string;
  listingId: string;
  town: string;
  kind: string;
  currency: string;
  seller: string | null;
  buyer: string | null;
  itemName: string;
  qty: number;
  price: number;
  tax: number;
  createdAt: number;
}

export interface AdminTrade {
  id: string;
  a: string | null;
  b: string | null;
  itemsA: Array<{ name: string; qty: number }>;
  itemsB: Array<{ name: string; qty: number }>;
  linhA: number;
  linhB: number;
  tnA: number;
  tnB: number;
  createdAt: number;
}

export type MarketAdminView = "listings" | "sales" | "trades";

function parseItems(text: string): Array<{ name: string; qty: number }> {
  try {
    const list = JSON.parse(text) as Array<{ type?: unknown; qty?: unknown }>;
    return Array.isArray(list) ? list.map((i) => ({ name: nameOf(String(i.type ?? "?")), qty: Number(i.qty) || 1 })) : [];
  } catch {
    return [];
  }
}

/** The listings, newest first; `onlyOpen` keeps the ones still on sale. `q` matches the item type or a character name. */
export async function adminListings(db: D1Database, onlyOpen: boolean, q: string): Promise<AdminListing[]> {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { results } = await db
    .prepare(
      "SELECT l.id, l.town, l.kind, l.currency, l.seller_id, s.name AS seller, l.item_type, l.qty, l.price, l.top_bid, b.name AS bidder, l.status, l.created_at, l.ends_at, l.closed_at " +
        "FROM market_listings l LEFT JOIN characters s ON s.id = l.seller_id LEFT JOIN characters b ON b.id = l.top_bidder_id " +
        `WHERE (? = 0 OR l.status = 'active') AND (? = '%%' OR l.item_type LIKE ? OR s.name LIKE ? OR b.name LIKE ?) ORDER BY l.created_at DESC LIMIT ${MARKET_ADMIN_ROWS}`,
    )
    .bind(onlyOpen ? 1 : 0, like, like, like, like)
    .all<{ id: string; town: string; kind: string; currency: string; seller_id: string; seller: string | null; item_type: string; qty: number; price: number; top_bid: number; bidder: string | null; status: string; created_at: number; ends_at: number; closed_at: number | null }>();
  return results.map((r) => ({ id: r.id, town: r.town, kind: r.kind, currency: r.currency, sellerId: r.seller_id, seller: r.seller, itemType: r.item_type, itemName: nameOf(r.item_type), qty: r.qty, price: r.price, topBid: r.top_bid, topBidder: r.bidder, status: r.status, createdAt: r.created_at, endsAt: r.ends_at, closedAt: r.closed_at }));
}

export async function adminSales(db: D1Database, q: string): Promise<AdminSale[]> {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { results } = await db
    .prepare(
      "SELECT m.id, m.listing_id, m.town, m.kind, m.currency, s.name AS seller, b.name AS buyer, m.item_type, m.qty, m.price, m.tax, m.created_at " +
        "FROM market_sales m LEFT JOIN characters s ON s.id = m.seller_id LEFT JOIN characters b ON b.id = m.buyer_id " +
        `WHERE (? = '%%' OR m.item_type LIKE ? OR s.name LIKE ? OR b.name LIKE ?) ORDER BY m.created_at DESC LIMIT ${MARKET_ADMIN_ROWS}`,
    )
    .bind(like, like, like, like)
    .all<{ id: string; listing_id: string; town: string; kind: string; currency: string; seller: string | null; buyer: string | null; item_type: string; qty: number; price: number; tax: number; created_at: number }>();
  return results.map((r) => ({ id: r.id, listingId: r.listing_id, town: r.town, kind: r.kind, currency: r.currency, seller: r.seller, buyer: r.buyer, itemName: nameOf(r.item_type), qty: r.qty, price: r.price, tax: r.tax, createdAt: r.created_at }));
}

export async function adminTrades(db: D1Database, q: string): Promise<AdminTrade[]> {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const { results } = await db
    .prepare(
      "SELECT t.id, a.name AS a, b.name AS b, t.items_a, t.items_b, t.linh_a, t.linh_b, t.tn_a, t.tn_b, t.created_at " +
        "FROM trade_log t LEFT JOIN characters a ON a.id = t.a_id LEFT JOIN characters b ON b.id = t.b_id " +
        `WHERE (? = '%%' OR a.name LIKE ? OR b.name LIKE ?) ORDER BY t.created_at DESC LIMIT ${MARKET_ADMIN_ROWS}`,
    )
    .bind(like, like, like)
    .all<{ id: string; a: string | null; b: string | null; items_a: string; items_b: string; linh_a: number; linh_b: number; tn_a: number; tn_b: number; created_at: number }>();
  return results.map((r) => ({ id: r.id, a: r.a, b: r.b, itemsA: parseItems(r.items_a), itemsB: parseItems(r.items_b), linhA: r.linh_a, linhB: r.linh_b, tnA: r.tn_a, tnB: r.tn_b, createdAt: r.created_at }));
}

export type TakedownResult = { ok: true; notify: string[] } | { ok: false; error: "gone" };

/** Takes an open listing down for an admin and writes the admin log in the same batch. */
export async function adminTakedown(db: D1Database, adminEmail: string, id: string, reason: string, now = Date.now()): Promise<TakedownResult> {
  const l = await db.prepare("SELECT item_type, qty FROM market_listings WHERE id = ? AND status = 'active'").bind(id).first<{ item_type: string; qty: number }>();
  if (!l) return { ok: false, error: "gone" };
  const log = logStatement(db, { adminEmail, screen: MARKET_LOG_SCREEN, content: `Gỡ tin ${id.slice(0, 8)}: ${nameOf(l.item_type)} x${l.qty}${reason ? ` (${reason.slice(0, 120)})` : ""}` }, now);
  const done = await takeDownListing(db, id, now, [log]);
  return done ? { ok: true, notify: done.notify } : { ok: false, error: "gone" };
}

/** Takes down every open listing of one item (after an admin made it untradable). Returns how many were closed and who got mail. */
export async function adminTakedownItem(db: D1Database, adminEmail: string, itemType: string, now = Date.now()): Promise<{ closed: number; notify: string[] }> {
  const { results } = await db.prepare("SELECT id FROM market_listings WHERE item_type = ? AND status = 'active'").bind(itemType).all<{ id: string }>();
  const notify = new Set<string>();
  let closed = 0;
  for (const l of results) {
    const r = await adminTakedown(db, adminEmail, l.id, "vật phẩm không giao dịch được", now);
    if (!r.ok) continue;
    closed++;
    r.notify.forEach((n) => notify.add(n));
  }
  return { closed, notify: [...notify] };
}

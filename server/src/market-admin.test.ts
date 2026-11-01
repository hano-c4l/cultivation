import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { adminListings, adminSales, adminTakedown, adminTrades } from "./market-admin";
import { makeDb } from "./test-db";

const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);

let db: D1Database;
let raw: DatabaseSync;

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of ["s", "b"]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${id}', 'acc', 'Nv ${id}', 'kim', 0, 0, 0, 0)`);
  raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, created_at) VALUES ('i1', 's', 'linh_thao', 3, 0)`);
});

const listing = (id: string, status: string, bid = 0) =>
  raw.exec(`INSERT INTO market_listings (id, town, kind, seller_id, item_id, item_type, qty, price, top_bid, top_bidder_id, status, currency, created_at, ends_at) VALUES ('${id}', 'town', 'auction', 's', '${id === "l1" ? "i1" : id}', 'linh_thao', 3, 100, ${bid}, ${bid ? "'b'" : "NULL"}, '${status}', 'linh_thach', 5, 9)`);

describe("market admin", () => {
  it("lists open listings with the names, and all of them on request", async () => {
    listing("l1", "active", 400);
    listing("l2", "sold");
    const open = await adminListings(db, true, "");
    expect(open.map((l) => [l.id, l.seller, l.topBidder, l.topBid])).toEqual([["l1", "Nv s", "Nv b", 400]]);
    expect((await adminListings(db, false, "")).length).toBe(2);
    expect((await adminListings(db, false, "Nv b")).map((l) => l.id)).toEqual(["l1"]);
  });

  it("takes an open listing down: the item goes back by mail, the top bidder is refunded, the admin log gets a row, a second takedown finds it gone", async () => {
    listing("l1", "active", 400);
    const r = await adminTakedown(db, "admin@x.test", "l1", "quảng cáo", NOW);
    expect(r).toEqual({ ok: true, notify: ["s", "b"] });
    expect(raw.prepare("SELECT status FROM market_listings WHERE id = 'l1'").get()).toEqual({ status: "cancelled" });
    const mail = raw.prepare("SELECT character_id AS to_id FROM mailbox ORDER BY character_id").all() as Array<{ to_id: string }>;
    expect(mail.map((m) => m.to_id)).toEqual(["b", "s"]);
    expect((raw.prepare("SELECT content FROM admin_log").get() as { content: string }).content).toContain("quảng cáo");
    expect(await adminTakedown(db, "admin@x.test", "l1", "", NOW)).toEqual({ ok: false, error: "gone" });
  });

  it("reads the closed sales and the trade log with names", async () => {
    raw.exec(`INSERT INTO market_sales (id, listing_id, town, kind, currency, seller_id, buyer_id, item_type, qty, price, tax, created_at) VALUES ('m1', 'l', 'town', 'fixed', 'tien_ngoc', 's', 'b', 'linh_thao', 2, 50, 5, 7)`);
    raw.exec(`INSERT INTO trade_log (id, a_id, b_id, items_a, items_b, linh_a, linh_b, created_at, tn_a, tn_b) VALUES ('t1', 's', 'b', '[{"id":"x","type":"linh_thao","qty":2}]', '[]', 0, 100, 8, 0, 3)`);
    expect((await adminSales(db, "")).map((s) => [s.seller, s.buyer, s.price, s.tax, s.currency])).toEqual([["Nv s", "Nv b", 50, 5, "tien_ngoc"]]);
    const t = (await adminTrades(db, "Nv b"))[0]!;
    expect([t.a, t.b, t.itemsA[0]?.qty, t.linhB, t.tnB]).toEqual(["Nv s", "Nv b", 2, 100, 3]);
    expect(await adminTrades(db, "nobody")).toEqual([]);
  });
});

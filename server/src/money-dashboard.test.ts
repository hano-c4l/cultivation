import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { moneyOverview, vnDayOf } from "./money-dashboard";
import { makeDb } from "./test-db";

const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);
const DAY = 86_400_000;

let db: D1Database;
let raw: DatabaseSync;

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of ["a", "b", "c"]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${id}', 'acc', 'Nv ${id}', 'kim', 0, 0, 0, 0)`);
  const bal = (id: string, cur: string, n: number) => raw.exec(`INSERT INTO currency_balances (character_id, currency, balance) VALUES ('${id}', '${cur}', ${n})`);
  bal("a", "linh_thach", 1000);
  bal("b", "linh_thach", 300);
  bal("c", "linh_thach", 0);
  bal("a", "tien_ngoc", 50);
  const total = (cur: string, id: string, grp: string, tin: number, tout: number) => raw.exec(`INSERT INTO ${cur}_totals (character_id, grp, total_in, total_out, updated_at) VALUES ('${id}', '${grp}', ${tin}, ${tout}, 0)`);
  total("linh_thach", "a", "farm", 1500, 0);
  total("linh_thach", "a", "shop", 0, 500);
  total("linh_thach", "b", "farm", 400, 0);
  total("linh_thach", "b", "market", 0, 100);
  total("tien_ngoc", "a", "admin", 50, 0);
});

describe("the money overview", () => {
  it("adds up the supply, the holders, the flows by group and the top holders", async () => {
    const o = await moneyOverview(db, NOW);
    const linh = o.currencies.find((c) => c.id === "linh_thach")!;
    expect(linh.supply).toBe(1300);
    expect(linh.holders).toBe(2); // the empty balance is not a holder
    expect(linh.groups.map((g) => [g.group, g.totalIn, g.totalOut])).toEqual([
      ["farm", 1900, 0],
      ["shop", 0, 500],
      ["market", 0, 100],
    ]);
    expect(linh.totalIn - linh.totalOut).toBe(1300); // the flows explain the supply
    expect(linh.top.map((t) => [t.name, t.balance])).toEqual([["Nv a", 1000], ["Nv b", 300]]);
    expect(o.currencies.find((c) => c.id === "tien_ngoc")!.supply).toBe(50);
  });

  it("counts the money held outside wallets once: sect funds, open bids, unclaimed mail", async () => {
    raw.exec(`INSERT INTO sects (id, name, leader_id, created_at, fund) VALUES ('s', 'S', 'a', 0, 700)`);
    // an open auction with a bid, one without, a closed one, and a bid in Tiên Ngọc
    const listing = (id: string, status: string, bid: number, bidder: string | null, currency: string) =>
      raw.exec(`INSERT INTO market_listings (id, town, kind, seller_id, item_id, item_type, qty, price, top_bid, top_bidder_id, status, currency, created_at, ends_at) VALUES ('${id}', 'town', 'auction', 'c', '${id}', 'linh_thao', 1, 100, ${bid}, ${bidder ? `'${bidder}'` : "NULL"}, '${status}', '${currency}', 0, 1)`);
    listing("l1", "active", 400, "a", "linh_thach");
    listing("l2", "active", 0, null, "linh_thach");
    listing("l3", "sold", 900, "a", "linh_thach");
    listing("l4", "active", 30, "b", "tien_ngoc");
    const mail = (id: string, gift: string, extra = "") => raw.exec(`INSERT INTO mailbox (id, character_id, subject, body, gift, created_at${extra ? ", " + extra.split("=")[0] : ""}) VALUES ('${id}', 'a', 's', '', '${gift}', 0${extra ? ", " + extra.split("=")[1] : ""})`);
    mail("m1", '{"linh_thach":250,"items":[]}'); // unclaimed
    mail("m2", '{"tien_ngoc":20,"items":[]}'); // unclaimed, Tiên Ngọc
    mail("m3", '{"linh_thach":999,"items":[]}', "claimed_at=5"); // claimed
    const o = await moneyOverview(db, NOW);
    const linh = o.currencies.find((c) => c.id === "linh_thach")!;
    expect(linh.wallets).toBe(1300);
    expect(linh.elsewhere.map((e) => [e.key, e.amount])).toEqual([["sect_fund", 700], ["auction_bids", 400], ["unclaimed_mail", 250]]);
    expect(linh.supply).toBe(1300 + 700 + 400 + 250);
    const tien = o.currencies.find((c) => c.id === "tien_ngoc")!;
    expect(tien.elsewhere.map((e) => [e.key, e.amount])).toEqual([["auction_bids", 30], ["unclaimed_mail", 20]]);
    expect(tien.supply).toBe(50 + 30 + 20);
    expect(linh.history[0]!.supply).toBe(linh.supply); // the snapshot keeps the whole supply
  });

  it("Cống Hiến is the contribution of the sect members", async () => {
    raw.exec(`INSERT INTO sects (id, name, leader_id, created_at) VALUES ('s', 'S', 'a', 0)`);
    raw.exec(`INSERT INTO sect_members (character_id, sect_id, rank, joined_at, contribution) VALUES ('a', 's', 5, 0, 120)`);
    raw.exec(`INSERT INTO sect_members (character_id, sect_id, rank, joined_at, contribution) VALUES ('b', 's', 0, 0, 30)`);
    const ch = (await moneyOverview(db, NOW)).currencies.find((c) => c.id === "cong_hien")!;
    expect(ch.supply).toBe(150);
    expect(ch.holders).toBe(2);
    expect(ch.top[0]).toMatchObject({ name: "Nv a", balance: 120 });
    expect(ch.groups).toEqual([]);
  });

  it("writes one snapshot a day, the first look of the day, and lists the days", async () => {
    await moneyOverview(db, NOW);
    raw.exec("UPDATE currency_balances SET balance = 9999 WHERE character_id = 'a' AND currency = 'linh_thach'");
    const same = await moneyOverview(db, NOW + 3_600_000); // the same Việt Nam day: the first row stays
    expect(same.currencies.find((c) => c.id === "linh_thach")!.history).toHaveLength(1);
    expect(same.currencies.find((c) => c.id === "linh_thach")!.history[0]!.supply).toBe(1300);
    const next = await moneyOverview(db, NOW + DAY);
    const hist = next.currencies.find((c) => c.id === "linh_thach")!.history;
    expect(hist.map((r) => r.day)).toEqual([vnDayOf(NOW + DAY), vnDayOf(NOW)]);
    expect(hist[0]!.supply).toBe(10_299);
  });

  it("lists the Tiên Ngọc the admins credited in the last 30 days, not the rest", async () => {
    const put = (at: number, delta: number, reason: string, actor: string) => raw.exec(`INSERT INTO tien_ngoc_ledger (character_id, delta, reason, actor, created_at) VALUES ('a', ${delta}, '${reason}', '${actor}', ${at})`);
    put(NOW - DAY, 100, "admin_grant", "boss@x.test"); // by an admin
    put(NOW - 2 * DAY, 40, "admin_gift:7", "system"); // a gift an admin sent, claimed from the mail
    put(NOW - 3 * DAY, 25, "admin_adjust:audit", "boss@x.test");
    put(NOW - 3 * DAY, -10, "admin_grant", "boss@x.test"); // a debit is not a credit
    put(NOW - 4 * DAY, 500, "monster_drop", "system"); // not an admin's
    put(NOW - 40 * DAY, 999, "admin_grant", "boss@x.test"); // too old
    const t = (await moneyOverview(db, NOW)).topups;
    expect(t.total).toBe(165);
    expect(t.count).toBe(3);
    expect(t.rows.map((r) => r.amount)).toEqual([25, 40, 100]);
    expect(t.rows[0]).toMatchObject({ name: "Nv a", actor: "boss@x.test" });
    expect(t.byDay.reduce((n, d) => n + d.total, 0)).toBe(165);
  });
});

import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { LEDGER_SORTS, PEOPLE_SORTS, listLedger, listPeople, parseLedgerFilter, parsePageQuery } from "./admin-ledger";
import { applyCurrencyDelta } from "./economy";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;

const filter = (o: Record<string, string> = {}) => parseLedgerFilter(new URLSearchParams(o));
const page = (o: Record<string, string> = {}) => parsePageQuery(new URLSearchParams(o), LEDGER_SORTS, "id");
const ppage = (o: Record<string, string> = {}) => parsePageQuery(new URLSearchParams(o), PEOPLE_SORTS, "net");

async function put(characterId: string, currency: "linh_thach" | "cong_hien" | "tien_ngoc", delta: number, reason: string, actor = "system", at?: number) {
  const r = await applyCurrencyDelta(db, { characterId, currency, delta, reason, actor, idempotencyKey: crypto.randomUUID() });
  expect(r.status).toBe("applied");
  if (at !== undefined) raw.exec(`DROP TRIGGER currency_ledger_no_update`), raw.exec(`UPDATE currency_ledger SET created_at = ${at} WHERE id = (SELECT MAX(id) FROM currency_ledger)`);
}

beforeEach(async () => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES ('a1', 'alice@x.test', 'h', 's', 1, 'player', 0), ('a2', 'bob@x.test', 'h', 's', 1, 'player', 0), ('adm', 'boss@x.test', 'h', 's', 1, 'admin', 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'Alice', 'kim', 0, 0, 0, 0), ('c2', 'a2', 'Bob', 'kim', 0, 0, 0, 0)");
  await put("c1", "tien_ngoc", 500, "admin_grant:gift", "adm");
  await put("c1", "tien_ngoc", -50, "shop_buy:ren_giu_cap:1");
  await put("c1", "tien_ngoc", -30, "shop_buy:ren_giu_cap:1");
  await put("c2", "tien_ngoc", 100, "admin_grant", "adm");
  await put("c1", "linh_thach", 999, "monster_drop");
});

describe("parseLedgerFilter", () => {
  it("defaults to Tiên Ngọc and drops anything odd", () => {
    expect(filter()).toMatchObject({ currency: "tien_ngoc", q: "", reason: "", character: "", from: null, to: null });
    expect(filter({ currency: "all" }).currency).toBe("all");
    expect(filter({ currency: "gold" }).currency).toBe("tien_ngoc");
    expect(filter({ reason: "shop_buy; DROP" }).reason).toBe("");
    expect(filter({ reason: "shop_buy" }).reason).toBe("shop_buy");
    expect(filter({ from: "yesterday", to: "2026-13-45" })).toMatchObject({ from: null, to: null });
  });

  it("reads a date as the whole day in Vietnam time", () => {
    const f = filter({ from: "2026-10-24", to: "2026-10-24" });
    expect(f.from).toBe(Date.parse("2026-10-23T17:00:00Z"));
    expect(f.to).toBe(Date.parse("2026-10-24T17:00:00Z") - 1);
  });
});

describe("listLedger", () => {
  it("lists only Tiên Ngọc by default, newest first, with the names and the actor's email", async () => {
    const res = await listLedger(db, filter(), page());
    expect(res.total).toBe(4);
    expect(res.rows.map((r) => r.delta)).toEqual([100, -30, -50, 500]);
    expect(res.rows[0]).toMatchObject({ characterName: "Bob", email: "bob@x.test", actor: "boss@x.test", currency: "tien_ngoc" });
    expect(res.rows[1]!.actor).toBe("system");
  });

  it("totals the whole filtered set, not the page", async () => {
    const res = await listLedger(db, filter(), page({ size: "1" }));
    expect(res.rows).toHaveLength(1);
    expect(res.total).toBe(4);
    expect(res.summary).toEqual({ totalIn: 600, totalOut: -80 });
  });

  it("filters by currency, reason group, character and search", async () => {
    expect((await listLedger(db, filter({ currency: "all" }), page())).total).toBe(5);
    expect((await listLedger(db, filter({ currency: "linh_thach" }), page())).rows[0]!.reason).toBe("monster_drop");
    expect((await listLedger(db, filter({ reason: "shop_buy" }), page())).total).toBe(2);
    expect((await listLedger(db, filter({ reason: "admin_grant" }), page())).total).toBe(2); // with and without a ":" part
    expect((await listLedger(db, filter({ reason: "shop" }), page())).total).toBe(0); // a group, not a prefix
    expect((await listLedger(db, filter({ character: "c2" }), page())).total).toBe(1);
    expect((await listLedger(db, filter({ q: "alice" }), page())).total).toBe(3);
    expect((await listLedger(db, filter({ q: "ren_giu" }), page())).total).toBe(2);
    expect((await listLedger(db, filter({ q: "%" }), page())).total).toBe(0);
  });

  it("filters by time range", async () => {
    const day = Date.parse("2026-01-10T12:00:00+07:00");
    await put("c2", "tien_ngoc", 7, "admin_grant:old", "adm", day);
    const f = filter({ from: "2026-01-10", to: "2026-01-10" });
    const res = await listLedger(db, f, page());
    expect(res.rows.map((r) => r.delta)).toEqual([7]);
    expect((await listLedger(db, filter({ from: "2026-01-11" }), page())).rows.map((r) => r.delta)).not.toContain(7);
  });

  it("breaks down by reason group, keeping the other reasons visible while one is picked", async () => {
    const res = await listLedger(db, filter({ reason: "shop_buy" }), page());
    const byReason = Object.fromEntries(res.groups.map((g) => [g.reason, g]));
    expect(byReason.shop_buy).toMatchObject({ entries: 2, totalIn: 0, totalOut: -80 });
    expect(byReason.admin_grant).toMatchObject({ entries: 2, totalIn: 600, totalOut: 0 });
  });

  it("sorts by amount and pages", async () => {
    const asc = await listLedger(db, filter(), page({ sort: "delta", dir: "asc", size: "2" }));
    expect(asc.rows.map((r) => r.delta)).toEqual([-50, -30]);
    const second = await listLedger(db, filter(), page({ sort: "delta", dir: "asc", size: "2", page: "2" }));
    expect(second.rows.map((r) => r.delta)).toEqual([100, 500]);
  });

  it("keeps rows whose character is gone (names show as null)", async () => {
    await put("ghost", "tien_ngoc", 5, "admin_grant");
    const res = await listLedger(db, filter({ character: "ghost" }), page());
    expect(res.rows[0]).toMatchObject({ characterName: null, email: null, delta: 5 });
  });
});

describe("listPeople", () => {
  it("sums in, out and net per character with the balance now", async () => {
    const res = await listPeople(db, filter(), ppage());
    expect(res.total).toBe(2);
    expect(res.rows.map((r) => r.characterName)).toEqual(["Alice", "Bob"]); // by net, 420 then 100
    expect(res.rows[0]).toMatchObject({ entries: 3, totalIn: 500, totalOut: -80, net: 420, balance: 420, email: "alice@x.test" });
    expect(res.rows[1]).toMatchObject({ entries: 1, totalIn: 100, totalOut: 0, net: 100, balance: 100 });
  });

  it("follows the currency and the search, and treats 'all' as Tiên Ngọc", async () => {
    const lt = await listPeople(db, filter({ currency: "linh_thach" }), ppage());
    expect(lt.rows).toHaveLength(1);
    expect(lt.rows[0]).toMatchObject({ characterName: "Alice", net: 999, balance: 999 });
    expect((await listPeople(db, filter({ currency: "all" }), ppage())).rows[0]!.net).toBe(420);
    expect((await listPeople(db, filter({ q: "bob" }), ppage())).total).toBe(1);
  });

  it("sorts ascending by a chosen column", async () => {
    const res = await listPeople(db, filter(), ppage({ sort: "total_out", dir: "asc" }));
    expect(res.rows[0]!.characterName).toBe("Alice"); // -80 is the lowest
  });
});

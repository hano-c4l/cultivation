import type { DatabaseSync } from "node:sqlite";
import type { Currency } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_SORTS, TOTALS_SORTS, listHistory, listTotals, parseCurrencyFilter, parsePageQuery } from "./admin-ledger";
import { applyCurrencyDelta } from "./economy";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;

const ALL: Currency[] = ["tien_ngoc", "linh_thach", "cong_hien"];
const filter = (o: Record<string, string> = {}, allowed: Currency[] = ALL) => parseCurrencyFilter(new URLSearchParams(o), allowed);
const hpage = (o: Record<string, string> = {}) => parsePageQuery(new URLSearchParams(o), HISTORY_SORTS, "id");
const tpage = (o: Record<string, string> = {}) => parsePageQuery(new URLSearchParams(o), TOTALS_SORTS, "net");

async function put(characterId: string, currency: Currency, delta: number, reason: string, actor = "system") {
  const r = await applyCurrencyDelta(db, { characterId, currency, delta, reason, actor });
  expect(r.status).toBe("applied");
}

beforeEach(async () => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES ('a1', 'alice@x.test', 'h', 's', 1, 'player', 0), ('a2', 'bob@x.test', 'h', 's', 1, 'player', 0), ('adm', 'boss@x.test', 'h', 's', 1, 'admin', 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'Alice', 'kim', 0, 0, 0, 0), ('c2', 'a2', 'Bob', 'kim', 0, 0, 0, 0)");
  await put("c1", "tien_ngoc", 500, "admin_grant:gift", "adm");
  await put("c1", "tien_ngoc", -50, "shop_buy:ren_giu_cap:1");
  await put("c1", "tien_ngoc", -30, "shop_buy:ren_giu_cap:1");
  await put("c2", "tien_ngoc", 100, "admin_grant", "adm");
  await put("c1", "linh_thach", 40, "monster_drop"); // small by the system: totals only
  await put("c1", "linh_thach", 250_000, "quest"); // big: also in the history
  await put("c2", "linh_thach", 7, "admin_grant", "adm"); // small but an admin did it: in the history
  await put("c1", "cong_hien", 9, "quest");
});

describe("parseCurrencyFilter", () => {
  it("falls back to the first allowed currency and drops anything odd", () => {
    expect(filter()).toMatchObject({ currency: "tien_ngoc", q: "", reason: "", character: "", from: null, to: null });
    expect(filter({ currency: "linh_thach" }).currency).toBe("linh_thach");
    expect(filter({ currency: "cong_hien" }, ["tien_ngoc", "linh_thach"]).currency).toBe("tien_ngoc"); // no history for Cống Hiến
    expect(filter({ currency: "gold" }).currency).toBe("tien_ngoc");
    expect(filter({ reason: "shop_buy; DROP" }).reason).toBe("");
    expect(filter({ group: "shop_buy" }).reason).toBe("shop_buy");
    expect(filter({ from: "yesterday", to: "2026-13-45" })).toMatchObject({ from: null, to: null });
  });

  it("reads a date as the whole day in Vietnam time", () => {
    const f = filter({ from: "2026-10-24", to: "2026-10-24" });
    expect(f.from).toBe(Date.parse("2026-10-23T17:00:00Z"));
    expect(f.to).toBe(Date.parse("2026-10-24T17:00:00Z") - 1);
  });
});

describe("listHistory", () => {
  it("lists Tiên Ngọc newest first with the names and the actor's email", async () => {
    const res = await listHistory(db, filter(), hpage());
    expect(res.total).toBe(4);
    expect(res.rows.map((r) => r.delta)).toEqual([100, -30, -50, 500]);
    expect(res.rows[0]).toMatchObject({ characterName: "Bob", email: "bob@x.test", actor: "boss@x.test" });
    expect(res.rows[1]!.actor).toBe("system");
  });

  it("totals the whole filtered set (both positive), not the page, and breaks down by group", async () => {
    const res = await listHistory(db, filter(), hpage({ size: "1" }));
    expect(res.rows).toHaveLength(1);
    expect(res.summary).toEqual({ totalIn: 600, totalOut: 80 });
    const by = Object.fromEntries(res.groups.map((g) => [g.group, g]));
    expect(by.shop_buy).toEqual({ group: "shop_buy", entries: 2, totalIn: 0, totalOut: 80 });
    expect(by.admin_grant).toEqual({ group: "admin_grant", entries: 2, totalIn: 600, totalOut: 0 });
  });

  it("Linh Thạch history holds only the big changes and the admin's, never the small ones by the system", async () => {
    const res = await listHistory(db, filter({ currency: "linh_thach" }), hpage());
    expect(res.rows.map((r) => r.delta)).toEqual([7, 250_000]);
  });

  it("never reads another currency's rows", async () => {
    expect((await listHistory(db, filter({ currency: "linh_thach", q: "alice" }), hpage())).rows.map((r) => r.delta)).toEqual([250_000]);
    await expect(listHistory(db, filter({ currency: "cong_hien" }), hpage())).rejects.toThrow(/no history/);
  });

  it("filters by reason group, character and search; % is literal", async () => {
    expect((await listHistory(db, filter({ reason: "shop_buy" }), hpage())).total).toBe(2);
    expect((await listHistory(db, filter({ reason: "admin_grant" }), hpage())).total).toBe(2);
    expect((await listHistory(db, filter({ reason: "shop" }), hpage())).total).toBe(0); // a group, not a prefix
    expect((await listHistory(db, filter({ character: "c2" }), hpage())).total).toBe(1);
    expect((await listHistory(db, filter({ q: "alice" }), hpage())).total).toBe(3);
    expect((await listHistory(db, filter({ q: "ren_giu" }), hpage())).total).toBe(2);
    expect((await listHistory(db, filter({ q: "%" }), hpage())).total).toBe(0);
  });

  it("filters by time range (whole Vietnamese days)", async () => {
    raw.exec("DROP TRIGGER tien_ngoc_ledger_no_update"); // a test may rewrite history; the game never does
    const day = Date.parse("2026-01-10T12:00:00+07:00");
    raw.exec(`UPDATE tien_ngoc_ledger SET created_at = ${day} WHERE id = (SELECT MAX(id) FROM tien_ngoc_ledger)`);
    const res = await listHistory(db, filter({ from: "2026-01-10", to: "2026-01-10" }), hpage());
    expect(res.rows.map((r) => r.delta)).toEqual([100]);
    expect((await listHistory(db, filter({ from: "2026-01-11" }), hpage())).total).toBe(3);
  });

  it("sorts and pages", async () => {
    const asc = await listHistory(db, filter(), hpage({ sort: "delta", dir: "asc", size: "2" }));
    expect(asc.rows.map((r) => r.delta)).toEqual([-50, -30]);
    expect((await listHistory(db, filter(), hpage({ sort: "delta", dir: "asc", size: "2", page: "2" }))).rows.map((r) => r.delta)).toEqual([100, 500]);
  });

  it("keeps rows whose character is gone (names show as null)", async () => {
    await put("ghost", "tien_ngoc", 5, "admin_grant");
    expect((await listHistory(db, filter({ character: "ghost" }), hpage())).rows[0]).toMatchObject({ characterName: null, email: null, delta: 5 });
  });
});

describe("listTotals", () => {
  it("sums per character with the balance next to the net, and no difference when all is well", async () => {
    const res = await listTotals(db, filter(), tpage());
    expect(res.total).toBe(2);
    expect(res.rows.map((r) => r.characterName)).toEqual(["Alice", "Bob"]); // by net, 420 then 100
    expect(res.rows[0]).toEqual({ characterId: "c1", characterName: "Alice", email: "alice@x.test", entries: 3, totalIn: 500, totalOut: 80, net: 420, balance: 420, diff: 0 });
    expect(res.summary).toEqual({ totalIn: 600, totalOut: 80, net: 520, balance: 520 });
  });

  it("covers every Linh Thạch change, not only the traced ones, and Cống Hiến", async () => {
    const lt = await listTotals(db, filter({ currency: "linh_thach" }), tpage());
    expect(lt.rows.find((r) => r.characterId === "c1")).toMatchObject({ entries: 2, totalIn: 250_040, net: 250_040, balance: 250_040 });
    const ch = await listTotals(db, filter({ currency: "cong_hien" }), tpage());
    expect(ch.rows).toHaveLength(1);
    expect(ch.rows[0]).toMatchObject({ characterName: "Alice", net: 9, balance: 9 });
  });

  it("flags a balance that was edited by hand", async () => {
    raw.exec("UPDATE currency_balances SET balance = balance + 40 WHERE character_id = 'c2' AND currency = 'tien_ngoc'");
    const res = await listTotals(db, filter(), tpage({ sort: "diff" }));
    expect(res.rows[0]).toMatchObject({ characterName: "Bob", net: 100, balance: 140, diff: 40 });
    expect(res.rows[1]!.diff).toBe(0);
    expect(res.summary).toMatchObject({ net: 520, balance: 560 });
  });

  it("filters by group, character and search, keeping the group breakdown of the rest", async () => {
    const shop = await listTotals(db, filter({ group: "shop_buy" }), tpage());
    expect(shop.rows.map((r) => r.characterName)).toEqual(["Alice"]);
    expect(shop.rows[0]).toMatchObject({ entries: 2, totalIn: 0, totalOut: 80, net: -80 });
    expect(Object.fromEntries(shop.groups.map((g) => [g.group, g.entries]))).toEqual({ shop_buy: 2, admin_grant: 2 });
    const one = await listTotals(db, filter({ character: "c1" }), tpage());
    expect(one.groups.map((g) => g.group).sort()).toEqual(["admin_grant", "shop_buy"]);
    expect((await listTotals(db, filter({ q: "bob" }), tpage())).total).toBe(1);
    expect((await listTotals(db, filter({ q: "%" }), tpage())).total).toBe(0);
  });

  it("sorts ascending by a chosen column", async () => {
    expect((await listTotals(db, filter(), tpage({ sort: "total_out", dir: "asc" }))).rows[0]!.characterName).toBe("Bob"); // 0 out
  });
});

describe("parsePageQuery", () => {
  it("clamps bad input to safe defaults", () => {
    expect(parsePageQuery(new URLSearchParams({ sort: "id; DROP TABLE x", dir: "sideways", page: "-4", size: "100000" }), HISTORY_SORTS, "id")).toEqual({ sort: "id", dir: "desc", page: 1, size: 100 });
    expect(parsePageQuery(new URLSearchParams({ page: "abc", size: "0" }), TOTALS_SORTS, "net")).toMatchObject({ sort: "net", page: 1, size: 20 });
  });
});

import type { DatabaseSync } from "node:sqlite";
import { rollLinhThachDrop, tuning } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCurrencyDelta, claimMail, createItem, getWallet, sendMail } from "./economy";
import { resetSettingsCache } from "./settings";
import { makeDb } from "./test-db";

const CHAR = "char-1";
const change = (over: Partial<Parameters<typeof applyCurrencyDelta>[1]> = {}) => ({
  characterId: CHAR,
  currency: "linh_thach" as const,
  delta: 10,
  reason: "test",
  actor: "system",
  idempotencyKey: crypto.randomUUID(),
  ...over,
});

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec(
    "INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('char-1', 'a1', 'Test', 'kim', 0, 0, 0, 0)",
  );
});

const count = (table: string) => (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const TOTALS = { linh_thach: "linh_thach_totals", cong_hien: "cong_hien_totals", tien_ngoc: "tien_ngoc_totals" } as const;

/** The totals invariant: per (character, currency), SUM(total_in) - SUM(total_out) equals the stored balance. */
function expectTotalsMatchBalances(): void {
  for (const [currency, table] of Object.entries(TOTALS)) {
    const drift = raw
      .prepare(
        `SELECT t.character_id, SUM(t.total_in) - SUM(t.total_out) AS net, COALESCE(b.balance, 0) AS balance
         FROM ${table} t LEFT JOIN currency_balances b ON b.character_id = t.character_id AND b.currency = '${currency}'
         GROUP BY t.character_id HAVING net <> balance`,
      )
      .all();
    expect(drift).toEqual([]);
  }
}

const totals = (table: string) =>
  raw.prepare(`SELECT grp, total_in, total_out FROM ${table} ORDER BY grp`).all() as Array<{ grp: string; total_in: number; total_out: number }>;

describe("applyCurrencyDelta", () => {
  it("credits, adds to the totals of the reason group and returns the new balance", async () => {
    expect(await applyCurrencyDelta(db, change({ delta: 10 }))).toEqual({ status: "applied", balance: 10 });
    expect(await applyCurrencyDelta(db, change({ delta: 5 }))).toEqual({ status: "applied", balance: 15 });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(15);
    expect(totals("linh_thach_totals")).toEqual([{ grp: "other", total_in: 15, total_out: 0 }]); // one row, updated in place; an unknown reason is "other"
    expectTotalsMatchBalances();
  });

  it("keeps totals per group (monster_drop is farm, shop_buy is shop), in and out apart", async () => {
    await applyCurrencyDelta(db, change({ delta: 100, reason: "monster_drop" }));
    await applyCurrencyDelta(db, change({ delta: -30, reason: "shop_buy:ren_giu_cap:1" }));
    await applyCurrencyDelta(db, change({ delta: -20, reason: "shop_buy:hoi_huyet_dan:5" }));
    expect(totals("linh_thach_totals")).toEqual([
      { grp: "farm", total_in: 100, total_out: 0 },
      { grp: "shop", total_in: 0, total_out: 50 },
    ]);
    expectTotalsMatchBalances();
  });

  it("is idempotent: the same key never applies twice and leaves totals and balance unchanged", async () => {
    const c = change({ delta: 10 });
    expect(await applyCurrencyDelta(db, c)).toEqual({ status: "applied", balance: 10 });
    expect(await applyCurrencyDelta(db, c)).toEqual({ status: "duplicate" });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(10);
    expect(totals("linh_thach_totals")).toEqual([{ grp: "other", total_in: 10, total_out: 0 }]);
    expectTotalsMatchBalances();
  });

  it("a change without a key writes no key row and can be repeated", async () => {
    const c = { ...change({ delta: 4 }), idempotencyKey: undefined };
    await applyCurrencyDelta(db, c);
    await applyCurrencyDelta(db, c);
    expect(count("currency_dedupe")).toBe(0);
    expect((await getWallet(db, CHAR)).linh_thach).toBe(8);
  });

  it("a key lives for its ttl (expires_at), or for good without one", async () => {
    await applyCurrencyDelta(db, change({ delta: 1, idempotencyKey: "short", keyTtlMs: 1000 }));
    await applyCurrencyDelta(db, change({ delta: 1, idempotencyKey: "forever" }));
    const rows = raw.prepare("SELECT key, expires_at FROM currency_dedupe ORDER BY key").all() as Array<{ key: string; expires_at: number | null }>;
    expect(rows[0]).toEqual({ key: "forever", expires_at: null });
    expect(rows[1]!.key).toBe("short");
    expect(rows[1]!.expires_at).toBeGreaterThan(Date.now());
    expect(rows[1]!.expires_at).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("rejects an overdraft and rolls the totals back", async () => {
    await applyCurrencyDelta(db, change({ delta: 10 }));
    expect(await applyCurrencyDelta(db, change({ delta: -11 }))).toEqual({ status: "insufficient" });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(10);
    expect(totals("linh_thach_totals")).toEqual([{ grp: "other", total_in: 10, total_out: 0 }]);
    expect(await applyCurrencyDelta(db, change({ delta: -10 }))).toEqual({ status: "applied", balance: 0 });
    expectTotalsMatchBalances();
  });

  it("rejects a debit on a character with no balance row yet", async () => {
    expect(await applyCurrencyDelta(db, change({ delta: -1, currency: "tien_ngoc" }))).toEqual({ status: "insufficient" });
    expect(count("tien_ngoc_totals")).toBe(0);
    expect(count("tien_ngoc_ledger")).toBe(0);
    expect(count("currency_dedupe")).toBe(0);
    expect(count("currency_balances")).toBe(0);
  });

  it("a rejected overdraft key can be retried later once funds exist", async () => {
    const spend = change({ delta: -5 });
    expect(await applyCurrencyDelta(db, spend)).toEqual({ status: "insufficient" });
    await applyCurrencyDelta(db, change({ delta: 5 }));
    expect(await applyCurrencyDelta(db, spend)).toEqual({ status: "applied", balance: 0 });
  });

  it("keeps currencies separate", async () => {
    await applyCurrencyDelta(db, change({ delta: 3, currency: "cong_hien" }));
    await applyCurrencyDelta(db, change({ delta: 7, currency: "linh_thach" }));
    expect(await getWallet(db, CHAR)).toEqual({ linh_thach: 7, cong_hien: 3, tien_ngoc: 0 });
    expect(count("cong_hien_totals")).toBe(1);
    expect(count("linh_thach_totals")).toBe(1);
    expect(count("tien_ngoc_totals")).toBe(0);
  });

  it("refuses zero, fractional and oversized deltas", async () => {
    await expect(applyCurrencyDelta(db, change({ delta: 0 }))).rejects.toThrow();
    await expect(applyCurrencyDelta(db, change({ delta: 1.5 }))).rejects.toThrow();
    await expect(applyCurrencyDelta(db, change({ delta: 2_000_000_000 }))).rejects.toThrow();
    expect(count("linh_thach_totals")).toBe(0);
  });

  it("a mixed sequence keeps the totals equal to the balance", async () => {
    for (const d of [5, 9, -3, 20, -50, 1, -27]) await applyCurrencyDelta(db, change({ delta: d }));
    expectTotalsMatchBalances();
    expect((await getWallet(db, CHAR)).linh_thach).toBeGreaterThanOrEqual(0);
  });
});

describe("which changes get a history row", () => {
  it("Tiên Ngọc: every change, with the actor", async () => {
    await applyCurrencyDelta(db, change({ currency: "tien_ngoc", delta: 3, reason: "admin_grant:gift", actor: "adm" }));
    await applyCurrencyDelta(db, change({ currency: "tien_ngoc", delta: -1, reason: "shop_buy:ren_giu_cap:1" }));
    expect(raw.prepare("SELECT delta, reason, actor FROM tien_ngoc_ledger ORDER BY id").all()).toEqual([
      { delta: 3, reason: "admin_grant:gift", actor: "adm" },
      { delta: -1, reason: "shop_buy:ren_giu_cap:1", actor: "system" },
    ]);
    expect(totals("tien_ngoc_totals").map((t) => t.grp)).toEqual(["admin", "shop"]);
    expectTotalsMatchBalances();
  });

  it("Linh Thạch: only a big change (from the setting) or anything an admin did", async () => {
    await applyCurrencyDelta(db, change({ delta: 99_999 })); // just below the default 100000
    expect(count("linh_thach_ledger")).toBe(0);
    await applyCurrencyDelta(db, change({ delta: 100_000 }));
    await applyCurrencyDelta(db, change({ delta: -150_000, reason: "shop_buy:x:1" }));
    await applyCurrencyDelta(db, change({ delta: 5, actor: "adm", reason: "admin_grant" })); // small, but an admin did it
    expect((raw.prepare("SELECT delta FROM linh_thach_ledger ORDER BY id").all() as Array<{ delta: number }>).map((r) => r.delta)).toEqual([100_000, -150_000, 5]);
    expect(totals("linh_thach_totals").reduce((n, t) => n + t.total_in - t.total_out, 0)).toBe(99_999 + 100_000 - 150_000 + 5); // the totals saw every change
    expectTotalsMatchBalances();
  });

  it("the Linh Thạch threshold is a setting", async () => {
    raw.exec("INSERT INTO game_settings (key, value, updated_at, updated_by) VALUES ('linh_thach_trace_min', '1000', 0, 'test')");
    resetSettingsCache();
    await applyCurrencyDelta(db, change({ delta: 999 }));
    await applyCurrencyDelta(db, change({ delta: 1000 }));
    expect((raw.prepare("SELECT delta FROM linh_thach_ledger").all() as Array<{ delta: number }>).map((r) => r.delta)).toEqual([1000]);
    resetSettingsCache();
  });

  it("Cống Hiến: totals only, never a history row", async () => {
    await applyCurrencyDelta(db, change({ currency: "cong_hien", delta: 500_000, actor: "adm" }));
    expect(count("cong_hien_totals")).toBe(1);
    expect(count("tien_ngoc_ledger") + count("linh_thach_ledger")).toBe(0);
  });
});

describe("history tables are append-only", () => {
  it("rejects UPDATE and DELETE on history rows", async () => {
    await applyCurrencyDelta(db, change({ currency: "tien_ngoc", delta: 5 }));
    await applyCurrencyDelta(db, change({ delta: 200_000 }));
    for (const t of ["tien_ngoc_ledger", "linh_thach_ledger"]) {
      expect(() => raw.exec(`UPDATE ${t} SET delta = 999`)).toThrow(/append-only/);
      expect(() => raw.exec(`DELETE FROM ${t}`)).toThrow(/append-only/);
    }
  });
});

describe("mailbox", () => {
  it("claiming credits once; a second claim changes nothing", async () => {
    const id = await sendMail(db, { characterId: CHAR, subject: "Thưởng", currency: "linh_thach", amount: 100 });
    expect(await claimMail(db, CHAR, id)).toEqual({ status: "claimed", balance: 100 });
    expect(await claimMail(db, CHAR, id)).toEqual({ status: "already_claimed" });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(100);
    expect(totals("linh_thach_totals")).toEqual([{ grp: "other", total_in: 100, total_out: 0 }]);
    expect(raw.prepare("SELECT expires_at FROM currency_dedupe WHERE key = ?").get(`mail:${id}`)).toEqual({ expires_at: null }); // kept for good
    expectTotalsMatchBalances();
  });

  it("the key of the mail alone stops a second grant even when the mail row is not marked", async () => {
    const id = await sendMail(db, { characterId: CHAR, subject: "x", currency: "linh_thach", amount: 7 });
    await claimMail(db, CHAR, id);
    raw.exec(`UPDATE mailbox SET claimed_at = NULL WHERE id = '${id}'`);
    expect(await claimMail(db, CHAR, id)).toEqual({ status: "already_claimed" });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(7);
  });

  it("another character cannot claim the mail", async () => {
    const id = await sendMail(db, { characterId: CHAR, subject: "x", currency: "linh_thach", amount: 5 });
    expect(await claimMail(db, "someone-else", id)).toEqual({ status: "not_found" });
    expect(count("linh_thach_totals")).toBe(0);
  });

  it("a mail without attachment is claimable and writes nothing to the currency tables", async () => {
    const id = await sendMail(db, { characterId: CHAR, subject: "Thông báo" });
    expect(await claimMail(db, CHAR, id)).toEqual({ status: "claimed", balance: null });
    expect(count("linh_thach_totals") + count("currency_dedupe")).toBe(0);
  });
});

describe("item instances", () => {
  it("every item is its own row with a unique id", async () => {
    const a = await createItem(db, CHAR, "linh_kiem");
    const b = await createItem(db, CHAR, "linh_kiem");
    expect(a).not.toBe(b);
    expect(count("item_instances")).toBe(2);
  });
});

describe("rollLinhThachDrop", () => {
  it("drops nothing when the chance roll misses", () => {
    expect(rollLinhThachDrop(0, "normal", tuning().drops.linh.chance.normal, 0.5)).toBe(0);
  });
  it("normal drop is a positive integer; rare ranks drop more than normal", () => {
    const n = rollLinhThachDrop(5, "normal", 0, 0.5);
    expect(Number.isInteger(n) && n >= 1).toBe(true);
    expect(rollLinhThachDrop(5, "rare1", 0, 0.5)).toBeGreaterThan(n);
    expect(rollLinhThachDrop(5, "rare2", 0, 0.5)).toBeGreaterThan(rollLinhThachDrop(5, "rare1", 0, 0.5));
  });
  it("rare monsters always drop", () => {
    expect(rollLinhThachDrop(0, "rare1", 0.999, 0)).toBeGreaterThan(0);
  });
});

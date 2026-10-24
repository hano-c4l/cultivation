import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { reasonGroup } from "@game/shared";
import { describe, expect, it } from "vitest";
import { checkAll, checkCurrency } from "./economy-check";
import { applyCurrencyDelta } from "./economy";
import { makeDb } from "./test-db";

/** Migration 0036 applied to a database that already holds a year of the old single ledger. */
function oldDatabase(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql") && !n.startsWith("0036")).sort()) raw.exec(readFileSync(new URL(f, dir), "utf8"));
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'a@x.test', 'h', 's', 1, 0), ('a2', 'b@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'One', 'kim', 0, 0, 0, 0), ('c2', 'a2', 'Two', 'kim', 0, 0, 0, 0)");
  // The old way of writing: a ledger row (key and all) plus the balance.
  const put = (id: string, currency: string, delta: number, reason: string, actor: string, key: string, at: number) => {
    raw.prepare("INSERT INTO currency_ledger (character_id, currency, delta, reason, actor, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, currency, delta, reason, actor, key, at);
    raw.prepare("INSERT OR IGNORE INTO currency_balances (character_id, currency, balance) VALUES (?, ?, 0)").run(id, currency);
    raw.prepare("UPDATE currency_balances SET balance = balance + ? WHERE character_id = ? AND currency = ?").run(delta, id, currency);
  };
  put("c1", "linh_thach", 40, "monster_drop", "system", "drop:1", 10);
  put("c1", "linh_thach", 60, "monster_drop", "system", "drop:2", 20);
  put("c1", "linh_thach", -30, "shop_buy", "system", "shop:1", 30);
  put("c1", "linh_thach", 500_000, "admin_grant:gift", "adm", "admin:k1", 40);
  put("c1", "linh_thach", 250_000, "quest", "system", "q:1", 50); // big, by the system
  put("c1", "linh_thach", 5, "admin_grant", "adm", "admin:k2", 60); // small, by an admin
  put("c1", "cong_hien", 9, "quest", "system", "q:2", 70);
  put("c1", "tien_ngoc", 100, "admin_grant:jade", "adm", "admin:k3", 80);
  put("c1", "tien_ngoc", -50, "shop_buy", "system", "shop:2", 90);
  put("c2", "linh_thach", 7, "mail_claim", "system", "mail:m1", 100);
  raw.exec(readFileSync(new URL("0036_currency_totals.sql", dir), "utf8"));
  return raw;
}

describe("migration 0036 on existing data", () => {
  const raw = oldDatabase();
  const rows = (sql: string) => raw.prepare(sql).all();

  it("builds the totals per reason group so that they equal the balances", () => {
    expect(rows("SELECT character_id, grp, total_in, total_out, entries FROM linh_thach_totals ORDER BY character_id, grp")).toEqual([
      { character_id: "c1", grp: "admin_grant", total_in: 500_005, total_out: 0, entries: 2 },
      { character_id: "c1", grp: "monster_drop", total_in: 100, total_out: 0, entries: 2 },
      { character_id: "c1", grp: "quest", total_in: 250_000, total_out: 0, entries: 1 },
      { character_id: "c1", grp: "shop_buy", total_in: 0, total_out: 30, entries: 1 },
      { character_id: "c2", grp: "mail_claim", total_in: 7, total_out: 0, entries: 1 },
    ]);
    expect(rows("SELECT grp, total_in FROM cong_hien_totals")).toEqual([{ grp: "quest", total_in: 9 }]);
    expect(rows("SELECT grp, total_in, total_out FROM tien_ngoc_totals ORDER BY grp")).toEqual([
      { grp: "admin_grant", total_in: 100, total_out: 0 },
      { grp: "shop_buy", total_in: 0, total_out: 50 },
    ]);
  });

  it("copies every Tiên Ngọc row and only the big or admin Linh Thạch rows, keeping their ids", () => {
    expect(rows("SELECT delta, reason, actor FROM tien_ngoc_ledger ORDER BY id")).toEqual([
      { delta: 100, reason: "admin_grant:jade", actor: "adm" },
      { delta: -50, reason: "shop_buy", actor: "system" },
    ]);
    expect(rows("SELECT delta FROM linh_thach_ledger ORDER BY id")).toEqual([{ delta: 500_000 }, { delta: 250_000 }, { delta: 5 }]);
    expect(rows("SELECT COUNT(*) AS n FROM cong_hien_totals")).toEqual([{ n: 1 }]);
  });

  it("keeps the keys that still guard something and drops the rest", () => {
    expect((rows("SELECT key FROM currency_dedupe ORDER BY key") as Array<{ key: string }>).map((r) => r.key)).toEqual(["admin:k1", "admin:k2", "admin:k3", "mail:m1"]);
    expect(rows("SELECT COUNT(*) AS n FROM currency_dedupe WHERE expires_at IS NOT NULL")).toEqual([{ n: 0 }]);
  });

  it("drops the old ledger and leaves the balances alone", () => {
    expect(() => raw.prepare("SELECT 1 FROM currency_ledger").all()).toThrow(/no such table/);
    expect(rows("SELECT balance FROM currency_balances WHERE character_id = 'c1' AND currency = 'linh_thach'")).toEqual([{ balance: 750_075 }]);
  });
});

describe("reasonGroup", () => {
  it("is the part before the first colon, and the SQL of the migration agrees", () => {
    expect(reasonGroup("shop_buy:ren_giu_cap:1")).toBe("shop_buy");
    expect(reasonGroup("monster_drop")).toBe("monster_drop");
    expect(reasonGroup("")).toBe("other");
    expect(reasonGroup(":x")).toBe("other");
    expect(reasonGroup("a".repeat(100))).toHaveLength(40);
  });
});

describe("economy check", () => {
  it("finds nothing after normal changes, then flags a balance edited by hand", async () => {
    const { db, raw: r } = makeDb();
    r.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'a@x.test', 'h', 's', 1, 0)");
    r.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'One', 'kim', 0, 0, 0, 0)");
    await applyCurrencyDelta(db, { characterId: "c1", currency: "linh_thach", delta: 100, reason: "monster_drop", actor: "system" });
    await applyCurrencyDelta(db, { characterId: "c1", currency: "tien_ngoc", delta: 5, reason: "admin_grant", actor: "adm" });
    const clean = await checkAll(db);
    expect(clean.map((c) => c.mismatches.length)).toEqual([0, 0, 0]);
    expect(clean.find((c) => c.currency === "linh_thach")).toMatchObject({ checked: 1, balanceSum: 100, computedSum: 100 });

    r.exec("UPDATE currency_balances SET balance = balance + 40 WHERE character_id = 'c1' AND currency = 'linh_thach'");
    r.exec("INSERT INTO currency_balances (character_id, currency, balance) VALUES ('ghost', 'cong_hien', 9)"); // a balance with no totals
    const bad = await checkCurrency(db, "linh_thach");
    expect(bad.mismatches).toEqual([{ characterId: "c1", characterName: "One", balance: 140, computed: 100 }]);
    expect(bad.balanceSum - bad.computedSum).toBe(40);
    expect((await checkCurrency(db, "cong_hien")).mismatches).toEqual([{ characterId: "ghost", characterName: null, balance: 9, computed: 0 }]);
    expect((await checkCurrency(db, "tien_ngoc")).mismatches).toEqual([]);
  });
});

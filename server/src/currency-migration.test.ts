import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

/** Migration 0036 (and 0037 when asked) applied to a database that already holds a year of the old single ledger. */
function oldDatabase(withGroups: boolean): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql") && !n.startsWith("0036") && !n.startsWith("0037")).sort()) raw.exec(readFileSync(new URL(f, dir), "utf8"));
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
  raw.prepare("INSERT INTO admin_audit (at, admin_id, admin_email, action, target_type, target_id, summary) VALUES (5, 'adm', 'boss@x.test', 'setting_change', 'setting', 'k', 'k = 5')").run();
  raw.exec(readFileSync(new URL("0036_currency_totals.sql", dir), "utf8"));
  if (withGroups) raw.exec(readFileSync(new URL("0037_currency_groups_audit.sql", dir), "utf8"));
  return raw;
}

describe("migration 0036 on existing data", () => {
  const raw = oldDatabase(false);
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

describe("migration 0037 on data in the 0036 shape", () => {
  const raw = oldDatabase(true);
  const rows = (sql: string) => raw.prepare(sql).all();

  it("regroups the totals into the fixed groups and keeps money in and out", () => {
    expect(rows("SELECT character_id, grp, total_in, total_out FROM linh_thach_totals ORDER BY character_id, grp")).toEqual([
      { character_id: "c1", grp: "admin", total_in: 500_005, total_out: 0 },
      { character_id: "c1", grp: "farm", total_in: 100, total_out: 0 },
      { character_id: "c1", grp: "quest", total_in: 250_000, total_out: 0 },
      { character_id: "c1", grp: "shop", total_in: 0, total_out: 30 },
      { character_id: "c2", grp: "other", total_in: 7, total_out: 0 },
    ]);
    expect(rows("SELECT grp, total_in, total_out FROM tien_ngoc_totals ORDER BY grp")).toEqual([
      { grp: "admin", total_in: 100, total_out: 0 },
      { grp: "shop", total_in: 0, total_out: 50 },
    ]);
    expect(rows("SELECT grp, total_in FROM cong_hien_totals")).toEqual([{ grp: "quest", total_in: 9 }]);
  });

  it("merges old groups that land in the same new group and keeps the latest time", () => {
    const db = new DatabaseSync(":memory:");
    const dir = new URL("../migrations/", import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql") && !n.startsWith("0037")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
    db.exec(`INSERT INTO linh_thach_totals (character_id, grp, total_in, total_out, entries, updated_at) VALUES
      ('x', 'smith_upgrade', 0, 10, 1, 5), ('x', 'smith_refine', 0, 20, 2, 9), ('x', 'path_swap', 0, 5, 1, 7), ('x', 'repair', 0, 1, 1, 2), ('x', 'weird_new_reason', 3, 0, 1, 1)`);
    db.exec(readFileSync(new URL("0037_currency_groups_audit.sql", dir), "utf8"));
    expect(db.prepare("SELECT grp, total_in, total_out, updated_at FROM linh_thach_totals WHERE character_id = 'x' ORDER BY grp").all()).toEqual([
      { grp: "enhance", total_in: 0, total_out: 36, updated_at: 9 },
      { grp: "other", total_in: 3, total_out: 0, updated_at: 1 },
    ]);
  });

  it("leaves in minus out per character equal to the balance", () => {
    const drift = raw
      .prepare(
        `SELECT t.character_id FROM linh_thach_totals t LEFT JOIN currency_balances b ON b.character_id = t.character_id AND b.currency = 'linh_thach'
         GROUP BY t.character_id HAVING SUM(t.total_in) - SUM(t.total_out) <> COALESCE(b.balance, 0)`,
      )
      .all();
    expect(drift).toEqual([]);
  });

  it("no longer has the entries column, and creates the audit table", () => {
    expect((rows("PRAGMA table_info(linh_thach_totals)") as Array<{ name: string }>).map((c) => c.name)).toEqual(["character_id", "grp", "total_in", "total_out", "updated_at"]);
    expect(rows("SELECT COUNT(*) AS n FROM currency_audit")).toEqual([{ n: 0 }]);
    expect(() => raw.exec("INSERT INTO currency_audit (currency, character_id, history_amount, balance_amount, status, checked_at) VALUES ('gold', 'c', 0, 0, 'invalid', 0)")).toThrow(/CHECK/);
    expect(() => raw.exec("INSERT INTO currency_audit (currency, character_id, history_amount, balance_amount, status, checked_at) VALUES ('tien_ngoc', 'c', 0, 0, 'weird', 0)")).toThrow(/CHECK/);
  });

  it("replaces the admin audit with the admin log and copies the old rows", () => {
    expect(rows("SELECT at, admin_email, screen, content FROM admin_log")).toEqual([{ at: 5, admin_email: "boss@x.test", screen: "setting", content: "setting_change: k = 5" }]);
    expect(() => raw.prepare("SELECT 1 FROM admin_audit").all()).toThrow(/no such table/);
  });
});

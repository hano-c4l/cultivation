import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { MAX_BAG_TABS, SETTINGS } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCurrencyDelta } from "./economy";
import { addBagTabStatements, loadBag } from "./inventory";
import { allSettings, getSetting, resetSettingsCache, setSetting } from "./settings";
import { makeDb } from "./test-db";

const A = "char-a";
let db: D1Database;
let raw: DatabaseSync;

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)`);
  raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${A}', 'acc-a', 'A', 'kim', 0, 0, 0, 0)`);
});

const tabs = () => (raw.prepare("SELECT bag_tabs AS t FROM characters WHERE id = ?").get(A) as { t: number }).t;
const balance = () => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(A) as { balance: number } | undefined)?.balance ?? 0;

async function fund(amount: number) {
  await applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: amount, reason: "test", actor: "system", idempotencyKey: `fund:${Math.random()}` });
}

async function buy(price: number, expectedTabs: number) {
  return applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: -price, reason: "bag_tab", actor: "system", idempotencyKey: `bagtab:${Math.random()}` }, addBagTabStatements(db, A, expectedTabs));
}

describe("buying a bag tab", () => {
  it("charges and adds the tab in one batch", async () => {
    await fund(1500);
    expect((await buy(1000, 1)).status).toBe("applied");
    expect(tabs()).toBe(2);
    expect(balance()).toBe(500);
    expect((await loadBag(db, A)).tabs).toBe(2);
  });

  it("without enough Linh Thạch nothing changes", async () => {
    await fund(999);
    expect((await buy(1000, 1)).status).toBe("insufficient");
    expect(tabs()).toBe(1);
    expect(balance()).toBe(999);
  });

  it("a stale tab count fails the batch and does not charge", async () => {
    await fund(5000);
    await expect(buy(1000, 3)).rejects.toThrow();
    expect(tabs()).toBe(1);
    expect(balance()).toBe(5000);
  });

  it("two purchases that both saw one tab cannot both succeed", async () => {
    await fund(5000);
    expect((await buy(1000, 1)).status).toBe("applied");
    await expect(buy(1000, 1)).rejects.toThrow();
    expect(tabs()).toBe(2);
    expect(balance()).toBe(4000);
  });

  it("the cap is MAX_BAG_TABS", () => {
    expect(MAX_BAG_TABS).toBe(10);
  });
});

describe("game settings", () => {
  it("default to the code value, accept an override and survive a cache reset", async () => {
    expect(await getSetting(db, "bag_tab_price")).toBe(1000);
    await setSetting(db, "bag_tab_price", 2500, "admin-1");
    expect(await getSetting(db, "bag_tab_price")).toBe(2500);
    resetSettingsCache();
    expect(await getSetting(db, "bag_tab_price")).toBe(2500);
    expect((await allSettings(db)).find((s) => s.key === "bag_tab_price")?.value).toBe(2500);
    expect(SETTINGS.length).toBeGreaterThan(0);
  });

  it("an out-of-range value stored by hand is ignored", async () => {
    raw.exec("INSERT INTO game_settings (key, value, updated_at) VALUES ('bag_tab_price', '-5', 0)");
    expect(await getSetting(db, "bag_tab_price")).toBe(1000);
  });
});

describe("migration 0015 (8x16 to 8x8)", () => {
  it("moves items past cell 63 to a mail that never expires and leaves the rest alone", () => {
    const old = new DatabaseSync(":memory:");
    old.exec("PRAGMA foreign_keys = ON");
    const dir = new URL("../migrations/", import.meta.url);
    const files = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
    for (const f of files.filter((n) => n < "0015")) old.exec(readFileSync(new URL(f, dir), "utf8"));
    old.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)`);
    old.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at, bag_tabs) VALUES ('${A}', 'acc-a', 'A', 'kim', 0, 0, 0, 0, 2)`);
    const put = (id: string, tab: number | null, cell: number | null, slot: string | null = null) =>
      old.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, equip_slot, created_at) VALUES ('${id}', '${A}', 'linh_thao', 1, ${tab}, ${cell}, ${slot ? `'${slot}'` : "NULL"}, 0)`);
    put("keep-low", 0, 63);
    put("keep-tab2", 1, 10);
    put("over-a", 0, 64);
    put("over-b", 1, 127);
    put("worn", null, null, "weapon");
    old.exec(readFileSync(new URL("0015_bag_8x8_settings.sql", dir), "utf8"));
    const rows = old.prepare("SELECT id, bag_tab, cell FROM item_instances ORDER BY id").all() as Array<{ id: string; bag_tab: number | null; cell: number | null }>;
    expect(rows.find((r) => r.id === "keep-low")).toMatchObject({ bag_tab: 0, cell: 63 });
    expect(rows.find((r) => r.id === "keep-tab2")).toMatchObject({ bag_tab: 1, cell: 10 });
    expect(rows.find((r) => r.id === "over-a")).toMatchObject({ bag_tab: null, cell: null });
    expect(rows.find((r) => r.id === "over-b")).toMatchObject({ bag_tab: null, cell: null });
    expect(rows.find((r) => r.id === "worn")).toMatchObject({ bag_tab: null, cell: null });
    const mail = old.prepare("SELECT item_id, subject, expires_at FROM mailbox ORDER BY item_id").all() as Array<{ item_id: string; subject: string; expires_at: number | null }>;
    expect(mail.map((m) => m.item_id)).toEqual(["over-a", "over-b"]);
    expect(mail.every((m) => m.subject === "bag_resized" && m.expires_at === null)).toBe(true);
    expect((old.prepare("SELECT bag_tabs AS t FROM characters").get() as { t: number }).t).toBe(2);
  });
});

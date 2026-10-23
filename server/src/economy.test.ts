import type { DatabaseSync } from "node:sqlite";
import { rollLinhThachDrop, tuning } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCurrencyDelta, claimMail, createItem, getWallet, sendMail } from "./economy";
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

/** The ledger invariant: per (character, currency), SUM(delta) equals the stored balance. */
function expectLedgerMatchesBalances(): void {
  const drift = raw
    .prepare(
      `SELECT l.character_id, l.currency, SUM(l.delta) AS total, COALESCE(b.balance, 0) AS balance
       FROM currency_ledger l LEFT JOIN currency_balances b ON b.character_id = l.character_id AND b.currency = l.currency
       GROUP BY l.character_id, l.currency HAVING total <> balance`,
    )
    .all();
  expect(drift).toEqual([]);
}

describe("applyCurrencyDelta", () => {
  it("credits, records the ledger row and returns the new balance", async () => {
    expect(await applyCurrencyDelta(db, change({ delta: 10 }))).toEqual({ status: "applied", balance: 10 });
    expect(await applyCurrencyDelta(db, change({ delta: 5 }))).toEqual({ status: "applied", balance: 15 });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(15);
    expect(count("currency_ledger")).toBe(2);
    expectLedgerMatchesBalances();
  });

  it("is idempotent: the same key never applies twice and leaves ledger and balance unchanged", async () => {
    const c = change({ delta: 10 });
    expect(await applyCurrencyDelta(db, c)).toEqual({ status: "applied", balance: 10 });
    expect(await applyCurrencyDelta(db, c)).toEqual({ status: "duplicate" });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(10);
    expect(count("currency_ledger")).toBe(1);
    expectLedgerMatchesBalances();
  });

  it("rejects an overdraft and rolls the ledger row back", async () => {
    await applyCurrencyDelta(db, change({ delta: 10 }));
    expect(await applyCurrencyDelta(db, change({ delta: -11 }))).toEqual({ status: "insufficient" });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(10);
    expect(count("currency_ledger")).toBe(1);
    expect(await applyCurrencyDelta(db, change({ delta: -10 }))).toEqual({ status: "applied", balance: 0 });
    expectLedgerMatchesBalances();
  });

  it("rejects a debit on a character with no balance row yet", async () => {
    expect(await applyCurrencyDelta(db, change({ delta: -1, currency: "tien_ngoc" }))).toEqual({ status: "insufficient" });
    expect(count("currency_ledger")).toBe(0);
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
  });

  it("refuses zero, fractional and oversized deltas", async () => {
    await expect(applyCurrencyDelta(db, change({ delta: 0 }))).rejects.toThrow();
    await expect(applyCurrencyDelta(db, change({ delta: 1.5 }))).rejects.toThrow();
    await expect(applyCurrencyDelta(db, change({ delta: 2_000_000_000 }))).rejects.toThrow();
    expect(count("currency_ledger")).toBe(0);
  });

  it("a mixed sequence keeps the ledger sum equal to the balance", async () => {
    for (const d of [5, 9, -3, 20, -50, 1, -27]) await applyCurrencyDelta(db, change({ delta: d }));
    expectLedgerMatchesBalances();
    expect((await getWallet(db, CHAR)).linh_thach).toBeGreaterThanOrEqual(0);
  });
});

describe("ledger is append-only", () => {
  it("rejects UPDATE and DELETE on ledger rows", async () => {
    await applyCurrencyDelta(db, change());
    expect(() => raw.exec("UPDATE currency_ledger SET delta = 999")).toThrow(/append-only/);
    expect(() => raw.exec("DELETE FROM currency_ledger")).toThrow(/append-only/);
  });
});

describe("mailbox", () => {
  it("claiming credits once; a second claim changes nothing", async () => {
    const id = await sendMail(db, { characterId: CHAR, subject: "Thưởng", currency: "linh_thach", amount: 100 });
    expect(await claimMail(db, CHAR, id)).toEqual({ status: "claimed", balance: 100 });
    expect(await claimMail(db, CHAR, id)).toEqual({ status: "already_claimed" });
    expect((await getWallet(db, CHAR)).linh_thach).toBe(100);
    expect(count("currency_ledger")).toBe(1);
    expectLedgerMatchesBalances();
  });

  it("another character cannot claim the mail", async () => {
    const id = await sendMail(db, { characterId: CHAR, subject: "x", currency: "linh_thach", amount: 5 });
    expect(await claimMail(db, "someone-else", id)).toEqual({ status: "not_found" });
    expect(count("currency_ledger")).toBe(0);
  });

  it("a mail without attachment is claimable and writes no ledger row", async () => {
    const id = await sendMail(db, { characterId: CHAR, subject: "Thông báo" });
    expect(await claimMail(db, CHAR, id)).toEqual({ status: "claimed", balance: null });
    expect(count("currency_ledger")).toBe(0);
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

import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_TRADE, applyBag } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCurrencyDelta } from "./economy";
import { loadBag } from "./inventory";
import { resetSettingsCache } from "./settings";
import { makeDb } from "./test-db";
import { hasRoomFor, newSession, planTrade, setConfirm, setLock, setOffer, type TradePlan } from "./trade";

const [A, B] = ["trader-a", "trader-b"];
let db: D1Database;
let raw: DatabaseSync;
let n = 0;

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [A, B]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${id}', 'acc', '${id}', 'kim', 0, 0, 0, 0)`);
});

const balance = (id: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(id) as { balance: number } | undefined)?.balance ?? 0;
const owner = (itemId: string) => (raw.prepare("SELECT owner_character_id AS o FROM item_instances WHERE id = ?").get(itemId) as { o: string }).o;
const fund = (id: string, amount: number) => applyCurrencyDelta(db, { characterId: id, currency: "linh_thach", delta: amount, reason: "test", actor: "system", idempotencyKey: `f:${id}:${n++}` });

function give(id: string, qty: number, cell: number, type = "hoi_huyet_dan"): string {
  const itemId = `item-${n++}`;
  raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('${itemId}', '${id}', '${type}', ${qty}, 0, ${cell}, 0)`);
  return itemId;
}

async function plan(aItems: string[], aLinh: number, bItems: string[], bLinh: number, aTn = 0, bTn = 0): Promise<TradePlan> {
  return planTrade(db, { tradeId: `t-${n++}`, a: { id: A, bag: await loadBag(db, A), items: aItems, linh: aLinh, tienNgoc: aTn }, b: { id: B, bag: await loadBag(db, B), items: bItems, linh: bLinh, tienNgoc: bTn }, traceMin: 100_000, now: 1000 });
}

describe("a direct trade", () => {
  it("swaps items and Linh Thạch in one batch and writes the log", async () => {
    const a1 = give(A, 5, 0);
    const b1 = give(B, 2, 0, "linh_thao");
    await fund(A, 1000);
    await fund(B, 500);
    const p = await plan([a1], 300, [b1], 100);
    if (!p.ok) throw new Error(p.reason);
    await db.batch(p.statements);
    expect(owner(a1)).toBe(B);
    expect(owner(b1)).toBe(A);
    expect(balance(A)).toBe(1000 - 300 + 100);
    expect(balance(B)).toBe(500 + 300 - 100);
    const log = raw.prepare("SELECT linh_a, linh_b FROM trade_log").get() as { linh_a: number; linh_b: number };
    expect(log).toEqual({ linh_a: 300, linh_b: 100 });
    // The ops describe the same change for the cached bags.
    const bagA = await loadBag(db, A);
    const applied = applyBag({ items: [{ id: a1, type: "hoi_huyet_dan", tab: 0, cell: 0, qty: 5 }], equipped: [] }, p.opsA);
    expect(applied.items.map((i) => i.id)).toEqual([b1]);
    expect(bagA.items.map((i) => i.id)).toEqual([b1]);
    expect(applied.items[0]).toMatchObject({ tab: bagA.items[0]!.tab, cell: bagA.items[0]!.cell });
  });

  it("a gift of Linh Thạch alone, and an even swap, write the right ledger rows", async () => {
    await fund(A, 1000);
    const gift = await plan([], 400, [], 0);
    if (!gift.ok) throw new Error(gift.reason);
    await db.batch(gift.statements);
    expect([balance(A), balance(B)]).toEqual([600, 400]);
    const even = await plan([], 100, [], 100); // nets to zero: no ledger statement at all
    if (!even.ok) throw new Error(even.reason);
    await db.batch(even.statements);
    expect([balance(A), balance(B)]).toEqual([600, 400]);
  });

  it("Tiên Ngọc, Linh Thạch and items move together in one batch", async () => {
    const a1 = give(A, 1, 0);
    await fund(A, 1000);
    await db.batch([...(await import("./economy")).currencyStatements(db, { characterId: B, currency: "tien_ngoc", delta: 50, reason: "test", actor: "system" }, 100_000, 0)]);
    const p = await plan([a1], 200, [], 0, 0, 30);
    if (!p.ok) throw new Error(p.reason);
    await db.batch(p.statements);
    const tn = (id: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'tien_ngoc'").get(id) as { balance: number } | undefined)?.balance ?? 0;
    expect([owner(a1), balance(A), balance(B), tn(A), tn(B)]).toEqual([B, 800, 200, 30, 20]);
    expect(raw.prepare("SELECT tn_a, tn_b FROM trade_log").get()).toEqual({ tn_a: 0, tn_b: 30 });
  });

  it("an untradable item is refused at the plan, even when it was offered before it was on the list", async () => {
    const a1 = give(A, 1, 0, "path_item_kiem");
    const b1 = give(B, 2, 0, "linh_thao");
    expect(await plan([a1], 0, [b1], 0)).toMatchObject({ ok: false, reason: "stale" });
    expect(owner(a1)).toBe(A);
  });

  it("a side without the money rolls everything back", async () => {
    const a1 = give(A, 1, 0);
    await fund(A, 100);
    const p = await plan([a1], 0, [], 500); // A would pay 500 and holds 100... B offers 500 it does not have
    if (!p.ok) throw new Error(p.reason);
    await expect(db.batch(p.statements)).rejects.toThrow();
    expect(owner(a1)).toBe(A);
    expect(balance(A)).toBe(100);
    expect(raw.prepare("SELECT COUNT(*) AS c FROM trade_log").get()).toEqual({ c: 0 });
  });

  it("an item that left the bag between the lock and the confirm (listed at the market) cannot be traded away", async () => {
    const a1 = give(A, 1, 0);
    const p = await plan([a1], 0, [], 0);
    if (!p.ok) throw new Error(p.reason);
    raw.exec(`UPDATE item_instances SET bag_tab = NULL, cell = NULL WHERE id = '${a1}'`); // what putting it up at Vạn Bảo Lâu does
    await expect(db.batch(p.statements)).rejects.toThrow(/inv_guard/);
    expect(owner(a1)).toBe(A);
  });

  it("an item whose stack changed in the meantime fails the guard", async () => {
    const a1 = give(A, 5, 0);
    const p = await plan([a1], 0, [], 0);
    if (!p.ok) throw new Error(p.reason);
    raw.exec(`UPDATE item_instances SET qty = 3 WHERE id = '${a1}'`);
    await expect(db.batch(p.statements)).rejects.toThrow(/inv_guard/);
    expect(owner(a1)).toBe(A);
  });

  it("an offer naming an item the bag no longer holds is stale, before any statement", async () => {
    const p = await plan(["ghost"], 0, [], 0);
    expect(p).toEqual({ ok: false, reason: "stale" });
  });

  it("applying the same plan twice moves things once (the second fails the guard)", async () => {
    const a1 = give(A, 1, 0);
    const p = await plan([a1], 0, [], 0);
    if (!p.ok) throw new Error(p.reason);
    await db.batch(p.statements);
    await expect(db.batch(p.statements)).rejects.toThrow();
    expect((raw.prepare("SELECT COUNT(*) AS c FROM trade_log").get() as { c: number }).c).toBe(1);
  });

  it("a full bag cannot receive: the refusal names the side", async () => {
    const a1 = give(A, 1, 0);
    // Fill B's single tab (64 cells).
    for (let c = 0; c < 64; c++) give(B, 1, c);
    const p = await plan([a1], 0, [], 0);
    expect(p).toEqual({ ok: false, reason: "full", side: "b" });
    expect(hasRoomFor(await loadBag(db, B), 1)).toBe(false);
    expect(hasRoomFor(await loadBag(db, A), 1)).toBe(true);
  });

  it("the worst trade (6 + 6 items, big Linh Thạch and Tiên Ngọc on both sides, every ledger row written) still fits 50 statements", async () => {
    const max = DEFAULT_TRADE.maxItems;
    const as = Array.from({ length: max }, (_, i) => give(A, 1, i));
    const bs = Array.from({ length: max }, (_, i) => give(B, 1, i));
    const p = planTrade(db, { tradeId: "worst", a: { id: A, bag: await loadBag(db, A), items: as, linh: 500_000, tienNgoc: 40 }, b: { id: B, bag: await loadBag(db, B), items: bs, linh: 900_000, tienNgoc: 10 }, traceMin: 100_000, now: 1000 });
    if (!p.ok) throw new Error(p.reason);
    expect(p.statements.length).toBeLessThanOrEqual(50);
    expect(p.statements.length).toBeGreaterThan(40); // two guards, 24 for the items, 2 x 2 currency groups of 4 statements, the log
  });

  it("the largest trade fits the 50 statements of a D1 batch", async () => {
    const max = DEFAULT_TRADE.maxItems;
    const as = Array.from({ length: max }, (_, i) => give(A, 1, i));
    const bs = Array.from({ length: max }, (_, i) => give(B, 1, i));
    await fund(A, 1000);
    await fund(B, 1000);
    const p = await plan(as, 100, bs, 200);
    if (!p.ok) throw new Error(p.reason);
    expect(p.statements.length).toBeLessThanOrEqual(50);
    await db.batch(p.statements);
    expect(as.every((id) => owner(id) === B) && bs.every((id) => owner(id) === A)).toBe(true);
  });
});

describe("the trade session", () => {
  it("a change to either offer undoes both locks and agreements and moves the version on", () => {
    const s = newSession("s", "a", "b", 0);
    setLock(s, "a", true);
    setLock(s, "b", true);
    expect(s.rev).toBe(1); // locking does not change what is offered
    expect(setConfirm(s, "a")).toBe(false);
    expect(setConfirm(s, "b")).toBe(true);
    setOffer(s, "b", ["x"], 5, 0);
    expect(s.rev).toBe(2);
    expect([s.a.locked, s.b.locked, s.a.confirmed, s.b.confirmed]).toEqual([false, false, false, false]);
  });

  it("an agreement needs both sides locked, and unlocking takes both agreements back", () => {
    const s = newSession("s", "a", "b", 0);
    setLock(s, "a", true);
    expect(setConfirm(s, "a")).toBe(false); // b is not locked
    expect(s.a.confirmed).toBe(false);
    setLock(s, "b", true);
    setConfirm(s, "a");
    setLock(s, "b", false);
    expect(s.a.confirmed).toBe(false);
  });
});

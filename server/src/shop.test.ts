import type { DatabaseSync } from "node:sqlite";
import { applyBag, findOffer, planAdd, planRemove, sellPrice, shopDay } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCurrencyDelta } from "./economy";
import { saveCharacterPosition } from "./characters";
import { commitBagOps, loadBag, opStatements } from "./inventory";
import { getPurchased, limitStatements, stockLeft } from "./shop";
import { makeDb } from "./test-db";

const A = "char-a";
const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
let db: D1Database;
let raw: DatabaseSync;
let n = 0;
const newId = () => `shop-${++n}`;

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('char-a', 'acc-a', 'A', 'kim', 0, 0, 0, 0)");
});

const fund = (amount: number) => applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: amount, reason: "admin_grant", actor: "t", idempotencyKey: `fund:${++n}` });
const balance = () => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = 'char-a' AND currency = 'linh_thach'").get() as { balance: number } | undefined)?.balance ?? 0;
const count = (type: string) => (raw.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = 'char-a' AND item_type = ?").get(type) as { q: number }).q;

/** Buys the way the room does: the debit, the bag cells and (for a limited offer) the counter in one batch. */
async function buy(offerId: string, qty: number, now = NOW) {
  const offer = findOffer("male", "merchant", offerId)!;
  const bag = await loadBag(db, A);
  const ops = planAdd(bag.items, bag.tabs, offer.item, qty, newId)!;
  const extra = [
    ...ops.flatMap((op) => opStatements(db, A, op, now)),
    ...(offer.dailyLimit !== undefined ? limitStatements(db, A, "merchant", offer.id, qty, offer.dailyLimit, now) : []),
  ];
  return applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: -offer.price * qty, reason: "shop_buy", actor: "system", idempotencyKey: `shop:${++n}` }, extra);
}

describe("buying", () => {
  it("takes the Linh Thạch and gives the item in one batch", async () => {
    await fund(100);
    expect(await buy("hoi_huyet_dan", 3)).toMatchObject({ status: "applied", balance: 70 });
    expect(balance()).toBe(70);
    expect(count("hoi_huyet_dan")).toBe(3);
  });

  it("with too little Linh Thạch nothing changes", async () => {
    await fund(20);
    expect(await buy("hoi_huyet_dan", 3)).toEqual({ status: "insufficient" });
    expect(balance()).toBe(20);
    expect(count("hoi_huyet_dan")).toBe(0);
  });

  it("a daily limit stops a purchase that would pass it, with no debit and no item", async () => {
    await fund(100_000);
    expect(await buy("ngo_dao_dan", 2)).toMatchObject({ status: "applied" });
    await expect(buy("ngo_dao_dan", 1)).rejects.toThrow(/inv_guard/);
    expect(count("ngo_dao_dan")).toBe(2);
    expect(balance()).toBe(100_000 - 2 * findOffer("male", "merchant", "ngo_dao_dan")!.price);
    expect(stockLeft("male", "merchant", await getPurchased(db, A, "merchant", NOW))["ngo_dao_dan"]).toBe(0);
  });

  it("the limit starts again the next day and the old day's row is swept", async () => {
    await fund(100_000);
    await buy("ngo_dao_dan", 2);
    expect(await buy("ngo_dao_dan", 1, NOW + DAY)).toMatchObject({ status: "applied" });
    expect(count("ngo_dao_dan")).toBe(3);
    const rows = raw.prepare("SELECT day, count FROM shop_purchases WHERE character_id = 'char-a'").all();
    expect(rows).toEqual([{ day: shopDay(NOW + DAY), count: 1 }]);
  });

  it("an unlimited offer leaves no counter", async () => {
    await fund(1000);
    await buy("hoi_huyet_dan", 5);
    expect(raw.prepare("SELECT COUNT(*) AS c FROM shop_purchases").get()).toEqual({ c: 0 });
  });
});

describe("selling", () => {
  async function give(type: string, qty: number) {
    const bag = await loadBag(db, A);
    const ops = planAdd(bag.items, bag.tabs, type, qty, newId)!;
    expect(await commitBagOps(db, A, ops)).toBe("ok");
  }

  it("pays the credit and removes part of the stack in one batch", async () => {
    await give("yeu_dan", 4);
    const bag = await loadBag(db, A);
    const ops = planRemove(bag.items, bag.tabs, { tab: 0, cell: 0 }, 3)!;
    const total = sellPrice("yeu_dan") * 3;
    const r = await applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: total, reason: "shop_sell", actor: "system", idempotencyKey: `shop:${++n}` }, ops.flatMap((op) => opStatements(db, A, op, NOW)));
    expect(r).toMatchObject({ status: "applied", balance: total });
    expect(count("yeu_dan")).toBe(1);
  });

  it("a stale stack (the cache says 4 but the row has 2) pays nothing", async () => {
    await give("yeu_dan", 4);
    const bag = await loadBag(db, A);
    const ops = planRemove(bag.items, bag.tabs, { tab: 0, cell: 0 })!; // plans removing all 4
    raw.exec("UPDATE item_instances SET qty = 2 WHERE owner_character_id = 'char-a'");
    await expect(
      applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: 100, reason: "shop_sell", actor: "system", idempotencyKey: `shop:${++n}` }, ops.flatMap((op) => opStatements(db, A, op, NOW))),
    ).rejects.toThrow(/inv_guard/);
    expect(balance()).toBe(0);
    expect(count("yeu_dan")).toBe(2);
    expect(applyBag({ items: bag.items, equipped: [] }, ops).items).toEqual([]);
  });
});

describe("the talisman is spent with the move", () => {
  const pos = () => raw.prepare("SELECT map_id, x, y FROM characters WHERE id = 'char-a'").get() as { map_id: string; x: number; y: number };

  it("spends one talisman and saves the new position in one batch", async () => {
    const bag0 = await loadBag(db, A);
    expect(await commitBagOps(db, A, planAdd(bag0.items, bag0.tabs, "ttp_town", 2, newId)!)).toBe("ok");
    const bag = await loadBag(db, A);
    const before = planRemove(bag.items, bag.tabs, { tab: 0, cell: 0 }, 1)!.flatMap((op) => opStatements(db, A, op, NOW));
    await saveCharacterPosition(db, A, "town", 20.5, 20.5, undefined, undefined, before);
    expect(pos()).toMatchObject({ map_id: "town", x: 20.5, y: 20.5 });
    expect(count("ttp_town")).toBe(1);
  });

  it("when the talisman is not there any more nothing is spent and the position is not written", async () => {
    const bag0 = await loadBag(db, A);
    expect(await commitBagOps(db, A, planAdd(bag0.items, bag0.tabs, "ttp_town", 1, newId)!)).toBe("ok");
    const bag = await loadBag(db, A);
    const before = planRemove(bag.items, bag.tabs, { tab: 0, cell: 0 }, 1)!.flatMap((op) => opStatements(db, A, op, NOW));
    raw.exec("DELETE FROM item_instances WHERE owner_character_id = 'char-a'"); // dropped meanwhile
    await expect(saveCharacterPosition(db, A, "town", 20.5, 20.5, undefined, undefined, before)).rejects.toThrow(/inv_guard/);
    expect(pos()).toMatchObject({ x: 0, y: 0 });
  });
});

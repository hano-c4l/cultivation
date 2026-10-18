import type { DatabaseSync } from "node:sqlite";
import { BREAKTHROUGHS, applyBag, expToNext, planAdd, type BagItem } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { commitBreakthroughFailure, commitBreakthroughSuccess, planTakePills, startStatements } from "./breakthrough";
import { saveCharacterPosition } from "./characters";
import { applyCurrencyDelta } from "./economy";
import { commitBagOps, loadBag } from "./inventory";
import { makeDb } from "./test-db";

const A = "char-a";
const LK = BREAKTHROUGHS[0]!;
const NEED = expToNext(0, 9);
let db: D1Database;
let raw: DatabaseSync;
let n = 0;

const char = () =>
  raw.prepare("SELECT realm, stage, exp, potential_points, bt_started_at FROM characters WHERE id = ?").get(A) as {
    realm: number;
    stage: number;
    exp: number;
    potential_points: number;
    bt_started_at: number | null;
  };
const balance = () => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(A) as { balance: number } | undefined)?.balance ?? 0;
const pillCount = () => (raw.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = ? AND item_type = ?").get(A, LK.pill) as { q: number }).q;

async function givePills(qty: number): Promise<void> {
  const bag = await loadBag(db, A);
  const ops = planAdd(bag.items, bag.tabs, LK.pill, qty, () => `pill-${++n}`)!;
  expect(await commitBagOps(db, A, ops)).toBe("ok");
}

async function credit(amount: number): Promise<void> {
  await applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: amount, reason: "test", actor: "system", idempotencyKey: `credit-${++n}` });
}

/** Starts the way the room does: pills out, cost out, marker set, all in one batch. */
async function start(pills: number, startedAt = 1000) {
  const bag = await loadBag(db, A);
  const ops = planTakePills(bag.items, LK.pill, pills)!;
  return applyCurrencyDelta(
    db,
    { characterId: A, currency: "linh_thach", delta: -LK.cost, reason: "breakthrough", actor: "system", idempotencyKey: `bt-${++n}` },
    startStatements(db, A, 0, ops, startedAt),
  );
}

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, exp, created_at, updated_at) VALUES ('char-a', 'acc-a', 'A', 'kim', 0, 0, 0, 9, ${NEED}, 0, 0)`);
});

describe("planTakePills", () => {
  const stack = (id: string, tab: number, cell: number, qty: number): BagItem => ({ id, type: LK.pill, tab, cell, qty });
  it("takes across stacks in reading order and refuses a shortage", () => {
    const items = [stack("b", 0, 5, 1), stack("a", 0, 1, 2)];
    const ops = planTakePills(items, LK.pill, 3)!;
    expect(applyBag({ items, equipped: [] }, ops).items).toEqual([]);
    const two = planTakePills(items, LK.pill, 2)!;
    expect(applyBag({ items, equipped: [] }, two).items).toEqual([stack("b", 0, 5, 1)]);
    expect(planTakePills(items, LK.pill, 4)).toBeNull();
    expect(planTakePills(items, LK.pill, 0)).toBeNull();
  });
});

describe("start", () => {
  it("takes the pills and the Linh Thạch and marks the start, together", async () => {
    await givePills(3);
    await credit(LK.cost + 100);
    const r = await start(2);
    expect(r).toMatchObject({ status: "applied", balance: 100 });
    expect(pillCount()).toBe(1);
    expect(char().bt_started_at).toBe(1000);
  });

  it("changes nothing when the funds are short", async () => {
    await givePills(2);
    await credit(LK.cost - 1);
    expect((await start(2)).status).toBe("insufficient");
    expect(pillCount()).toBe(2);
    expect(balance()).toBe(LK.cost - 1);
    expect(char().bt_started_at).toBeNull();
  });

  it("a second start while one runs is refused and charges nothing", async () => {
    await givePills(4);
    await credit(LK.cost * 3);
    await start(2);
    await expect(start(2, 2000)).rejects.toThrow(/inv_guard/);
    expect(pillCount()).toBe(2);
    expect(balance()).toBe(LK.cost * 2);
    expect(char().bt_started_at).toBe(1000);
  });

  it("a bag that changed under the room's cache rolls everything back", async () => {
    await givePills(2);
    await credit(LK.cost);
    const bag = await loadBag(db, A);
    const ops = planTakePills(bag.items, LK.pill, 2)!;
    raw.exec(`UPDATE item_instances SET qty = 1 WHERE item_type = '${LK.pill}'`); // another path used one
    await expect(
      applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: -LK.cost, reason: "breakthrough", actor: "system", idempotencyKey: "stale-1" }, startStatements(db, A, 0, ops, 1000)),
    ).rejects.toThrow();
    expect(pillCount()).toBe(1);
    expect(balance()).toBe(LK.cost);
    expect(char().bt_started_at).toBeNull();
  });

  it("is refused below stage 9", async () => {
    raw.exec("UPDATE characters SET stage = 8 WHERE id = 'char-a'");
    await givePills(1);
    await credit(LK.cost);
    await expect(start(1)).rejects.toThrow(/inv_guard/);
    expect(pillCount()).toBe(1);
    expect(balance()).toBe(LK.cost);
  });
});

describe("outcome", () => {
  beforeEach(async () => {
    await givePills(1);
    await credit(LK.cost);
    await start(1);
  });

  it("success moves to stage 1 of the next realm with the points, once", async () => {
    expect(await commitBreakthroughSuccess(db, A, 0, 1000, 17)).toBe("ok");
    expect(char()).toMatchObject({ realm: 1, stage: 1, exp: 0, potential_points: 17, bt_started_at: null });
    // The same outcome again (a late alarm, say) changes nothing.
    expect(await commitBreakthroughSuccess(db, A, 0, 1000, 17)).toBe("stale");
    expect(await commitBreakthroughFailure(db, A, 1000, 100)).toBe("stale");
    expect(char()).toMatchObject({ realm: 1, stage: 1, exp: 0, potential_points: 17 });
  });

  it("failure takes the EXP (never below zero) and clears the marker, once", async () => {
    expect(await commitBreakthroughFailure(db, A, 1000, 300)).toBe("ok");
    expect(char()).toMatchObject({ realm: 0, stage: 9, exp: NEED - 300, bt_started_at: null });
    expect(await commitBreakthroughFailure(db, A, 1000, 300)).toBe("stale");
    expect(await commitBreakthroughSuccess(db, A, 0, 1000, 5)).toBe("stale");
    expect(char().exp).toBe(NEED - 300);
    raw.exec("UPDATE characters SET bt_started_at = 5000 WHERE id = 'char-a'");
    expect(await commitBreakthroughFailure(db, A, 5000, 10 * NEED)).toBe("ok");
    expect(char().exp).toBe(0);
  });

  it("an outcome for another start time is stale", async () => {
    expect(await commitBreakthroughSuccess(db, A, 0, 999, 5)).toBe("stale");
    expect(char()).toMatchObject({ realm: 0, bt_started_at: 1000 });
  });
});

describe("saves racing a breakthrough", () => {
  it("a save made for the old realm cannot put stage 9 back", async () => {
    await givePills(1);
    await credit(LK.cost);
    await start(1);
    await commitBreakthroughSuccess(db, A, 0, 1000, 10);
    // The room had reserved this write before the breakthrough committed.
    await saveCharacterPosition(db, A, "town", 5.5, 5.5, { realm: 0, stage: 9, exp: NEED, addPoints: 3 });
    expect(char()).toMatchObject({ realm: 1, stage: 1, exp: 0, potential_points: 13 });
    // A write for the new realm goes through.
    await saveCharacterPosition(db, A, "town", 5.5, 5.5, { realm: 1, stage: 2, exp: 7, addPoints: 0 });
    expect(char()).toMatchObject({ realm: 1, stage: 2, exp: 7 });
  });
});

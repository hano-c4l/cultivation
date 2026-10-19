import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_QUESTS, EXTRA_QUESTS, SEED_QUESTS, planAdd, type QuestDef } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { commitBagOps, loadBag } from "./inventory";
import { acceptQuest, commitTurnIn, getQuestCatalog, loadQuestCatalog, loadQuestProgress, pathItemKey, planConsume, planTurnIn, resetQuestCache, resetQuestStatements, saveQuestProgress } from "./quests";
import { makeDb } from "./test-db";

const A = "char-a";
const NOW = 5_000_000;
let db: D1Database;
let raw: DatabaseSync;
let n = 0;
const newId = () => `q-${++n}`;
const def = (id: string) => SEED_QUESTS.find((q) => q.id === id) as QuestDef;

beforeEach(() => {
  ({ db, raw } = makeDb());
  resetQuestCache();
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('char-a', 'acc-a', 'A', 'kim', 0, 0, 0, 0)");
});

const balance = () => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = 'char-a' AND currency = 'linh_thach'").get() as { balance: number } | undefined)?.balance ?? 0;
const count = (type: string) => (raw.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = 'char-a' AND item_type = ?").get(type) as { q: number }).q;
const character = () => raw.prepare("SELECT realm, stage, exp, potential_points FROM characters WHERE id = 'char-a'").get() as { realm: number; stage: number; exp: number; potential_points: number };
const questRow = (id: string) => raw.prepare("SELECT state, progress FROM character_quests WHERE character_id = 'char-a' AND quest_id = ?").get(id) as { state: string; progress: number } | undefined;

async function give(type: string, qty: number) {
  const bag = await loadBag(db, A);
  expect(await commitBagOps(db, A, planAdd(bag.items, bag.tabs, type, qty, newId)!)).toBe("ok");
}

/** Plans and commits a hand-in the way the room does. */
async function turnIn(q: QuestDef, counted: boolean) {
  const bag = await loadBag(db, A);
  const plan = planTurnIn(q, { items: bag.items, equipped: bag.equipped }, bag.tabs, character(), newId);
  if (!plan.ok) return plan;
  return { plan, result: await commitTurnIn(db, A, q, plan, counted, NOW) };
}

describe("the catalogue", () => {
  it("is seeded with the default chain, valid, and later edits are kept", async () => {
    const first = await loadQuestCatalog(db);
    expect(first.defs.map((d) => d.id).sort()).toEqual(SEED_QUESTS.map((d) => d.id).sort());
    expect(DEFAULT_QUESTS.length + EXTRA_QUESTS.length).toBe(SEED_QUESTS.length);
    raw.exec("UPDATE quests SET enabled = 0 WHERE id = 'newbie_3'");
    raw.exec("UPDATE quests SET def = json_set(def, '$.rewards.linhThach', 777) WHERE id = 'newbie_2'");
    resetQuestCache();
    const again = await loadQuestCatalog(db);
    expect(again.defs.find((d) => d.id === "newbie_3")?.enabled).toBe(false);
    expect(again.defs.find((d) => d.id === "newbie_2")?.rewards.linhThach).toBe(777);
  });

  it("refuses a catalogue that does not validate, and serves the last good copy afterwards", async () => {
    await getQuestCatalog(db, 0);
    raw.exec("UPDATE quests SET def = json_set(def, '$.giver', 'nobody') WHERE id = 'newbie_1'");
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'quests'");
    expect((await getQuestCatalog(db, 1_000_000)).find((d) => d.id === "newbie_1")?.giver).toBe("elder"); // last good copy
    resetQuestCache();
    await expect(loadQuestCatalog(db)).rejects.toThrow(/invalid/);
  });
});

describe("progress", () => {
  it("accepting twice fails on the key, progress is absolute and a closed quest is left alone", async () => {
    await acceptQuest(db, A, "newbie_2", NOW);
    await expect(acceptQuest(db, A, "newbie_2", NOW)).rejects.toThrow(/character_quests/);
    await saveQuestProgress(db, A, [{ id: "newbie_2", progress: 4 }]);
    await saveQuestProgress(db, A, [{ id: "newbie_2", progress: 4 }]); // writing the same value again changes nothing
    expect(questRow("newbie_2")).toEqual({ state: "active", progress: 4 });
    raw.exec("UPDATE character_quests SET state = 'done' WHERE quest_id = 'newbie_2'");
    await saveQuestProgress(db, A, [{ id: "newbie_2", progress: 9 }]);
    expect(questRow("newbie_2")).toEqual({ state: "done", progress: 4 });
    expect(await loadQuestProgress(db, A)).toEqual({ newbie_2: { state: "done", progress: 4 } });
  });
});

describe("handing a quest in", () => {
  it("pays Linh Thạch, items and EXP, closes the quest, in one batch (a kill quest)", async () => {
    const q = def("newbie_2");
    await acceptQuest(db, A, q.id, NOW);
    await saveQuestProgress(db, A, [{ id: q.id, progress: 10 }]);
    const r = (await turnIn(q, true)) as Exclude<Awaited<ReturnType<typeof turnIn>>, { ok: false }>;
    expect(r.result).toMatchObject({ status: "done", balance: 100 });
    expect(balance()).toBe(100);
    expect(count("duong_huyet_dan")).toBe(3);
    expect(character()).toMatchObject({ stage: 1, exp: 400 });
    expect(questRow(q.id)?.state).toBe("done");
  });

  it("a second hand-in changes nothing (the grant key is spent)", async () => {
    const q = def("newbie_2");
    await acceptQuest(db, A, q.id, NOW);
    await saveQuestProgress(db, A, [{ id: q.id, progress: 10 }]);
    await turnIn(q, true);
    const afterFirst = { balance: balance(), potions: count("duong_huyet_dan"), c: character() };
    const again = (await turnIn(q, true)) as { result: { status: string } };
    expect(again.result.status).toBe("duplicate");
    expect({ balance: balance(), potions: count("duong_huyet_dan"), c: character() }).toEqual(afterFirst);
  });

  it("a kill quest without the progress is refused by the guard and nothing is paid", async () => {
    const q = def("newbie_2");
    await acceptQuest(db, A, q.id, NOW);
    await saveQuestProgress(db, A, [{ id: q.id, progress: 9 }]);
    const r = (await turnIn(q, true)) as { result: { status: string } };
    expect(r.result.status).toBe("stale");
    expect(balance()).toBe(0);
    expect(count("duong_huyet_dan")).toBe(0);
    expect(questRow(q.id)?.state).toBe("active");
  });

  it("a quest that was never accepted cannot be handed in", async () => {
    const r = (await turnIn(def("newbie_2"), true)) as { result: { status: string } };
    expect(r.result.status).toBe("stale");
    expect(balance()).toBe(0);
  });

  it("a collect quest takes the items from several stacks and refuses when there are too few", async () => {
    const q = def("newbie_3");
    await acceptQuest(db, A, q.id, NOW);
    await give("linh_thao", 3);
    expect((await turnIn(q, false)) as { ok: boolean }).toMatchObject({ ok: false, reason: "not_ready" });
    expect(count("linh_thao")).toBe(3);
    raw.exec("UPDATE item_instances SET qty = 2 WHERE item_type = 'linh_thao'");
    await give("linh_thao", 4); // a second stack (the first holds 2 after the edit; stacks merge only when planned together)
    const total = count("linh_thao");
    expect(total).toBeGreaterThanOrEqual(5);
    const r = (await turnIn(q, false)) as { result: { status: string } };
    expect(r.result.status).toBe("done");
    expect(count("linh_thao")).toBe(total - 5);
    expect(count("duong_huyet_dan")).toBe(3);
  });

  it("a full bag refuses the hand-in with nothing changed", async () => {
    const q = def("newbie_2");
    await acceptQuest(db, A, q.id, NOW);
    await saveQuestProgress(db, A, [{ id: q.id, progress: 10 }]);
    // Fill every cell of every tab with distinct non-stackable fillers.
    const bag = await loadBag(db, A);
    const cells = bag.tabs * 64;
    raw.exec("BEGIN");
    for (let i = 0; i < cells; i++) raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES (?, 'char-a', 'eq.weapon.u.0.1.1', 1, ?, ?, 0)").run(`fill-${i}`, Math.floor(i / 64), i % 64);
    raw.exec("COMMIT");
    const r = await turnIn(q, true);
    expect(r).toMatchObject({ ok: false, reason: "full" });
    expect(balance()).toBe(0);
    expect(questRow(q.id)?.state).toBe("active");
  });

  it("EXP follows the kill rule: stage-ups carry over and the stage 9 bar overflows by at most 100%", async () => {
    const q = { ...def("newbie_2"), rewards: { exp: 1_000_000_000 } } as QuestDef;
    await acceptQuest(db, A, q.id, NOW);
    await saveQuestProgress(db, A, [{ id: q.id, progress: 10 }]);
    const r = (await turnIn(q, true)) as { result: { status: string } };
    expect(r.result.status).toBe("done");
    const c = character();
    expect(c.stage).toBe(9);
    expect(c.potential_points).toBeGreaterThan(0);
    expect(c.exp).toBeGreaterThan(0);
    const again = (await turnIn({ ...q, id: "newbie_x" } as QuestDef, true)) as { result: { status: string } };
    expect(again.result.status).toBe("stale"); // not accepted
  });

  it("a stale EXP bar (the row moved on since the plan) pays nothing", async () => {
    const q = def("newbie_2");
    await acceptQuest(db, A, q.id, NOW);
    await saveQuestProgress(db, A, [{ id: q.id, progress: 10 }]);
    const bag = await loadBag(db, A);
    const plan = planTurnIn(q, { items: bag.items, equipped: bag.equipped }, bag.tabs, character(), newId);
    if (!plan.ok) throw new Error("plan");
    raw.exec("UPDATE characters SET exp = 55 WHERE id = 'char-a'"); // the character gained EXP meanwhile
    const result = await commitTurnIn(db, A, q, plan, true, NOW);
    expect(result.status).toBe("stale");
    expect(balance()).toBe(0);
    expect(character().exp).toBe(55);
    expect(questRow(q.id)?.state).toBe("active");
  });
});

describe("planConsume", () => {
  it("removes across stacks, smallest cell first, and is null when short", async () => {
    await give("linh_thao", 99);
    await give("linh_thao", 5);
    const bag = await loadBag(db, A);
    const ops = planConsume({ items: bag.items, equipped: [] }, bag.tabs, "linh_thao", 100);
    expect(ops).not.toBeNull();
    expect(planConsume({ items: bag.items, equipped: [] }, bag.tabs, "linh_thao", 105)).toBeNull();
  });
});

describe("path quests", () => {
  const kiem = () => def("path_kiem");
  const give2 = async () => {
    await give("linh_thao", 10);
    await give("thu_cot", 5);
  };

  it("take every material, give the path item and spend the path's one-time key", async () => {
    await acceptQuest(db, A, kiem().id, NOW);
    await give("linh_thao", 10);
    expect(((await turnIn(kiem(), false)) as { ok: boolean }).ok).toBe(false); // the Thú Cốt is missing
    expect(count("linh_thao")).toBe(10);
    await give("thu_cot", 5);
    const r = (await turnIn(kiem(), false)) as { result: { status: string } };
    expect(r.result.status).toBe("done");
    expect(count("path_item_kiem")).toBe(1);
    expect(count("linh_thao") + count("thu_cot")).toBe(0);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_grants WHERE key = ?").get(pathItemKey(A, "kiem"))).toEqual({ n: 1 });
  });

  it("a path item given before (the claim button) makes the hand-in fail whole: nothing is taken, nothing is given", async () => {
    await acceptQuest(db, A, kiem().id, NOW);
    await give2();
    raw.prepare("INSERT INTO item_grants (key, created_at) VALUES (?, 0)").run(pathItemKey(A, "kiem"));
    const r = (await turnIn(kiem(), false)) as { result: { status: string } };
    expect(r.result.status).toBe("duplicate");
    expect(count("linh_thao")).toBe(10);
    expect(count("thu_cot")).toBe(5);
    expect(count("path_item_kiem")).toBe(0);
    expect(questRow(kiem().id)?.state).toBe("active");
  });

  it("dropping the path opens the quest again and the item can be earned a second time", async () => {
    await acceptQuest(db, A, kiem().id, NOW);
    await give2();
    expect(((await turnIn(kiem(), false)) as { result: { status: string } }).result.status).toBe("done");
    // What dropping a path does to the item key (rearrangeStatements) and to its quest (resetQuestStatements).
    await db.batch([db.prepare("DELETE FROM item_grants WHERE key = ?").bind(pathItemKey(A, "kiem")), ...resetQuestStatements(db, A, [kiem()])]);
    expect(questRow(kiem().id)).toBeUndefined();
    await acceptQuest(db, A, kiem().id, NOW + 1);
    await give2();
    expect(((await turnIn(kiem(), false)) as { result: { status: string } }).result.status).toBe("done");
    expect(count("path_item_kiem")).toBe(2);
  });

  it("the breakthrough quest takes three kinds of materials and gives the pill, once", async () => {
    const bt = def("breakthrough_1");
    await acceptQuest(db, A, bt.id, NOW);
    await give("linh_thao", 20);
    await give("thu_cot", 10);
    await give("yeu_dan", 2);
    expect(((await turnIn(bt, false)) as { ok: boolean }).ok).toBe(false);
    await give("yeu_dan", 1);
    expect(((await turnIn(bt, false)) as { result: { status: string } }).result.status).toBe("done");
    expect(count("bt_pill_1")).toBe(1);
    expect(count("linh_thao") + count("thu_cot") + count("yeu_dan")).toBe(0);
    // Handing in again (with the materials in hand once more) finds the key spent: no second pill, and the materials stay.
    await give("linh_thao", 20);
    await give("thu_cot", 10);
    await give("yeu_dan", 3);
    expect(((await turnIn(bt, false)) as { result: { status: string } }).result.status).toBe("duplicate");
    expect(count("bt_pill_1")).toBe(1);
    expect(count("linh_thao")).toBe(20);
  });
});

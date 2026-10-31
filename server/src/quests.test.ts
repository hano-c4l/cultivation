import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DAILY_QUESTS, DEFAULT_QUESTS, EXTRA_QUESTS, HIGH_DAILY_QUESTS, SEED_QUESTS, meetsQuestLevel, planAdd, questStatus, type QuestDef } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { commitBagOps, loadBag } from "./inventory";
import { abandonQuest, acceptQuest, commitTurnIn, getQuestCatalog, loadQuestCatalog, loadQuestProgress, pathItemKey, planConsume, planTurnIn, resetQuestCache, resetQuestStatements, saveQuestProgress } from "./quests";
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
    expect(DEFAULT_QUESTS.length + EXTRA_QUESTS.length + DAILY_QUESTS.length + HIGH_DAILY_QUESTS.length).toBe(SEED_QUESTS.length);
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
    expect(await loadQuestProgress(db, A)).toEqual({ newbie_2: { state: "done", progress: 4, at: expect.any(Number) } });
    // Giving up touches an active quest only: a finished quest stays finished.
    expect(await abandonQuest(db, A, "newbie_2")).toBe(false);
    expect(questRow("newbie_2")).toEqual({ state: "done", progress: 4 });
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
  const dan = () => def("path_dan");
  const give2 = async () => {
    await give("duong_huyet_dan", 10);
    await give("thu_cot", 10);
    await give("yeu_dan", 2);
  };

  it("take every material, give the path item and spend the path's one-time key", async () => {
    await acceptQuest(db, A, dan().id, NOW);
    await give("duong_huyet_dan", 10);
    await give("thu_cot", 10);
    expect(((await turnIn(dan(), false)) as { ok: boolean }).ok).toBe(false); // the Yêu Đan is missing
    expect(count("thu_cot")).toBe(10);
    await give("yeu_dan", 2);
    const r = (await turnIn(dan(), false)) as { result: { status: string } };
    expect(r.result.status).toBe("done");
    expect(count("path_item_dan")).toBe(1);
    expect(count("duong_huyet_dan") + count("thu_cot") + count("yeu_dan")).toBe(0);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_grants WHERE key = ?").get(pathItemKey(A, "dan"))).toEqual({ n: 1 });
  });

  it("a path item given before (the claim button) makes the hand-in fail whole: nothing is taken, nothing is given", async () => {
    await acceptQuest(db, A, dan().id, NOW);
    await give2();
    raw.prepare("INSERT INTO item_grants (key, created_at) VALUES (?, 0)").run(pathItemKey(A, "dan"));
    const r = (await turnIn(dan(), false)) as { result: { status: string } };
    expect(r.result.status).toBe("duplicate");
    expect(count("duong_huyet_dan")).toBe(10);
    expect(count("thu_cot")).toBe(10);
    expect(count("path_item_dan")).toBe(0);
    expect(questRow(dan().id)?.state).toBe("active");
  });

  it("dropping the path opens the quest again and the item can be earned a second time", async () => {
    await acceptQuest(db, A, dan().id, NOW);
    await give2();
    expect(((await turnIn(dan(), false)) as { result: { status: string } }).result.status).toBe("done");
    // What dropping a path does to the item key (rearrangeStatements) and to its quest (resetQuestStatements).
    await db.batch([db.prepare("DELETE FROM item_grants WHERE key = ?").bind(pathItemKey(A, "dan")), ...resetQuestStatements(db, A, SEED_QUESTS.filter((q) => q.path === "dan"))]);
    expect(questRow(dan().id)).toBeUndefined();
    await acceptQuest(db, A, dan().id, NOW + 1);
    await give2();
    expect(((await turnIn(dan(), false)) as { result: { status: string } }).result.status).toBe("done");
    expect(count("path_item_dan")).toBe(2);
  });

  it("the three paths ask for different things in both steps", () => {
    expect(def("path_kiem_1").objective).toMatchObject({ kind: "kill", count: 30, map: "forest" });
    expect(def("path_kiem").objective).toMatchObject({ kind: "kill", count: 3, map: "cave", rare: true });
    expect(def("path_thuat_1").objective).toMatchObject({ kind: "collect", item: "yeu_dan", qty: 4 });
    expect(def("path_thuat").objective).toMatchObject({ kind: "kill", count: 50, map: "cave" });
    expect(def("path_dan_1").objective).toMatchObject({ kind: "collect", item: "linh_thao", qty: 30 });
    expect(def("path_dan").objective).toMatchObject({ kind: "collect", item: "duong_huyet_dan", qty: 10 });
    const ids = ["kiem", "thuat", "dan"].flatMap((p) => [`path_${p}_1`, `path_${p}`]);
    expect(new Set(ids.map((id) => JSON.stringify(def(id).objective))).size).toBe(6);
  });

  it("the first step gives no path item and does not spend the path's one-time key; the second step needs the first", async () => {
    const first = def("path_dan_1");
    await acceptQuest(db, A, first.id, NOW);
    await give("linh_thao", 30);
    await give("hoi_huyet_dan", 5);
    expect(((await turnIn(first, false)) as { result: { status: string } }).result.status).toBe("done");
    expect(count("path_item_dan")).toBe(0);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_grants WHERE key = ?").get(pathItemKey(A, "dan"))).toEqual({ n: 0 });
    expect(questStatus(def("path_dan"), await loadQuestProgress(db, A))).toBe("available");
    expect(questStatus(def("path_dan"), {})).toBe("locked");
  });

  it("giving up an active quest removes its row, so it is as if never taken", async () => {
    await acceptQuest(db, A, "path_kiem_1", NOW);
    expect(await abandonQuest(db, A, "path_kiem_1")).toBe(true);
    expect(questRow("path_kiem_1")).toBeUndefined();
    expect(await abandonQuest(db, A, "path_kiem_1")).toBe(false);
    await acceptQuest(db, A, "path_kiem_1", NOW + 1); // can be taken again
    expect(questRow("path_kiem_1")?.state).toBe("active");
  });

  it("the kiếm quest is a kill quest: it needs 3 counted rare kills in the cave, then gives the Kiếm Tu Lệnh", async () => {
    const kiem = def("path_kiem");
    await acceptQuest(db, A, kiem.id, NOW);
    await saveQuestProgress(db, A, [{ id: kiem.id, progress: 2 }]);
    expect(((await turnIn(kiem, true)) as { result: { status: string } }).result.status).toBe("stale");
    expect(count("path_item_kiem")).toBe(0);
    await saveQuestProgress(db, A, [{ id: kiem.id, progress: 3 }]);
    expect(((await turnIn(kiem, true)) as { result: { status: string } }).result.status).toBe("done");
    expect(count("path_item_kiem")).toBe(1);
  });

  it("the stored definitions after migration 0023 are the ones in the seed", () => {
    const sql = readFileSync(new URL("../migrations/0023_path_quest_steps.sql", import.meta.url), "utf8");
    for (const q of EXTRA_QUESTS.filter((x) => x.path)) {
      const line = sql.split(String.fromCharCode(10)).find((x) => x.includes(`{"id":"${q.id}"`));
      expect(line, q.id).toBeDefined();
      const stored = JSON.parse(line!.slice(line!.indexOf("'{") + 1, line!.lastIndexOf("}'") + 1)) as { rewards: { congHien?: number } };
      delete stored.rewards.congHien; // migration 0063 takes the Cống Hiến reward out of the stored definitions
      expect(stored).toEqual(JSON.parse(JSON.stringify(q)));
    }
    expect(sql).toMatch(/UPDATE config_versions SET version = version \+ 1/);
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

  it("the stored daily quests after migration 0024 are the ones in the seed", () => {
    const sql = readFileSync(new URL("../migrations/0024_daily_quests.sql", import.meta.url), "utf8");
    for (const q of DAILY_QUESTS) {
      const line = sql.split(String.fromCharCode(10)).find((x) => x.includes(`{"id":"${q.id}"`));
      expect(line, q.id).toBeDefined();
      const stored = JSON.parse(line!.slice(line!.indexOf("'{") + 1, line!.lastIndexOf("}'") + 1)) as { rewards: { congHien?: number } };
      delete stored.rewards.congHien; // migration 0063 takes the Cống Hiến reward out of the stored definitions
      expect(stored).toEqual(JSON.parse(JSON.stringify(q)));
    }
    expect(sql).toMatch(/UPDATE config_versions SET version = version \+ 1/);
  });
});

describe("the breakthrough pill quests and the level they ask for", () => {
  it("migration 0031 turns the stored definitions into the seed's (stage 9 of the realm before)", () => {
    const sql = readFileSync(new URL("../migrations/0031_breakthrough_quest_levels.sql", import.meta.url), "utf8");
    const ids = ["breakthrough_1", "breakthrough_2", "breakthrough_3"];
    for (const id of ids) {
      // What the quest looked like before: the same without a stage (and breakthrough_1 without a minimum realm), and its old text.
      const { minStage: _s, ...old } = def(id) as QuestDef & { minStage?: number };
      const stored = id === "breakthrough_1" ? (({ minRealm: _r, ...rest }) => rest)(old) : old;
      raw.prepare("INSERT INTO quests (id, chain, seq, enabled, def, updated_at) VALUES (?, 'breakthrough', 1, 1, ?, 5)").run(id, JSON.stringify({ ...stored, descVi: "old text" }));
    }
    const before = (raw.prepare("SELECT version FROM config_versions WHERE name = 'quests'").get() as { version: number }).version;
    raw.exec(sql);
    for (const id of ids) {
      const row = raw.prepare("SELECT def FROM quests WHERE id = ?").get(id) as { def: string };
      expect(JSON.parse(row.def), id).toEqual(JSON.parse(JSON.stringify(def(id))));
    }
    expect((raw.prepare("SELECT version FROM config_versions WHERE name = 'quests'").get() as { version: number }).version).toBe(before + 1);
  });

  it("meetsQuestLevel: stage 9 of the realm before, or anything above", () => {
    const b1 = def("breakthrough_1");
    const b2 = def("breakthrough_2");
    const b3 = def("breakthrough_3");
    expect([b1, b2, b3].map((d) => [d.minRealm, d.minStage])).toEqual([[0, 9], [1, 9], [2, 9]]);
    expect(meetsQuestLevel(b1, 0, 8)).toBe(false);
    expect(meetsQuestLevel(b1, 0, 9)).toBe(true);
    expect(meetsQuestLevel(b2, 1, 8)).toBe(false);
    expect(meetsQuestLevel(b2, 1, 9)).toBe(true);
    expect(meetsQuestLevel(b2, 0, 9)).toBe(false);
    expect(meetsQuestLevel(b3, 2, 9)).toBe(true);
    expect(meetsQuestLevel(b3, 3, 1)).toBe(true);
    expect(meetsQuestLevel({}, 0, 1)).toBe(true);
  });
});

describe("Cống Hiến and daily quests", () => {
  const wallet = (cur: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = ?").get(A, cur) as { balance: number } | undefined)?.balance ?? 0;
  const DAY = 86_400_000;
  const T0 = 20_000 * DAY + 3 * 3_600_000; // 10:00 Vietnam time on some day

  it("a quest pays its Linh Thạch, counted in the quest totals (and no Cống Hiến)", async () => {
    const d = def("daily_herb");
    await acceptQuest(db, A, d.id, T0, true);
    await give("linh_thao", 10);
    const bag = await loadBag(db, A);
    const plan = planTurnIn(d, { items: bag.items, equipped: bag.equipped }, bag.tabs, character(), newId);
    if (!plan.ok) throw new Error("plan");
    const r = await commitTurnIn(db, A, d, plan, false, T0);
    expect(r).toMatchObject({ status: "done", balance: 100, congHien: null });
    expect(wallet("linh_thach")).toBe(100);
    expect(wallet("cong_hien")).toBe(0);
    expect(raw.prepare("SELECT total_in FROM linh_thach_totals WHERE character_id = ? AND grp = 'quest'").get(A)).toEqual({ total_in: 100 });
  });

  it("a Cống Hiến reward in an old definition pays nothing (it is the sect's now)", async () => {
    const q: QuestDef = { ...def("daily_herb"), id: "cong_only", rewards: { congHien: 5 } };
    raw.prepare("INSERT INTO character_quests (character_id, quest_id, state, progress, accepted_at) VALUES (?, 'cong_only', 'active', 0, 1)").run(A);
    await give("linh_thao", 10);
    const bag = await loadBag(db, A);
    const plan = planTurnIn(q, { items: bag.items, equipped: bag.equipped }, bag.tabs, character(), newId);
    if (!plan.ok) throw new Error("plan");
    const r = await commitTurnIn(db, A, q, plan, false, T0);
    expect(r).toMatchObject({ status: "done", balance: null, congHien: null });
    expect(wallet("cong_hien")).toBe(0);
  });

  it("a daily quest is open again the next Vietnam day, and its reward is one-time per day", async () => {
    const d = def("daily_herb");
    raw.prepare("INSERT INTO character_quests (character_id, quest_id, state, progress, accepted_at, done_at) VALUES (?, 'newbie_3', 'done', 1, 0, 0)").run(A);
    const finish = async (now: number) => {
      await acceptQuest(db, A, d.id, now, true);
      await give("linh_thao", 10);
      const bag = await loadBag(db, A);
      const plan = planTurnIn(d, { items: bag.items, equipped: bag.equipped }, bag.tabs, character(), newId);
      if (!plan.ok) throw new Error("plan");
      return commitTurnIn(db, A, d, plan, false, now);
    };
    expect((await finish(T0)).status).toBe("done");
    const rows = await loadQuestProgress(db, A);
    expect(questStatus(d, rows, T0 + 3_600_000)).toBe("done"); // later the same day
    expect(questStatus(d, rows, T0 + DAY)).toBe("available"); // the next day
    await expect(acceptQuest(db, A, d.id, T0 + 3_600_000, true)).rejects.toThrow(); // the same day: the finished row stays, so the insert fails
    expect((await finish(T0 + DAY)).status).toBe("done");
    expect(wallet("cong_hien")).toBe(0);
    expect(count("linh_thao")).toBe(0);
  });
});

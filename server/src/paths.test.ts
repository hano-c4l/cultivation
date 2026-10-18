import type { DatabaseSync } from "node:sqlite";
import { PATHS, SUB_PATH_COST, afterDrop, afterSwap, allPathSkills, pathDropCost, pathSwapCost, planAdd, serializePaths, type PathState } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { planTakePills } from "./breakthrough";
import { applyCurrencyDelta } from "./economy";
import { commitBagOps, loadBag, pruneGrants } from "./inventory";
import { commitPathBatch, commitPathChoice, levelUpStatements, rearrangeStatements } from "./paths";
import { makeDb } from "./test-db";

const A = "char-a";
let db: D1Database;
let raw: DatabaseSync;
let n = 0;

const none: PathState = { main: null, subs: [] };
const mainKiem: PathState = { main: "kiem", subs: [] };

const charPaths = () => (raw.prepare("SELECT paths FROM characters WHERE id = ?").get(A) as { paths: string }).paths;
const rows = () => raw.prepare("SELECT path_id, slot FROM character_paths WHERE character_id = ? ORDER BY slot").all(A) as Array<{ path_id: string; slot: number }>;
const skills = () => (raw.prepare("SELECT skill_id FROM character_skills WHERE character_id = ? AND source = 'path' ORDER BY skill_id").all(A) as Array<{ skill_id: string }>).map((r) => r.skill_id);
const items = (type: string) => (raw.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = ? AND item_type = ?").get(A, type) as { q: number }).q;
const balance = () => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(A) as { balance: number } | undefined)?.balance ?? 0;

async function give(type: string, qty = 1): Promise<void> {
  const bag = await loadBag(db, A);
  const ops = planAdd(bag.items, bag.tabs, type, qty, () => `it-${++n}`)!;
  expect(await commitBagOps(db, A, ops)).toBe("ok");
}
async function credit(amount: number): Promise<void> {
  await applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: amount, reason: "test", actor: "system", idempotencyKey: `c-${++n}` });
}
/** Chooses the way the room does: takes one item of the path from the bag the batch is planned on. */
async function choose(path: "kiem" | "thuat" | "dan", slot: number, before: PathState, after: PathState, cost = 0) {
  const bag = await loadBag(db, A);
  const ops = planTakePills(bag.items, PATHS[path].item, 1)!;
  return commitPathChoice(db, A, path, slot, before, after, ops, cost, 5000);
}

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, created_at, updated_at) VALUES ('char-a', 'acc-a', 'A', 'kim', 0, 0, 1, 0, 0)");
});

describe("taking up a path", () => {
  it("the chủ tu costs the item only: row, text, skills and item change together", async () => {
    await give(PATHS.kiem.item);
    const r = await choose("kiem", 0, none, mainKiem);
    expect(r).toEqual({ status: "ok", balance: null });
    expect(items(PATHS.kiem.item)).toBe(0);
    expect(rows()).toEqual([{ path_id: "kiem", slot: 0 }]);
    expect(charPaths()).toBe("kiem");
    expect(skills()).toEqual([...PATHS.kiem.levels[0]!.skills].sort());
  });

  it("a phụ tu also costs Linh Thạch, and short funds change nothing", async () => {
    await give(PATHS.kiem.item);
    await choose("kiem", 0, none, mainKiem);
    await give(PATHS.dan.item);
    await credit(SUB_PATH_COST[0]! - 1);
    expect(await choose("dan", 1, mainKiem, { main: "kiem", subs: ["dan"] }, SUB_PATH_COST[0]!)).toEqual({ status: "insufficient" });
    expect(items(PATHS.dan.item)).toBe(1);
    expect(balance()).toBe(SUB_PATH_COST[0]! - 1);
    expect(rows()).toHaveLength(1);
    expect(charPaths()).toBe("kiem");
    expect(skills()).toHaveLength(2);
    await credit(1);
    const ok = await choose("dan", 1, mainKiem, { main: "kiem", subs: ["dan"] }, SUB_PATH_COST[0]!);
    expect(ok).toEqual({ status: "ok", balance: 0 });
    expect(charPaths()).toBe("kiem:dan");
    expect(rows()).toHaveLength(2);
    expect(skills()).toHaveLength(4);
    expect(items(PATHS.dan.item)).toBe(0);
  });

  it("a second submit of the same choice changes nothing more (the room's picture is stale)", async () => {
    await give(PATHS.kiem.item, 2);
    const bag = await loadBag(db, A);
    const ops1 = planTakePills(bag.items, PATHS.kiem.item, 1)!;
    const ops2 = planTakePills(bag.items, PATHS.kiem.item, 1)!; // planned on the same bag, like a double click
    expect((await commitPathChoice(db, A, "kiem", 0, none, mainKiem, ops1, 0, 5000)).status).toBe("ok");
    expect((await commitPathChoice(db, A, "kiem", 0, none, mainKiem, ops2, 0, 5000)).status).toBe("stale");
    expect(items(PATHS.kiem.item)).toBe(1);
    expect(rows()).toHaveLength(1);
  });

  it("the same path again is refused even with a current picture", async () => {
    await give(PATHS.kiem.item, 2);
    await choose("kiem", 0, none, mainKiem);
    // A caller that believed the character has no sub paths yet and tries kiem again as a phụ tu: the unique key rejects it.
    const r = await choose("kiem", 1, mainKiem, { main: "kiem", subs: ["kiem"] }, 0);
    expect(r.status).toBe("duplicate");
    expect(items(PATHS.kiem.item)).toBe(1);
    expect(rows()).toHaveLength(1);
    expect(charPaths()).toBe("kiem");
  });

  it("a third phụ tu (slot 3) is refused and changes nothing", async () => {
    await give(PATHS.kiem.item);
    await choose("kiem", 0, none, mainKiem);
    await give(PATHS.dan.item);
    await give(PATHS.thuat.item);
    await credit(1_000_000);
    await choose("dan", 1, mainKiem, { main: "kiem", subs: ["dan"] }, SUB_PATH_COST[0]!);
    await choose("thuat", 2, { main: "kiem", subs: ["dan"] }, { main: "kiem", subs: ["dan", "thuat"] }, SUB_PATH_COST[1]!);
    expect(rows()).toHaveLength(3);
    // There is no fourth path to give, so ask for a fourth slot with an existing item.
    await give(PATHS.kiem.item);
    await expect(choose("kiem", 3, { main: "kiem", subs: ["dan", "thuat"] }, { main: "kiem", subs: ["dan", "thuat", "x" as never] })).rejects.toThrow();
    expect(rows()).toHaveLength(3);
    expect(serializePaths({ main: "kiem", subs: ["dan", "thuat"] })).toBe(charPaths());
    expect(items(PATHS.kiem.item)).toBe(1);
  });

  it("an item that was spent elsewhere rolls everything back", async () => {
    await give(PATHS.kiem.item);
    const bag = await loadBag(db, A);
    const ops = planTakePills(bag.items, PATHS.kiem.item, 1)!;
    raw.exec(`DELETE FROM item_instances WHERE item_type = '${PATHS.kiem.item}'`);
    await expect(commitPathChoice(db, A, "kiem", 0, none, mainKiem, ops, 0, 5000)).resolves.toEqual({ status: "stale" });
    expect(rows()).toHaveLength(0);
    expect(charPaths()).toBe("");
    expect(skills()).toHaveLength(0);
  });
});

describe("one-time path item keys", () => {
  it("housekeeping drops old loot keys but never a path item key", async () => {
    raw.exec("INSERT INTO item_grants (key, created_at) VALUES ('loot:old', 0), ('path_item:char-a:kiem', 0), ('death:old', 0)");
    await pruneGrants(db, 10 * 86_400_000);
    const keys = (raw.prepare("SELECT key FROM item_grants ORDER BY key").all() as Array<{ key: string }>).map((r) => r.key);
    expect(keys).toEqual(["path_item:char-a:kiem"]);
  });
});

describe("changing, dropping and levelling paths", () => {
  const full: PathState = { main: "kiem", subs: ["dan", "thuat"] };
  /** A character with the three paths taken, the rows written the way choosing writes them. */
  async function withThree(): Promise<void> {
    for (const [i, p] of (["kiem", "dan", "thuat"] as const).entries()) {
      raw.exec(`INSERT INTO character_paths (character_id, path_id, slot, level, chosen_at) VALUES ('${A}', '${p}', ${i}, 0, 1)`);
      for (const sk of PATHS[p].levels[0]!.skills) raw.exec(`INSERT INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES ('${A}', '${sk}', 1, 'path', 1)`);
    }
    raw.exec(`UPDATE characters SET paths = '${serializePaths(full)}' WHERE id = '${A}'`);
    raw.exec(`INSERT INTO item_grants (key, created_at) VALUES ('path_item:${A}:dan', 1)`);
  }

  it("swapping rewrites the rows in their new slots, for Linh Thạch, in one batch", async () => {
    await withThree();
    await credit(1_000_000);
    const after = afterSwap(full, "thuat")!;
    const cost = pathSwapCost(full, "thuat");
    const r = await commitPathBatch(db, A, rearrangeStatements(db, A, full, after, { now: 9 }), cost, "swap-1", "path_swap");
    expect(r).toEqual({ status: "ok", balance: 1_000_000 - cost });
    expect(rows()).toEqual([{ path_id: "thuat", slot: 0 }, { path_id: "dan", slot: 1 }, { path_id: "kiem", slot: 2 }]);
    expect(charPaths()).toBe("thuat:dan:kiem");
    expect(skills()).toHaveLength(6); // nothing lost
  });

  it("short funds change nothing", async () => {
    await withThree();
    await credit(10);
    const after = afterSwap(full, "thuat")!;
    const r = await commitPathBatch(db, A, rearrangeStatements(db, A, full, after, { now: 9 }), pathSwapCost(full, "thuat"), "swap-2", "path_swap");
    expect(r.status).toBe("insufficient");
    expect(rows().map((x) => x.path_id)).toEqual(["kiem", "dan", "thuat"]);
    expect(charPaths()).toBe("kiem:dan:thuat");
  });

  it("dropping takes the path, its skills and its item key, and clears them from the hotbar", async () => {
    await withThree();
    await credit(1_000_000);
    raw.exec(`UPDATE characters SET hotbar = '["s:dt_hoi_xuan","s:chuong_0","","","","","",""]' WHERE id = '${A}'`);
    const after = afterDrop(full, "dan")!;
    const cost = pathDropCost(full, "dan");
    const hotbar = ["", "s:chuong_0", "", "", "", "", "", ""];
    const r = await commitPathBatch(db, A, rearrangeStatements(db, A, full, after, { dropped: "dan", hotbar, now: 9 }), cost, "drop-1", "path_drop");
    expect(r.status).toBe("ok");
    expect(rows()).toEqual([{ path_id: "kiem", slot: 0 }, { path_id: "thuat", slot: 1 }]);
    expect(charPaths()).toBe("kiem:thuat");
    expect(skills().some((sk) => allPathSkills("dan").includes(sk))).toBe(false);
    expect(skills()).toHaveLength(4);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_grants WHERE key = ?").get(`path_item:${A}:dan`)).toEqual({ n: 0 });
    expect((raw.prepare("SELECT hotbar FROM characters WHERE id = ?").get(A) as { hotbar: string }).hotbar).toBe(JSON.stringify(hotbar));
    expect(balance()).toBe(1_000_000 - cost);
  });

  it("a stale picture (the paths changed meanwhile) changes nothing and costs nothing", async () => {
    await withThree();
    await credit(1_000_000);
    const after = afterDrop(full, "dan")!;
    raw.exec(`UPDATE characters SET paths = 'kiem:thuat' WHERE id = '${A}'`); // another change landed first
    const r = await commitPathBatch(db, A, rearrangeStatements(db, A, full, after, { dropped: "dan", now: 9 }), 5000, "drop-2", "path_drop");
    expect(r.status).toBe("stale");
    expect(balance()).toBe(1_000_000);
    expect(rows()).toHaveLength(3);
    expect(skills()).toHaveLength(6);
  });

  it("a level up grants the two skills of the next level once, and is guarded on the level it was at", async () => {
    await withThree();
    const after: PathState = { ...full, levels: { kiem: 1 } };
    const r = await commitPathBatch(db, A, levelUpStatements(db, A, "kiem", 0, full, after, 9), 0, "lv-1");
    expect(r.status).toBe("ok");
    expect(charPaths()).toBe("kiem.1:dan:thuat");
    expect((raw.prepare("SELECT level FROM character_paths WHERE character_id = ? AND path_id = 'kiem'").get(A) as { level: number }).level).toBe(1);
    for (const sk of PATHS.kiem.levels[1]!.skills) expect(skills()).toContain(sk);
    // The same level up again (a second trigger) finds the level already moved.
    const again = await commitPathBatch(db, A, levelUpStatements(db, A, "kiem", 0, full, after, 10), 0, "lv-2");
    expect(again.status).toBe("stale");
    expect(skills()).toHaveLength(8);
  });
});

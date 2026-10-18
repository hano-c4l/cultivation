import type { DatabaseSync } from "node:sqlite";
import { parseHotbar, planAdd, planRemove } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getCharacterById, loadLearnedSkills, saveCharacterPosition, saveHotbar } from "./characters";
import { commitBagOps, loadBag } from "./inventory";
import { makeDb } from "./test-db";

const A = "char-a";
let db: D1Database;
let raw: DatabaseSync;
let n = 0;
const newId = () => `sk-${++n}`;

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('char-a', 'acc-a', 'A', 'kim', 0, 0, 0, 0)");
});

const BOOK = "bt_cuong_than";
const learnStatement = () => db.prepare("INSERT INTO character_skills (character_id, skill_id, learned_at) VALUES (?, ?, ?)").bind(A, "cuong_than", 1);

async function giveBook(): Promise<void> {
  const bag = await loadBag(db, A);
  expect(await commitBagOps(db, A, planAdd(bag.items, bag.tabs, BOOK, 1, newId)!)).toBe("ok");
}

/** What the room does when a book is read: remove one and store the skill in the same batch. */
async function read(): Promise<string> {
  const bag = await loadBag(db, A);
  const ops = planRemove(bag.items, bag.tabs, { tab: 0, cell: 0 }, 1)!;
  return commitBagOps(db, A, ops, { extra: [learnStatement()] });
}

describe("learning a skill from a bí tịch", () => {
  it("consumes the book and stores the skill in one batch", async () => {
    await giveBook();
    expect(await read()).toBe("ok");
    expect((await loadBag(db, A)).items).toEqual([]);
    expect(await loadLearnedSkills(db, A)).toEqual(["cuong_than"]);
  });

  it("a skill already known rolls the whole batch back: the book is not consumed", async () => {
    await giveBook();
    raw.exec("INSERT INTO character_skills (character_id, skill_id, learned_at) VALUES ('char-a', 'cuong_than', 0)");
    expect(await read()).toBe("duplicate");
    expect((await loadBag(db, A)).items).toHaveLength(1);
    expect(await loadLearnedSkills(db, A)).toEqual(["cuong_than"]);
  });

  it("an item that is gone makes the batch stale and learns nothing", async () => {
    await giveBook();
    const bag = await loadBag(db, A);
    const ops = planRemove(bag.items, bag.tabs, { tab: 0, cell: 0 }, 1)!;
    raw.exec("DELETE FROM item_instances");
    expect(await commitBagOps(db, A, ops, { extra: [learnStatement()] })).toBe("stale");
    expect(await loadLearnedSkills(db, A)).toEqual([]);
  });
});

describe("hotbar", () => {
  it("starts empty, saves as one row and reads back", async () => {
    expect(parseHotbar((await getCharacterById(db, A))!.hotbar)).toEqual(Array(8).fill(""));
    const slots = ["s:kim_1", "", "i:hoi_huyet_dan", "", "", "", "", ""];
    await saveHotbar(db, A, slots);
    expect(parseHotbar((await getCharacterById(db, A))!.hotbar)).toEqual(slots);
  });
});

describe("vitals stored with the position", () => {
  const vitalsOf = async () => (await getCharacterById(db, A))!.vitals;

  it("are written in the same update as the position, cleared with null and left alone when undefined", async () => {
    expect(await vitalsOf()).toBeNull();
    await saveCharacterPosition(db, A, "forest", 3.5, 4.5, undefined, JSON.stringify({ hp: 50, mp: 5, at: 1 }));
    expect(JSON.parse((await vitalsOf())!)).toMatchObject({ hp: 50, mp: 5 });
    await saveCharacterPosition(db, A, "forest", 5.5, 4.5); // undefined: untouched
    expect(JSON.parse((await vitalsOf())!)).toMatchObject({ hp: 50 });
    await saveCharacterPosition(db, A, "forest", 5.5, 4.5, { stage: 2, exp: 7, addPoints: 0 }, JSON.stringify({ hp: 20, mp: 1, at: 2 }));
    const row = (await getCharacterById(db, A))!;
    expect(JSON.parse(row.vitals!)).toMatchObject({ hp: 20 });
    expect(row.stage).toBe(2);
    await saveCharacterPosition(db, A, "town", 20.5, 20.5, undefined, null); // respawn: fresh
    expect(await vitalsOf()).toBeNull();
  });
});

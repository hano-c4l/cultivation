import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_TUNING, ITEMS, getItemDef, setItemOverlays } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { deleteItem, listItems, saveItem } from "./items-admin";
import { getAlchemyAdmin, saveAlchemy } from "./alchemy-admin";
import { listLoot, saveLoot } from "./monsters-admin";
import { getItemOverlays, resetItemsCache } from "./items-live";
import { saveQuest } from "./quests-admin";
import { resetQuestCache } from "./quests";
import { resetNpcsCache } from "./npcs";
import { resetTuningCache } from "./tuning";
import { claimGiftMail, sendGift } from "./gifts";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db, raw } = makeDb());
  setItemOverlays([]);
  resetItemsCache();
  resetTuningCache();
  resetQuestCache();
  resetNpcsCache();
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('char', 'acc', 'A', 'kim', 0, 0, 0, 0)");
});

const n = (sql: string, ...args: unknown[]) => (raw.prepare(sql).get(...(args as never[])) as { n: number }).n;
const item = (over: Record<string, unknown> = {}) => ({ id: "su_kien_dan", nameVi: "Sự Kiện Đan", descVi: "Đan thử.", category: "consumable", maxStack: 50, rarity: "rare", grade: 2, healFraction: 0.5, ...over });
const find = async (id: string) => (await listItems(db)).items.find((i) => i.def.id === id);
const vtoken = async () => (await listItems(db)).valueToken;
const own = (id: string, qty: number) => raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('inst-${id}-${qty}', 'char', '${id}', ${qty}, 0, ${qty}, 0)`);

describe("saving an item", () => {
  it("lists the catalogue as the code has it, with no rows", async () => {
    const list = await listItems(db);
    expect(list.items.length).toBe(Object.keys(ITEMS).length);
    expect(list.items.every((i) => !i.custom && !i.disabled && i.updatedAt === 0)).toBe(true);
    expect(list.items.find((i) => i.def.id === "ngo_dao_dan")!.value).toBe(1500);
  });

  it("creates an item the game then serves, with its sell value, and logs it", async () => {
    const res = await saveItem(db, ADMIN, item(), true, 0, 250, await vtoken());
    expect(res).toMatchObject({ ok: true });
    resetItemsCache();
    await getItemOverlays(db);
    expect(getItemDef("su_kien_dan")).toMatchObject({ nameVi: "Sự Kiện Đan", healFraction: 0.5 });
    expect((await find("su_kien_dan"))!).toMatchObject({ custom: true, value: 250, disabled: false });
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!.content).toContain("Thêm vật phẩm");
    expect(n("SELECT version AS n FROM config_versions WHERE name = 'items'")).toBe(2);
  });

  it("changes the name of an item of the code and nothing else about it", async () => {
    const base = ITEMS.hoi_huyet_dan!;
    const res = await saveItem(db, ADMIN, { id: "hoi_huyet_dan", nameVi: "Hồi Máu Đan", descVi: base.descVi, rarity: base.rarity, grade: base.grade, category: "material", maxStack: 1, healFraction: 1 }, false, 0, undefined, 0);
    expect(res).toMatchObject({ ok: true, changed: ["tên"] });
    resetItemsCache();
    await getItemOverlays(db);
    expect(getItemDef("hoi_huyet_dan")).toMatchObject({ nameVi: "Hồi Máu Đan", category: "consumable", maxStack: base.maxStack, healFraction: base.healFraction });
    expect(JSON.parse((raw.prepare("SELECT def FROM items WHERE id = 'hoi_huyet_dan'").get() as { def: string }).def)).toEqual({ nameVi: "Hồi Máu Đan" });
  });

  it("changes only the value of an item of the code without making a row", async () => {
    const before = n("SELECT version AS n FROM config_versions WHERE name = 'items'");
    const base = ITEMS.hoi_huyet_dan!;
    const res = await saveItem(db, ADMIN, { ...item(), id: "hoi_huyet_dan", nameVi: base.nameVi, descVi: base.descVi, rarity: base.rarity, grade: base.grade }, false, 0, 77, await vtoken());
    expect(res).toMatchObject({ ok: true, changed: ["giá trị"] });
    expect(n("SELECT COUNT(*) AS n FROM items")).toBe(0);
    expect(n("SELECT version AS n FROM config_versions WHERE name = 'items'")).toBe(before);
    expect((await find("hoi_huyet_dan"))!.value).toBe(77);
  });

  it("refuses a stale token, and a stale value token, without changing anything", async () => {
    await saveItem(db, ADMIN, item(), true, 0, undefined, 0);
    const token = (await find("su_kien_dan"))!.updatedAt;
    expect(await saveItem(db, ADMIN, item({ nameVi: "Tên mới" }), false, token, undefined, 0, token + 10)).toMatchObject({ ok: true });
    expect(await saveItem(db, ADMIN, item({ nameVi: "Tên khác" }), false, token, undefined, 0, token + 20)).toEqual({ ok: false, error: "version_conflict" });
    expect((await find("su_kien_dan"))!.def.nameVi).toBe("Tên mới");
    const t = (await find("su_kien_dan"))!.updatedAt;
    expect(await saveItem(db, ADMIN, item({ nameVi: "Tên mới" }), false, t, 5, 12345)).toEqual({ ok: false, error: "version_conflict" });
    expect(await saveItem(db, ADMIN, item({ nameVi: "Tên mới" }), false, t, undefined, 0)).toEqual({ ok: false, error: "unchanged" });
  });

  it("refuses bad input, an id of the code, equipment and an id someone still owns", async () => {
    for (const bad of [item({ nameVi: "   " }), item({ category: "equipment" }), item({ category: "skill_book" }), item({ maxStack: 0 }), item({ healFraction: 3 }), item({ id: "Bad Id" }), item({ id: "eq.weapon.1" })]) {
      expect(await saveItem(db, ADMIN, bad, true, 0, undefined, 0), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
    expect(await saveItem(db, ADMIN, item({ id: "hoi_huyet_dan" }), true, 0, undefined, 0)).toEqual({ ok: false, error: "exists" });
    own("old_item", 3);
    expect(await saveItem(db, ADMIN, item({ id: "old_item" }), true, 0, undefined, 0)).toEqual({ ok: false, error: "has_owner" });
    expect(n("SELECT COUNT(*) AS n FROM items")).toBe(0);
    expect(await saveItem(db, ADMIN, item(), false, 0, undefined, 0)).toEqual({ ok: false, error: "not_found" });
  });

  it("locks the category and a stack size below what someone holds once the item is owned", async () => {
    await saveItem(db, ADMIN, item(), true, 0, undefined, 0);
    own("su_kien_dan", 40);
    const token = (await find("su_kien_dan"))!.updatedAt;
    expect(await saveItem(db, ADMIN, item({ category: "material", healFraction: undefined }), false, token, undefined, 0)).toEqual({ ok: false, error: "locked_field", problems: ["category"] });
    expect(await saveItem(db, ADMIN, item({ maxStack: 30 }), false, token, undefined, 0)).toEqual({ ok: false, error: "locked_field", problems: ["maxStack"] });
    expect(await saveItem(db, ADMIN, item({ maxStack: 99 }), false, token, undefined, 0, token + 5)).toMatchObject({ ok: true });
  });
});

describe("deleting an item", () => {
  const make = async () => {
    await saveItem(db, ADMIN, item(), true, 0, undefined, 0);
    return (await find("su_kien_dan"))!.updatedAt;
  };

  it("never deletes an item of the code", async () => {
    expect(await deleteItem(db, ADMIN, "hoi_huyet_dan", 0)).toMatchObject({ ok: false, error: "bound" });
  });

  it("removes an item nobody owns and nothing names, leaving no row", async () => {
    const token = await make();
    expect(await deleteItem(db, ADMIN, "su_kien_dan", token)).toEqual({ ok: true, mode: "hard" });
    expect(n("SELECT COUNT(*) AS n FROM items")).toBe(0);
    expect(await find("su_kien_dan")).toBeUndefined();
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams({ q: "Xóa cứng" })))).total).toBe(1);
  });

  it("only takes it out of play when a character owns it, then it is read-only but still resolves", async () => {
    const token = await make();
    own("su_kien_dan", 2);
    expect(await deleteItem(db, ADMIN, "su_kien_dan", token)).toEqual({ ok: true, mode: "soft" });
    const gone = (await find("su_kien_dan"))!;
    expect(gone.disabled).toBe(true);
    expect(getItemDef("su_kien_dan")!.disabled).toBe(true);
    expect(await saveItem(db, ADMIN, item({ nameVi: "Khác" }), false, gone.updatedAt, undefined, 0)).toEqual({ ok: false, error: "deleted" });
    expect(await deleteItem(db, ADMIN, "su_kien_dan", gone.updatedAt)).toEqual({ ok: false, error: "deleted" });
  });

  it("counts a gift mail nobody claimed as an owner", async () => {
    const token = await make();
    await getItemOverlays(db);
    expect(await sendGift(db, ADMIN, "admin-acc", { batchId: "giftbatch1", subject: "Quà", body: "", audience: { kind: "all" }, gift: { items: [{ type: "su_kien_dan", qty: 1 }] }, expiresInDays: null })).toMatchObject({ ok: true });
    expect((await find("su_kien_dan"))!.gifts).toBe(1);
    expect(await deleteItem(db, ADMIN, "su_kien_dan", token)).toEqual({ ok: true, mode: "soft" });
    // The gift that was pending can still be claimed: the item left play, the gift was promised before.
    const claim = await claimGiftMail(db, "char", `giftbatch1:char`, { tabs: 1, items: [], equipped: [] });
    expect(claim.status).toBe("claimed");
    expect(n("SELECT COUNT(*) AS n FROM item_instances WHERE item_type = 'su_kien_dan' AND owner_character_id = 'char'")).toBe(1);
  });

  it("keeps the stack size above the largest pending gift, and takes the sell value away with a hard delete", async () => {
    await saveItem(db, ADMIN, item(), true, 0, 90, await vtoken());
    await getItemOverlays(db);
    await sendGift(db, ADMIN, "admin-acc", { batchId: "giftbatch2", subject: "Quà", body: "", audience: { kind: "all" }, gift: { items: [{ type: "su_kien_dan", qty: 40 }] }, expiresInDays: null });
    const token = (await find("su_kien_dan"))!.updatedAt;
    expect(await saveItem(db, ADMIN, item({ maxStack: 30 }), false, token, undefined, 0)).toEqual({ ok: false, error: "locked_field", problems: ["maxStack"] });
    raw.exec("DELETE FROM mailbox");
    expect(await deleteItem(db, ADMIN, "su_kien_dan", token)).toEqual({ ok: true, mode: "hard" });
    expect((await listItems(db)).items.some((i) => i.value === 90 && i.def.id === "su_kien_dan")).toBe(false);
    expect(JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = 'itemValue'").get() as { value: string }).value).items.su_kien_dan).toBeUndefined();
  });

  it("is refused while a quest or a merchant still names it, with where", async () => {
    const token = await make();
    await getItemOverlays(db);
    const quest = { id: "qa_item", chain: "qa", seq: 1, giver: "elder", titleVi: "Thử", descVi: "Thử vật phẩm.", enabled: true, requires: null, objective: { kind: "kill", count: 1 }, rewards: { items: [{ item: "su_kien_dan", qty: 1 }] } };
    expect(await saveQuest(db, ADMIN, quest, true, 0)).toMatchObject({ ok: true });
    const refused = await deleteItem(db, ADMIN, "su_kien_dan", token);
    expect(refused).toMatchObject({ ok: false, error: "in_use" });
    expect(refused.ok === false && refused.problems?.[0]).toContain("qa_item");
    raw.exec(`INSERT INTO shop_stock (npc_id, rule_id, sort, def, enabled) VALUES ('merchant', 'r1', 99, '{"id":"r1","kind":"item","item":"su_kien_dan"}', 1)`);
    expect((await deleteItem(db, ADMIN, "su_kien_dan", token)) as { problems: string[] }).toMatchObject({ problems: expect.arrayContaining([expect.stringContaining("merchant")]) });
    expect(await find("su_kien_dan")).toBeDefined();
  });

  it("is refused while a loot table drops it, with where", async () => {
    const token = await make();
    await getItemOverlays(db);
    const loot = JSON.parse(JSON.stringify(DEFAULT_TUNING.loot)) as typeof DEFAULT_TUNING.loot;
    loot.base.rare1.push({ item: "su_kien_dan", chance: 0.1, min: 1, max: 1 });
    const t = (await listLoot(db)).token;
    expect(await saveLoot(db, ADMIN, loot, t, Date.now() + 5)).toMatchObject({ ok: true });
    const refused = await deleteItem(db, ADMIN, "su_kien_dan", token);
    expect(refused).toMatchObject({ ok: false, error: "in_use" });
    expect(refused.ok === false && refused.problems?.[0]).toContain("Bảng rơi");
  });

  it("is refused while an alchemist recipe makes it or uses it, with which recipe", async () => {
    const token = await make();
    await getItemOverlays(db);
    const view = await getAlchemyAdmin(db);
    const recipe = { id: "su_kien", nameVi: "Luyện Sự Kiện", output: "su_kien_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 2 }], linhThach: 10, seconds: 5, enabled: true };
    expect(await saveAlchemy(db, ADMIN, { ...view.alchemy, recipes: [...view.alchemy.recipes, recipe] }, view.updatedAt, Date.now() + 5)).toMatchObject({ ok: true });
    const refused = await deleteItem(db, ADMIN, "su_kien_dan", token);
    expect(refused).toMatchObject({ ok: false, error: "in_use" });
    expect(refused.ok === false && refused.problems?.[0]).toContain("Công thức luyện đan");
  });

  it("is only taken out of play (soft) while a brewing of it waits to be collected, and the recipe check ignores other broken recipes", async () => {
    const token = await make();
    raw.exec("INSERT INTO brew_jobs (id, character_id, npc_id, recipe_id, item, qty, started_at, ready_at, collected_at) VALUES ('j1', 'char', 'alchemist', 'old', 'su_kien_dan', 1, 0, 0, NULL)");
    expect(await deleteItem(db, ADMIN, "su_kien_dan", token)).toMatchObject({ ok: true, mode: "soft" });
    expect((await find("su_kien_dan"))!.disabled).toBe(true);
    // The item is out of play now, but a recipe that does not name it can still be saved: only new or changed recipes are checked.
    await getItemOverlays(db);
    const view = await getAlchemyAdmin(db);
    const broken = { ...view.alchemy, recipes: [{ id: "dead", nameVi: "Cũ", output: "su_kien_dan", qty: 1, inputs: [{ item: "linh_thao", qty: 1 }], linhThach: 0, seconds: 1, enabled: true }] };
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'alchemy'").run(JSON.stringify(broken));
    const edited = { ...broken, maxJobs: 4 };
    expect(await saveAlchemy(db, ADMIN, edited, view.updatedAt, Date.now() + 9)).toMatchObject({ ok: true });
    expect(await saveAlchemy(db, ADMIN, { ...edited, recipes: [{ ...edited.recipes[0]!, qty: 2 }] }, (await getAlchemyAdmin(db)).updatedAt, Date.now() + 99)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("a quest cannot be given a deleted item as a reward", async () => {
    const token = await make();
    own("su_kien_dan", 1);
    await deleteItem(db, ADMIN, "su_kien_dan", token);
    await getItemOverlays(db);
    const quest = { id: "qa_dead", chain: "qa", seq: 1, giver: "elder", titleVi: "Thử", descVi: "Thử.", enabled: true, requires: null, objective: { kind: "kill", count: 1 }, rewards: { items: [{ item: "su_kien_dan", qty: 1 }] } };
    expect(await saveQuest(db, ADMIN, quest, true, 0)).toMatchObject({ ok: false, error: "invalid" });
  });
});

import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { REALMS, SKILLS, setItemOverlays } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { REVIEW_MS, addItem, addEquipment, addSkill, adjustMoney, deleteCharacter, editConstitution, editProfile, editStats, endReview, getCharacterView, removeItem, removeSkill, startReview } from "./characters-admin";
import { getConstitutionCatalog } from "./constitution-catalog";
import { realmBoard } from "./leaderboard";
import { resetItemsCache } from "./items-live";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
let kicks: string[];
const A = "admin@x.test";
const B = "other@x.test";
const NOW = 1_000_000;
const kicker = async (_account: string, character: string) => {
  kicks.push(character);
  return true;
};
const logs = async () => (await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows.map((r) => r.content);
const skill = SKILLS[0]!;

beforeEach(() => {
  ({ db, raw } = makeDb());
  setItemOverlays([]);
  resetItemsCache();
  kicks = [];
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'p@x.test', 'h', 's', 1, 0)");
  raw.prepare("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at, hotbar) VALUES ('c1', 'a1', 'Lan Tu', 'kim', 0, 0, 0, 0, ?)").run(JSON.stringify([`s:${skill.id}`, ""]));
  raw.exec("INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES ('t1', 'a1', 9999999999999, 1)");
  raw.exec("INSERT INTO currency_balances (character_id, currency, balance) VALUES ('c1', 'linh_thach', 100)");
});

const stats = { canCot: 5, thanPhap: 5, ngoTinh: 5, linhLuc: 5, thanThuc: 5, phucDuyen: 5 };

describe("a character under review", () => {
  it("refuses every change until the admin starts a review, and starting it ends the sessions and kicks", async () => {
    expect(await editStats(db, A, "c1", { realm: 1, stage: 2, exp: 0, potentialPoints: 0, stats }, REALMS.length, NOW)).toEqual({ ok: false, error: "not_reviewing" });
    expect(await adjustMoney(db, A, "c1", "linh_thach", 5, NOW)).toEqual({ ok: false, error: "not_reviewing" });
    expect(await addItem(db, A, "c1", "linh_thao", 1, NOW)).toEqual({ ok: false, error: "not_reviewing" });
    expect(await addSkill(db, A, "c1", skill.id, NOW)).toEqual({ ok: false, error: "not_reviewing" });
    expect(await startReview(db, A, "c1", kicker, NOW)).toEqual({ ok: true, kicked: true });
    expect(kicks).toEqual(["c1"]);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    const v = (await getCharacterView(db, "c1", NOW + 1))!;
    expect(v.review).toEqual({ by: A, until: NOW + REVIEW_MS });
  });

  it("is held by one admin at a time, runs out after 30 minutes, and refuses a change after that", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    expect(await startReview(db, B, "c1", kicker, NOW + 1000)).toEqual({ ok: false, error: "reviewed_by_other" });
    expect(await adjustMoney(db, B, "c1", "linh_thach", 5, NOW + 1000)).toEqual({ ok: false, error: "not_reviewing" });
    const late = NOW + REVIEW_MS + 1;
    expect(await adjustMoney(db, A, "c1", "linh_thach", 5, late)).toEqual({ ok: false, error: "not_reviewing" });
    expect((await getCharacterView(db, "c1", late))!.review).toBeNull();
    expect(await startReview(db, B, "c1", kicker, late)).toMatchObject({ ok: true }); // the old review had run out
  });

  it("edits the sheet and logs what changed; refuses bad numbers and no-ops", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    const next = { realm: 1, stage: 3, exp: 50, potentialPoints: 9, stats: { ...stats, canCot: 40 } };
    expect(await editStats(db, A, "c1", next, REALMS.length, NOW)).toEqual({ ok: true });
    const v = (await getCharacterView(db, "c1", NOW))!;
    expect(v).toMatchObject({ realm: 1, stage: 3, exp: 50, potentialPoints: 9, stats: { canCot: 40 } });
    expect((await logs())[0]).toContain("cảnh giới 0-1 → 1-3");
    expect(await editStats(db, A, "c1", next, REALMS.length, NOW)).toEqual({ ok: false, error: "unchanged" });
    expect(await editStats(db, A, "c1", { ...next, realm: 9 }, REALMS.length, NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await editStats(db, A, "c1", { ...next, stage: 10 }, REALMS.length, NOW)).toEqual({ ok: false, error: "invalid" });
  });

  it("moves money through the currency statements (totals, admin group, this admin as the actor) and never below zero", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    expect(await adjustMoney(db, A, "c1", "linh_thach", 400, NOW)).toEqual({ ok: true });
    expect((await getCharacterView(db, "c1", NOW))!.wallet.linh_thach).toBe(500);
    expect(raw.prepare("SELECT total_in FROM linh_thach_totals WHERE character_id = 'c1' AND grp = 'admin'").get()).toEqual({ total_in: 400 });
    expect(raw.prepare("SELECT actor FROM linh_thach_ledger WHERE character_id = 'c1'").get()).toEqual({ actor: A });
    expect(await adjustMoney(db, A, "c1", "linh_thach", -9999, NOW)).toEqual({ ok: false, error: "funds" });
    expect(await adjustMoney(db, A, "c1", "linh_thach", 0, NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await adjustMoney(db, A, "c1", "gold", 5, NOW)).toEqual({ ok: false, error: "invalid" });
    expect(await adjustMoney(db, A, "c1", "tien_ngoc", 3, NOW)).toEqual({ ok: true });
  });

  it("adds items to the bag and takes a stack out; equipment and unknown items are refused", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    expect(await addItem(db, A, "c1", "linh_thao", 120, NOW)).toEqual({ ok: true });
    const v = (await getCharacterView(db, "c1", NOW))!;
    expect(v.items.reduce((n, i) => n + i.qty, 0)).toBe(120);
    expect(v.items.length).toBe(2); // 99 + 21
    expect(await addItem(db, A, "c1", "no_such_item", 1, NOW)).toEqual({ ok: false, error: "unknown_item" });
    expect(await addItem(db, A, "c1", "eq.hat.m.0.1.1.kim", 1, NOW)).toEqual({ ok: false, error: "unknown_item" });
    expect(await removeItem(db, A, "c1", v.items[0]!.id, NOW)).toEqual({ ok: true });
    expect((await getCharacterView(db, "c1", NOW))!.items.length).toBe(1);
    expect(await removeItem(db, A, "c1", "nope", NOW)).toEqual({ ok: false, error: "not_found" });
  });

  it("adds an item an admin created (not in the code)", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    raw.prepare("INSERT INTO items (id, custom, disabled, def, updated_at) VALUES ('su_kien', 1, 0, ?, 1)").run(JSON.stringify({ id: "su_kien", nameVi: "Sự Kiện", descVi: "x", category: "consumable", maxStack: 10, rarity: "rare", grade: 2, healFraction: 0.5 }));
    expect(await addItem(db, A, "c1", "su_kien", 2, NOW)).toEqual({ ok: true });
  });

  it("adds a skill once, removes it, and clears it from the hotbar", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    expect(await addSkill(db, A, "c1", skill.id, NOW)).toEqual({ ok: true });
    expect(await addSkill(db, A, "c1", skill.id, NOW)).toEqual({ ok: false, error: "unchanged" });
    expect(await addSkill(db, A, "c1", "no_such_skill", NOW)).toEqual({ ok: false, error: "invalid" });
    expect((await getCharacterView(db, "c1", NOW))!.skills.map((s) => s.id)).toEqual([skill.id]);
    expect(await removeSkill(db, A, "c1", skill.id, NOW)).toEqual({ ok: true });
    expect(JSON.parse((raw.prepare("SELECT hotbar FROM characters WHERE id = 'c1'").get() as { hotbar: string }).hotbar)).toEqual(["", ""]);
    expect(await removeSkill(db, A, "c1", skill.id, NOW)).toEqual({ ok: false, error: "not_found" });
  });

  it("ends the review: changes stop, ending twice is a no-op", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    expect(await endReview(db, A, "c1", NOW + 5)).toEqual({ ok: true });
    expect((await getCharacterView(db, "c1", NOW + 6))!.review).toBeNull();
    expect(await adjustMoney(db, A, "c1", "linh_thach", 1, NOW + 6)).toMatchObject({ ok: false });
    expect(await endReview(db, A, "c1", NOW + 7)).toEqual({ ok: false, error: "unchanged" });
    expect((await logs()).some((l) => l.includes("Xong sửa nhân vật"))).toBe(true);
  });
});

describe("the profile and deleting a character", () => {
  const profile = { name: "Lan Tử", gender: "female", satKhi: 20, satNhan: 300, anhHung: 0 };

  it("edits name, gender and the PvP scores under review; the name stays unique and valid", async () => {
    expect(await editProfile(db, A, "c1", profile, NOW)).toEqual({ ok: false, error: "not_reviewing" });
    await startReview(db, A, "c1", kicker, NOW);
    expect(await editProfile(db, A, "c1", { ...profile, name: "x" }, NOW + 1)).toEqual({ ok: false, error: "invalid" });
    expect(await editProfile(db, A, "c1", { ...profile, satKhi: 5000 }, NOW + 1)).toEqual({ ok: false, error: "invalid" });
    expect(await editProfile(db, A, "c1", profile, NOW + 1)).toEqual({ ok: true });
    expect(raw.prepare("SELECT name, gender, sat_khi, sat_nhan FROM characters WHERE id = 'c1'").get()).toEqual({ name: "Lan Tử", gender: "female", sat_khi: 20, sat_nhan: 300 });
    expect(await editProfile(db, A, "c1", profile, NOW + 2)).toEqual({ ok: false, error: "unchanged" });
    raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a2', 'q@x.test', 'h', 's', 1, 0)");
    raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c2', 'a2', 'Mộc Đầu', 'kim', 0, 0, 0, 0)");
    expect(await editProfile(db, A, "c1", { ...profile, name: "Mộc Đầu" }, NOW + 3)).toEqual({ ok: false, error: "name_taken" });
    expect((await logs()).some((l) => l.includes("tên «Lan Tu» → «Lan Tử»"))).toBe(true);
  });

  it("refuses a gender change while something is worn", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    raw.exec("INSERT INTO item_instances (id, owner_character_id, item_type, qty, created_at, equip_slot) VALUES ('w1', 'c1', 'eq.0.0.weapon', 1, 0, 'weapon')");
    expect(await editProfile(db, A, "c1", { ...profile, gender: "female" }, NOW + 1)).toEqual({ ok: false, error: "equipped" });
    expect(await editProfile(db, A, "c1", { ...profile, gender: "male" }, NOW + 1)).toEqual({ ok: true }); // the other fields still change
  });

  it("deletes by moving the row to a tombstone account: the name and the account are free, the ledger stays, the rankings and gifts skip it", async () => {
    raw.exec("INSERT INTO tien_ngoc_ledger (character_id, delta, reason, actor, created_at) VALUES ('c1', 5, 'admin_grant', 'admin', 1)");
    expect(await deleteCharacter(db, A, "c1", "Lan Tu", NOW)).toEqual({ ok: false, error: "not_reviewing" });
    await startReview(db, A, "c1", kicker, NOW);
    expect(await deleteCharacter(db, A, "c1", "wrong", NOW + 1)).toEqual({ ok: false, error: "invalid" });
    expect(await deleteCharacter(db, A, "c1", "Lan Tu", NOW + 1)).toEqual({ ok: true });
    expect(raw.prepare("SELECT account_id, deleted_at, review_until FROM characters WHERE id = 'c1'").get()).toEqual({ account_id: "deleted:c1", deleted_at: NOW + 1, review_until: null });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM characters WHERE account_id = 'a1'").get()).toEqual({ n: 0 }); // the account can make a new character
    raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c9', 'a1', 'Lan Tu', 'kim', 0, 0, 0, 0)"); // and the name is free again
    expect(raw.prepare("SELECT COUNT(*) AS n FROM tien_ngoc_ledger WHERE character_id = 'c1'").get()).toEqual({ n: 1 });
    expect((await logs()).some((l) => l.includes("Xóa nhân vật «Lan Tu»"))).toBe(true);
    const board = await realmBoard(db);
    expect(board.map((r) => r.name)).toEqual(["Lan Tu"]); // only the new one (c9), not the deleted one
  });
});

describe("the constitution", () => {
  it("is checked against the catalogue and changed under review, clearing the stored HP/MP", async () => {
    const catalog = await getConstitutionCatalog(db, NOW);
    const special = catalog.constitutions.find((c) => !c.isDefault && c.tiers.length >= 2)!;
    expect(await editConstitution(db, A, "c1", special.id, 1, NOW)).toEqual({ ok: false, error: "not_reviewing" });
    await startReview(db, A, "c1", kicker, NOW);
    raw.exec("UPDATE characters SET vitals = '{\"hp\":5}' WHERE id = 'c1'");
    expect(await editConstitution(db, A, "c1", "no_such", 1, NOW + 1)).toEqual({ ok: false, error: "invalid" });
    expect(await editConstitution(db, A, "c1", special.id, special.tiers.length + 1, NOW + 1)).toEqual({ ok: false, error: "invalid" });
    expect(await editConstitution(db, A, "c1", special.id, 2, NOW + 1)).toEqual({ ok: true });
    expect(raw.prepare("SELECT constitution, constitution_tier, vitals FROM characters WHERE id = 'c1'").get()).toEqual({ constitution: special.id, constitution_tier: 2, vitals: null });
    expect(await editConstitution(db, A, "c1", special.id, 2, NOW + 2)).toEqual({ ok: false, error: "unchanged" });
    expect((await logs()).some((l) => l.includes(`→ ${special.id}/2`))).toBe(true);
  });
});

describe("gear", () => {
  it("adds a piece the way the merchant sells it (full durability, stats rolled in range), takes it out, and refuses the other gender or a piece that cannot exist", async () => {
    raw.exec("UPDATE characters SET gender = 'male' WHERE id = 'c1'");
    expect(await addEquipment(db, A, "c1", "eq.weapon.u.0.1.1.kim.kiem", NOW)).toEqual({ ok: false, error: "not_reviewing" });
    await startReview(db, A, "c1", kicker, NOW);
    expect(await addEquipment(db, A, "c1", "eq.nonsense", NOW + 1)).toEqual({ ok: false, error: "unknown_item" });
    expect(await addEquipment(db, A, "c1", "eq.robe.f.0.1.1", NOW + 1)).toEqual({ ok: false, error: "gender" });
    expect(await addEquipment(db, A, "c1", "eq.weapon.u.0.1.1.kim.kiem", NOW + 1)).toEqual({ ok: true });
    const row = raw.prepare("SELECT id, item_type, durability, max_durability, rolled_stats FROM item_instances WHERE owner_character_id = 'c1' AND item_type LIKE 'eq.%'").get() as { id: string; durability: number; max_durability: number; rolled_stats: string | null };
    expect(row.durability).toBe(row.max_durability);
    expect(row.max_durability).toBeGreaterThan(0);
    expect(row.rolled_stats).not.toBeNull();
    expect((await logs()).some((l) => l.includes("Thêm trang bị"))).toBe(true);
    expect(await removeItem(db, A, "c1", row.id, NOW + 2)).toEqual({ ok: true });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_instances WHERE owner_character_id = 'c1' AND item_type LIKE 'eq.%'").get()).toEqual({ n: 0 });
  });
});

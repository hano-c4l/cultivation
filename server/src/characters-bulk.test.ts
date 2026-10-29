import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { ENHANCE_MAX, SKILLS, getSkill, maxSkillLevel, parseRolledStats, skillGrade } from "@game/shared";
import { addEquipment, startReview } from "./characters-admin";
import { bulkAction } from "./characters-bulk";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const A = "admin@x.test";
const NOW = 1_000_000;
const kicker = async () => true;

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'p@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at, realm, stage, root_grade, gender) VALUES ('c1', 'a1', 'Lan Tu', 'kim', 0, 0, 0, 0, 2, 5, 2, 'male')");
  raw.exec("INSERT INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES ('c1', 'chuong_0', 0, 'root', 0)");
});

describe("bulk actions of the character screen", () => {
  it("need the review, and refuse an unknown action", async () => {
    expect(await bulkAction(db, A, "c1", "skills_learn", NOW)).toEqual({ ok: false, error: "not_reviewing" });
    await startReview(db, A, "c1", kicker, NOW);
    expect(await bulkAction(db, A, "c1", "nonsense", NOW + 1)).toEqual({ ok: false, error: "invalid" });
    expect(await bulkAction(db, A, "nobody", "skills_learn", NOW + 1)).toEqual({ ok: false, error: "not_found" });
  });

  it("learns every root and book skill up to the character's realm once, then raises them all to the top", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    const r = await bulkAction(db, A, "c1", "skills_learn", NOW + 1);
    expect(r.ok).toBe(true);
    const ids = (raw.prepare("SELECT skill_id, realm FROM character_skills WHERE character_id = 'c1'").all() as Array<{ skill_id: string; realm: number }>);
    const want = SKILLS.filter((s) => (s.source === "root" || s.source === "learned") && s.realm <= 2);
    expect(ids.length).toBe(want.length);
    expect(ids.every((x) => x.realm <= 2)).toBe(true);
    expect(ids.some((x) => x.skill_id === "kim_4")).toBe(true); // a Kim Đan book skill
    expect(ids.some((x) => x.skill_id === "kim_5")).toBe(false); // a Nguyên Anh one is beyond the realm
    expect(await bulkAction(db, A, "c1", "skills_learn", NOW + 2)).toEqual({ ok: false, error: "unchanged" });
    expect((await bulkAction(db, A, "c1", "skills_max", NOW + 3)).ok).toBe(true);
    for (const row of raw.prepare("SELECT skill_id, level FROM character_skills WHERE character_id = 'c1'").all() as Array<{ skill_id: string; level: number }>) {
      expect(row.level).toBe(maxSkillLevel(skillGrade(getSkill(row.skill_id)!, 2)));
    }
    expect(await bulkAction(db, A, "c1", "skills_max", NOW + 4)).toEqual({ ok: false, error: "unchanged" });
  });

  it("enhances, refines and repairs the gear worn or in the bag, and logs it", async () => {
    await startReview(db, A, "c1", kicker, NOW);
    await addEquipment(db, A, "c1", "eq.weapon.u.2.5.1.kim.kiem", NOW + 1);
    await addEquipment(db, A, "c1", "eq.hat.m.2.3.1", NOW + 1);
    raw.exec("UPDATE item_instances SET durability = 1 WHERE owner_character_id = 'c1' AND item_type LIKE 'eq.%'");
    raw.exec("UPDATE item_instances SET equip_slot = 'weapon', bag_tab = NULL, cell = NULL WHERE item_type LIKE 'eq.weapon%'");
    expect(await bulkAction(db, A, "c1", "worn_enhance", NOW + 2)).toEqual({ ok: true, count: 1 });
    expect(raw.prepare("SELECT enhance_level FROM item_instances WHERE item_type LIKE 'eq.weapon%'").get()).toEqual({ enhance_level: ENHANCE_MAX });
    expect(raw.prepare("SELECT enhance_level FROM item_instances WHERE item_type LIKE 'eq.hat%'").get()).toEqual({ enhance_level: 0 }); // the hat is in the bag
    expect(await bulkAction(db, A, "c1", "worn_enhance", NOW + 3)).toEqual({ ok: false, error: "unchanged" });
    expect(await bulkAction(db, A, "c1", "bag_enhance", NOW + 4)).toEqual({ ok: true, count: 1 });
    // refining: every rolled stat at its range's top
    const before = parseRolledStats((raw.prepare("SELECT rolled_stats FROM item_instances WHERE item_type LIKE 'eq.hat%'").get() as { rolled_stats: string }).rolled_stats)!;
    await bulkAction(db, A, "c1", "bag_refine", NOW + 5); // (a piece rolled at the very top would answer "unchanged")
    const after = parseRolledStats((raw.prepare("SELECT rolled_stats FROM item_instances WHERE item_type LIKE 'eq.hat%'").get() as { rolled_stats: string }).rolled_stats)!;
    for (const key of Object.keys(before) as Array<keyof typeof before>) expect(after[key]!).toBeGreaterThanOrEqual(before[key]!);
    expect(await bulkAction(db, A, "c1", "bag_refine", NOW + 6)).toEqual({ ok: false, error: "unchanged" }); // already at the top
    expect(await bulkAction(db, A, "c1", "worn_repair", NOW + 7)).toEqual({ ok: true, count: 1 });
    expect(raw.prepare("SELECT durability = max_durability AS full FROM item_instances WHERE item_type LIKE 'eq.weapon%'").get()).toEqual({ full: 1 });
    expect(raw.prepare("SELECT durability = max_durability AS full FROM item_instances WHERE item_type LIKE 'eq.hat%'").get()).toEqual({ full: 0 }); // not worn: untouched
    const log = (raw.prepare("SELECT content FROM admin_log").all() as Array<{ content: string }>).map((l) => l.content);
    expect(log.some((l) => l.includes("Cường hóa +10 toàn bộ trang bị đang mặc"))).toBe(true);
  });
});

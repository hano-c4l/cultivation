import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { GRADE_MULT, allDefaultMasterEntries, equipmentInfo, EQUIP_KINDS, GENDERED_KINDS, makeEquipmentId, masterKey, REALMS, STAGES_PER_REALM, type EquipKind, type EquipStyle } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getGearMaster, resetGearMasterCache } from "./gear-master";
import { makeDb } from "./test-db";

/** Migration 0056: the regeneration stats join the master rows that exist and are rolled for the pieces that exist. */
let db: D1Database;
let raw: DatabaseSync;
const REGEN = ["hpRegen", "mpRegen", "hpRegenPct", "mpRegenPct"];
const sql = readFileSync(new URL("../migrations/0056_regen_gear_stats.sql", import.meta.url), "utf8");

beforeEach(() => {
  ({ db, raw } = makeDb());
  resetGearMasterCache();
});

describe("migration 0056", () => {
  it("gives the stored master rows the same ranges as the code's defaults, keeps a range an admin set, and rolls the stats of existing pieces inside their ranges", async () => {
    await getGearMaster(db); // seeds the table from the code (which already has the new stats)
    // Back to the table as it was before: no regeneration stat in any row; an admin had set a range on one belt row.
    for (const k of REGEN) raw.exec(`UPDATE equipment_master SET stats = json_remove(stats, '$.${k}')`);
    raw.exec(`UPDATE equipment_master SET stats = json_set(stats, '$.hpRegen', json('[7,9]')) WHERE item_key = 'belt.u.1.1'`);
    // Pieces that exist: one rolled before the stats (a belt, a necklace of each grade), one never rolled (formula).
    raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'p@x.test', 'h', 's', 1, 0)");
    raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'Lan Tu', 'kim', 0, 0, 0, 0)");
    const types: string[] = [];
    for (let grade = 1; grade <= 4; grade++) {
      types.push(makeEquipmentId("belt", "u", 3, 5, grade), makeEquipmentId("necklace", "f", 4, 2, grade), makeEquipmentId("ring", "u", 2, 9, grade), makeEquipmentId("jade", "m", 5, 1, grade));
    }
    types.push(makeEquipmentId("hat", "m", 3, 5, 1));
    types.forEach((t, i) => raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, created_at, rolled_stats) VALUES (?, 'c1', ?, 0, ?)").run(`i${i}`, t, JSON.stringify({ attack: 3 })));
    raw.exec("INSERT INTO item_instances (id, owner_character_id, item_type, created_at) VALUES ('plain', 'c1', 'eq.belt.u.0.1.1', 0)");
    const before = (raw.prepare("SELECT version FROM config_versions WHERE name = 'gear_master'").get() as { version: number }).version;

    raw.exec(sql);
    raw.exec(sql); // twice: nothing changes the second time (a piece that has the stat is not rolled again, a row that has it keeps it)

    // The master rows: equal to the code's defaults, except the admin's.
    const rows = new Map((raw.prepare("SELECT item_key, stats FROM equipment_master").all() as Array<{ item_key: string; stats: string }>).map((r) => [r.item_key, JSON.parse(r.stats) as Record<string, number[]>]));
    const stylesOf = (kind: EquipKind): readonly EquipStyle[] => (GENDERED_KINDS.has(kind) ? ["m", "f"] : ["u"]);
    for (const e of allDefaultMasterEntries(REALMS.length, STAGES_PER_REALM, stylesOf, EQUIP_KINDS)) {
      const key = masterKey(e.kind, e.style, e.realm, e.tier);
      const got = rows.get(key)!;
      for (const k of REGEN) {
        if (key === "belt.u.1.1" && k === "hpRegen") expect(got[k]).toEqual([7, 9]);
        else expect(got[k], `${key} ${k}`).toEqual(e.stats[k as keyof typeof e.stats]);
      }
    }
    expect(Object.keys(rows.get("hat.m.3.5")!).some((k) => k.includes("Regen"))).toBe(false);
    expect((raw.prepare("SELECT version FROM config_versions WHERE name = 'gear_master'").get() as { version: number }).version).toBeGreaterThan(before);

    // The pieces: the stat of their kind is in the range of the master row times the grade; others have none; the rest of what was rolled stays.
    const statOf: Record<string, string> = { belt: "hpRegen", ring: "mpRegen", necklace: "hpRegenPct", jade: "mpRegenPct" };
    for (const [i, t] of types.entries()) {
      const info = equipmentInfo(t)!;
      const rs = JSON.parse((raw.prepare("SELECT rolled_stats FROM item_instances WHERE id = ?").get(`i${i}`) as { rolled_stats: string }).rolled_stats) as Record<string, number>;
      expect(rs.attack).toBe(3);
      const stat = statOf[info.kind];
      if (!stat) {
        expect(Object.keys(rs).some((k) => k.includes("Regen"))).toBe(false);
        continue;
      }
      const r = rows.get(masterKey(info.kind, info.style, info.realm, info.tier))![stat]!;
      const mult = GRADE_MULT[info.grade - 1]!;
      expect(rs[stat], t).toBeGreaterThanOrEqual(r[0]! * mult - 0.51);
      expect(rs[stat], t).toBeLessThanOrEqual(r[1]! * mult + 0.51);
    }
    expect((raw.prepare("SELECT rolled_stats FROM item_instances WHERE id = 'plain'").get() as { rolled_stats: string | null }).rolled_stats).toBeNull();
  });
});

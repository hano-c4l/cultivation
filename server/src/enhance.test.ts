import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_ENHANCE_TABLE, enhanceStatMult, setEnhanceTable } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getEnhanceTable, loadPity, resetEnhanceCache } from "./enhance";
import { commitBagOps, loadBag } from "./inventory";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
  resetEnhanceCache();
  setEnhanceTable(null);
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES ('a', 'a@x.test', 'h', 's', 1, 'player', 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c', 'a', 'C', 'kim', 0, 0, 0, 0)");
});

describe("the upgrade rules table", () => {
  it("is seeded from the defaults, and an edited row takes effect when the version changes", async () => {
    const rows = await getEnhanceTable(db);
    expect(rows).toEqual(DEFAULT_ENHANCE_TABLE);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM enhance_levels").get() as { n: number }).n).toBe(DEFAULT_ENHANCE_TABLE.length);
    raw.exec("UPDATE enhance_levels SET stat_pct = 25, success_pct = 77 WHERE level = 1");
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'enhance'");
    const later = await getEnhanceTable(db, Date.now() + 60_000);
    expect(later[0]).toMatchObject({ level: 1, successPct: 77, statPct: 25 });
    expect(enhanceStatMult(1)).toBeCloseTo(1.25); // installed for the stat maths too
  });

  it("falls back to the default for a broken row", async () => {
    await getEnhanceTable(db);
    raw.exec("UPDATE enhance_levels SET success_pct = 500 WHERE level = 2");
    resetEnhanceCache();
    expect((await getEnhanceTable(db))[1]).toEqual(DEFAULT_ENHANCE_TABLE[1]);
  });
});

describe("the level of a piece", () => {
  it("is stored with the item, carried when it moves, and the bonus chance is kept apart", async () => {
    await commitBagOps(db, "c", [{ op: "add", id: "i1", type: "eq.robe.m.0.1.1", tab: 0, cell: 0, qty: 1, dur: 100, max: 100, en: 4 }]);
    expect((await loadBag(db, "c")).items[0]!.en).toBe(4);
    await commitBagOps(db, "c", [{ op: "equip", id: "i1", slot: "robe", tab: 0, cell: 0 }]);
    expect((await loadBag(db, "c")).equipped[0]!.en).toBe(4);
    raw.exec("UPDATE item_instances SET enhance_bonus = 15 WHERE id = 'i1'");
    expect(await loadPity(db, "c")).toEqual({ i1: 15 });
    // A piece that never went through the smith has no level at all.
    await commitBagOps(db, "c", [{ op: "add", id: "i2", type: "eq.robe.m.0.1.1", tab: 0, cell: 1, qty: 1, dur: 100, max: 100 }]);
    expect((await loadBag(db, "c")).items.find((i) => i.id === "i2")!.en).toBeUndefined();
  });

  it("cannot go above +10 in the database", () => {
    raw.exec("INSERT INTO item_instances (id, owner_character_id, item_type, created_at) VALUES ('x', 'c', 'eq.robe.m.0.1.1', 0)");
    expect(() => raw.exec("UPDATE item_instances SET enhance_level = 11 WHERE id = 'x'")).toThrow();
  });
});

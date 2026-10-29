import type { DatabaseSync } from "node:sqlite";
import { equipmentInfo, setGearSetNames } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getGearMaster, resetGearMasterCache, rollGear } from "./gear-master";
import { commitBagOps, loadBag } from "./inventory";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
  resetGearMasterCache();
  setGearSetNames(null);
});

describe("the gear master table", () => {
  it("is seeded from the code defaults on the first read, and the rows can then be edited", async () => {
    const m = await getGearMaster(db);
    const count = (raw.prepare("SELECT COUNT(*) AS n FROM equipment_master").get() as { n: number }).n;
    expect(count).toBe(m.stats.size);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM equipment_sets").get() as { n: number }).n).toBe(54);
    expect(m.setNames[0]![0]).toBe("Lăng Y");
    raw.exec(`UPDATE equipment_master SET stats = '{"attack":[100,100]}' WHERE item_key = 'weapon.u.0.1'`);
    raw.exec(`UPDATE equipment_sets SET name_vi = 'Tuyết Ảnh' WHERE realm = 0 AND tier = 1`);
    raw.exec(`UPDATE config_versions SET version = version + 1 WHERE name = 'gear_master'`);
    const later = await getGearMaster(db, Date.now() + 60_000);
    expect(later.stats.get("weapon.u.0.1")).toEqual({ attack: [100, 100] });
    expect(equipmentInfo("eq.robe.m.0.1.1")!.nameVi).toBe("Tuyết Ảnh Đạo Bào");
  });

  it("does not overwrite edited rows when it seeds again, and falls back to the default for a broken row", async () => {
    await getGearMaster(db);
    raw.exec(`UPDATE equipment_master SET stats = 'not json' WHERE item_key = 'ring.u.0.1'`);
    raw.exec(`DELETE FROM equipment_master WHERE item_key = 'belt.u.0.1'`);
    resetGearMasterCache();
    const m = await getGearMaster(db);
    expect(m.stats.get("ring.u.0.1")).toBeDefined(); // the default, not the broken text
    expect(m.stats.get("belt.u.0.1")).toBeDefined(); // seeded back
    expect((raw.prepare("SELECT stats FROM equipment_master WHERE item_key = 'ring.u.0.1'").get() as { stats: string }).stats).toBe("not json");
  });

  it("rolls from the live row", async () => {
    await getGearMaster(db);
    raw.exec(`UPDATE equipment_master SET stats = '{"attack":[100,100]}' WHERE item_key = 'weapon.u.0.1'`);
    raw.exec(`UPDATE config_versions SET version = version + 1 WHERE name = 'gear_master'`);
    resetGearMasterCache();
    expect(await rollGear(db, "eq.weapon.u.0.1.1.kim.kiem")).toEqual({ attack: 100 });
    expect(await rollGear(db, "hoi_huyet_dan")).toBeUndefined();
  });
});

describe("rolled stats travel with the item", () => {
  it("are stored when the item is added and read back from the bag", async () => {
    raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES ('a', 'a@x.test', 'h', 's', 1, 'player', 0)");
    raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c', 'a', 'C', 'kim', 0, 0, 0, 0)");
    const res = await commitBagOps(db, "c", [
      { op: "add", id: "i1", type: "eq.robe.m.0.1.1", tab: 0, cell: 0, qty: 1, dur: 100, max: 100, rs: { defense: 2, maxHp: 7 } },
      { op: "add", id: "i2", type: "eq.robe.m.0.1.1", tab: 0, cell: 1, qty: 1, dur: 100, max: 100 },
    ]);
    expect(res).toBe("ok");
    const bag = await loadBag(db, "c");
    expect(bag.items.find((i) => i.id === "i1")!.rs).toEqual({ defense: 2, maxHp: 7 });
    expect(bag.items.find((i) => i.id === "i2")!.rs).toBeUndefined(); // an item made before rolling keeps its fixed stats
    // Wearing it keeps them.
    await commitBagOps(db, "c", [{ op: "equip", id: "i1", slot: "robe", tab: 0, cell: 0 }]);
    expect((await loadBag(db, "c")).equipped[0]!.rs).toEqual({ defense: 2, maxHp: 7 });
  });
});

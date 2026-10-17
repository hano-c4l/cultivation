import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_CATALOG, validateCatalog } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getConstitutionCatalog, loadConstitutionCatalog, resetConstitutionCatalogCache } from "./constitution-catalog";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
  resetConstitutionCatalogCache();
});

describe("loading the seeded tables", () => {
  it("reads back exactly the default catalogue (the seed of migration 0008 equals shared DEFAULT_CATALOG)", async () => {
    const loaded = await loadConstitutionCatalog(db);
    expect(loaded).toEqual(DEFAULT_CATALOG);
    expect(validateCatalog(loaded)).toEqual([]);
  });

  it("refuses a catalogue that fails validation instead of serving it", async () => {
    raw.exec("UPDATE constitution_tiers SET roll_weight = 1 WHERE constitution_id = 'kiem_the' AND tier = 1");
    await expect(loadConstitutionCatalog(db)).rejects.toThrow(/tier weights sum to/);
  });

  it("an admin-style edit (rename, new effect, new tier) is picked up", async () => {
    raw.exec("UPDATE constitutions SET name_vi = 'Kiếm Thể Mới' WHERE id = 'kiem_the'");
    raw.exec("INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 1, 'move_speed', 'all', '', 'percent', 5)");
    const c = await loadConstitutionCatalog(db);
    const kiem = c.constitutions.find((d) => d.id === "kiem_the")!;
    expect(kiem.nameVi).toBe("Kiếm Thể Mới");
    expect(kiem.tiers[0]!.effects.some((e) => e.stat === "move_speed" && e.value === 5)).toBe(true);
  });
});

describe("the database enforces the structural rules", () => {
  it("allows only one default constitution", () => {
    expect(() => raw.exec("INSERT INTO constitutions (id, name_vi, is_default) VALUES ('khac', 'Khác', 1)")).toThrow();
  });

  it("refuses an effect for a tier that does not exist, a duplicate effect, and a bad mode", () => {
    const eff = (tier: number, mode: string, value = 1) =>
      `INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', ${tier}, 'exp_gain', 'all', '', '${mode}', ${value})`;
    expect(() => raw.exec(eff(9, "percent"))).toThrow(); // foreign key to the tier
    raw.exec(eff(1, "percent"));
    expect(() => raw.exec(eff(1, "percent", 2))).toThrow(); // unique per tier, stat, target and mode
    expect(() => raw.exec(eff(1, "multiplier"))).toThrow(); // check on mode
  });

  it("a stat the code does not know yet is not a SQL error (the vocabulary lives in code), but validation catches it", async () => {
    raw.exec("INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 1, 'luck', 'all', '', 'percent', 1)");
    await expect(loadConstitutionCatalog(db)).rejects.toThrow(/unknown stat/);
  });

  it("a constitution cannot be deleted while tiers refer to it", () => {
    expect(() => raw.exec("DELETE FROM constitutions WHERE id = 'kiem_the'")).toThrow();
  });
});

describe("the cached getter", () => {
  it("serves the cache within the TTL, reloads when the version changed, and survives a D1 failure with the last good copy", async () => {
    const t0 = 1_000_000;
    const first = await getConstitutionCatalog(db, t0);
    expect(first.version).toBe(1);

    raw.exec("UPDATE constitutions SET name_vi = 'Đổi Tên' WHERE id = 'loi_the'");
    expect((await getConstitutionCatalog(db, t0 + 1000)).constitutions.find((c) => c.id === "loi_the")!.nameVi).toBe("Lôi Thể"); // inside the TTL

    // After the TTL but with the same version: the cheap check keeps the cache.
    expect((await getConstitutionCatalog(db, t0 + 60_000)).constitutions.find((c) => c.id === "loi_the")!.nameVi).toBe("Lôi Thể");

    // An admin save bumps the version: the next check reloads.
    raw.exec("UPDATE config_versions SET version = 2 WHERE name = 'constitutions'");
    const reloaded = await getConstitutionCatalog(db, t0 + 120_000);
    expect(reloaded.version).toBe(2);
    expect(reloaded.constitutions.find((c) => c.id === "loi_the")!.nameVi).toBe("Đổi Tên");

    // D1 goes away: the last good copy is served.
    const broken = { prepare: () => { throw new Error("D1 down"); } } as unknown as D1Database;
    expect((await getConstitutionCatalog(broken, t0 + 200_000)).version).toBe(2);
  });

  it("with nothing cached and D1 failing it throws, so creation cannot roll from a made-up catalogue", async () => {
    const broken = { prepare: () => { throw new Error("D1 down"); } } as unknown as D1Database;
    await expect(getConstitutionCatalog(broken)).rejects.toThrow("D1 down");
  });
});

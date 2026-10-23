import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_TUNING, effectiveSkill, getSkill, itemValue, killsToNext, aoiEnter, bossReward, bossShares, guardStats, resetTuning, rollLinhThachDrop, rollOreDrop, satKhiDamagePct, tuning, upgradeCost } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getTuning, resetTuningCache } from "./tuning";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
  resetTuningCache();
  resetTuning();
});

describe("the 2j tuning table", () => {
  it("is seeded from the defaults, and an edited group takes effect when the version changes", async () => {
    expect(await getTuning(db)).toEqual(DEFAULT_TUNING);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM game_tuning").get() as { n: number }).n).toBe(Object.keys(DEFAULT_TUNING).length);
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'keepLevel'").run(JSON.stringify({ priceTienNgoc: 80 }));
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'enhanceCost'").run(JSON.stringify({ linhBase: [1, 2, 3, 4], maxPityPct: 10 }));
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
    const later = await getTuning(db, Date.now() + 60_000);
    expect(later.keepLevel.priceTienNgoc).toBe(80);
    expect(upgradeCost(0, 0, 0)!.linhThach).toBe(1); // installed for the game maths too
  });

  it("keeps the default of a group that is broken or not JSON", async () => {
    await getTuning(db);
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'bossCone'").run(JSON.stringify({ power: -3 }));
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'bossRegen'").run("not json");
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'oreDrop'").run(JSON.stringify({ ...DEFAULT_TUNING.oreDrop, normal: { chance: 0, min: 5, max: 5 } }));
    resetTuningCache();
    const t = await getTuning(db);
    expect(t.bossCone).toEqual(DEFAULT_TUNING.bossCone);
    expect(t.bossRegen).toEqual(DEFAULT_TUNING.bossRegen);
    expect(tuning().oreDrop.normal.chance).toBe(0); // the valid edit still applies
    expect(rollOreDrop(0, "normal", () => 0.5)).toBeNull();
  });

  it("takes the boss, guard, PvP and area-of-interest numbers from the table, and keeps the default of a broken one", async () => {
    await getTuning(db);
    const hpBefore = guardStats(0).maxHp;
    const pvp = { ...DEFAULT_TUNING.pvp, satKhi: { ...DEFAULT_TUNING.pvp.satKhi, bonusMinPct: 20, bonusMaxPct: 20 } };
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'pvp'").run(JSON.stringify(pvp));
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'aoi'").run(JSON.stringify({ enter: { x: 60, y: 40 }, leave: { x: 50, y: 30 }, everyTicks: 5 })); // leave inside enter: invalid
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'guard'").run(JSON.stringify({ ...DEFAULT_TUNING.guard, hpMult: 10 }));
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'bossReward'").run(JSON.stringify({ ...DEFAULT_TUNING.bossReward, minShare: 0.5 }));
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
    await getTuning(db, Date.now() + 60_000);
    expect(satKhiDamagePct(500)).toBe(20);
    expect(aoiEnter()).toEqual(DEFAULT_TUNING.aoi.enter);
    expect(guardStats(0).maxHp).toBeCloseTo(2 * hpBefore, 5); // the guard HP multiple went from 5 to 10
    expect(bossReward().minShare).toBe(0.5);
    // 60% and 40% of the damage, the first with the last hit: at a 0.5 minimum only the first pays.
    const shares = bossShares(new Map([["a", 600], ["b", 400]]), 1000, "a", () => true);
    expect(shares.map((x) => x.id)).toEqual(["a"]);
  });

  it("takes drops, kills, item values, skills and theme from the table, and a broken theme keeps its default", async () => {
    await getTuning(db);
    const set = (name: string, v: unknown) => raw.prepare("UPDATE game_tuning SET value = ? WHERE name = ?").run(JSON.stringify(v), name);
    set("drops", { ...DEFAULT_TUNING.drops, linh: { ...DEFAULT_TUNING.drops.linh, chance: { normal: 0, rare1: 0, rare2: 0 } } });
    set("kills", { base: 60, growth: 1.13 });
    set("itemValue", { ...DEFAULT_TUNING.itemValue, items: { ...DEFAULT_TUNING.itemValue.items, yeu_dan: 400 } });
    set("skills", { ...DEFAULT_TUNING.skills, levelPower: [2, 2, 2, 2, 2] });
    set("theme", { realmColors: ["red"], gradeColors: [] });
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
    const baseSkill = (() => {
      const def = getSkill("kim_3")!;
      return { def, at: (lv: number) => effectiveSkill(def, { realm: 0, grade: 0, level: lv }).power };
    })();
    const before = baseSkill.at(0);
    const got = await getTuning(db, Date.now() + 60_000);
    expect(rollLinhThachDrop(0, "normal", 0.01, 0.5)).toBe(0);
    expect(killsToNext(0, 1)).toBe(60);
    expect(itemValue("yeu_dan")).toBe(400);
    expect(baseSkill.at(0)).toBeCloseTo(before * 2, 5);
    expect(got.theme).toEqual(DEFAULT_TUNING.theme);
  });

  it("replaces a row nobody edited that no longer fits the group's shape, and leaves an admin's row alone", async () => {
    await getTuning(db);
    raw.prepare("UPDATE game_tuning SET value = ? WHERE name = 'pvp'").run(JSON.stringify({ satKhi: DEFAULT_TUNING.pvp.satKhi })); // an old shape, no updated_by
    raw.prepare("UPDATE game_tuning SET value = ?, updated_by = 'admin' WHERE name = 'theme'").run(JSON.stringify({ broken: true }));
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'tuning'");
    const got = await getTuning(db, Date.now() + 60_000);
    expect(got.pvp).toEqual(DEFAULT_TUNING.pvp);
    expect((JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = 'pvp'").get() as { value: string }).value) as { hero: unknown }).hero).toBeDefined();
    expect(JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = 'theme'").get() as { value: string }).value)).toEqual({ broken: true }); // kept, served as the default
    expect(got.theme).toEqual(DEFAULT_TUNING.theme);
  });
});

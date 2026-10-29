import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_TUNING, validTuningGroup } from "@game/shared";
import { describe, expect, it } from "vitest";
import { makeDb } from "./test-db";

/** Migration 0055 (two new realms, a third town) over `game_tuning` rows stored before it: every group ends up as the new default, and what an admin set stays. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function oldRows() {
  const d = clone(DEFAULT_TUNING);
  const rows: Record<string, unknown> = {
    exp: { ...d.exp, realms: d.exp.realms.slice(0, 4) },
    breakthrough: { ...d.breakthrough, steps: d.breakthrough.steps.slice(0, 3) },
    theme: { ...d.theme, realmColors: d.theme.realmColors.slice(0, 4) },
    enhanceCost: { ...d.enhanceCost, linhBase: d.enhanceCost.linhBase.slice(0, 4) },
    bossSpawn: { ...d.bossSpawn, pityKills: d.bossSpawn.pityKills.slice(0, 4) },
    boss: { ...d.boss, species: Object.fromEntries(Object.entries(d.boss.species).filter(([k]) => !["town3", "hoathan", "luyenhu"].includes(k))) },
    drops: { ...d.drops, pill: Object.fromEntries(Object.entries(d.drops.pill).filter(([k]) => Number(k) < 3)) },
    loot: { ...d.loot, realm: Object.fromEntries(Object.entries(d.loot.realm).filter(([k]) => Number(k) < 4)) },
    itemValue: { ...d.itemValue, items: Object.fromEntries(Object.entries(d.itemValue.items).filter(([k]) => !["ttp_town3", "than_huyet_dan", "than_linh_dan", "hu_huyet_dan", "hu_linh_dan"].includes(k))) },
    alchemy: { ...d.alchemy, recipes: d.alchemy.recipes.filter((r) => !r.id.startsWith("hu_")) },
  };
  return rows;
}

describe("migration 0055", () => {
  it("completes the stored tuning groups once and keeps what an admin set", () => {
    const { raw } = makeDb() as unknown as { raw: DatabaseSync };
    const sql = readFileSync(new URL("../migrations/0055_realms_hoa_than_luyen_hu.sql", import.meta.url), "utf8");
    const rows = oldRows();
    raw.exec("DELETE FROM game_tuning");
    const ins = raw.prepare("INSERT INTO game_tuning (name, value, updated_at) VALUES (?, ?, 0)");
    for (const [name, value] of Object.entries(rows)) ins.run(name, JSON.stringify(value));
    raw.exec("UPDATE game_tuning SET value = json_set(value, '$.realms[0].expBase', 1234) WHERE name = 'exp'"); // an admin edit
    const before = (raw.prepare("SELECT version FROM config_versions WHERE name = 'tuning'").get() as { version: number }).version;
    raw.exec(sql);
    raw.exec(sql); // twice: nothing is added a second time
    const read = (name: string) => JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = ?").get(name) as { value: string }).value) as unknown;
    for (const name of Object.keys(rows)) {
      const expected = clone(DEFAULT_TUNING[name as keyof typeof DEFAULT_TUNING]) as unknown;
      if (name === "exp") (expected as typeof DEFAULT_TUNING.exp).realms[0]!.expBase = 1234;
      expect(read(name), name).toEqual(expected);
      expect(validTuningGroup(name, read(name)), name).toBe(true);
    }
    expect((raw.prepare("SELECT version FROM config_versions WHERE name = 'tuning'").get() as { version: number }).version).toBeGreaterThan(before);
  });
});

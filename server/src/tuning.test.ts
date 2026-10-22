import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_TUNING, resetTuning, rollOreDrop, tuning, upgradeCost } from "@game/shared";
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
});

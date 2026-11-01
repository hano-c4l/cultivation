import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_TUNING, validTuningGroup } from "@game/shared";
import { makeDb } from "./test-db";

describe("migration 0076", () => {
  it("gives a stored npcLooks row the default hats it lacks, keeps a hat an admin chose, and leaves NPCs that are not in the row alone", () => {
    const { raw } = makeDb() as unknown as { raw: DatabaseSync };
    const sql = readFileSync(new URL("../migrations/0076_npc_hats.sql", import.meta.url), "utf8");
    const stored = {
      byKind: { merchant: { body: "male", outfit: "sage" }, guard: { body: "male", scale: 1.5, hat: 9 } },
      byId: { elder: { body: "male" } },
    };
    raw.exec("DELETE FROM game_tuning WHERE name = 'npcLooks'");
    raw.prepare("INSERT INTO game_tuning (name, value, updated_at) VALUES ('npcLooks', ?, 0)").run(JSON.stringify(stored));
    const before = (raw.prepare("SELECT version FROM config_versions WHERE name = 'tuning'").get() as { version: number }).version;
    raw.exec(sql);
    raw.exec(sql); // twice: nothing changes the second time
    const row = JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = 'npcLooks'").get() as { value: string }).value);
    expect(row.byKind.merchant.hat).toBe(DEFAULT_TUNING.npcLooks.byKind.merchant!.hat);
    expect(row.byKind.guard.hat).toBe(9); // the admin's choice stays
    expect(row.byId.elder.hat).toBe(DEFAULT_TUNING.npcLooks.byId.elder!.hat);
    expect(row.byKind.quest).toBeUndefined(); // not in the stored table: the code's default stands
    expect(validTuningGroup("npcLooks", row)).toBe(true);
    expect((raw.prepare("SELECT version FROM config_versions WHERE name = 'tuning'").get() as { version: number }).version).toBe(before + 2);
  });
});

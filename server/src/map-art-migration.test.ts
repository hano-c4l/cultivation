import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeDb } from "./test-db";

// Migration 0061 writes the code looks of the newest maps into a stored `mapArt` row that lacks them, or lists them as plain.
const sql = readFileSync(new URL("../migrations/0061_tiennguc_market_trade.sql", import.meta.url), "utf8");
const part = sql.slice(sql.indexOf("-- Thành 3 and the two maps"));

const maps = (raw: ReturnType<typeof makeDb>["raw"]) => JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = 'mapArt'").get() as { value: string }).value).maps;

describe("migration 0061: the looks of the newest maps", () => {
  it("adds the missing maps and replaces plain ones, leaving an edited look alone", () => {
    const { raw } = makeDb();
    raw.exec("DELETE FROM game_tuning WHERE name = 'mapArt'");
    raw.prepare("INSERT INTO game_tuning (name, value, updated_at) VALUES ('mapArt', ?, 0)").run(JSON.stringify({ maps: { forest: { ground: "grass", obstacle: "tree" }, hoathan: { ground: "plain", obstacle: "plain" }, luyenhu: { ground: "snow", obstacle: "bamboo" } } }));
    raw.exec(part);
    const m = maps(raw);
    expect(m.town3).toMatchObject({ obstacle: "rock", big: "house" }); // missing: written
    expect(m.hoathan).toMatchObject({ ground: "stone", obstacle: "crystal" }); // plain: replaced
    expect(m.luyenhu).toEqual({ ground: "snow", obstacle: "bamboo" }); // an admin's own choice stays
    expect(m.forest).toEqual({ ground: "grass", obstacle: "tree" });
  });
});

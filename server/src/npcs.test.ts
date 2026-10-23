import type { DatabaseSync } from "node:sqlite";
import { MAP_IDS, allNpcIds, getMap, npcNear, npcsOf, setAllNpcs, startingNpcs } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getNpcs, resetNpcsCache } from "./npcs";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
  resetNpcsCache();
  setAllNpcs([]);
});

describe("the NPC table", () => {
  it("is seeded with the NPCs the map builders place, names included", async () => {
    const got = await getNpcs(db);
    expect(got.length).toBe(startingNpcs().length);
    expect(got.find((n) => n.id === "merchant")).toMatchObject({ mapId: "town", kind: "merchant", name: "Thương nhân" });
    const town = getMap("town");
    expect(npcsOf(town).map((n) => n.id).sort()).toEqual(town.npcs.map((n) => n.id).sort());
  });

  it("takes a moved, renamed and a brand new NPC when the version changes, and an NPC added to the table works for commands", async () => {
    await getNpcs(db);
    raw.exec("UPDATE npc_spots SET x = 30.5, y = 31.5, name_vi = 'Lão Thương' WHERE npc_id = 'merchant'");
    raw.exec("INSERT INTO npc_spots (npc_id, map_id, kind, name_vi, x, y) VALUES ('herbalist', 'town', 'merchant', 'Dược sư', 40.5, 41.5)");
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'npcs'");
    await getNpcs(db, Date.now() + 60_000);
    const town = getMap("town");
    const merchant = npcsOf(town).find((n) => n.id === "merchant")!;
    expect(merchant).toMatchObject({ x: 30.5, y: 31.5, name: "Lão Thương" });
    expect(npcNear(town, "herbalist", 41, 42)?.kind).toBe("merchant");
    expect(npcNear(town, "merchant", 23.5, 17.5)).toBeUndefined(); // it no longer stands at its old spot
    expect(allNpcIds().has("herbalist")).toBe(true);
  });

  it("does not put back a disabled NPC, skips a broken row, and seeds an NPC added to the code later", async () => {
    await getNpcs(db);
    raw.exec("UPDATE npc_spots SET enabled = 0 WHERE npc_id = 'elder' AND map_id = 'town'");
    raw.exec("UPDATE npc_spots SET kind = 'nonsense' WHERE npc_id = 'smith'");
    raw.exec("DELETE FROM npc_spots WHERE npc_id = 'path_kiem' AND map_id = 'town'"); // as if new
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'npcs'");
    resetNpcsCache();
    await getNpcs(db);
    const ids = npcsOf(getMap("town")).map((n) => n.id);
    expect(ids).not.toContain("elder");
    expect(ids).not.toContain("smith");
    expect(ids).toContain("path_kiem");
    // every map has a list installed
    for (const id of MAP_IDS) expect(npcsOf(getMap(id))).toBeDefined();
  });
});

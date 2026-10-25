import { beforeEach, describe, expect, it } from "vitest";
import { MAP_IDS, getMap, overrideRecipe, setMapRecipe } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { getMapRecipes, resetMapsCache } from "./maps";
import { getMapAdmin, listMaps, resetMap, saveMap } from "./maps-admin";
import { makeDb } from "./test-db";

let db: D1Database;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db } = makeDb());
  resetMapsCache();
  for (const id of MAP_IDS) setMapRecipe(null, id);
});

describe("the maps screen", () => {
  it("lists the six maps as the code has them, unedited, and installs nothing for them", async () => {
    const list = await listMaps(db);
    expect(list.map((m) => m.id).sort()).toEqual([...MAP_IDS].sort());
    expect(list.every((m) => !m.edited)).toBe(true);
    expect(MAP_IDS.every((id) => overrideRecipe(id) === undefined)).toBe(true);
  });

  it("saves a change, installs it for the game on the next read, logs it, and resets to the code's map", async () => {
    const v = (await getMapAdmin(db, "forest"))!;
    const recipe = { ...v.recipe, palette: { ...v.recipe.palette, groundA: 0x112233 } };
    expect(await saveMap(db, ADMIN, recipe, v.updatedAt + 3)).toMatchObject({ ok: false, error: "version_conflict" });
    expect(await saveMap(db, ADMIN, v.recipe, v.updatedAt)).toMatchObject({ ok: false, error: "unchanged" });
    const saved = await saveMap(db, ADMIN, recipe, v.updatedAt, Date.now() + 5);
    expect(saved.ok).toBe(true);
    resetMapsCache();
    await getMapRecipes(db);
    expect(getMap("forest").palette.groundA).toBe(0x112233);
    expect(overrideRecipe("forest")?.palette.groundA).toBe(0x112233);
    expect((await listMaps(db)).find((m) => m.id === "forest")).toMatchObject({ edited: true, updatedBy: ADMIN });
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!.content).toContain("Sửa bản đồ forest: màu");
    const again = (await getMapAdmin(db, "forest"))!;
    expect((await resetMap(db, ADMIN, "forest", again.updatedAt, Date.now() + 50)).ok).toBe(true);
    resetMapsCache();
    await getMapRecipes(db);
    expect(overrideRecipe("forest")).toBeUndefined();
    expect(getMap("forest").palette.groundA).not.toBe(0x112233);
  });

  it("refuses locked fields, a spawn or gate outside the area, a gate to the same map and a malformed recipe", async () => {
    const v = (await getMapAdmin(db, "cave"))!;
    expect(await saveMap(db, ADMIN, { ...v.recipe, realm: 3 }, v.updatedAt)).toMatchObject({ ok: false, error: "locked", problems: ["realm"] });
    expect(await saveMap(db, ADMIN, { ...v.recipe, size: v.recipe.size + 1 }, v.updatedAt)).toMatchObject({ ok: false, error: "locked" });
    expect(await saveMap(db, ADMIN, { ...v.recipe, spawn: [0, v.recipe.size - 1] as [number, number] }, v.updatedAt)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveMap(db, ADMIN, { ...v.recipe, portals: [{ ...v.recipe.portals[0]!, toMap: "cave" }] }, v.updatedAt)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveMap(db, ADMIN, { ...v.recipe, ops: [{ op: "scatter", seed: 1, count: 99999, rMin: 1, rMax: 2, halfW: 1, halfH: 1 }] }, v.updatedAt)).toMatchObject({ ok: false, error: "invalid", problems: ["structure"] });
    expect(await saveMap(db, ADMIN, { nonsense: true }, v.updatedAt)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("a row that does not validate leaves the map as the code has it", async () => {
    await listMaps(db);
    const raw = (db as unknown as { prepare: (s: string) => { run: () => Promise<unknown> } }).prepare("UPDATE map_recipes SET def = 'broken', updated_by = 'x' WHERE map_id = 'town'");
    await raw.run();
    resetMapsCache();
    await getMapRecipes(db);
    expect(overrideRecipe("town")).toBeUndefined();
  });
});

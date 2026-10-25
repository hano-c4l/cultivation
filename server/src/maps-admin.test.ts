import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { CLUSTERS, MAP_IDS, MAP_NAMES, MAP_SIZE, getMap, isMapId, overrideRecipe, setMapRecipe } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { getMapRecipes, resetMapsCache } from "./maps";
import { createMap, deleteMap, getMapAdmin, listMaps, resetMap, saveMap } from "./maps-admin";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db, raw } = makeDb());
  resetMapsCache();
  for (const id of [...MAP_IDS]) setMapRecipe(null, id);
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

  it("shows the code's groups, guards and boss spot for a map, and editing them keeps the other map data", async () => {
    const v = (await getMapAdmin(db, "forest"))!;
    expect(v.code).toBe(true);
    expect(v.recipe.content!.groups.length).toBeGreaterThan(8);
    expect(await saveMap(db, ADMIN, v.recipe, v.updatedAt)).toMatchObject({ ok: false, error: "unchanged" }); // the content shown is the code's
    const groups = v.recipe.content!.groups.slice(0, 3);
    const saved = await saveMap(db, ADMIN, { ...v.recipe, content: { ...v.recipe.content!, groups } }, v.updatedAt, Date.now() + 5);
    expect(saved.ok).toBe(true);
    resetMapsCache();
    await getMapRecipes(db);
    expect(CLUSTERS.forest).toHaveLength(3);
    const again = (await getMapAdmin(db, "forest"))!;
    expect(await saveMap(db, ADMIN, { ...again.recipe, content: { ...again.recipe.content!, groups: [{ ...groups[0]!, kind: "no_such_beast" }] } }, again.updatedAt)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveMap(db, ADMIN, { ...again.recipe, content: { ...again.recipe.content!, groups: [{ ...groups[0]!, kind: "ve_binh" }] } }, again.updatedAt)).toMatchObject({ ok: false, error: "invalid" });
    // putting the code's groups back stores "the code's" again
    const code = (await resetMap(db, ADMIN, "forest", again.updatedAt, Date.now() + 50)).ok;
    expect(code).toBe(true);
  });

  const input = (over: Record<string, unknown> = {}) => ({ id: "rung_moi", name: "Rừng Mới", template: "forest", realm: 0, gate: { x: 100, y: 100, toX: 100, toY: 100 }, back: { map: "town", x: 60, y: 60, toX: 90, toY: 90 }, ...over });
  const gateTile = async (map: string) => {
    const v = (await getMapAdmin(db, map))!;
    const size = v.recipe.size;
    // a tile in the middle of the playing rectangle
    return { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  };

  it("creates a map from a template, joined both ways, and the game then knows it; refuses a bad id, an existing one and a gate outside the area", async () => {
    const fm = await gateTile("forest");
    const tm = await gateTile("town");
    const good = input({ gate: { x: fm.x, y: fm.y, toX: tm.x, toY: tm.y }, back: { map: "town", x: tm.x + 3, y: tm.y, toX: fm.x, toY: fm.y } });
    expect(await createMap(db, ADMIN, input({ id: "Town" }))).toMatchObject({ ok: false, error: "invalid" });
    expect(await createMap(db, ADMIN, input({ id: "forest" }))).toMatchObject({ ok: false, error: "invalid" });
    expect(await createMap(db, ADMIN, input({ ...good, template: "nope" }))).toMatchObject({ ok: false, error: "not_found" });
    expect(await createMap(db, ADMIN, { ...good, gate: { x: 0, y: 0, toX: 1, toY: 1 } })).toMatchObject({ ok: false, error: "invalid" });
    const made = await createMap(db, ADMIN, good, Date.now() + 10);
    expect(made).toMatchObject({ ok: true, id: "rung_moi" });
    resetMapsCache();
    await getMapRecipes(db);
    expect(isMapId("rung_moi")).toBe(true);
    expect(MAP_SIZE.rung_moi).toBe(MAP_SIZE.forest);
    expect(getMap("rung_moi").realm).toBe(0);
    expect(getMap("rung_moi").portals).toEqual([{ x: fm.x, y: fm.y, toMap: "town", toX: tm.x, toY: tm.y }]);
    expect(getMap("town").portals.some((p) => p.toMap === "rung_moi" && p.toX === fm.x)).toBe(true); // the way in
    expect(CLUSTERS.rung_moi!.length).toBeGreaterThan(8);
    expect((await listMaps(db)).find((m) => m.id === "rung_moi")).toMatchObject({ edited: true });
    expect(await createMap(db, ADMIN, good)).toMatchObject({ ok: false, error: "invalid" }); // already there
    expect(MAP_NAMES.rung_moi).toBe("Rừng Mới"); // the name reaches the game
    expect(await createMap(db, ADMIN, input({ id: "khong_ten", name: "" }))).toMatchObject({ ok: false, error: "invalid" }); // a new map needs a name
  });

  it("names a map without pinning the layout of a map of the code, and clears the name", async () => {
    const before = (await getMapAdmin(db, "cave"))!;
    expect(before.edited).toBe(false);
    const named = await saveMap(db, ADMIN, before.recipe, before.updatedAt, Date.now() + 100, "Hang Tối");
    expect(named.ok).toBe(true);
    resetMapsCache();
    await getMapRecipes(db);
    expect(MAP_NAMES.cave).toBe("Hang Tối");
    const after = (await getMapAdmin(db, "cave"))!;
    expect(after.name).toBe("Hang Tối");
    expect(after.edited).toBe(false); // still the code's grid
    expect(overrideRecipe("cave")).toBeUndefined();
    expect(await saveMap(db, ADMIN, after.recipe, after.updatedAt, Date.now() + 200, "Hang Tối")).toMatchObject({ ok: false, error: "unchanged" });
    expect(await saveMap(db, ADMIN, after.recipe, after.updatedAt, Date.now() + 200, "  bad ")).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveMap(db, ADMIN, after.recipe, after.updatedAt, Date.now() + 200, null)).toMatchObject({ ok: true });
    resetMapsCache();
    await getMapRecipes(db);
    expect(MAP_NAMES.cave).toBeUndefined();
  });

  it("makes a safe town when the realm is none, with no monsters", async () => {
    const t = await gateTile("town2");
    const made = await createMap(db, ADMIN, input({ id: "thanh_moi", template: "town", realm: null, gate: { x: t.x, y: t.y, toX: t.x, toY: t.y }, back: { map: "town2", x: t.x + 3, y: t.y, toX: t.x, toY: t.y } }));
    expect(made.ok).toBe(true);
    const v = (await getMapAdmin(db, "thanh_moi"))!;
    expect(v.recipe).toMatchObject({ safe: true, realm: null, home: "thanh_moi" });
    expect(v.recipe.content!.groups).toEqual([]);
  });

  it("deletes a map an admin added only when nothing points at it, never a map of the code", async () => {
    const fm = await gateTile("forest");
    const tm = await gateTile("town");
    await createMap(db, ADMIN, input({ gate: { x: fm.x, y: fm.y, toX: tm.x, toY: tm.y }, back: { map: "town", x: tm.x + 3, y: tm.y, toX: fm.x, toY: fm.y } }), Date.now() + 10);
    const v = (await getMapAdmin(db, "rung_moi"))!;
    expect(await deleteMap(db, ADMIN, "forest", 0)).toMatchObject({ ok: false, error: "locked" });
    const blocked = await deleteMap(db, ADMIN, "rung_moi", v.updatedAt);
    expect(blocked).toMatchObject({ ok: false, error: "invalid" });
    expect(blocked.ok === false && blocked.problems!.join()).toContain("town");
    // take the town's gate out, put a character there, then remove the character
    const town = (await getMapAdmin(db, "town"))!;
    await saveMap(db, ADMIN, { ...town.recipe, portals: town.recipe.portals.filter((p) => p.toMap !== "rung_moi") }, town.updatedAt, Date.now() + 100);
    raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'p@x.test', 'h', 's', 1, 0)");
    raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, map_id, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'Lan', 'kim', 'rung_moi', 0, 0, 0, 0)");
    const there = await deleteMap(db, ADMIN, "rung_moi", v.updatedAt);
    expect(there).toMatchObject({ ok: false, error: "invalid" });
    expect(there.ok === false && there.problems!.join()).toContain("nhân vật");
    raw.exec("UPDATE characters SET map_id = 'town'");
    // a quest that sends players to hunt there also blocks it
    raw.prepare("INSERT INTO quests (id, chain, seq, enabled, def, updated_at, deleted_at, tomb) VALUES ('qk', 'qa', 1, 1, ?, 1, NULL, 0)").run(JSON.stringify({ id: "qk", chain: "qa", seq: 1, giver: "elder", titleVi: "x", descVi: "x", enabled: true, requires: null, objective: { kind: "kill", count: 1, map: "rung_moi" }, rewards: {} }));
    const quest = await deleteMap(db, ADMIN, "rung_moi", v.updatedAt, Date.now() + 150);
    expect(quest).toMatchObject({ ok: false, error: "invalid" });
    expect(quest.ok === false && quest.problems!.join()).toContain("nhiệm vụ qk");
    raw.exec("DELETE FROM quests WHERE id = 'qk'");
    expect((await deleteMap(db, ADMIN, "rung_moi", v.updatedAt, Date.now() + 200)).ok).toBe(true);
    resetMapsCache();
    await getMapRecipes(db);
    expect(isMapId("rung_moi")).toBe(false);
    expect(CLUSTERS.rung_moi).toBeUndefined();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TUNING, getMonsterDef, resetTuning, setItemOverlays } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { listLoot, listSpecies, saveLoot, saveSpecies } from "./monsters-admin";
import { listTuningGroups, saveTuningGroup } from "./tuning-admin";
import { resetItemsCache } from "./items-live";
import { getTuning, resetTuningCache } from "./tuning";
import { makeDb } from "./test-db";
import type { DatabaseSync } from "node:sqlite";

let db: D1Database;
let raw: DatabaseSync;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db, raw } = makeDb());
  resetTuning();
  resetTuningCache();
  resetItemsCache();
  setItemOverlays([]);
});

const token = async () => (await listSpecies(db)).token;
const species = async (id: string) => (await listSpecies(db)).species.find((s) => s.id === id)!;
const reload = async () => {
  resetTuningCache();
  await getTuning(db, Date.now() + 120_000);
};

describe("the species screen", () => {
  it("lists every species with its code numbers, where it appears and whether it is the guard", async () => {
    const list = await listSpecies(db);
    expect(list.species.length).toBe(17);
    expect(await species("soi_rung")).toMatchObject({ changed: false, guard: false, maps: ["forest"], bossOf: [] });
    expect(await species("ve_binh")).toMatchObject({ guard: true });
    expect(await species("huyet_lang_vuong")).toMatchObject({ bossOf: ["forest"], maps: [] });
  });

  it("renames a species and changes a number, keeping the other numbers, and the game then serves it", async () => {
    const before = (await species("soi_rung")).effective;
    const res = await saveSpecies(db, ADMIN, "soi_rung", { nameVi: "Sói Núi", hpMult: 1.5 }, await token(), Date.now() + 5);
    expect(res).toMatchObject({ ok: true, changed: ["hệ số sinh lực", "tên"] });
    await reload();
    expect(getMonsterDef("soi_rung")).toMatchObject({ nameVi: "Sói Núi", hpMult: 1.5, speed: before.speed, respawnMs: before.respawnMs });
    expect((await species("soi_rung")).effective).toMatchObject({ nameVi: "Sói Núi", hpMult: 1.5 });
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]).toMatchObject({ screen: "Quái / BOSS" });
  });

  it("does not store a name equal to the code's, and says when nothing changed", async () => {
    expect(await saveSpecies(db, ADMIN, "soi_rung", { nameVi: "Sói Rừng" }, await token())).toEqual({ ok: false, error: "unchanged" });
    expect(await saveSpecies(db, ADMIN, "soi_rung", { nameVi: "  Sói Rừng  " }, await token())).toEqual({ ok: false, error: "unchanged" });
    expect(await saveSpecies(db, ADMIN, "soi_rung", {}, await token())).toEqual({ ok: false, error: "unchanged" });
  });

  it("refuses a chase shorter than the notice, a too fast respawn in a group, and a number out of range", async () => {
    const t = await token();
    expect(await saveSpecies(db, ADMIN, "soi_rung", { aggroRadius: 10, leashRadius: 5 }, t)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveSpecies(db, ADMIN, "soi_rung", { respawnMs: 1000 }, t)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveSpecies(db, ADMIN, "soi_rung", { hpMult: 0 }, t)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveSpecies(db, ADMIN, "soi_rung", { nameVi: "a".repeat(41) }, t)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveSpecies(db, ADMIN, "no_such_species", { hpMult: 2 }, t)).toEqual({ ok: false, error: "unknown" });
    expect((await species("soi_rung")).changed).toBe(false);
  });

  it("lets a boss or the guard keep a respawn of 0, and warns about a species as fast as the player", async () => {
    const t = await token();
    expect(await saveSpecies(db, ADMIN, "huyet_lang_vuong", { hpMult: 2 }, t, Date.now() + 5)).toMatchObject({ ok: true });
    const res = await saveSpecies(db, ADMIN, "bao_dem", { speed: 3.2 }, await token(), Date.now() + 10);
    expect((res as { warnings: string[] }).warnings[0]).toContain("không thấp hơn tốc độ chạy");
  });

  it("refuses a stale token, and puts a species back to the code's numbers", async () => {
    const t = await token();
    await saveSpecies(db, ADMIN, "heo_rung", { hpMult: 3 }, t, t + 5);
    expect(await saveSpecies(db, ADMIN, "heo_rung", { hpMult: 4 }, t)).toEqual({ ok: false, error: "version_conflict" });
    expect(await saveSpecies(db, ADMIN, "heo_rung", null, await token(), Date.now() + 20)).toMatchObject({ ok: true });
    expect((await species("heo_rung")).changed).toBe(false);
  });
});

describe("the loot tables", () => {
  const clone = () => JSON.parse(JSON.stringify(DEFAULT_TUNING.loot)) as typeof DEFAULT_TUNING.loot;
  const withLine = (loot: typeof DEFAULT_TUNING.loot, item: string) => {
    loot.base.normal.push({ item, chance: 0.5, min: 1, max: 2 });
    return loot;
  };

  it("lists the default tables, the realms and the items to choose from", async () => {
    const list = await listLoot(db);
    expect(list.loot).toEqual(DEFAULT_TUNING.loot);
    expect(list.realms.map((r) => r.key)).toEqual(["0", "1", "2", "3"]);
    expect(list.items.some((i) => i.id === "yeu_dan")).toBe(true);
  });

  it("saves a new line, which the game then rolls, and logs it", async () => {
    const t = (await listLoot(db)).token;
    expect(await saveLoot(db, ADMIN, withLine(clone(), "thu_cot"), t, Date.now() + 5)).toMatchObject({ ok: true, changed: ["+1", "-0"] });
    await reload();
    expect((await getTuning(db)).loot.base.normal.at(-1)).toMatchObject({ item: "thu_cot", chance: 0.5 });
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!.content).toContain("bảng rơi");
  });

  it("refuses new lines naming an unknown item, equipment or a deleted item, and a stale token or no change", async () => {
    const t = (await listLoot(db)).token;
    expect(await saveLoot(db, ADMIN, withLine(clone(), "no_such_item"), t)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveLoot(db, ADMIN, withLine(clone(), "eq.weapon.1"), t)).toMatchObject({ ok: false, error: "invalid" });
    setItemOverlays([{ id: "su_kien", custom: true, disabled: true, def: { id: "su_kien", nameVi: "Sự Kiện", descVi: "Thử.", category: "material", maxStack: 9, rarity: "common", grade: 1 } }]);
    expect(await saveLoot(db, ADMIN, withLine(clone(), "su_kien"), t)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveLoot(db, ADMIN, clone(), t)).toEqual({ ok: false, error: "unchanged" });
    expect(await saveLoot(db, ADMIN, { base: { normal: [] } }, t)).toMatchObject({ ok: false, error: "invalid" });
    await saveLoot(db, ADMIN, withLine(clone(), "thu_cot"), t, t + 5);
    expect(await saveLoot(db, ADMIN, clone(), t)).toEqual({ ok: false, error: "version_conflict" });
  });

  it("does not let a line that went stale block a change elsewhere", async () => {
    const stale = clone();
    stale.base.rare2.push({ item: "removed_from_code", chance: 0.1, min: 1, max: 1 });
    raw.exec(`INSERT OR REPLACE INTO game_tuning (name, value, updated_at, updated_by) VALUES ('loot', '${JSON.stringify(stale)}', 5, 'a')`);
    const list = await listLoot(db);
    const edited = JSON.parse(JSON.stringify(list.loot)) as typeof stale;
    edited.base.normal[0]!.chance = 0.2;
    expect(await saveLoot(db, ADMIN, edited, list.token, Date.now() + 5)).toMatchObject({ ok: true });
  });
});

describe("the boss of a map", () => {
  const group = async () => (await listTuningGroups(db, "boss")).find((g) => g.group === "boss")!;
  const withSpecies = (g: Awaited<ReturnType<typeof group>>, species: Record<string, string | null>) => ({ ...(g.value as object), species: { ...(g.value as { species: object }).species, ...species } });

  it("refuses a species that stands in the groups of a map, the guard, a town and an unknown species", async () => {
    const g = await group();
    for (const [map, kind] of [["forest", "soi_rung"], ["cave", "ve_binh"], ["town", "huyet_lang_vuong"], ["cave", "no_such"], ["forest", "xich_thi"]] as const) {
      const res = await saveTuningGroup(db, "boss", withSpecies(g, { [map]: kind }), g.updatedAt, ADMIN);
      expect(res, `${map} ${kind}`).toMatchObject({ ok: false, error: "invalid" });
    }
  });

  it("accepts a free species, takes the boss away with null, and refuses a change while the boss is on the map", async () => {
    const g = await group();
    expect(await saveTuningGroup(db, "boss", withSpecies(g, { cave: "huyet_lang_vuong" }), g.updatedAt, ADMIN, g.updatedAt + 5)).toMatchObject({ ok: true });
    const g2 = await group();
    expect(await saveTuningGroup(db, "boss", withSpecies(g2, { cave: null }), g2.updatedAt, ADMIN, g2.updatedAt + 5)).toMatchObject({ ok: true });
    raw.exec("INSERT INTO world_boss (map_id, room, claimed_at) VALUES ('forest', 'forest:1', 1)");
    // A claim older than the time limit is a lost one: it does not block.
    const old = await group();
    expect(await saveTuningGroup(db, "boss", withSpecies(old, { forest: "quy_vuong" }), old.updatedAt, ADMIN, old.updatedAt + 5)).toMatchObject({ ok: true });
    raw.exec(`UPDATE world_boss SET claimed_at = ${Date.now()} WHERE map_id = 'forest'`);
    const g3 = await group();
    const res = await saveTuningGroup(db, "boss", withSpecies(g3, { forest: "hoa_long_vuong" }), g3.updatedAt, ADMIN);
    expect(res).toMatchObject({ ok: false, error: "invalid" });
    expect((res as { problems: string[] }).problems[0]).toContain("boss đang có mặt");
  });
});

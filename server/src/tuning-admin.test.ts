import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TUNING, getPath, resetTuning } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { listTuningGroups, saveTuningGroup } from "./tuning-admin";
import { getTuning, resetTuningCache } from "./tuning";
import { makeDb } from "./test-db";

let db: D1Database;
beforeEach(() => {
  db = makeDb().db;
  resetTuning();
  resetTuningCache();
});

async function group(name: string) {
  const g = (await listTuningGroups(db)).find((x) => x.group === name)!;
  return { token: g.updatedAt, value: JSON.parse(JSON.stringify(g.value)) as Record<string, unknown> };
}
const version = async () => (await db.prepare("SELECT version FROM config_versions WHERE name = 'tuning'").first<{ version: number }>())!.version;

describe("saving a tuning group", () => {
  it("lists the groups of the screen with defaults and a token, seeding the rows", async () => {
    const groups = await listTuningGroups(db);
    expect(groups.map((g) => g.group)).toEqual(["pvp", "waygate", "aoi", "combat", "gearLooks", "theme"]);
    expect(groups[1]).toMatchObject({ value: DEFAULT_TUNING.waygate, default: DEFAULT_TUNING.waygate, stored: true, updatedBy: null });
  });

  it("lists the realms and potential pages separately, and saves an exp group", async () => {
    expect((await listTuningGroups(db, "realms")).map((g) => g.group)).toEqual(["exp", "breakthrough", "kills"]);
    expect((await listTuningGroups(db, "potential")).map((g) => g.group)).toEqual(["stats"]);
    const e = (await listTuningGroups(db, "realms")).find((g) => g.group === "exp")!;
    const value = JSON.parse(JSON.stringify(e.value));
    value.overflowMax = 0.5;
    expect(await saveTuningGroup(db, "exp", value, e.updatedAt, "a@x.test", e.updatedAt + 5)).toMatchObject({ ok: true, changes: 1 });
    expect((await getTuning(db, Date.now() + 120_000)).exp.overflowMax).toBe(0.5);
    const s = (await listTuningGroups(db, "potential"))[0]!;
    const stats = JSON.parse(JSON.stringify(s.value));
    stats.rateCap = 150;
    expect(await saveTuningGroup(db, "stats", stats, s.updatedAt)).toEqual({ ok: false, error: "invalid" });
  });

  it("saves, bumps the version, writes the log and is read back by the game", async () => {
    const { token, value } = await group("waygate");
    const before = await version();
    (value as { base: number }).base = 800;
    const res = await saveTuningGroup(db, "waygate", value, token, "a@x.test", token + 1000);
    expect(res).toMatchObject({ ok: true, changes: 1 });
    expect(await version()).toBe(before + 1);
    const log = await listAdminLog(db, parseLogQuery(new URLSearchParams()));
    expect(log.rows[0]).toMatchObject({ adminEmail: "a@x.test", screen: "Chỉ số khác" });
    expect(log.rows[0]!.content).toContain("Phí cơ bản: 500 → 800");
    expect((await getTuning(db, Date.now() + 120_000)).waygate.base).toBe(800);
    expect((await group("waygate")).token).toBeGreaterThan(token);
  });

  it("refuses a stale token and leaves the row, the version and the log alone", async () => {
    const { token, value } = await group("aoi");
    const before = await version();
    (value as { everyTicks: number }).everyTicks = 7;
    expect(await saveTuningGroup(db, "aoi", value, token, "a@x.test", token + 10)).toMatchObject({ ok: true });
    (value as { everyTicks: number }).everyTicks = 9;
    expect(await saveTuningGroup(db, "aoi", value, token, "b@x.test", token + 20)).toEqual({ ok: false, error: "version_conflict" });
    expect((await group("aoi")).value).toMatchObject({ everyTicks: 7 });
    expect(await version()).toBe(before + 1);
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).total).toBe(1);
  });

  it("rejects an unknown group, a missing or fractional field, an invalid combination and a save that changes nothing", async () => {
    const { token, value } = await group("pvp");
    expect(await saveTuningGroup(db, "itemValue", value, token, "a@x.test")).toEqual({ ok: false, error: "unknown_group" });
    expect(await saveTuningGroup(db, "pvp", value, token, "a@x.test")).toEqual({ ok: false, error: "unchanged" });
    const missing = JSON.parse(JSON.stringify(value));
    delete missing.satKhi.perKill;
    expect(await saveTuningGroup(db, "pvp", missing, token, "a@x.test")).toEqual({ ok: false, error: "invalid" });
    const fractional = JSON.parse(JSON.stringify(value));
    fractional.nameTiers.orangeFrom = 250.5;
    expect(await saveTuningGroup(db, "pvp", fractional, token, "a@x.test")).toEqual({ ok: false, error: "invalid" });
    const order = JSON.parse(JSON.stringify(value));
    order.nameTiers.yellowFrom = 300; // yellow must stay below orange
    expect(await saveTuningGroup(db, "pvp", order, token, "a@x.test")).toEqual({ ok: false, error: "invalid" });
    const share = JSON.parse(JSON.stringify(value));
    share.dropChance[2] = 1.5;
    expect(await saveTuningGroup(db, "pvp", share, token, "a@x.test")).toEqual({ ok: false, error: "invalid" });
    expect(getPath((await group("pvp")).value, "nameTiers.yellowFrom")).toBe(1);
  });

  it("saves combat numbers and theme colours, and refuses a colour that is not one", async () => {
    const c = await group("combat");
    (c.value as { deathExpLoss: number }).deathExpLoss = 0.2;
    expect(await saveTuningGroup(db, "combat", c.value, c.token, "a@x.test", c.token + 5)).toMatchObject({ ok: true });
    const t = await group("theme");
    const bad = JSON.parse(JSON.stringify(t.value));
    bad.ui["ui-accent"] = "javascript:alert(1)";
    expect(await saveTuningGroup(db, "theme", bad, t.token, "a@x.test")).toEqual({ ok: false, error: "invalid" });
    const next = JSON.parse(JSON.stringify(t.value));
    next.realmColors[0] = "#112233";
    next.ui["ui-page"] = "rgba(1, 2, 3, 0.5)";
    expect(await saveTuningGroup(db, "theme", next, t.token, "a@x.test", t.token + 5)).toMatchObject({ ok: true, changes: 2 });
    expect((await getTuning(db, Date.now() + 120_000)).theme.ui["ui-page"]).toBe("rgba(1, 2, 3, 0.5)");
    expect((await getTuning(db, Date.now() + 120_000)).combat.deathExpLoss).toBe(0.2);
  });

  it("ignores keys that are not fields and keeps what the screen does not show", async () => {
    const { token, value } = await group("waygate");
    const res = await saveTuningGroup(db, "waygate", { ...value, perUnit: 55, evil: "x" }, token, "a@x.test", token + 5);
    expect(res).toMatchObject({ ok: true });
    const raw = await db.prepare("SELECT value FROM game_tuning WHERE name = 'waygate'").first<{ value: string }>();
    expect(JSON.parse(raw!.value)).toEqual({ base: 500, perUnit: 55 });
  });

  it("reports a stored row that no longer fits as not stored, serving the default", async () => {
    await listTuningGroups(db);
    await db.prepare("UPDATE game_tuning SET value = '{\"base\":\"x\"}', updated_by = 'a@x.test' WHERE name = 'waygate'").run();
    const g = (await listTuningGroups(db)).find((x) => x.group === "waygate")!;
    expect(g).toMatchObject({ stored: false, value: DEFAULT_TUNING.waygate });
  });
});

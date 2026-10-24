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
    expect(groups.map((g) => g.group)).toEqual(["pvp", "waygate", "aoi"]);
    expect(groups[1]).toMatchObject({ value: DEFAULT_TUNING.waygate, default: DEFAULT_TUNING.waygate, stored: true, updatedBy: null });
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
    expect(await saveTuningGroup(db, "monsters", value, token, "a@x.test")).toEqual({ ok: false, error: "unknown_group" });
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

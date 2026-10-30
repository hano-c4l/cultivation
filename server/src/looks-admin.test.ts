import { beforeEach, describe, expect, it } from "vitest";
import { resetTuning, tuning } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { LOOK_GROUPS, listLookGroups, saveLookGroup } from "./looks-admin";
import { getTuning, resetTuningCache } from "./tuning";
import { makeDb } from "./test-db";

let db: D1Database;
beforeEach(() => {
  db = makeDb().db;
  resetTuning();
  resetTuningCache();
});

const get = async (name: string) => {
  const g = (await listLookGroups(db)).find((x) => x.group === name)!;
  return { token: g.updatedAt, value: JSON.parse(JSON.stringify(g.value)) as Record<string, unknown> };
};

describe("picture groups", () => {
  it("lists every picture group with its default", async () => {
    const groups = await listLookGroups(db);
    expect(groups.map((g) => g.group)).toEqual([...LOOK_GROUPS]);
    expect(groups.find((g) => g.group === "iconLooks")!.value).toEqual({ items: {}, skills: {}, kinds: {} });
  });

  it("saves an icon choice, bumps the version, logs it and the game reads it back", async () => {
    const before = await get("iconLooks");
    const next = { ...before.value, items: { hoi_huyet_dan: "heal" } };
    const r = await saveLookGroup(db, "iconLooks", next, before.token, "a@x.test", before.token + 5);
    expect(r).toMatchObject({ ok: true, changes: 1 });
    expect((await getTuning(db, Date.now() + 120_000)).iconLooks.items.hoi_huyet_dan).toBe("heal");
    const log = await listAdminLog(db, parseLogQuery(new URLSearchParams()));
    expect(JSON.stringify(log)).toContain("iconLooks");
    expect(tuning().iconLooks).toBeDefined();
  });

  it("refuses a shape that does not exist, an interface shape, an unknown group and a stale token", async () => {
    const g = await get("iconLooks");
    expect(await saveLookGroup(db, "iconLooks", { ...g.value, items: { x: "nope" } }, g.token, "a@x.test")).toEqual({ ok: false, error: "invalid" });
    expect(await saveLookGroup(db, "iconLooks", { ...g.value, items: { x: "stone" } }, g.token, "a@x.test")).toEqual({ ok: false, error: "invalid" });
    expect(await saveLookGroup(db, "pvp", {}, 0, "a@x.test")).toEqual({ ok: false, error: "unknown_group" });
    expect(await saveLookGroup(db, "iconLooks", { ...g.value }, g.token, "a@x.test")).toEqual({ ok: false, error: "unchanged" });
    const ok = await saveLookGroup(db, "iconLooks", { ...g.value, skills: { khi_co_ban: "nova" } }, g.token, "a@x.test", g.token + 5);
    expect(ok.ok).toBe(true);
    expect(await saveLookGroup(db, "iconLooks", { ...g.value, skills: { khi_co_ban: "heal" } }, g.token, "b@x.test", g.token + 9)).toEqual({ ok: false, error: "version_conflict" });
  });

  it("saves a model for a species and an outfit rule list", async () => {
    const m = await get("monsterModels");
    expect(await saveLookGroup(db, "monsterModels", { ...m.value, heo_rung: "cat" }, m.token, "a@x.test", m.token + 5)).toMatchObject({ ok: true });
    const o = await get("outfits");
    expect(await saveLookGroup(db, "outfits", { rules: [{ minRealm: 0, outfit: "tien" }] }, o.token, "a@x.test", o.token + 5)).toMatchObject({ ok: true });
    expect(await saveLookGroup(db, "outfits", { rules: [{ minRealm: 0, outfit: "BAD!" }] }, o.token + 5, "a@x.test")).toEqual({ ok: false, error: "invalid" });
  });
});

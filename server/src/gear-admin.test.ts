import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ENHANCE_TABLE, enhanceTable, setEnhanceTable } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { resetEnhanceCache } from "./enhance";
import { getEnhanceView, getMasterView, getSetsView, saveEnhance, saveMaster, saveSets } from "./gear-admin";
import { getGearMaster, resetGearMasterCache } from "./gear-master";
import { makeDb } from "./test-db";

let db: D1Database;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db } = makeDb());
  resetGearMasterCache();
  resetEnhanceCache();
  setEnhanceTable(null);
});

const logs = async () => (await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows.map((r) => r.content);

describe("the master table", () => {
  it("lists a kind with both styles, every realm and bậc", async () => {
    const v = (await getMasterView(db, "hat"))!;
    expect(v.rows.length).toBe(2 * 6 * 9);
    expect((await getMasterView(db, "weapon"))!.rows.length).toBe(6 * 9);
    expect(await getMasterView(db, "bonded")).toBeNull();
    expect(Object.keys(v.rows[0]!.stats).length).toBeGreaterThan(0);
  });

  it("saves only the changed rows, bumps the version, the game then rolls from the new range, and logs it", async () => {
    const v = (await getMasterView(db, "weapon"))!;
    const row = v.rows[0]!;
    const next = { ...row.stats, attack: [50, 60] as [number, number] };
    const res = await saveMaster(db, ADMIN, "weapon", { [row.key]: next }, v.token, Date.now() + 5);
    expect(res).toMatchObject({ ok: true, token: v.token + 1 });
    resetGearMasterCache();
    expect((await getGearMaster(db, Date.now() + 120_000)).stats.get(row.key)!.attack).toEqual([50, 60]);
    expect((await logs())[0]).toContain("Sửa bảng master trang bị «weapon»: 1 dòng");
  });

  it("refuses a stale token, an unchanged save, changed stat keys, a bad range and an unknown row", async () => {
    const v = (await getMasterView(db, "weapon"))!;
    const row = v.rows[0]!;
    expect(await saveMaster(db, ADMIN, "weapon", { [row.key]: { ...row.stats, attack: [1, 2] } }, v.token + 4)).toMatchObject({ ok: false, error: "version_conflict" });
    expect(await saveMaster(db, ADMIN, "weapon", { [row.key]: row.stats }, v.token)).toMatchObject({ ok: false, error: "unchanged" });
    expect(await saveMaster(db, ADMIN, "weapon", { [row.key]: { ...row.stats, defense: [5, 6] } }, v.token)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveMaster(db, ADMIN, "weapon", { [row.key]: { ...row.stats, attack: [9, 3] } }, v.token)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveMaster(db, ADMIN, "weapon", { "weapon.u.9.9": row.stats }, v.token)).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("the set names", () => {
  it("renames sets, and the game serves the new names", async () => {
    const v = await getSetsView(db);
    expect(v.realms.length).toBe(6);
    const names = v.realms.map((r) => [...r.names]);
    names[0]![0] = "Tân Y";
    expect(await saveSets(db, ADMIN, names, v.token, Date.now() + 5)).toMatchObject({ ok: true });
    resetGearMasterCache();
    expect((await getGearMaster(db, Date.now() + 120_000)).setNames[0]![0]).toBe("Tân Y");
    expect((await logs())[0]).toContain("Lăng Y → Tân Y");
    const again = await getSetsView(db);
    expect(await saveSets(db, ADMIN, again.realms.map((r) => r.names), again.token)).toMatchObject({ ok: false, error: "unchanged" });
    names[1]![2] = "";
    expect(await saveSets(db, ADMIN, names, again.token)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveSets(db, ADMIN, names, again.token + 3)).toMatchObject({ ok: false, error: "version_conflict" });
  });
});

describe("the blacksmith table", () => {
  it("edits a step, the shared table follows after a reload, and a bad step is refused", async () => {
    const v = await getEnhanceView(db);
    expect(v.rows).toEqual([...DEFAULT_ENHANCE_TABLE]);
    const rows = v.rows.map((r) => ({ ...r }));
    rows[2]!.successPct = 77;
    rows[9]!.dropOnFail = false;
    expect(await saveEnhance(db, ADMIN, rows, v.token, Date.now() + 5)).toMatchObject({ ok: true });
    resetEnhanceCache();
    await getEnhanceView(db);
    expect(enhanceTable()[2]!.successPct).toBe(77);
    expect(enhanceTable()[9]!.dropOnFail).toBe(false);
    expect((await logs())[0]).toContain("+3, +10");
    const again = await getEnhanceView(db);
    expect(await saveEnhance(db, ADMIN, again.rows, again.token)).toMatchObject({ ok: false, error: "unchanged" });
    expect(await saveEnhance(db, ADMIN, again.rows.map((r) => (r.level === 1 ? { ...r, successPct: 120 } : r)), again.token)).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveEnhance(db, ADMIN, rows, v.token)).toMatchObject({ ok: false, error: "version_conflict" });
  });
});

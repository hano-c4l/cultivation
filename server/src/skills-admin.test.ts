import { beforeEach, describe, expect, it } from "vitest";
import { baseSkill, getSkill, resetTuning } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { listSkills, saveSkillOverride } from "./skills-admin";
import { getTuning, resetTuningCache } from "./tuning";
import { makeDb } from "./test-db";

let db: D1Database;
const ADMIN = "admin@x.test";

beforeEach(() => {
  db = makeDb().db;
  resetTuning();
  resetTuningCache();
});

const entry = async (id: string) => (await listSkills(db)).skills.find((s) => s.id === id && !s.template) ?? (await listSkills(db)).skills.find((s) => s.id === id)!;
const token = async () => (await listSkills(db)).token;

describe("the skills screen", () => {
  it("lists every skill and every root template with the code's numbers and an example", async () => {
    const list = await listSkills(db);
    expect(list.skills.filter((s) => s.template).map((s) => s.id).sort()).toEqual(["bd_cong", "bd_mang", "bd_than", "bd_thu", "chi", "chuong", "cuong_luc", "hoi", "phong_bo", "thuan", "tram"]);
    const tram2 = list.skills.find((s) => s.id === "tram_2")!;
    expect(tram2).toMatchObject({ template: false, kind: "attack", override: null, templateOverride: null });
    expect(tram2.example!.power).toBeGreaterThan(tram2.base.power); // the realm scales an attack
    expect(list.skills.find((s) => s.id === "bd_cong")!.fields).toEqual(["nameVi", "descVi", "power"]);
  });

  it("saves a change, which the game then serves, and logs it", async () => {
    const res = await saveSkillOverride(db, ADMIN, "chuong_1", { power: 3, mpCost: 12 }, await token(), Date.now() + 5);
    expect(res).toMatchObject({ ok: true, changed: ["sức mạnh", "MP"], reset: false });
    resetTuningCache();
    await getTuning(db, Date.now() + 120_000);
    expect(getSkill("chuong_1")).toMatchObject({ power: 3, mpCost: 12 });
    expect((await entry("chuong_1")).override).toEqual({ power: 3, mpCost: 12 });
    const log = (await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!;
    expect(log).toMatchObject({ screen: "Kỹ năng", adminEmail: ADMIN });
    expect(log.content).toContain("chuong_1");
  });

  it("keeps only what differs from the code, and a template entry shows on every realm with the own entry winning", async () => {
    const base = baseSkill("tram_0")!;
    await saveSkillOverride(db, ADMIN, "tram", { power: base.power, mpCost: 99 }, await token(), Date.now() + 5);
    expect((await entry("tram")).override).toEqual({ mpCost: 99 });
    expect((await entry("tram_3")).templateOverride).toEqual({ mpCost: 99 });
    expect((await entry("tram_3")).effective.mpCost).toBe(99);
    await saveSkillOverride(db, ADMIN, "tram_3", { mpCost: 50 }, await token(), Date.now() + 10);
    expect((await entry("tram_3")).effective.mpCost).toBe(50);
    expect((await entry("tram_2")).effective.mpCost).toBe(99);
  });

  it("does not copy a template's values into a skill when it is saved as it shows", async () => {
    await saveSkillOverride(db, ADMIN, "tram", { mpCost: 99, nameVi: "Chém Mới" }, await token(), Date.now() + 5);
    const shown = await entry("tram_2");
    expect(shown.effective.mpCost).toBe(99);
    // The form shows the effective numbers; saving them untouched changes nothing, and the skill keeps following the template.
    expect(await saveSkillOverride(db, ADMIN, "tram_2", { mpCost: shown.effective.mpCost, nameVi: shown.effective.nameVi, power: shown.effective.power }, await token())).toEqual({ ok: false, error: "unchanged" });
    expect((await entry("tram_2")).override).toBeNull();
    await saveSkillOverride(db, ADMIN, "tram", { mpCost: 70, nameVi: "Chém Mới" }, await token(), Date.now() + 10);
    expect((await entry("tram_2")).effective.mpCost).toBe(70);
    // Pinning the code's own number is a real change when the template differs from it.
    expect(await saveSkillOverride(db, ADMIN, "tram_2", { mpCost: baseSkill("tram_2")!.mpCost }, await token(), Date.now() + 20)).toMatchObject({ ok: true });
    expect((await entry("tram_2")).effective.mpCost).toBe(baseSkill("tram_2")!.mpCost);
  });

  it("trims a name before comparing it with the code's", async () => {
    expect(await saveSkillOverride(db, ADMIN, "chi_0", { nameVi: `${baseSkill("chi_0")!.nameVi}  ` }, await token())).toEqual({ ok: false, error: "unchanged" });
  });

  it("puts a skill back to the code's numbers, and says when there is nothing to change", async () => {
    await saveSkillOverride(db, ADMIN, "hoi_0", { power: 0.5 }, await token(), Date.now() + 5);
    expect(await saveSkillOverride(db, ADMIN, "hoi_0", { power: 0.5 }, await token(), Date.now() + 6)).toEqual({ ok: false, error: "unchanged" });
    expect(await saveSkillOverride(db, ADMIN, "hoi_0", null, await token(), Date.now() + 10)).toMatchObject({ ok: true, reset: true });
    expect((await entry("hoi_0")).override).toBeNull();
    expect(await saveSkillOverride(db, ADMIN, "hoi_0", null, await token())).toEqual({ ok: false, error: "unchanged" });
    expect(await saveSkillOverride(db, ADMIN, "hoi_0", { power: baseSkill("hoi_0")!.power }, await token())).toEqual({ ok: false, error: "unchanged" });
  });

  it("refuses a stale token, an unknown skill and a key that is not a skill", async () => {
    const t = await token();
    await saveSkillOverride(db, ADMIN, "chi_0", { range: 7 }, t, t + 5);
    expect(await saveSkillOverride(db, ADMIN, "chi_0", { range: 8 }, t, t + 10)).toEqual({ ok: false, error: "version_conflict" });
    expect((await entry("chi_0")).override).toEqual({ range: 7 });
    expect(await saveSkillOverride(db, ADMIN, "no_such_skill", { power: 1 }, await token())).toEqual({ ok: false, error: "unknown_skill" });
    expect(await saveSkillOverride(db, ADMIN, "kim", { power: 1 }, await token())).toEqual({ ok: false, error: "unknown_skill" });
  });

  it("refuses fields that do not fit the kind, and numbers out of range", async () => {
    const t = await token();
    const bad: Array<[string, Record<string, unknown>]> = [
      ["bd_cong_0", { mpCost: 5 }], // a passive has no cost
      ["hoi_0", { range: 5 }], // a heal needs no reach
      ["hoi_0", { power: 1.5 }], // a heal is a share of the maximum HP
      ["thuan_0", { fx: "melee" }], // only attacks have an effect to pick
      ["chuong_0", { buffDurationMs: 5000 }],
      ["chuong_0", { fx: "cone" }],
      ["chuong_0", { power: 0 }],
      ["chuong_0", { cooldownMs: 100 }],
      ["chuong_0", { nameVi: "   " }],
      ["chuong_0", { descVi: "a".repeat(201) }],
      ["pt_thuan_di", { power: 2 }], // a teleport has no power
      ["thuan_0", { buffDurationMs: 100 }],
    ];
    for (const [id, fields] of bad) expect(await saveSkillOverride(db, ADMIN, id, fields, t), `${id} ${JSON.stringify(fields)}`).toMatchObject({ ok: false, error: "invalid" });
    expect((await entry("chuong_0")).override).toBeNull();
    expect(await saveSkillOverride(db, ADMIN, "thuan_0", { buffDurationMs: 30_000, nameVi: "Thuẫn Mới" }, t, t + 5)).toMatchObject({ ok: true });
  });
});

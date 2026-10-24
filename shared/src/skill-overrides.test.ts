import { afterEach, describe, expect, it } from "vitest";
import { SKILLS, SKILL_TEMPLATES, baseSkill, getSkill, isSkillTemplateId, passiveTotals, rootTemplateOf } from "./skills";
import { DEFAULT_TUNING, resetTuning, setTuning, validTuningGroup } from "./tuning";

afterEach(() => resetTuning());

const withOverrides = (skillOverrides: Record<string, unknown>) => setTuning({ skillOverrides });

describe("skill overrides", () => {
  it("with none, every skill is exactly the one the code gives", () => {
    for (const s of SKILLS) expect(getSkill(s.id), s.id).toBe(s);
  });

  it("no template id is a skill id, so a template key can never hit a single skill", () => {
    const ids = new Set(SKILLS.map((s) => s.id));
    for (const t of SKILL_TEMPLATES) {
      expect(ids.has(t.id), t.id).toBe(false);
      expect(isSkillTemplateId(t.id)).toBe(true);
    }
    expect(isSkillTemplateId("tram_2")).toBe(false);
  });

  it("applies an entry under a template to that skill in every realm, and only to root skills", () => {
    withOverrides({ tram: { power: 5, nameVi: "Chém Mới" } });
    for (const realm of [0, 1, 2, 3]) expect(getSkill(`tram_${realm}`), `tram_${realm}`).toMatchObject({ power: 5, nameVi: "Chém Mới" });
    expect(rootTemplateOf("tram_2")).toBe("tram");
    expect(rootTemplateOf("kim_3")).toBeUndefined(); // a book skill, even if a template were called kim
    withOverrides({ kim: { power: 9 } });
    expect(getSkill("kim_3")).toBe(baseSkill("kim_3"));
  });

  it("lets the entry under the full id win over the template", () => {
    withOverrides({ tram: { power: 5, mpCost: 40 }, tram_2: { power: 7 } });
    expect(getSkill("tram_2")).toMatchObject({ power: 7, mpCost: 40 });
    expect(getSkill("tram_1")).toMatchObject({ power: 5, mpCost: 40 });
  });

  it("changes the length of a buff and the effect of an attack, and leaves the base object alone", () => {
    const base = baseSkill("thuan_0")!;
    withOverrides({ thuan_0: { buffDurationMs: 30_000 }, chuong_1: { fx: "melee" } });
    expect(getSkill("thuan_0")!.buff).toEqual({ ...base.buff, durationMs: 30_000 });
    expect(base.buff!.durationMs).toBe(15_000);
    expect(getSkill("chuong_1")!.fx).toBe("melee");
  });

  it("makes the passive skills of a character follow an override", () => {
    const base = passiveTotals(["bd_cong_0"], {}, 0).attackPct;
    withOverrides({ bd_cong_0: { power: 0.16 } });
    expect(passiveTotals(["bd_cong_0"], {}, 0).attackPct).toBeCloseTo(base * 2, 5);
  });

  it("accepts the rows of today's shape (a superset) and checks only the structure", () => {
    expect(validTuningGroup("skillOverrides", DEFAULT_TUNING.skillOverrides)).toBe(true);
    expect(validTuningGroup("skillOverrides", { chuong_0: { power: 2, mpCost: 5, cooldownMs: 1000, range: 4 } })).toBe(true);
    expect(validTuningGroup("skillOverrides", { an_id_that_does_not_exist: { nameVi: "Lạ" } })).toBe(true); // existence is checked where an admin saves
    expect(validTuningGroup("skillOverrides", { chuong_0: { fx: "cone" } })).toBe(false);
    expect(validTuningGroup("skillOverrides", { chuong_0: { nameVi: "  " } })).toBe(false);
    expect(validTuningGroup("skillOverrides", { chuong_0: { color: "red" } })).toBe(false);
  });
});

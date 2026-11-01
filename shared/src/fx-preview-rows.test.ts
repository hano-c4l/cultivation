import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TUNING } from "./tuning";
import { getSkill } from "./skills";
import { skillLookOf } from "./skill-looks";
import { resetTuning, setTuning } from "./tuning";

afterEach(() => resetTuning());

/** The rows the Admin's effect preview installs (client/admin/src/fx-preview.ts): they must pass validation, or the preview would quietly draw the code's defaults. */
describe("the rows of the Admin effect preview", () => {
  it("are accepted by setTuning, and change the look, the effect others see and the power of the skill", () => {
    const base = getSkill("kim_3")!;
    setTuning({ skillLooks: { ...DEFAULT_TUNING.skillLooks, kim_3: "meteor" }, skillOverrides: { kim_3: { fx: "melee", power: base.power + 1 } } });
    const def = getSkill("kim_3")!;
    expect(skillLookOf(def)).toBe("meteor");
    expect(def.fx).toBe("melee");
    expect(def.power).toBe(base.power + 1);
  });

  it("an empty override leaves the skill as the code has it", () => {
    setTuning({ skillLooks: { ...DEFAULT_TUNING.skillLooks }, skillOverrides: {} });
    const def = getSkill("kim_3")!;
    expect(def.fx).toBeUndefined();
    expect(skillLookOf(def)).toBe(DEFAULT_TUNING.skillLooks.kim_3);
  });
});

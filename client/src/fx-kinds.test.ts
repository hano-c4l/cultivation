import { getSkill, resetTuning, setTuning, SKILLS } from "@game/shared";
import { afterEach, describe, expect, it } from "vitest";
import { BASIC_COLOR, BASIC_MELEE_MAX_PX, BUFF_COLOR, ELEMENT_COLOR, basicFxOf, basicProjectileOf, elementStyleOf, skillFxOf, weaponEquipped } from "./fx-kinds";

afterEach(() => resetTuning());

describe("which effect a skill uses", () => {
  it("honours the effect an admin picked, for one skill or for a whole template", () => {
    setTuning({ skillOverrides: { chi: { fx: "melee" }, chuong_2: { fx: "ranged" } } });
    expect(skillFxOf(getSkill("chi_1"))).toBe("melee");
    expect(skillFxOf(getSkill("chuong_2"))).toBe("ranged");
    expect(skillFxOf(getSkill("chuong_1"))).toBe("melee"); // untouched
  });

  it("every skill kind has an effect, by the kind of the skill", () => {
    const of = (id: string) => skillFxOf(getSkill(id));
    expect(of("hoi_0")).toBe("heal");
    expect(of("thuan_0")).toBe("buff");
    expect(of("cuong_luc_2")).toBe("buff");
    expect(of("pt_thuan_di")).toBe("blink");
    expect(of("chuong_0")).toBe("melee");
    expect(of("tram_3")).toBe("melee");
    expect(of("chi_1")).toBe("ranged");
    expect(of("kim_4")).toBe("ranged"); // an element book skill: thrown from afar
    expect(skillFxOf(undefined)).toBe("ranged");
  });

  it("skills of the same template share an effect across realms, and every usable skill gets one", () => {
    expect(new Set(["tram_0", "tram_1", "tram_2", "tram_3"].map((id) => skillFxOf(getSkill(id))))).toEqual(new Set(["melee"]));
    for (const s of SKILLS) if (s.kind !== "passive") expect(["melee", "ranged", "cone", "blink", "buff", "heal"]).toContain(skillFxOf(s));
  });

  it("has a colour for every element and for the stats a buff raises", () => {
    for (const el of ["kim", "moc", "thuy", "hoa", "tho", "loi", "bang", "phong"]) expect(ELEMENT_COLOR[el]).toBeDefined();
    for (const stat of ["attack", "defense", "dodge"]) expect(BUFF_COLOR[stat]).toBeDefined();
  });
});

describe("the effect of a plain attack", () => {
  it("is a swing up close and a bolt from afar", () => {
    expect(basicFxOf(0)).toBe("melee");
    expect(basicFxOf(BASIC_MELEE_MAX_PX)).toBe("melee");
    expect(basicFxOf(BASIC_MELEE_MAX_PX + 1)).toBe("ranged");
    expect(BASIC_COLOR.player).not.toBe(BASIC_COLOR.monster);
  });
});

describe("element styles", () => {
  it("every element with a colour has its own style, anything else is plain", () => {
    for (const el of Object.keys(ELEMENT_COLOR)) expect(elementStyleOf(el)).toBe(el);
    expect(new Set(Object.keys(ELEMENT_COLOR).map(elementStyleOf)).size).toBe(Object.keys(ELEMENT_COLOR).length);
    expect(elementStyleOf(undefined)).toBe("plain");
    expect(elementStyleOf("nope")).toBe("plain");
  });
});

describe("basic projectile and the weapon flash", () => {
  it("a bow shoots arrows, only for players", () => {
    expect(basicProjectileOf("cung", false)).toBe("arrow");
    expect(basicProjectileOf("cung", true)).toBe("bolt");
    expect(basicProjectileOf("kiem", false)).toBe("bolt");
    expect(basicProjectileOf(undefined, false)).toBe("bolt");
  });

  it("flashes only when a weapon is put on or swapped", () => {
    expect(weaponEquipped(undefined, "kiem")).toBe(true);
    expect(weaponEquipped("kiem", "dao")).toBe(true);
    expect(weaponEquipped("kiem", "kiem")).toBe(false); // an outfit change repeats the weapon
    expect(weaponEquipped("kiem", undefined)).toBe(false); // taken off or broken
    expect(weaponEquipped(undefined, undefined)).toBe(false);
  });
});

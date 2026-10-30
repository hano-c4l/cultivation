import { DEFAULT_TUNING, EQUIP_KINDS, SKILLS, WEAPON_TYPES, allItemDefs, makeEquipmentId, resetTuning, setTuning } from "@game/shared";
import { describe, expect, it } from "vitest";
import { ELEMENT_COLOR } from "./fx-kinds";
import { iconSpecOf, skillIconSpecOf } from "./icons";

describe("item icons", () => {
  it("every catalogue item resolves to a real shape, not the question mark", () => {
    for (const def of allItemDefs()) expect(iconSpecOf(def.id).shape, def.id).not.toBe("unknown");
  });

  it("every kind of gear has its own shape, and every weapon family too", () => {
    const gendered = new Set(["hat", "robe", "bracer", "jade", "necklace"]); // worn by one gender: the id carries it
    const kinds = EQUIP_KINDS.filter((k) => k !== "weapon").map((k) => iconSpecOf(makeEquipmentId(k, gendered.has(k) ? "m" : "u", 0, 1, 1)).shape);
    expect(kinds).not.toContain("unknown");
    expect(new Set(kinds).size).toBe(kinds.length);
    const weapons = WEAPON_TYPES.map((w) => iconSpecOf(makeEquipmentId("weapon", "u", 0, 1, 1, "kim", w)).shape);
    expect(new Set(weapons).size).toBe(WEAPON_TYPES.length);
    expect(weapons).not.toContain("unknown");
  });

  it("gear carries its element and grade, and categories of other items get their own shapes", () => {
    const spec = iconSpecOf(makeEquipmentId("robe", "m", 1, 2, 3, "hoa"));
    expect(spec).toEqual({ shape: "robe", element: "hoa", grade: 3 });
    expect(Object.keys(ELEMENT_COLOR)).toContain(spec.element);
    const shapes = new Set(allItemDefs().map((d) => iconSpecOf(d.id).shape));
    for (const s of ["pill", "ore", "book"] as const) expect(shapes.has(s), s).toBe(true);
  });

  it("an unknown type gets the fallback and does not throw", () => {
    expect(iconSpecOf("no_such_item")).toEqual({ shape: "unknown", element: null, grade: 0 });
    expect(iconSpecOf("")).toEqual({ shape: "unknown", element: null, grade: 0 });
  });
});

describe("skill icons", () => {
  it("every skill gets a glyph, passives a star, and the glyph follows the effect", () => {
    for (const s of SKILLS) {
      const spec = skillIconSpecOf(s);
      expect(spec.shape, s.id).not.toBe("unknown");
      if (s.kind === "passive") expect(spec.shape).toBe("passive");
    }
    expect(skillIconSpecOf(SKILLS.find((s) => s.id === "tram_0")).shape).toBe("slash");
    expect(skillIconSpecOf(SKILLS.find((s) => s.id === "chi_0")).shape).toBe("bolt");
    expect(skillIconSpecOf(SKILLS.find((s) => s.id === "hoi_0")).shape).toBe("heal");
    expect(skillIconSpecOf(undefined).shape).toBe("unknown");
  });
});

describe("icons an Admin chose", () => {
  it("a choice for the item, for its kind or for the skill wins over what the code derives, and clearing it brings the old icon back", () => {
    const sword = makeEquipmentId("weapon", "u", 0, 1, 1, "kim", "kiem");
    const own = DEFAULT_TUNING.iconLooks;
    setTuning({ iconLooks: { ...own, kinds: { "weapon.kiem": "axe" }, skills: { khi_co_ban: "nova" }, items: { hoi_huyet_dan: "heal" } } });
    expect(iconSpecOf(sword).shape).toBe("axe");
    expect(iconSpecOf("hoi_huyet_dan").shape).toBe("heal");
    expect(skillIconSpecOf(SKILLS.find((s) => s.id === "khi_co_ban")).shape).toBe("nova");
    setTuning({ iconLooks: own });
    expect(iconSpecOf(sword).shape).toBe("sword");
    expect(iconSpecOf("hoi_huyet_dan").shape).toBe("pill");
    resetTuning();
  });
});

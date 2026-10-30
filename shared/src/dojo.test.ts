import { describe, expect, it } from "vitest";
import { DEFAULT_DOJO, DEFAULT_DOJO_COURSES, coursesOf, validDojo } from "./dojo";
import { DEFAULT_ALCHEMY, scaleBrew, validAlchemy } from "./alchemy";
import { getSkill } from "./skills";
import { canLearn } from "./skills";

describe("the martial masters", () => {
  it("every course teaches a skill that exists and can be learned, in its own town, at a fee", () => {
    for (const c of DEFAULT_DOJO_COURSES) {
      const skill = getSkill(c.skill);
      expect(skill, c.skill).toBeDefined();
      expect(skill!.learn, c.skill).toBeDefined();
      expect(canLearn(skill!, 9, 9), c.skill).toBe(true);
      expect(c.cost).toBeGreaterThan(0);
    }
    expect(coursesOf(DEFAULT_DOJO, "master").every((c) => c.npc === "master")).toBe(true);
    expect(coursesOf(DEFAULT_DOJO, "master2").length).toBeGreaterThan(0);
    expect(coursesOf(DEFAULT_DOJO, "nobody")).toEqual([]);
  });

  it("validates the list: no duplicates, no negative fee", () => {
    expect(validDojo(DEFAULT_DOJO)).toBe(true);
    expect(validDojo({ courses: [{ npc: "master", skill: "kim_3", cost: 1 }, { npc: "master", skill: "kim_3", cost: 2 }] })).toBe(false);
    expect(validDojo({ courses: [{ npc: "master", skill: "kim_3", cost: -1 }] })).toBe(false);
    expect(validDojo({})).toBe(false);
  });
});

describe("brewing in batches", () => {
  const recipe = DEFAULT_ALCHEMY.recipes[0]!;
  it("scales the materials, the fee and the pills by the number of batches, the time less than that", () => {
    const four = scaleBrew(recipe, 4, DEFAULT_ALCHEMY);
    expect(four.qty).toBe(recipe.qty * 4);
    expect(four.linhThach).toBe(recipe.linhThach * 4);
    expect(four.inputs[0]!.qty).toBe(recipe.inputs[0]!.qty * 4);
    expect(four.seconds).toBeGreaterThan(recipe.seconds);
    expect(four.seconds).toBeLessThan(recipe.seconds * 4);
    expect(scaleBrew(recipe, 1, DEFAULT_ALCHEMY)).toEqual(recipe);
  });
  it("never goes past the most batches, and an old stored config without the new fields still validates", () => {
    expect(scaleBrew(recipe, 999, { maxBatch: 5 }).qty).toBe(recipe.qty * 5);
    expect(scaleBrew(recipe, 0, {}).qty).toBe(recipe.qty);
    expect(validAlchemy({ maxJobs: 3, recipes: DEFAULT_ALCHEMY.recipes })).toBe(true);
    expect(validAlchemy({ ...DEFAULT_ALCHEMY, maxBatch: 0 })).toBe(false);
  });
});

describe("rare skills", () => {
  it("their books drop only for the realm they are for, never sold or taught, and the chance is rare", async () => {
    const { RARE_SKILLS } = await import("./skills-extra");
    const { rollRareBook, bookItemId, BOOK_SKILLS } = await import("./skills");
    expect(RARE_SKILLS.length).toBe(12);
    for (const s of RARE_SKILLS) {
      expect(s.rare).toBe(true);
      expect(DEFAULT_DOJO_COURSES.some((c) => c.skill === s.id)).toBe(false);
      expect(BOOK_SKILLS.some((b) => b.id === s.id)).toBe(false); // the ordinary book drop never picks them
    }
    expect(rollRareBook("normal", 2, () => 0)).toMatch(/^bt_(thien_co|hap_tinh)$/); // a lucky roll gives one of that realm's two
    expect(rollRareBook("normal", 2, () => 0.5)).toBeNull(); // an ordinary roll gives nothing
    expect(bookItemId("thon_linh")).toBe("bt_thon_linh");
  });
});

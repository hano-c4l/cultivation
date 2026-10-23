import { describe, expect, it } from "vitest";
import { getItemDef, isItemId } from "./items";
import { parseClientMessage } from "./protocol";
import {
  ATTACK_TEMPLATES,
  BOOK_SKILLS,
  DIVINE_GRADE,
  HOTBAR_SLOTS,
  masteryNeeded,
  SKILLS,
  addMastery,
  availableSkills,
  bookItemId,
  canLearn,
  effectiveSkill,
  emptyHotbar,
  getSkill,
  maxSkillLevel,
  parseHotbar,
  parseSkillSlot,
  rollBookDrop,
  rollRealmSkills,
  passiveTotals,
  skillGrade,
  withPassives,
} from "./skills";

/** A deterministic "random" source that walks through the given numbers. */
const seq = (...nums: number[]) => {
  let i = 0;
  return () => nums[i++ % nums.length]!;
};

describe("skills a character was given", () => {
  it("availableSkills lists only what was granted, plus the worn gear skills, in list order", () => {
    expect(availableSkills([])).toEqual([]);
    expect(availableSkills(["tram_0", "hoi_0"])).toEqual(["tram_0", "hoi_0"]);
    expect(availableSkills(["not_a_skill"])).toEqual([]);
    expect(availableSkills(["chuong_0"], ["pt_thuan_di"])).toEqual(["chuong_0", "pt_thuan_di"]);
    // A gear skill is never granted by having its id on the list.
    expect(availableSkills(["pt_thuan_di"])).toEqual([]);
  });

  it("a realm gives one attack and a different second skill, the same template never twice", () => {
    for (let n = 0; n < 200; n++) {
      let k = n;
      const rand = () => ((k = (k * 16807 + 11) % 2147483647) / 2147483647);
      const [first, second] = rollRealmSkills(1, rand);
      expect(getSkill(first!)!.kind).toBe("attack");
      expect(first!.endsWith("_1") && second!.endsWith("_1")).toBe(true);
      expect(first!.split("_")[0]).not.toBe(second!.split("_")[0]);
      expect(getSkill(second!)).toBeDefined();
    }
    expect(rollRealmSkills(0, seq(0, 0))).toEqual(["chuong_0", "tram_0"]);
    expect(rollRealmSkills(2, seq(0.99, 0.99))).toEqual([`${ATTACK_TEMPLATES[ATTACK_TEMPLATES.length - 1]!.id}_2`, "bd_mang_2"]);
  });

  it("root skills are not tied to an element: attacks pick it on the hotbar, the others have none", () => {
    for (const s of SKILLS.filter((x) => x.source === "root")) {
      expect(s.element).toBeNull();
      expect(!!s.flex).toBe(s.kind === "attack");
    }
  });

  it("a book can be learned from its level on", () => {
    const s = getSkill("ngu_kiem_tram")!;
    expect(canLearn(s, 0, 6)).toBe(false);
    expect(canLearn(s, 0, 7)).toBe(true);
    expect(canLearn(getSkill("chuong_0")!, 3, 9)).toBe(false); // not a book skill
  });

  it("every skill has sane numbers", () => {
    for (const s of SKILLS) {
      if (s.kind !== "passive") expect(s.mpCost, s.id).toBeGreaterThan(0);
      if (s.kind === "passive") expect(s.passive, s.id).toBeDefined();
      if (s.kind !== "teleport") expect(s.power, s.id).toBeGreaterThan(0);
      if (s.kind === "teleport") expect(s.range, s.id).toBeGreaterThan(0);
      if (s.kind === "attack") expect(s.range, s.id).toBeGreaterThan(0);
      if (s.kind === "buff") expect(s.buff, s.id).toBeDefined();
      if (s.kind !== "passive") expect(s.cooldownMs, s.id).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe("realm, grade and mastery make a skill stronger", () => {
  const attack = getSkill("tram_0")!;
  it("a higher realm, a higher grade and a higher level each raise the power, and never lower it", () => {
    const base = effectiveSkill(attack, { realm: 0, grade: 0, level: 0 });
    expect(base.power).toBeCloseTo(attack.power);
    expect(effectiveSkill(attack, { realm: 1, grade: 0, level: 0 }).power).toBeGreaterThan(base.power);
    expect(effectiveSkill(attack, { realm: 0, grade: 3, level: 0 }).power).toBeGreaterThan(effectiveSkill(attack, { realm: 0, grade: 1, level: 0 }).power);
    expect(effectiveSkill(attack, { realm: 0, grade: 0, level: 2 }).power).toBeGreaterThan(effectiveSkill(attack, { realm: 0, grade: 0, level: 1 }).power);
    expect(effectiveSkill(attack, { realm: 1, grade: 0, level: 0 }).mpCost).toBeGreaterThan(base.mpCost);
  });

  it("heals and buffs are capped, and the late levels shorten the cooldown", () => {
    const heal = getSkill("hoi_0")!;
    expect(effectiveSkill(heal, { realm: 3, grade: 4, level: 4 }).power).toBeLessThanOrEqual(0.9);
    const dodge = getSkill("phong_bo_0")!;
    expect(effectiveSkill(dodge, { realm: 3, grade: 4, level: 4 }).power).toBeLessThanOrEqual(0.5);
    const early = effectiveSkill(attack, { realm: 0, grade: 4, level: 0 }).cooldownMs;
    expect(effectiveSkill(attack, { realm: 0, grade: 4, level: 3 }).cooldownMs).toBeLessThan(early);
    expect(effectiveSkill(attack, { realm: 0, grade: 4, level: 4 }).cooldownMs).toBeLessThan(effectiveSkill(attack, { realm: 0, grade: 4, level: 3 }).cooldownMs);
  });

  it("a level above the grade's top is treated as the top one", () => {
    const top = maxSkillLevel(0);
    expect(effectiveSkill(attack, { realm: 0, grade: 0, level: 9 })).toEqual(effectiveSkill(attack, { realm: 0, grade: 0, level: top }));
  });

  it("which grade a skill is used at: the character's for root skills, its own for learned ones, the piece's for gear", () => {
    expect(skillGrade(getSkill("chuong_0")!, 4)).toBe(4);
    expect(skillGrade(getSkill("ngu_kiem_tram")!, 4)).toBe(2);
    expect(skillGrade(getSkill("pt_thuan_di")!, 4, 1)).toBe(1);
  });
});

describe("mastery", () => {
  it("one level takes the points MASTERY_NEEDED says, and extra points carry over", () => {
    expect(addMastery(0, 0, 1, 0)).toEqual({ level: 0, mastery: 1, up: false });
    expect(addMastery(0, masteryNeeded(0)! - 1, 1, 0)).toEqual({ level: 1, mastery: 0, up: true });
    expect(addMastery(0, 0, masteryNeeded(0)! + 7, 0)).toEqual({ level: 1, mastery: 7, up: true });
    expect(addMastery(0, 0, masteryNeeded(0)! + masteryNeeded(1)! + 3, 0)).toEqual({ level: 2, mastery: 3, up: true });
  });

  it("thần thông is only open to the high grades; below it viên mãn is the top and points stop", () => {
    expect(maxSkillLevel(DIVINE_GRADE - 1)).toBe(3);
    expect(maxSkillLevel(DIVINE_GRADE)).toBe(4);
    expect(addMastery(3, masteryNeeded(3)! - 1, 5, DIVINE_GRADE - 1)).toEqual({ level: 3, mastery: 0, up: false });
    expect(addMastery(3, masteryNeeded(3)! - 1, 1, DIVINE_GRADE)).toEqual({ level: 4, mastery: 0, up: true });
    expect(addMastery(4, 0, 50, DIVINE_GRADE)).toEqual({ level: 4, mastery: 0, up: false });
  });
});

describe("bí tịch items", () => {
  it("exist for every book skill and teach it", () => {
    for (const s of BOOK_SKILLS) {
      const item = getItemDef(bookItemId(s.id));
      expect(item?.category).toBe("skill_book");
      expect(item?.teaches).toBe(s.id);
      expect(isItemId(bookItemId(s.id))).toBe(true);
    }
    expect(getItemDef("bt_hoi_khi")).toBeUndefined();
  });

  it("drop rarely, from a monster class, with exactly two rolls", () => {
    let n = 0;
    expect(rollBookDrop("normal", () => (n++, 0.5))).toBeNull();
    expect(n).toBe(2);
    expect(rollBookDrop("rare2", () => 0)).toBe(bookItemId(BOOK_SKILLS[0]!.id));
    expect(rollBookDrop("normal", () => 0.2)).toBeNull();
    const seq = [0.01, 0.99];
    let i = 0;
    expect(rollBookDrop("rare1", () => seq[i++]!)).toBe(bookItemId(BOOK_SKILLS[BOOK_SKILLS.length - 1]!.id));
  });
});

describe("hotbar", () => {
  it("parses a stored bar and falls back to an empty one for anything else", () => {
    const bar = emptyHotbar();
    bar[0] = "s:chuong_0:kim";
    bar[7] = "i:hoi_huyet_dan";
    expect(parseHotbar(JSON.stringify(bar))).toEqual(bar);
    expect(parseHotbar("[]")).toEqual(emptyHotbar());
    expect(parseHotbar("garbage")).toEqual(emptyHotbar());
    expect(parseHotbar(JSON.stringify([...bar.slice(1), "x:bad"]))).toEqual(emptyHotbar());
    expect(parseHotbar(null)).toEqual(emptyHotbar());
    // A slot holding a skill that no longer exists (the old kim_1 and friends) is cleared, the rest stays.
    const old = emptyHotbar();
    old[0] = "s:kim_1";
    old[1] = "s:tram_0:hoa";
    expect(parseHotbar(JSON.stringify(old))).toEqual(["", "s:tram_0:hoa", "", "", "", "", "", ""]);
    expect(parseSkillSlot("s:tram_0:hoa")).toEqual({ id: "tram_0", element: "hoa" });
    expect(parseSkillSlot("s:tram_0")).toEqual({ id: "tram_0", element: null });
    expect(parseSkillSlot("s:tram_0:xyz")).toEqual({ id: "tram_0", element: null });
    expect(parseSkillSlot("i:hoi_huyet_dan")).toBeNull();
    expect(emptyHotbar()).toHaveLength(HOTBAR_SLOTS);
  });
});

describe("protocol messages", () => {
  it("cast, hotbar_set and use_type are validated", () => {
    expect(parseClientMessage('{"t":"cast","skill":"chuong_0"}')).toEqual({ t: "cast", skill: "chuong_0" });
    expect(parseClientMessage('{"t":"hotbar_swap","a":0,"b":5}')).toEqual({ t: "hotbar_swap", a: 0, b: 5 });
    expect(parseClientMessage('{"t":"hotbar_swap","a":2,"b":2}')).toBeNull();
    expect(parseClientMessage('{"t":"hotbar_swap","a":0,"b":8}')).toBeNull();
    expect(parseClientMessage('{"t":"hotbar_swap","a":-1,"b":3}')).toBeNull();
    expect(parseClientMessage('{"t":"cast","skill":"chuong_0","target":"m3"}')).toEqual({ t: "cast", skill: "chuong_0", target: "m3" });
    expect(parseClientMessage('{"t":"cast","skill":"Hoa 1"}')).toBeNull();
    expect(parseClientMessage('{"t":"cast","skill":"chuong_0","el":"kim"}')).toEqual({ t: "cast", skill: "chuong_0", el: "kim" });
    expect(parseClientMessage('{"t":"cast","skill":"chuong_0","target":"m3","el":"hoa"}')).toEqual({ t: "cast", skill: "chuong_0", target: "m3", el: "hoa" });
    expect(parseClientMessage('{"t":"cast","skill":"chuong_0","el":"lei"}')).toBeNull();
    expect(parseClientMessage('{"t":"skill_boost","skill":"chuong_0"}')).toEqual({ t: "skill_boost", skill: "chuong_0" });
    expect(parseClientMessage('{"t":"skill_boost","skill":"A B"}')).toBeNull();
    expect(parseClientMessage('{"t":"cast","skill":"chuong_0","target":"../x"}')).toBeNull();
    expect(parseClientMessage('{"t":"hotbar_set","slot":2,"v":"s:chuong_0"}')).toEqual({ t: "hotbar_set", slot: 2, v: "s:chuong_0" });
    expect(parseClientMessage('{"t":"hotbar_set","slot":2,"v":""}')).toEqual({ t: "hotbar_set", slot: 2, v: "" });
    expect(parseClientMessage('{"t":"hotbar_set","slot":8,"v":""}')).toBeNull();
    expect(parseClientMessage('{"t":"hotbar_set","slot":0,"v":"x:y"}')).toBeNull();
    expect(parseClientMessage('{"t":"use_type","type":"hoi_huyet_dan"}')).toEqual({ t: "use_type", type: "hoi_huyet_dan" });
    expect(parseClientMessage('{"t":"use_type","type":"A B"}')).toBeNull();
  });
});

describe("passive skills", () => {
  it("add up by kind, grow with level and realm, and ignore anything that is not a passive", () => {
    expect(passiveTotals([], {}, 0)).toEqual({ attackPct: 0, defensePct: 0, dodgePoints: 0, critPoints: 0 });
    const base = passiveTotals(["bd_cong_0", "bd_thu_0", "bd_than_0", "bd_mang_0", "chuong_0", "pt_thuan_di"], {}, 0);
    expect(base.attackPct).toBeCloseTo(0.08);
    expect(base.defensePct).toBeCloseTo(0.08);
    expect(base.dodgePoints).toBeCloseTo(3);
    expect(base.critPoints).toBeCloseTo(3);
    expect(passiveTotals(["bd_cong_0"], { bd_cong_0: { lv: 3 } }, 0).attackPct).toBeGreaterThan(base.attackPct);
    expect(passiveTotals(["bd_cong_0"], {}, 4).attackPct).toBeGreaterThan(base.attackPct); // a higher root grade
    expect(passiveTotals(["bd_cong_1"], {}, 0).attackPct).toBeGreaterThan(base.attackPct); // a higher realm
  });

  it("withPassives raises the derived stats the way combat does, with the same caps", () => {
    const d = { attack: 100, defense: 50, critRate: 58, dodgeRate: 10, other: 7 };
    const out = withPassives(d, { attackPct: 0.1, defensePct: 0.2, dodgePoints: 5, critPoints: 10 });
    expect(out).toEqual({ attack: 110, defense: 60, critRate: 60, dodgeRate: 15, other: 7 });
  });
});

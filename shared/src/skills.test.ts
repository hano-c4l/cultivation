import { describe, expect, it } from "vitest";
import { getItemDef, isItemId } from "./items";
import { parseClientMessage } from "./protocol";
import { BOOK_SKILLS, HOTBAR_SLOTS, SKILLS, availableSkills, bookItemId, canLearn, emptyHotbar, getSkill, isBasicUnlocked, parseHotbar, rollBookDrop } from "./skills";

describe("skill unlocks", () => {
  it("basic skills unlock by level; element skills only for the matching root", () => {
    expect(availableSkills("hoa", 0, 1, [])).toEqual(["hoa_1", "hoi_khi"]);
    expect(availableSkills("kim", 0, 1, [])).toEqual(["kim_1", "hoi_khi"]);
    expect(availableSkills("hoa", 0, 3, [])).toContain("linh_thuan");
    expect(availableSkills("hoa", 0, 5, [])).toEqual(["hoa_1", "hoa_2", "hoi_khi", "linh_thuan"]);
    expect(availableSkills("hoa", 1, 1, [])).toContain("hoa_2"); // a higher realm keeps earlier unlocks
  });

  it("book skills are never unlocked by level, only by having learned them", () => {
    for (const s of BOOK_SKILLS) expect(isBasicUnlocked(s, "kim", 3, 9)).toBe(false);
    expect(availableSkills("hoa", 0, 1, ["hoa_3"])).toContain("hoa_3");
    expect(availableSkills("hoa", 0, 1, ["not_a_skill"])).toEqual(["hoa_1", "hoi_khi"]);
  });

  it("a book can be learned from its level on", () => {
    const s = getSkill("ngu_kiem_tram")!;
    expect(canLearn(s, 0, 6)).toBe(false);
    expect(canLearn(s, 0, 7)).toBe(true);
    expect(canLearn(getSkill("hoi_khi")!, 3, 9)).toBe(false); // not a book skill
  });

  it("every skill has sane numbers", () => {
    for (const s of SKILLS) {
      expect(s.mpCost, s.id).toBeGreaterThan(0);
      expect(s.cooldownMs, s.id).toBeGreaterThanOrEqual(1000);
      expect(s.power, s.id).toBeGreaterThan(0);
      if (s.kind === "attack") expect(s.range, s.id).toBeGreaterThan(0);
      if (s.kind === "buff") expect(s.buff, s.id).toBeDefined();
    }
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
    bar[0] = "s:hoa_1";
    bar[7] = "i:hoi_huyet_dan";
    expect(parseHotbar(JSON.stringify(bar))).toEqual(bar);
    expect(parseHotbar("[]")).toEqual(emptyHotbar());
    expect(parseHotbar("garbage")).toEqual(emptyHotbar());
    expect(parseHotbar(JSON.stringify([...bar.slice(1), "x:bad"]))).toEqual(emptyHotbar());
    expect(parseHotbar(null)).toEqual(emptyHotbar());
    expect(emptyHotbar()).toHaveLength(HOTBAR_SLOTS);
  });
});

describe("protocol messages", () => {
  it("cast, hotbar_set and use_type are validated", () => {
    expect(parseClientMessage('{"t":"cast","skill":"hoa_1"}')).toEqual({ t: "cast", skill: "hoa_1" });
    expect(parseClientMessage('{"t":"cast","skill":"hoa_1","target":"m3"}')).toEqual({ t: "cast", skill: "hoa_1", target: "m3" });
    expect(parseClientMessage('{"t":"cast","skill":"Hoa 1"}')).toBeNull();
    expect(parseClientMessage('{"t":"cast","skill":"hoa_1","target":"../x"}')).toBeNull();
    expect(parseClientMessage('{"t":"hotbar_set","slot":2,"v":"s:hoa_1"}')).toEqual({ t: "hotbar_set", slot: 2, v: "s:hoa_1" });
    expect(parseClientMessage('{"t":"hotbar_set","slot":2,"v":""}')).toEqual({ t: "hotbar_set", slot: 2, v: "" });
    expect(parseClientMessage('{"t":"hotbar_set","slot":8,"v":""}')).toBeNull();
    expect(parseClientMessage('{"t":"hotbar_set","slot":0,"v":"x:y"}')).toBeNull();
    expect(parseClientMessage('{"t":"use_type","type":"hoi_huyet_dan"}')).toEqual({ t: "use_type", type: "hoi_huyet_dan" });
    expect(parseClientMessage('{"t":"use_type","type":"A B"}')).toBeNull();
  });
});

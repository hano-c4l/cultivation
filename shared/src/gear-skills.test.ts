import { describe, expect, it } from "vitest";
import { makeEquipmentId } from "./equipment-data";
import { gearSkillIds } from "./gear-skills";
import { BOOK_SKILLS, SKILLS, availableSkills, getSkill } from "./skills";
import { parseClientMessage } from "./protocol";

const charm = (element?: string) => makeEquipmentId("charm", "u", 0, 1, 1, element);
const bonded = (element?: string) => makeEquipmentId("bonded", "u", 0, 1, 1, element);
const flight = () => makeEquipmentId("flight", "u", 0, 1, 1);

describe("skills granted by worn pháp bảo", () => {
  it("an ordinary charm grants the attack of its own element, two charms of one element grant it once", () => {
    expect(gearSkillIds([{ slot: "charm1", type: charm("hoa") }])).toEqual(["pb_hoa"]);
    expect(gearSkillIds([{ slot: "charm1", type: charm("hoa") }, { slot: "charm2", type: charm("hoa") }])).toEqual(["pb_hoa"]);
    expect(gearSkillIds([{ slot: "charm1", type: charm("hoa") }, { slot: "charm3", type: charm("thuy") }])).toEqual(["pb_thuy", "pb_hoa"].sort((a, b) => SKILLS.findIndex((s) => s.id === a) - SKILLS.findIndex((s) => s.id === b)));
  });

  it("the bonded artifact grants stronger skills than any ordinary charm", () => {
    const ids = gearSkillIds([{ slot: "bonded", type: bonded("kim") }]);
    expect(ids).toEqual(expect.arrayContaining(["bm_kim", "bm_ho_the", "bm_hoi_sinh"]));
    expect(getSkill("bm_kim")!.power).toBeGreaterThan(getSkill("pb_kim")!.power);
    expect(getSkill("bm_kim")!.power).toBeGreaterThan(getSkill("kim_3")!.power); // beyond even a book skill
    expect(getSkill("bm_kim")!.cooldownMs).toBeGreaterThan(getSkill("pb_kim")!.cooldownMs);
  });

  it("the flight artifact grants the teleport and the dodge buff, and nothing else", () => {
    expect(gearSkillIds([{ slot: "flight", type: flight() }]).sort()).toEqual(["pt_phong_than", "pt_thuan_di"]);
    const tele = getSkill("pt_thuan_di")!;
    expect(tele.kind).toBe("teleport");
    expect(getSkill("pt_phong_than")!.buff?.stat).toBe("dodge");
  });

  it("a broken piece grants nothing, and pieces in other slots grant nothing", () => {
    expect(gearSkillIds([{ slot: "flight", type: flight(), dur: 0 }])).toEqual([]);
    expect(gearSkillIds([{ slot: "bonded", type: bonded("kim"), dur: 1 }]).length).toBeGreaterThan(0);
    expect(gearSkillIds([{ slot: "ring1", type: makeEquipmentId("ring", "u", 0, 1, 1, "kim") }])).toEqual([]);
  });

  it("they show up in availableSkills only while worn, and are never learnable from a book", () => {
    expect(availableSkills(["kim"], 0, 1, [])).not.toContain("pt_thuan_di");
    expect(availableSkills(["kim"], 0, 1, [], ["pt_thuan_di"])).toContain("pt_thuan_di");
    expect(availableSkills(["kim"], 0, 1, ["pt_thuan_di"])).not.toContain("pt_thuan_di"); // a learned id does not grant a gear skill
    for (const s of BOOK_SKILLS) expect(s.gear).toBeUndefined();
  });

  it("a cast carries a point only as two sane coordinates", () => {
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 10.5, y: 7 }))).toEqual({ t: "cast", skill: "pt_thuan_di", x: 10.5, y: 7 });
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 10 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: "a", y: 1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 99999, y: 1 }))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { makeEquipmentId } from "./equipment-data";
import { gearSkillIds, gearSkillInfo } from "./gear-skills";
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
    expect(getSkill("bm_kim")!.power).toBeGreaterThan(getSkill("kim_3")!.power * 1.5); // beyond even the strongest book skill, realm bonus included
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
    expect(availableSkills(["chuong_0"])).not.toContain("pt_thuan_di");
    expect(availableSkills(["chuong_0"], ["pt_thuan_di"])).toContain("pt_thuan_di");
    expect(availableSkills(["pt_thuan_di"])).not.toContain("pt_thuan_di"); // a granted id does not give a gear skill
    for (const s of BOOK_SKILLS) expect(s.gear).toBeUndefined();
  });

  it("each skill carries the realm and grade of the piece behind it, the better piece winning", () => {
    const lowRing = makeEquipmentId("charm", "u", 0, 1, 1, "hoa");
    const highCharm = makeEquipmentId("charm", "u", 1, 3, 3, "hoa");
    expect(gearSkillInfo([{ slot: "charm1", type: lowRing }])).toEqual([{ id: "pb_hoa", realm: 0, grade: 0 }]);
    expect(gearSkillInfo([{ slot: "charm1", type: lowRing }, { slot: "charm2", type: highCharm }])).toEqual([{ id: "pb_hoa", realm: 1, grade: 2 }]);
    expect(gearSkillInfo([{ slot: "charm1", type: highCharm }, { slot: "charm2", type: lowRing }])).toEqual([{ id: "pb_hoa", realm: 1, grade: 2 }]);
  });

  it("a cast carries a point only as two sane coordinates", () => {
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 10.5, y: 7 }))).toEqual({ t: "cast", skill: "pt_thuan_di", x: 10.5, y: 7 });
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 10 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: "a", y: 1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 99999, y: 1 }))).toBeNull();
  });
});

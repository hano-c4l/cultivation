import { describe, expect, it } from "vitest";
import { makeEquipmentId } from "./equipment-data";
import { gearSkillIds, gearSkillInfo } from "./gear-skills";
import { BOOK_SKILLS, SKILLS, availableSkills, effectiveSkill, getSkill } from "./skills";
import { parseClientMessage } from "./protocol";

const charm = (element?: string) => makeEquipmentId("charm", "u", 0, 1, 1, element);
const bonded = (element?: string) => makeEquipmentId("bonded", "u", 0, 1, 1, element);
const flight = () => makeEquipmentId("flight", "u", 0, 1, 1);

describe("skills granted by worn pháp bảo", () => {
  it("each of the four charm slots gives its own skill, so pieces of the same kind all show", () => {
    expect(gearSkillIds([{ slot: "charm1", type: charm("hoa") }])).toEqual(["pb_hoa_1"]);
    expect(gearSkillIds([{ slot: "charm1", type: charm("hoa") }, { slot: "charm2", type: charm("hoa") }])).toEqual(["pb_hoa_1", "pb_hoa_2"]);
    // The case from the preview: a Hỏa LK4, a Thổ LK1, a Hỏa LK1 and one more LK1 piece give four skills.
    const four = [
      { slot: "charm1", type: makeEquipmentId("charm", "u", 0, 4, 3, "hoa") },
      { slot: "charm2", type: makeEquipmentId("charm", "u", 0, 1, 2, "tho") },
      { slot: "charm3", type: makeEquipmentId("charm", "u", 0, 1, 1, "hoa") },
      { slot: "charm4", type: makeEquipmentId("charm", "u", 0, 1, 3, "kim") },
    ];
    expect(gearSkillIds(four).sort()).toEqual(["pb_hoa_1", "pb_hoa_3", "pb_kim_4", "pb_tho_2"]);
    expect(gearSkillIds([{ slot: "charm1", type: charm("hoa") }, { slot: "charm3", type: charm("thuy") }])).toEqual(["pb_thuy_3", "pb_hoa_1"].sort((a, b) => SKILLS.findIndex((x) => x.id === a) - SKILLS.findIndex((x) => x.id === b)));
  });

  it("a higher bậc of the same realm makes the skill stronger, and the info says which bậc it is", () => {
    const low = makeEquipmentId("charm", "u", 0, 1, 2, "hoa");
    const high = makeEquipmentId("charm", "u", 0, 4, 2, "hoa");
    const info = gearSkillInfo([{ slot: "charm1", type: high }, { slot: "charm2", type: low }]);
    expect(info.map((g) => [g.id, g.realm, g.tier])).toEqual([["pb_hoa_1", 0, 4], ["pb_hoa_2", 0, 1]]);
    const def = getSkill("pb_hoa_1")!;
    const power = (tier: number) => effectiveSkill(def, { realm: 0, tier, grade: 1, level: 0 }).power;
    expect(power(4)).toBeGreaterThan(power(1));
    expect(power(9)).toBeGreaterThan(power(4));
    // Bậc 9 of a realm stays below bậc 1 of the next one.
    expect(power(9)).toBeLessThan(effectiveSkill(def, { realm: 1, tier: 1, grade: 1, level: 0 }).power);
  });

  it("the bonded artifact grants stronger skills than any ordinary charm", () => {
    const ids = gearSkillIds([{ slot: "bonded", type: bonded("kim") }]);
    expect(ids).toEqual(expect.arrayContaining(["bm_kim", "bm_ho_the", "bm_hoi_sinh"]));
    expect(getSkill("bm_kim")!.power).toBeGreaterThan(getSkill("pb_kim_1")!.power);
    expect(getSkill("bm_kim")!.power).toBeGreaterThan(getSkill("kim_3")!.power * 1.5); // beyond even the strongest book skill, realm bonus included
    expect(getSkill("bm_kim")!.cooldownMs).toBeGreaterThan(getSkill("pb_kim_1")!.cooldownMs);
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

  it("each skill carries the realm, bậc and grade of the piece in its slot", () => {
    const lowRing = makeEquipmentId("charm", "u", 0, 1, 1, "hoa");
    const highCharm = makeEquipmentId("charm", "u", 1, 3, 3, "hoa");
    expect(gearSkillInfo([{ slot: "charm1", type: lowRing }])).toEqual([{ id: "pb_hoa_1", realm: 0, tier: 1, grade: 0 }]);
    expect(gearSkillInfo([{ slot: "charm1", type: lowRing }, { slot: "charm2", type: highCharm }])).toEqual([
      { id: "pb_hoa_1", realm: 0, tier: 1, grade: 0 },
      { id: "pb_hoa_2", realm: 1, tier: 3, grade: 2 },
    ]);
  });

  it("a cast carries a point only as two sane coordinates", () => {
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 10.5, y: 7 }))).toEqual({ t: "cast", skill: "pt_thuan_di", x: 10.5, y: 7 });
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 10 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: "a", y: 1 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "cast", skill: "pt_thuan_di", x: 99999, y: 1 }))).toBeNull();
  });
});

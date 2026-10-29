import { describe, expect, it } from "vitest";
import { makeEquipmentId } from "./equipment-data";
import { equipmentRegen, gearRegenOf, regenPerSecond, NO_GEAR_REGEN } from "./gear-regen";
import { equipmentInfo } from "./equipment-data";
import { bootsTintOf, gearLookOf, hatShapeOf, HAT_SHAPES, robeTintOf, weaponLookParts, weaponTintOf } from "./gear-look";
import { startingStats } from "./progression";
import { basicSkillAt, getSkill, setBasicSkillRealm, BASIC_SKILL_ID } from "./skills";

const w = { gender: "male" as const, realm: 5, stage: 9, base: { ...startingStats("kim", 0).base, canCot: 999, thanThuc: 999, thanPhap: 999, nguTinh: 999, linhLuc: 999, phucDuyen: 999 } as never };

describe("gear that regenerates", () => {
  const id = (kind: "necklace" | "belt" | "ring" | "jade" | "hat", realm: number, tier: number, grade: number) => makeEquipmentId(kind, kind === "necklace" || kind === "jade" || kind === "hat" ? "m" : "u", realm, tier, grade);

  it("is given by some kinds only, more by a higher level and grade", () => {
    expect(gearRegenOf(equipmentInfo(id("hat", 0, 1, 1))!)).toEqual(NO_GEAR_REGEN);
    const low = gearRegenOf(equipmentInfo(id("belt", 0, 1, 1))!);
    const high = gearRegenOf(equipmentInfo(id("belt", 4, 5, 4))!);
    expect(low.hp).toBeGreaterThanOrEqual(1);
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(low.mp).toBe(0);
    expect(gearRegenOf(equipmentInfo(id("necklace", 3, 3, 2))!).hpPct).toBeGreaterThan(0);
    expect(gearRegenOf(equipmentInfo(id("ring", 1, 1, 1))!).mp).toBeGreaterThanOrEqual(1);
    expect(gearRegenOf(equipmentInfo(id("jade", 1, 1, 1))!).mpPct).toBeGreaterThan(0);
  });

  it("adds up over the worn pieces and skips a broken one", () => {
    const a = id("belt", 2, 1, 1);
    const b = id("necklace", 2, 1, 1);
    const both = equipmentRegen([{ slot: "belt", type: a }, { slot: "necklace", type: b }] as never, w as never);
    expect(both.hp).toBe(gearRegenOf(equipmentInfo(a)!).hp);
    expect(both.hpPct).toBe(gearRegenOf(equipmentInfo(b)!).hpPct);
    const broken = equipmentRegen([{ slot: "belt", type: a, dur: 0, max: 10 }] as never, w as never);
    expect(broken).toEqual(NO_GEAR_REGEN);
  });

  it("the ordinary regeneration needs meditation, the gear's does not, and they add up", () => {
    expect(regenPerSecond(1000, 500, false)).toEqual({ hp: 0, mp: 0 });
    expect(regenPerSecond(1000, 500, true)).toEqual({ hp: 20, mp: 10 });
    const g = { hp: 3, mp: 2, hpPct: 1, mpPct: 2 };
    expect(regenPerSecond(1000, 500, false, g)).toEqual({ hp: 13, mp: 12 });
    expect(regenPerSecond(1000, 500, true, g)).toEqual({ hp: 33, mp: 22 });
  });
});

describe("the look of the worn gear", () => {
  it("numbers the weapon by element and realm, the others by set, and colours them from the tuning", () => {
    const sword = makeEquipmentId("weapon", "u", 3, 2, 1, "hoa", "kiem");
    const look = gearLookOf([{ slot: "weapon", type: sword }, { slot: "robe", type: makeEquipmentId("robe", "m", 1, 4, 1) }, { slot: "hat", type: makeEquipmentId("hat", "m", 0, 2, 1) }, { slot: "boots", type: makeEquipmentId("boots", "u", 2, 9, 1) }])!;
    expect(weaponLookParts(look.w!)).toEqual({ realm: 3, element: "hoa" });
    expect(look.r).toBe(1 + 9 + 3);
    expect(look.h).toBe(2);
    expect(look.b).toBe(1 + 18 + 8);
    expect(weaponTintOf(look.w!)).toMatch(/^#[0-9a-f]{6}$/);
    expect(robeTintOf(look.r!)).toMatch(/^#[0-9a-f]{6}$/);
    expect(bootsTintOf(look.b!)).toMatch(/^#[0-9a-f]{6}$/);
    expect(hatShapeOf(look.h!)).toBeLessThan(HAT_SHAPES);
    // two swords of one family differ by element and by realm
    const other = gearLookOf([{ slot: "weapon", type: makeEquipmentId("weapon", "u", 3, 2, 1, "thuy", "kiem") }])!;
    expect(weaponTintOf(other.w!)).not.toBe(weaponTintOf(look.w!));
    const higher = gearLookOf([{ slot: "weapon", type: makeEquipmentId("weapon", "u", 5, 2, 1, "hoa", "kiem") }])!;
    expect(weaponTintOf(higher.w!)).not.toBe(weaponTintOf(look.w!));
    expect(gearLookOf([])).toBeUndefined();
    expect(gearLookOf([{ slot: "hat", type: makeEquipmentId("hat", "m", 0, 2, 1), dur: 0 }])).toBeUndefined();
  });
});

describe("the basic qi blast by realm", () => {
  it("is stronger from Trúc Cơ on, reaches further from Hóa Thần and hits an area at Luyện Hư", () => {
    expect(basicSkillAt(0).power).toBe(getSkill(BASIC_SKILL_ID)!.power);
    for (let r = 1; r <= 5; r++) expect(basicSkillAt(r).power).toBeGreaterThanOrEqual(basicSkillAt(r - 1).power);
    expect(basicSkillAt(1).power).toBeGreaterThan(basicSkillAt(0).power);
    expect(basicSkillAt(4).range).toBeGreaterThan(basicSkillAt(3).range);
    expect(basicSkillAt(3).area).toBeUndefined();
    expect(basicSkillAt(5).area?.maxTargets).toBeGreaterThan(1);
    expect(basicSkillAt(5).nameVi).not.toBe(basicSkillAt(0).nameVi);
    setBasicSkillRealm(5);
    expect(getSkill(BASIC_SKILL_ID)).toEqual(basicSkillAt(5)); // the client's own realm shows through getSkill
    setBasicSkillRealm(0);
    expect(getSkill(BASIC_SKILL_ID)!.nameVi).toBe(basicSkillAt(0).nameVi);
  });
});

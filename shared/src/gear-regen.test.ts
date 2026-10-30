import { describe, expect, it } from "vitest";
import { equipmentBonus, equipmentInfo, makeEquipmentId, scaledStats } from "./equipment-data";
import { defaultMasterEntry, rollForType } from "./gear-master";
import { gearRegenFrom, regenPerSecond, NO_GEAR_REGEN } from "./gear-regen";
import { bootsTintOf, gearLookOf, hatShapeOf, HAT_SHAPES, robeTintOf, weaponLookParts, weaponTintOf } from "./gear-look";
import { startingStats } from "./progression";
import { basicSkillAt, getSkill, setBasicSkillRealm, BASIC_SKILL_ID } from "./skills";

const w = { gender: "male" as const, realm: 5, stage: 9, base: { ...startingStats("kim", 0).base, canCot: 999, thanThuc: 999, thanPhap: 999, nguTinh: 999, linhLuc: 999, phucDuyen: 999 } as never };

describe("gear that regenerates", () => {
  const id = (kind: "necklace" | "belt" | "ring" | "jade" | "hat", realm: number, tier: number, grade: number) => makeEquipmentId(kind, kind === "necklace" || kind === "jade" || kind === "hat" ? "m" : "u", realm, tier, grade);

  it("is a stat of some kinds only (necklace, belt, ring, jade), more at a higher level and grade, and it is in the master table", () => {
    expect(equipmentInfo(id("hat", 0, 1, 1))!.stats.hpRegen).toBe(0);
    const low = equipmentInfo(id("belt", 0, 1, 1))!.stats;
    const high = equipmentInfo(id("belt", 4, 5, 4))!.stats;
    expect(low.hpRegen).toBeGreaterThanOrEqual(1);
    expect(high.hpRegen).toBeGreaterThan(low.hpRegen);
    expect(low.mpRegen).toBe(0);
    expect(equipmentInfo(id("necklace", 3, 3, 2))!.stats.hpRegenPct).toBeGreaterThan(0);
    expect(equipmentInfo(id("ring", 1, 1, 1))!.stats.mpRegen).toBeGreaterThanOrEqual(1);
    expect(equipmentInfo(id("jade", 1, 1, 1))!.stats.mpRegenPct).toBeGreaterThan(0);
    for (const kind of ["belt", "necklace", "ring", "jade"] as const) {
      const style = kind === "necklace" || kind === "jade" ? "m" : "u";
      const e = defaultMasterEntry(kind, style, 3, 4)!;
      expect(Object.keys(e.stats).some((k) => /Regen/.test(k)), kind).toBe(true);
    }
    expect(Object.keys(defaultMasterEntry("hat", "m", 3, 4)!.stats).some((k) => /Regen/.test(k))).toBe(false);
  });

  it("adds up over the worn pieces (equipmentBonus) and becomes per-second rates", () => {
    const a = id("belt", 2, 1, 1);
    const b = id("necklace", 2, 1, 1);
    const bonus = equipmentBonus([{ slot: "belt", type: a }, { slot: "necklace", type: b }] as never, w as never);
    expect(bonus.hpRegen).toBe(equipmentInfo(a)!.stats.hpRegen);
    expect(bonus.hpRegenPct).toBe(equipmentInfo(b)!.stats.hpRegenPct);
    expect(gearRegenFrom(bonus)).toEqual({ hp: bonus.hpRegen, mp: 0, hpPct: bonus.hpRegenPct / 60, mpPct: 0 });
    expect(gearRegenFrom(undefined)).toEqual(NO_GEAR_REGEN);
    expect(equipmentBonus([{ slot: "belt", type: a, dur: 0, max: 10 }] as never, w as never).hpRegen).toBe(0); // broken: nothing
  });

  it("a rolled piece keeps the regeneration it was rolled with, inside the master range", () => {
    const t = id("belt", 3, 4, 3);
    const rs = rollForType(t, () => 0.5)!;
    expect(rs.hpRegen).toBeGreaterThanOrEqual(1);
    const info = equipmentInfo(t)!;
    expect(scaledStats(info, undefined, undefined, undefined, 1, rs).hpRegen).toBe(rs.hpRegen);
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

describe("upgrade glow", () => {
  it("starts at +7 and is grander at +10; only the weapon carries it in the look", async () => {
    const { glowTierOf, gearLookOf: look } = await import("./gear-look");
    expect([glowTierOf(undefined), glowTierOf(6), glowTierOf(7), glowTierOf(9), glowTierOf(10)]).toEqual([0, 0, 1, 1, 2]);
    const sword = makeEquipmentId("weapon", "u", 3, 2, 1, "thuy", "kiem");
    expect(look([{ slot: "weapon", type: sword, en: 6 }])!.e).toBeUndefined();
    expect(look([{ slot: "weapon", type: sword, en: 10 }])!.e).toBe(10);
  });
});

import { describe, expect, it } from "vitest";
import { BASE_SPEED } from "./pathfinding";
import { EQUIP_KINDS, equipmentBonus, equipmentInfo, KIND_SLOTS, SPEED_RANGES, type EquippedItem } from "./equipment-data";
import { defaultMasterEntry, rollForType, rollPosition } from "./gear-master";
import { setGearSetNames } from "./gear-names";
import { setWornSkillSets, skillDisplayName } from "./gear-skills";
import { getSkill } from "./skills";
import { STAT_KEYS, type BaseStats } from "./progression-data";

const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 10])) as unknown as BaseStats;
const wearer = { gender: "male" as const, realm: 3, stage: 9, base, mounted: true };
const seeded = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

describe("walking speed", () => {
  it("is slower on foot than before, so boots and the flight pháp bảo are felt", () => {
    expect(BASE_SPEED).toBeLessThan(4);
  });
});

describe("boots", () => {
  it("are a kind with their own slot, unisex, giving defense and speed", () => {
    expect(EQUIP_KINDS).toContain("boots");
    expect(KIND_SLOTS.boots).toEqual(["boots"]);
    const info = equipmentInfo("eq.boots.u.0.1.1")!;
    expect(info.nameVi).toBe("Lăng Y Giày");
    expect(info.stats.moveSpeed).toBeGreaterThan(0);
    expect(info.stats.defense).toBeGreaterThan(0);
    expect(equipmentInfo("eq.boots.m.0.1.1")).toBeUndefined(); // not gendered
  });

  it("roll their speed in the range of their realm (10-20 in Luyện Khí, rising), whatever the grade", () => {
    for (const [realm, range] of SPEED_RANGES.boots!.entries()) {
      for (let grade = 1; grade <= 4; grade++) {
        const rand = seeded(realm * 10 + grade);
        for (let i = 0; i < 80; i++) {
          const v = rollForType(`eq.boots.u.${realm}.5.${grade}`, rand)!.moveSpeed!;
          expect(v).toBeGreaterThanOrEqual(range[0]);
          expect(v).toBeLessThanOrEqual(range[1]);
        }
      }
    }
    expect(SPEED_RANGES.boots![0]).toEqual([10, 20]);
    expect(SPEED_RANGES.boots![1]).toEqual([15, 25]);
    expect(SPEED_RANGES.boots![2]).toEqual([20, 30]);
    for (let r = 1; r < 4; r++) expect(SPEED_RANGES.boots![r]![0]).toBeGreaterThan(SPEED_RANGES.boots![r - 1]![0]);
  });
});

describe("the flight pháp bảo", () => {
  it("give 40-60% speed in Luyện Khí, 60-80 in Trúc Cơ, 80-100 in Kim Đan, never above 150", () => {
    expect(SPEED_RANGES.flight!.slice(0, 3)).toEqual([[40, 60], [60, 80], [80, 100]]);
    for (const r of SPEED_RANGES.flight!) expect(r[1]).toBeLessThanOrEqual(150);
    expect(defaultMasterEntry("flight", "u", 0, 4)!.stats.moveSpeed).toEqual([40, 60]);
    expect(defaultMasterEntry("flight", "u", 1, 4)!.stats.moveSpeed).toEqual([60, 80]);
  });

  it("do not scale their speed by grade, upgrade level or resonance", () => {
    const type = "eq.flight.u.0.1.1.kim";
    const worn = (en?: number): EquippedItem => ({ id: "f", type, slot: "flight", dur: 100, max: 100, rs: { moveSpeed: 50 }, ...(en ? { en } : {}) });
    expect(equipmentBonus([worn()], wearer).moveSpeed).toBe(50);
    expect(equipmentBonus([worn(10)], wearer).moveSpeed).toBe(50);
    expect(equipmentBonus([worn()], { ...wearer, affinity: { elements: ["kim"], weapons: [] } }).moveSpeed).toBe(50);
  });
});

describe("where a rolled stat sits in its range", () => {
  it("max, min or in between", () => {
    const type = "eq.flight.u.0.1.1.kim";
    expect(rollPosition(type, "moveSpeed", 60)).toBe("max");
    expect(rollPosition(type, "moveSpeed", 40)).toBe("min");
    expect(rollPosition(type, "moveSpeed", 50)).toBe("mid");
    expect(rollPosition(type, "moveSpeed", undefined)).toBe("mid");
    const robe = "eq.robe.m.0.1.1";
    const range = defaultMasterEntry("robe", "m", 0, 1)!.stats.maxHp!;
    expect(rollPosition(robe, "maxHp", range[1])).toBe("max");
    expect(rollPosition(robe, "maxHp", range[0])).toBe("min");
    expect(rollPosition("eq.ring.u.0.1.1", "defense", 5)).toBe("mid"); // the kind has no such stat
  });
});

describe("the names of pháp bảo skills", () => {
  it("follow the set of the piece that grants them", () => {
    setGearSetNames(null);
    const skill = getSkill("pb_kim_1")!;
    expect(skillDisplayName(skill)).toBe(skill.nameVi); // nothing worn: the old name
    setWornSkillSets([
      { slot: "charm1", type: "eq.charm.u.0.2.1.kim" },
      { slot: "bonded", type: "eq.bonded.u.0.1.2.moc" },
      { slot: "flight", type: "eq.flight.u.0.3.1.kim" },
    ]);
    expect(skillDisplayName(skill)).toBe("Bạch Thi Kim Quang");
    expect(skillDisplayName(getSkill("bm_moc")!)).toBe("Lăng Y Mộc Kích");
    expect(skillDisplayName(getSkill("bm_ho_the")!)).toBe("Lăng Y Hộ Thể");
    expect(skillDisplayName(getSkill("pt_thuan_di")!)).toBe("Thanh Phong Thuấn Di");
    expect(skillDisplayName(getSkill("chuong_0")!)).toBe(getSkill("chuong_0")!.nameVi); // not a pháp bảo skill
    setWornSkillSets([]);
  });
});

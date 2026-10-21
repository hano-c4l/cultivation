import { afterEach, describe, expect, it } from "vitest";
import { EQUIP_KINDS, EQUIP_STAT_KEYS, equipmentBonus, equipmentInfo, GENDERED_KINDS, type EquipKind, type EquippedItem } from "./equipment-data";
import { allDefaultMasterEntries, defaultMasterEntry, rollForType, rollGearStats, validMasterStats } from "./gear-master";
import { gearSetName, setGearSetNames } from "./gear-names";
import { REALMS, STAGES_PER_REALM } from "./progression-data";
import { STAT_KEYS, type BaseStats } from "./progression-data";

const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 10])) as unknown as BaseStats;
const wearer = { gender: "male" as const, realm: 3, stage: 9, base };
const seeded = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

afterEach(() => setGearSetNames(null));

describe("the default master table", () => {
  it("has an entry for every kind, style, realm and bậc except the bonded artifact", () => {
    const all = allDefaultMasterEntries(REALMS.length, STAGES_PER_REALM, (k: EquipKind) => (GENDERED_KINDS.has(k) ? ["m", "f"] : ["u"]), EQUIP_KINDS);
    const styles = EQUIP_KINDS.filter((k) => k !== "bonded").reduce((n, k) => n + (GENDERED_KINDS.has(k) ? 2 : 1), 0);
    expect(all.length).toBe(styles * REALMS.length * STAGES_PER_REALM);
    for (const e of all) expect(validMasterStats(e.stats)).toBe(true);
    expect(defaultMasterEntry("bonded", "u", 0, 1)).toBeNull();
  });

  it("gives each kind only the stats it has, with min below max", () => {
    const hat = defaultMasterEntry("hat", "m", 0, 1)!;
    expect(Object.keys(hat.stats).sort()).toEqual(["defense", "maxHp"]);
    for (const [lo, hi] of Object.values(hat.stats)) expect(lo).toBeLessThan(hi);
  });
});

describe("rolling", () => {
  it("stays inside the range of the master entry, scaled by the grade", () => {
    const entry = defaultMasterEntry("robe", "m", 1, 3)!;
    for (let grade = 1; grade <= 4; grade++) {
      const mult = [1, 1.25, 1.6, 2.2][grade - 1]!;
      const rand = seeded(grade * 7);
      for (let i = 0; i < 200; i++) {
        const rolled = rollGearStats(entry.stats, grade, rand);
        for (const key of EQUIP_STAT_KEYS) {
          const r = entry.stats[key];
          if (!r) {
            expect(rolled[key]).toBeUndefined();
            continue;
          }
          expect(rolled[key]!).toBeGreaterThanOrEqual(Math.floor(r[0] * mult) - 1);
          expect(rolled[key]!).toBeLessThanOrEqual(Math.ceil(r[1] * mult) + 1);
        }
      }
    }
  });

  it("makes pieces of the same type differ, and uses the live master when given one", () => {
    const rand = seeded(3);
    const set = new Set<string>();
    for (let i = 0; i < 50; i++) set.add(JSON.stringify(rollForType("eq.robe.m.0.5.2.kim", rand)));
    expect(set.size).toBeGreaterThan(5);
    expect(rollForType("eq.robe.m.0.5.2.kim", () => 0, () => ({ attack: [7, 9] }))).toEqual({ attack: Math.round(7 * 1.25) });
  });

  it("does not roll the bonded artifact, special pieces or things that are not gear", () => {
    expect(rollForType("eq.bonded.u.0.1.2.kim", seeded(1))).toBeUndefined();
    expect(rollForType("eqs.van_co_gioi", seeded(1))).toBeUndefined();
    expect(rollForType("hoi_huyet_dan", seeded(1))).toBeUndefined();
  });

  it("a rolled piece counts its own stats; one without a roll keeps the fixed stats", () => {
    const type = "eq.ring.u.0.1.1.kim";
    const plain: EquippedItem = { id: "a", type, slot: "ring1", dur: 100, max: 100 };
    const rolled: EquippedItem = { id: "b", type, slot: "ring1", dur: 100, max: 100, rs: { attack: 99 } };
    expect(equipmentBonus([plain], wearer).attack).toBe(equipmentInfo(type)!.stats.attack);
    expect(equipmentBonus([rolled], wearer).attack).toBe(99);
  });
});

describe("gear set names", () => {
  it("name every piece of a realm and bậc, and follow a rename", () => {
    expect(equipmentInfo("eq.robe.m.0.1.1")!.nameVi).toBe("Lăng Y Đạo Bào");
    expect(equipmentInfo("eq.hat.m.0.1.1")!.nameVi).toBe("Lăng Y Đạo Quan");
    expect(equipmentInfo("eq.charm.u.0.2.1.kim")!.nameVi).toBe("Bạch Thi Pháp Bảo");
    const names = Array.from({ length: REALMS.length }, () => Array<string>(STAGES_PER_REALM).fill(""));
    names[0]![0] = "Tuyết Ảnh";
    setGearSetNames(names);
    expect(gearSetName(0, 1)).toBe("Tuyết Ảnh");
    expect(gearSetName(0, 2)).toBe("Bạch Thi"); // an empty name keeps the default
    expect(equipmentInfo("eq.robe.m.0.1.1")!.nameVi).toBe("Tuyết Ảnh Đạo Bào");
  });
});

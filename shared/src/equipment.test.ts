import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_DURABILITY,
  EQUIP_KINDS,
  SPECIAL_EQUIPMENT,
  equipBlock,
  equipmentBonus,
  equipmentInfo,
  equipTierTag,
  makeEquipmentId,
  repairCost,
  rollEquipmentDrop,
  scaledStats,
  type EquippedItem,
  type WearerCtx,
} from "./equipment-data";
import { planDeathWear, planEquip, planReconcile, planRepair, planUnequip } from "./equipment";
import { gearStyleOf } from "./gender";
import { applyBag, type BagContents, type BagItem } from "./inventory";
import { getItemDef, isItemId } from "./items";
import { deriveStats } from "./progression";
import { BASE_STAT_START, STAT_KEYS, type BaseStats } from "./progression-data";

function base(over: Partial<BaseStats> = {}): BaseStats {
  const b = {} as BaseStats;
  for (const k of STAT_KEYS) b[k] = BASE_STAT_START;
  return { ...b, ...over };
}

const maleWearer: WearerCtx = { gender: "male", realm: 0, stage: 5, base: base() };
let n = 0;
const newId = () => `id${++n}`;

function bagItem(id: string, type: string, tab: number, cell: number, dur?: number): BagItem {
  const info = equipmentInfo(type);
  return { id, type, tab, cell, qty: 1, ...(dur !== undefined && info?.maxDurability ? { dur, max: info.maxDurability } : {}) };
}

describe("gender", () => {
  it("crossed genders wear the opposite style and nothing of their own", () => {
    expect(gearStyleOf("male")).toBe("male");
    expect(gearStyleOf("female")).toBe("female");
    expect(gearStyleOf("male_wears_female")).toBe("female");
    expect(gearStyleOf("female_wears_male")).toBe("male");
  });
});

describe("equipment templates", () => {
  it("are generated from the id, with gendered kinds in a male and a female version", () => {
    const m = equipmentInfo("eq.robe.m.0.3.2");
    const f = equipmentInfo("eq.robe.f.0.3.2");
    expect(m?.nameVi).not.toBe(f?.nameVi);
    expect(m?.stats).toEqual(f?.stats);
    expect(getItemDef("eq.robe.m.0.3.2")?.maxStack).toBe(1);
    expect(isItemId("eq.robe.m.0.3.2")).toBe(true);
  });

  it("rejects malformed ids and a style that does not fit the kind", () => {
    for (const bad of ["eq.robe.u.0.3.2", "eq.ring.m.0.3.2", "eq.robe.m.9.3.2", "eq.robe.m.0.0.2", "eq.robe.m.0.10.2", "eq.robe.m.0.3.5", "eq.nothing.u.0.1.1", "eq.robe.m.0.3"]) {
      expect(equipmentInfo(bad), bad).toBeUndefined();
    }
  });

  it("get stronger with bậc, realm and phẩm cấp", () => {
    const a = equipmentInfo(makeEquipmentId("weapon", "u", 0, 1, 1))!.stats.attack;
    const b = equipmentInfo(makeEquipmentId("weapon", "u", 0, 9, 1))!.stats.attack;
    const c = equipmentInfo(makeEquipmentId("weapon", "u", 1, 1, 1))!.stats.attack;
    const d = equipmentInfo(makeEquipmentId("weapon", "u", 0, 1, 4))!.stats.attack;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(a);
  });

  it("some pieces ask nothing, higher ones ask for a level and a base stat", () => {
    expect(equipmentInfo("eq.weapon.u.0.1.1")!.req).toEqual({ level: null, stat: null });
    const hard = equipmentInfo("eq.weapon.u.1.4.4")!.req;
    expect(hard.level).toBe(9 + 3);
    expect(hard.stat?.key).toBe("canCot");
  });

  it("every kind has stats", () => {
    for (const k of EQUIP_KINDS) {
      const style = equipmentInfo(makeEquipmentId(k, "m", 0, 1, 1)) ? "m" : "u";
      const s = equipmentInfo(makeEquipmentId(k, style, 0, 4, 2))!.stats;
      expect(Object.values(s).some((v) => v > 0), k).toBe(true);
    }
  });

  it("the special ring never wears out", () => {
    expect(SPECIAL_EQUIPMENT["eqs.van_co_gioi"]!.maxDurability).toBeNull();
    expect(isItemId("eqs.van_co_gioi")).toBe(true);
  });
});

describe("wearing rules", () => {
  const robeM = equipmentInfo("eq.robe.m.0.1.1")!;
  const robeF = equipmentInfo("eq.robe.f.0.1.1")!;
  const ring = equipmentInfo("eq.ring.u.0.1.1")!;

  it("gendered gear needs the matching style, unisex gear anyone", () => {
    expect(equipBlock(robeM, "robe", 100, maleWearer)).toBeNull();
    expect(equipBlock(robeF, "robe", 100, maleWearer)).toBe("gender");
    const crossed: WearerCtx = { ...maleWearer, gender: "male_wears_female" };
    expect(equipBlock(robeM, "robe", 100, crossed)).toBe("gender");
    expect(equipBlock(robeF, "robe", 100, crossed)).toBeNull();
    expect(equipBlock(ring, "ring1", 100, crossed)).toBeNull();
  });

  it("checks slot, durability, level and base stat", () => {
    expect(equipBlock(ring, "hat", 100, maleWearer)).toBe("slot");
    expect(equipBlock(ring, "ring2", 0, maleWearer)).toBe("broken");
    const lv = equipmentInfo("eq.robe.m.0.9.1")!;
    expect(equipBlock(lv, "robe", 100, maleWearer)).toBe("level");
    expect(equipBlock(lv, "robe", 100, { ...maleWearer, stage: 9 })).toBeNull();
    const hard = equipmentInfo("eq.weapon.u.0.1.4")!;
    expect(hard.req.stat).not.toBeNull();
    expect(equipBlock(hard, "weapon", 100, maleWearer)).toBe("stat");
    expect(equipBlock(hard, "weapon", 100, { ...maleWearer, base: base({ canCot: 50 }) })).toBeNull();
  });
});

describe("durability", () => {
  const info = equipmentInfo("eq.weapon.u.0.5.2")!;

  it("scales stats by the share of durability left, broken gives nothing", () => {
    expect(scaledStats(info, 100, 100).attack).toBe(info.stats.attack);
    expect(scaledStats(info, 50, 100).attack).toBe(Math.floor(info.stats.attack / 2));
    expect(scaledStats(info, 0, 100).attack).toBe(0);
    expect(scaledStats(info, undefined, undefined).attack).toBe(info.stats.attack);
  });

  it("bonus counts only pieces that may be worn", () => {
    const worn: EquippedItem[] = [
      { id: "a", type: "eq.weapon.u.0.5.2", slot: "weapon", dur: 100, max: 100 },
      { id: "b", type: "eq.ring.u.0.1.1", slot: "ring1", dur: 0, max: 100 },
      { id: "c", type: "eq.robe.f.0.1.1", slot: "robe", dur: 100, max: 100 }, // wrong gender
    ];
    expect(equipmentBonus(worn, maleWearer).attack).toBe(info.stats.attack);
  });

  it("repair costs by grade and lost points", () => {
    expect(repairCost(1, 10)).toBe(10);
    expect(repairCost(2, 10)).toBe(20);
    expect(repairCost(4, 10)).toBe(80);
    expect(repairCost(3, 0)).toBe(0);
  });

  it("the bonus reaches the derived stats", () => {
    const plain = deriveStats(base(), 0, 5, 1);
    const geared = deriveStats(base(), 0, 5, 1, { attack: 10, defense: 5, maxHp: 50, critRate: 2, dodgeRate: 1 });
    expect(geared.attack).toBe(plain.attack + 10);
    expect(geared.defense).toBe(plain.defense + 5);
    expect(geared.maxHp).toBe(plain.maxHp + 50);
    expect(geared.critRate).toBe(plain.critRate + 2);
    expect(geared.dodgeRate).toBe(plain.dodgeRate + 1);
  });
});

describe("equip planning", () => {
  const sword = "eq.weapon.u.0.1.1";
  const ringT = "eq.ring.u.0.1.1";
  const empty: BagContents = { items: [], equipped: [] };

  it("wears into an empty slot and the bag cell is freed", () => {
    const st: BagContents = { items: [bagItem("s", sword, 0, 3, 100)], equipped: [] };
    const plan = planEquip(st, 1, { tab: 0, cell: 3 }, undefined, maleWearer);
    expect(plan.ok && plan.ops).toEqual([{ op: "equip", id: "s", slot: "weapon", tab: 0, cell: 3 }]);
    const after = applyBag(st, plan.ok ? plan.ops : []);
    expect(after.items).toEqual([]);
    expect(after.equipped).toEqual([{ id: "s", type: sword, slot: "weapon", dur: 100, max: 100 }]);
  });

  it("replacing swaps: the old piece takes the new piece's cell", () => {
    const st: BagContents = {
      items: [bagItem("new", "eq.weapon.u.0.2.1", 0, 7, 100)],
      equipped: [{ id: "old", type: sword, slot: "weapon", dur: 40, max: 100 }],
    };
    const plan = planEquip(st, 1, { tab: 0, cell: 7 }, undefined, maleWearer);
    expect(plan.ok && plan.ops[0]!.op).toBe("swapequip");
    const after = applyBag(st, plan.ok ? plan.ops : []);
    expect(after.equipped.map((e) => e.id)).toEqual(["new"]);
    expect(after.items).toEqual([{ id: "old", type: sword, tab: 0, cell: 7, qty: 1, dur: 40, max: 100 }]);
  });

  it("rings fill the second slot first, then replace the first; pháp bảo have four", () => {
    const ring = (id: string, cell: number) => bagItem(id, ringT, 0, cell, 100);
    let st: BagContents = { items: [ring("r1", 0), ring("r2", 1), ring("r3", 2)], equipped: [] };
    for (const [id, cell, slot] of [["r1", 0, "ring1"], ["r2", 1, "ring2"]] as const) {
      const plan = planEquip(st, 1, { tab: 0, cell }, undefined, maleWearer);
      expect(plan.ok && plan.ops[0]).toMatchObject({ id, slot });
      st = applyBag(st, plan.ok ? plan.ops : []);
    }
    const third = planEquip(st, 1, { tab: 0, cell: 2 }, undefined, maleWearer);
    expect(third.ok && third.ops[0]).toMatchObject({ op: "swapequip", slot: "ring1" });
  });

  it("refuses wrong slot, wrong gender, broken and empty cells", () => {
    const st: BagContents = { items: [bagItem("f", "eq.robe.f.0.1.1", 0, 0, 100), bagItem("b", ringT, 0, 1, 0), bagItem("m", sword, 0, 2, 100)], equipped: [] };
    expect(planEquip(st, 1, { tab: 0, cell: 0 }, undefined, maleWearer)).toEqual({ ok: false, error: "gender" });
    expect(planEquip(st, 1, { tab: 0, cell: 1 }, undefined, maleWearer)).toEqual({ ok: false, error: "broken" });
    expect(planEquip(st, 1, { tab: 0, cell: 2 }, "hat", maleWearer)).toEqual({ ok: false, error: "slot" });
    expect(planEquip(st, 1, { tab: 0, cell: 9 }, undefined, maleWearer)).toEqual({ ok: false, error: "invalid" });
    expect(planEquip(empty, 1, { tab: 99, cell: 0 }, undefined, maleWearer)).toEqual({ ok: false, error: "invalid" });
  });

  it("taking off needs a free cell", () => {
    const worn: EquippedItem = { id: "s", type: sword, slot: "weapon", dur: 100, max: 100 };
    const plan = planUnequip({ items: [], equipped: [worn] }, 1, "weapon");
    expect(plan.ok && plan.ops).toEqual([{ op: "unequip", id: "s", slot: "weapon", tab: 0, cell: 0 }]);
    const full: BagItem[] = Array.from({ length: 128 }, (_, i) => bagItem(`x${i}`, "linh_thao", 0, i));
    expect(planUnequip({ items: full, equipped: [worn] }, 1, "weapon")).toEqual({ ok: false, error: "full" });
    expect(planUnequip(empty, 1, "weapon")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("death, repair and auto take-off", () => {
  const worn = (id: string, type: string, slot: EquippedItem["slot"], dur?: number): EquippedItem => ({
    id,
    type,
    slot,
    ...(dur !== undefined ? { dur, max: DEFAULT_MAX_DURABILITY } : {}),
  });

  it("death takes 5% of the maximum from every worn piece, never from gear that does not wear out", () => {
    const st: BagContents = { items: [], equipped: [worn("a", "eq.weapon.u.0.1.1", "weapon", 100), worn("b", "eqs.van_co_gioi", "ring1")] };
    const r = planDeathWear(st, 1, maleWearer, newId);
    expect(r.ops).toEqual([{ op: "setdur", id: "a", from: 100, to: 95 }]);
    expect(r.removed).toEqual([]);
  });

  it("a piece that reaches zero comes off into the bag, or into permanent mail when the bag is full", () => {
    const st: BagContents = { items: [], equipped: [worn("a", "eq.weapon.u.0.1.1", "weapon", 3)] };
    const r = planDeathWear(st, 1, maleWearer, newId);
    expect(r.ops.map((o) => o.op)).toEqual(["setdur", "unequip"]);
    expect(r.removed[0]).toMatchObject({ reason: "broken", mailed: false });
    const after = applyBag(st, r.ops);
    expect(after.equipped).toEqual([]);
    expect(after.items[0]).toMatchObject({ id: "a", dur: 0, max: 100 });

    const full: BagItem[] = Array.from({ length: 128 }, (_, i) => bagItem(`x${i}`, "linh_thao", 0, i));
    const r2 = planDeathWear({ items: full, equipped: st.equipped }, 1, maleWearer, newId);
    expect(r2.ops.map((o) => o.op)).toEqual(["setdur", "mailequip"]);
    expect(r2.removed[0]).toMatchObject({ mailed: true });
  });

  it("gear the wearer no longer qualifies for comes off", () => {
    const st: BagContents = { items: [], equipped: [worn("a", "eq.robe.m.0.9.1", "robe", 100), worn("b", "eq.robe.f.0.1.1", "hat", 100)] };
    const r = planReconcile(st, 1, maleWearer, newId);
    expect(r.removed.map((x) => [x.item.id, x.reason])).toEqual([["a", "level"], ["b", "slot"]]);
  });

  it("repair restores worn pieces to full and totals the price, skipping broken and full ones", () => {
    const st: BagContents = {
      items: [],
      equipped: [worn("a", "eq.weapon.u.0.1.1", "weapon", 90), worn("b", "eq.ring.u.0.1.4", "ring1", 50), worn("c", "eq.belt.u.0.1.1", "belt", 0), worn("d", "eq.charm.u.0.1.1", "charm1", 100)],
    };
    const all = planRepair(st, "all");
    expect(all.ok && all.cost).toBe(10 * 1 + 50 * 8);
    expect(all.ok && all.ops.map((o) => (o as { id: string }).id)).toEqual(["a", "b"]);
    expect(planRepair(st, "belt")).toEqual({ ok: false, error: "nothing" });
    expect(planRepair(st, "hat")).toEqual({ ok: false, error: "invalid" });
  });
});

describe("element and weapon family", () => {
  it("are parsed from the id; older six-part ids still work and have neither", () => {
    const sword = equipmentInfo("eq.weapon.u.0.2.1.hoa.kiem")!;
    expect([sword.element, sword.weaponType]).toEqual(["hoa", "kiem"]);
    expect(equipmentInfo("eq.robe.m.0.2.1.thuy")).toMatchObject({ element: "thuy", weaponType: null });
    expect(equipmentInfo("eq.weapon.u.0.2.1")).toMatchObject({ element: null, weaponType: null });
    expect(equipmentInfo(makeEquipmentId("weapon", "u", 0, 2, 1, "hoa", "riu"))!.weaponType).toBe("riu");
  });

  it("rejects an unknown element, a weapon family on a non-weapon and an unknown family", () => {
    for (const bad of ["eq.robe.m.0.2.1.nothing", "eq.robe.m.0.2.1.hoa.kiem", "eq.weapon.u.0.2.1.hoa.sling", "eq.weapon.u.0.2.1.hoa.kiem.extra"]) {
      expect(equipmentInfo(bad), bad).toBeUndefined();
    }
  });

  it("do not change the stats, and the name has no realm or bậc (they are a tag)", () => {
    const a = equipmentInfo("eq.weapon.u.0.2.1")!;
    const b = equipmentInfo("eq.weapon.u.0.2.1.hoa.kiem")!;
    expect(b.stats).toEqual(a.stats);
    expect(b.nameVi).toBe("Phi Kiếm");
    expect(equipTierTag(b)).toBe("LK2");
    expect(equipTierTag(equipmentInfo("eq.robe.m.1.4.1")!)).toBe("TC4");
  });

  it("drops carry one of the five elements, and weapons a family", () => {
    const seen = new Set<string>();
    for (let t = 0; t < 400; t++) {
      let s = t + 7;
      const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const drop = rollEquipmentDrop(0, 4, "rare2", rand);
      if (!drop) continue;
      const info = equipmentInfo(drop.type)!;
      expect(["kim", "moc", "thuy", "hoa", "tho"]).toContain(info.element);
      expect(info.kind === "weapon" ? info.weaponType !== null : info.weaponType === null).toBe(true);
      seen.add(info.element!);
    }
    expect(seen.size).toBe(5);
  });
});

describe("equipment drops", () => {
  const seq = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length]!;
  };

  it("uses nine rolls whatever the outcome", () => {
    let calls = 0;
    rollEquipmentDrop(0, 4, "normal", () => (calls++, 0.99));
    expect(calls).toBe(9);
    calls = 0;
    rollEquipmentDrop(0, 4, "rare2", () => (calls++, 0));
    expect(calls).toBe(9);
  });

  it("normal drops stay in the map's realm at or below the monster's bậc", () => {
    for (let t = 0; t < 200; t++) {
      let s = t + 1;
      const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const drop = rollEquipmentDrop(1, 4, "normal", () => rand() * 0.02);
      if (!drop) continue;
      const info = equipmentInfo(drop.type)!;
      expect(info.realm).toBe(1);
      expect(info.tier).toBeLessThanOrEqual(4);
      expect(info.tier).toBeGreaterThanOrEqual(2);
      expect(drop.dur).toBe(drop.max);
    }
  });

  it("rare monsters can drop over-level gear and high grades", () => {
    // chance, kind=weapon, style, tier, grade roll high, over-level roll low
    const drop = rollEquipmentDrop(0, 7, "rare2", seq([0, 0, 0, 0, 0.99, 0, 0, 0, 0]));
    const info = equipmentInfo(drop!.type)!;
    expect(info.realm).toBe(1);
    expect(info.grade).toBe(4);
  });

  it("a normal monster never drops the top grade", () => {
    const drop = rollEquipmentDrop(0, 7, "normal", seq([0, 0, 0, 0, 0.9999, 0.9, 0, 0, 0]));
    expect(equipmentInfo(drop!.type)!.grade).toBeLessThan(4);
  });

  it("no drop when the chance roll fails", () => {
    expect(rollEquipmentDrop(0, 1, "normal", () => 0.5)).toBeNull();
  });
});

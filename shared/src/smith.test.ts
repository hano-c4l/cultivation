import { afterEach, describe, expect, it } from "vitest";
import { equipmentBonus, equipmentInfo, scaledStats, type EquippedItem } from "./equipment-data";
import { getItemDef } from "./items";
import { getMap, npcNear } from "./map";
import { STAT_KEYS, type BaseStats } from "./progression-data";
import { DEFAULT_ENHANCE_TABLE, ENHANCE_MAX, enhanceStatMult, KEEP_LEVEL_ITEM, MAX_PITY_PCT, planConsume, resolveUpgrade, rollOreDrop, setEnhanceTable, SMITH_ORES, upgradeCost } from "./smith";
import { merchantOffers } from "./shop";
import { isStandable } from "./map";

afterEach(() => setEnhanceTable(null));

describe("upgrade levels", () => {
  it("each level adds a share of the stats: +1 is 10%, +2 is 20%", () => {
    expect(enhanceStatMult(0)).toBe(1);
    expect(enhanceStatMult(undefined)).toBe(1);
    expect(enhanceStatMult(1)).toBeCloseTo(1.1);
    expect(enhanceStatMult(2)).toBeCloseTo(1.2);
    expect(enhanceStatMult(ENHANCE_MAX)).toBeCloseTo(2);
    expect(enhanceStatMult(99)).toBeCloseTo(2);
  });

  it("scale the stats of a piece on top of its own roll and wear", () => {
    const info = equipmentInfo("eq.weapon.u.0.5.1.kim.kiem")!;
    const plain = scaledStats(info, undefined, undefined, undefined, 1, { attack: 100 });
    expect(plain.attack).toBe(100);
    expect(scaledStats(info, undefined, undefined, undefined, 1, { attack: 100 }, 3).attack).toBe(130);
    expect(scaledStats(info, 50, 100, undefined, 1, { attack: 100 }, 3).attack).toBe(65); // half worn
    const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 10])) as unknown as BaseStats;
    const w = { gender: "male" as const, realm: 3, stage: 9, base };
    const item: EquippedItem = { id: "a", type: info ? "eq.weapon.u.0.5.1.kim.kiem" : "", slot: "weapon", dur: 100, max: 100, rs: { attack: 100 }, en: 10 };
    expect(equipmentBonus([item], w).attack).toBe(200);
  });

  it("can be tuned from a table: a row that is broken keeps its default", () => {
    setEnhanceTable([{ level: 1, successPct: 10, statPct: 50, failBonusPct: 1, dropOnFail: false, materials: 1, linhMult: 1 }, { level: 2, successPct: 500 }]);
    expect(enhanceStatMult(1)).toBeCloseTo(1.5);
    expect(upgradeCost(0, 1, 0)!.chancePct).toBe(DEFAULT_ENHANCE_TABLE[1]!.successPct); // level 2 row was invalid
    expect(upgradeCost(0, 0, 0)!.chancePct).toBe(10);
  });
});

describe("the cost and the chance of a step", () => {
  it("rise with the level, and use the ore and the Linh Thạch of the piece's realm", () => {
    const a = upgradeCost(0, 0, 0)!;
    const b = upgradeCost(0, 5, 0)!;
    expect(a.ore).toBe("ren_lk");
    expect(upgradeCost(2, 0, 0)!.ore).toBe("ren_kd");
    expect(b.materials).toBeGreaterThan(a.materials);
    expect(b.linhThach).toBeGreaterThan(a.linhThach);
    expect(b.chancePct).toBeLessThan(a.chancePct);
    expect(upgradeCost(1, 0, 0)!.linhThach).toBeGreaterThan(a.linhThach);
    expect(upgradeCost(0, ENHANCE_MAX, 0)).toBeUndefined();
  });

  it("add the bonus built up by failures, but never more than the cap", () => {
    expect(upgradeCost(0, 5, 10)!.chancePct).toBe(DEFAULT_ENHANCE_TABLE[5]!.successPct + 10);
    expect(upgradeCost(0, 5, 999)!.chancePct).toBe(DEFAULT_ENHANCE_TABLE[5]!.successPct + MAX_PITY_PCT);
  });
});

describe("resolving an attempt", () => {
  const stepOf = (level: number) => DEFAULT_ENHANCE_TABLE[level - 1]!;
  it("success goes up a level and clears the bonus", () => {
    expect(resolveUpgrade(2, 15, 90, stepOf(3), false, 0.5)).toEqual({ success: true, level: 3, pity: 0, dropped: false, scrollUsed: false });
  });

  it("from +1 to +5 a failure keeps the level and builds the bonus", () => {
    expect(resolveUpgrade(2, 0, 50, stepOf(3), false, 0.9)).toEqual({ success: false, level: 2, pity: 5, dropped: false, scrollUsed: false });
    expect(resolveUpgrade(4, 28, 50, stepOf(5), false, 0.9).pity).toBe(MAX_PITY_PCT);
  });

  it("from +6 up a failure costs a level, unless the scroll is used (and then the scroll is spent)", () => {
    expect(resolveUpgrade(6, 0, 50, stepOf(7), false, 0.9)).toMatchObject({ success: false, level: 5, dropped: true, scrollUsed: false });
    expect(resolveUpgrade(6, 0, 50, stepOf(7), true, 0.9)).toMatchObject({ success: false, level: 6, dropped: false, scrollUsed: true });
  });

  it("the scroll is not spent when it would not have saved anything", () => {
    expect(resolveUpgrade(2, 0, 50, stepOf(3), true, 0.9).scrollUsed).toBe(false);
    expect(resolveUpgrade(6, 0, 50, stepOf(7), true, 0.1).scrollUsed).toBe(false); // it worked
  });

  it("the roll decides at the edge of the chance", () => {
    expect(resolveUpgrade(0, 0, 50, stepOf(1), false, 0.4999).success).toBe(true);
    expect(resolveUpgrade(0, 0, 50, stepOf(1), false, 0.5).success).toBe(false);
  });
});

describe("planConsume", () => {
  const bag = [
    { id: "a", type: "ren_lk", tab: 0, cell: 0, qty: 5 },
    { id: "b", type: "ren_lk", tab: 0, cell: 1, qty: 2 },
    { id: "c", type: "ren_tc", tab: 0, cell: 2, qty: 9 },
  ];
  it("takes from the smallest stacks first, and refuses when there is not enough", () => {
    expect(planConsume(bag, "ren_lk", 3)).toEqual([{ op: "remove", id: "b", qty: 2 }, { op: "setqty", id: "a", from: 5, to: 4 }]);
    expect(planConsume(bag, "ren_lk", 7)).toHaveLength(2);
    expect(planConsume(bag, "ren_lk", 8)).toBeNull();
    expect(planConsume(bag, "ren_na", 1)).toBeNull();
    expect(planConsume(bag, "ren_lk", 0)).toEqual([]);
  });
});

describe("the ore and the scroll", () => {
  it("are items, one ore per realm", () => {
    for (const ore of SMITH_ORES) expect(getItemDef(ore)?.category).toBe("material");
    expect(getItemDef(KEEP_LEVEL_ITEM)).toBeDefined();
    expect(new Set(SMITH_ORES.map((o) => getItemDef(o)!.nameVi)).size).toBe(SMITH_ORES.length);
  });

  it("only drop in the realm of the map, and draw two numbers", () => {
    let n = 0;
    const rand = () => (n++, 0);
    expect(rollOreDrop(0, "normal", rand)).toEqual({ item: "ren_lk", qty: 1 });
    expect(n).toBe(2);
    expect(rollOreDrop(1, "normal", () => 0)!.item).toBe("ren_tc");
    expect(rollOreDrop(9, "normal", () => 0)).toBeNull();
    expect(rollOreDrop(0, "normal", () => 0.99)).toBeNull();
    expect(rollOreDrop(0, "rare2", () => 0.99)!.qty).toBe(5);
  });

  it("the merchant sells the scroll for Tiên Ngọc", () => {
    const offer = merchantOffers("male", "town").find((o) => o.item === KEEP_LEVEL_ITEM);
    expect(offer).toMatchObject({ currency: "tien_ngoc", price: 50 });
  });
});

describe("the blacksmith NPC", () => {
  it("stands in town on ground a character can reach", () => {
    const town = getMap("town");
    const spot = town.npcs.find((n) => n.kind === "smith")!;
    expect(spot).toBeDefined();
    expect(npcNear(town, "smith", spot.x, spot.y)).toBeDefined();
    expect(isStandable(town, spot.x + 1.2, spot.y)).toBe(true);
  });
});

describe("the realm the smith counts a piece in", () => {
  it("is the realm of the piece, except for the bonded artifact, which counts as the realm it has trained to", async () => {
    const { smithRealmOf } = await import("./smith");
    expect(smithRealmOf({ kind: "robe", realm: 1 }, undefined, 9)).toBe(1);
    expect(smithRealmOf({ kind: "robe", realm: 1 }, 30, 9)).toBe(1); // only the bonded artifact trains
    expect(smithRealmOf({ kind: "bonded", realm: 0 }, 5, 9)).toBe(0);
    expect(smithRealmOf({ kind: "bonded", realm: 0 }, 9, 9)).toBe(1);
    expect(smithRealmOf({ kind: "bonded", realm: 0 }, undefined, 9)).toBe(0);
  });
});

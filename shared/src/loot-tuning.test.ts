import { afterEach, describe, expect, it } from "vitest";
import { LOOT_TABLES, REALM_LOOT, rollLoot, setItemOverlays, type LootDrop } from "./items";
import type { MonsterRank } from "./monsters";
import { DEFAULT_TUNING, resetTuning, setTuning, validTuningGroup } from "./tuning";

afterEach(() => {
  resetTuning();
  setItemOverlays([]);
});

/** rollLoot as it was written before the tables became tuning numbers (docs/PHASE3.md 3j). */
function oldRollLoot(rank: MonsterRank, rand: () => number, chanceMult: number, mapRealm: number): LootDrop[] {
  const out: LootDrop[] = [];
  for (const e of [...LOOT_TABLES[rank], ...(REALM_LOOT[mapRealm]?.[rank] ?? [])]) {
    const chanceRoll = rand();
    const qtyRoll = rand();
    if (chanceRoll >= e.chance * chanceMult) continue;
    out.push({ item: e.item, qty: e.min + Math.floor(qtyRoll * (e.max - e.min + 1)) });
  }
  return out;
}

/** A small seeded generator, so both versions see the same numbers. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe("the loot tuning", () => {
  it("has the tables of the code as its default", () => {
    expect(DEFAULT_TUNING.loot.base).toEqual(LOOT_TABLES);
    expect(DEFAULT_TUNING.loot.realm).toEqual(REALM_LOOT);
    expect(validTuningGroup("loot", DEFAULT_TUNING.loot)).toBe(true);
  });

  it("rolls exactly what the old code rolled, for every class, map realm and chance multiple", () => {
    for (const rank of ["normal", "rare1", "rare2"] as const)
      for (const realm of [0, 1, 2, 3])
        for (const mult of [1, 3, 0.5])
          for (let seed = 1; seed <= 40; seed++) expect(rollLoot(rank, seeded(seed), mult, realm), `${rank} ${realm} ${mult} ${seed}`).toEqual(oldRollLoot(rank, seeded(seed), mult, realm));
  });

  it("follows a changed table, in the order of its lines", () => {
    const base = { normal: [{ item: "yeu_dan", chance: 1, min: 3, max: 3 }, { item: "thu_cot", chance: 1, min: 1, max: 1 }], rare1: [], rare2: [] };
    setTuning({ loot: { base, realm: { "1": { normal: [{ item: "ngo_dao_dan", chance: 1, min: 1, max: 1 }], rare1: [], rare2: [] } } } });
    expect(rollLoot("normal", () => 0, 1, 0)).toEqual([{ item: "yeu_dan", qty: 3 }, { item: "thu_cot", qty: 1 }]);
    expect(rollLoot("normal", () => 0, 1, 1).map((d) => d.item)).toEqual(["yeu_dan", "thu_cot", "ngo_dao_dan"]);
    expect(rollLoot("rare1", () => 0, 1, 0)).toEqual([]);
  });

  it("skips an item that is gone from the catalogue or taken out of play, without breaking the rest", () => {
    const line = (item: string) => ({ item, chance: 1, min: 1, max: 1 });
    setTuning({ loot: { base: { normal: [line("no_such_item"), line("su_kien"), line("yeu_dan")], rare1: [], rare2: [] }, realm: {} } });
    setItemOverlays([{ id: "su_kien", custom: true, disabled: true, def: { id: "su_kien", nameVi: "Sự Kiện", descVi: "Thử.", category: "material", maxStack: 9, rarity: "common", grade: 1 } }]);
    expect(rollLoot("normal", () => 0, 1, 0).map((d) => d.item)).toEqual(["yeu_dan"]);
  });

  it("checks only the structure of a table", () => {
    const ok = { normal: [], rare1: [], rare2: [] };
    expect(validTuningGroup("loot", { base: ok, realm: {} })).toBe(true);
    expect(validTuningGroup("loot", { base: { ...ok, normal: [{ item: "an_item_that_may_not_exist", chance: 0.5, min: 1, max: 2 }] }, realm: {} })).toBe(true);
    expect(validTuningGroup("loot", { base: { ...ok, normal: [{ item: "x", chance: 2, min: 1, max: 2 }] }, realm: {} })).toBe(false);
    expect(validTuningGroup("loot", { base: { ...ok, normal: [{ item: "x", chance: 0.5, min: 3, max: 2 }] }, realm: {} })).toBe(false);
    expect(validTuningGroup("loot", { base: { ...ok, normal: [{ item: "X Y", chance: 0.5, min: 1, max: 2 }] }, realm: {} })).toBe(false);
    expect(validTuningGroup("loot", { base: ok, realm: { two: ok } })).toBe(false);
    expect(validTuningGroup("loot", { base: { normal: [], rare1: [] }, realm: {} })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { BAG_CELLS_PER_TAB, BAG_COLS, BAG_ROWS, applyOps, bagUsage, inBounds, planAdd, planMove, planRemove, type BagItem } from "./inventory";
import { ITEMS, LOOT_TABLES, rollLoot } from "./items";

let n = 0;
const newId = () => `id${++n}`;
const item = (type: string, tab: number, cell: number, qty: number, id = newId()): BagItem => ({ id, type, tab, cell, qty });

describe("bag layout", () => {
  it("is 8 x 16 cells per tab and positions are validated against the tab count", () => {
    expect(BAG_COLS * BAG_ROWS).toBe(128);
    expect(BAG_CELLS_PER_TAB).toBe(128);
    expect(inBounds({ tab: 0, cell: 127 }, 1)).toBe(true);
    expect(inBounds({ tab: 0, cell: 128 }, 1)).toBe(false);
    expect(inBounds({ tab: 1, cell: 0 }, 1)).toBe(false);
    expect(inBounds({ tab: 1, cell: 0 }, 2)).toBe(true);
    expect(inBounds({ tab: -1, cell: 0 }, 2)).toBe(false);
    expect(inBounds({ tab: 0, cell: 1.5 }, 2)).toBe(false);
  });
});

describe("planAdd", () => {
  it("fills an existing stack first, then opens a new cell", () => {
    const bag = [item("linh_thao", 0, 3, 98, "a")];
    const ops = planAdd(bag, 1, "linh_thao", 3, newId)!;
    expect(ops[0]).toEqual({ op: "setqty", id: "a", from: 98, to: 99 });
    expect(ops[1]).toMatchObject({ op: "add", type: "linh_thao", tab: 0, cell: 0, qty: 2 });
    const after = applyOps(bag, ops);
    expect(after.reduce((s, i) => s + i.qty, 0)).toBe(101);
    expect(after.every((i) => i.qty <= 99)).toBe(true);
  });

  it("uses the first free cell in reading order and never two items in one cell", () => {
    let bag: BagItem[] = [item("thu_cot", 0, 0, 99), item("thu_cot", 0, 1, 99)];
    bag = applyOps(bag, planAdd(bag, 1, "thu_cot", 1, newId)!);
    expect(bag.find((i) => i.qty === 1)).toMatchObject({ tab: 0, cell: 2 });
    const cells = bag.map((i) => `${i.tab}:${i.cell}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("splits a large quantity over several cells", () => {
    const ops = planAdd([], 1, "linh_thao", 250, newId)!;
    expect(ops.map((o) => (o.op === "add" ? o.qty : 0))).toEqual([99, 99, 52]);
  });

  it("returns null when the whole quantity does not fit, and plans nothing", () => {
    const full: BagItem[] = Array.from({ length: BAG_CELLS_PER_TAB }, (_, i) => item("thu_cot", 0, i, 99));
    expect(planAdd(full, 1, "linh_thao", 1, newId)).toBeNull();
    expect(planAdd(full, 1, "thu_cot", 1, newId)).toBeNull(); // every stack is at its limit too
    expect(planAdd(full, 2, "linh_thao", 1, newId)).not.toBeNull(); // a second tab gives room
  });

  it("rejects a non-positive or fractional quantity", () => {
    expect(planAdd([], 1, "linh_thao", 0, newId)).toBeNull();
    expect(planAdd([], 1, "linh_thao", -1, newId)).toBeNull();
    expect(planAdd([], 1, "linh_thao", 1.5, newId)).toBeNull();
  });

  it("never stacks an item whose limit is 1", () => {
    // An unknown type is treated as non-stackable, like equipment will be.
    const ops = planAdd([item("kiem_gi_do", 0, 0, 1, "a")], 1, "kiem_gi_do", 1, newId)!;
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "add", qty: 1, cell: 1 });
  });
});

describe("planMove", () => {
  it("moves into an empty cell", () => {
    const bag = [item("linh_thao", 0, 0, 5, "a")];
    const ops = planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 9 })!;
    expect(applyOps(bag, ops)).toEqual([{ id: "a", type: "linh_thao", tab: 0, cell: 9, qty: 5 }]);
  });

  it("merges stacks of the same type and keeps the remainder in the source", () => {
    const bag = [item("linh_thao", 0, 0, 60, "a"), item("linh_thao", 0, 1, 50, "b")];
    const after = applyOps(bag, planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 1 })!);
    expect(after.find((i) => i.id === "b")!.qty).toBe(99);
    expect(after.find((i) => i.id === "a")!.qty).toBe(11);
    expect(after.reduce((s, i) => s + i.qty, 0)).toBe(110);
  });

  it("merges completely and removes the source when everything fits", () => {
    const bag = [item("linh_thao", 0, 0, 10, "a"), item("linh_thao", 0, 1, 20, "b")];
    const after = applyOps(bag, planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 1 })!);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: "b", qty: 30 });
  });

  it("swaps two different items", () => {
    const bag = [item("linh_thao", 0, 0, 1, "a"), item("thu_cot", 0, 5, 2, "b")];
    const after = applyOps(bag, planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 5 })!);
    expect(after.find((i) => i.id === "a")).toMatchObject({ cell: 5 });
    expect(after.find((i) => i.id === "b")).toMatchObject({ cell: 0 });
  });

  it("swaps (does not merge) when the target stack is already full", () => {
    const bag = [item("linh_thao", 0, 0, 5, "a"), item("linh_thao", 0, 1, 99, "b")];
    const ops = planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 1 })!;
    expect(ops[0]!.op).toBe("swap");
  });

  it("moves between tabs", () => {
    const bag = [item("linh_thao", 0, 0, 1, "a")];
    const after = applyOps(bag, planMove(bag, 2, { tab: 0, cell: 0 }, { tab: 1, cell: 4 })!);
    expect(after[0]).toMatchObject({ tab: 1, cell: 4 });
  });

  it("refuses invalid moves", () => {
    const bag = [item("linh_thao", 0, 0, 1, "a")];
    expect(planMove(bag, 1, { tab: 0, cell: 1 }, { tab: 0, cell: 2 })).toBeNull(); // empty source
    expect(planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 0 })).toBeNull(); // same cell
    expect(planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 1, cell: 0 })).toBeNull(); // tab not owned
    expect(planMove(bag, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 999 })).toBeNull();
  });
});

describe("planRemove", () => {
  it("discards part or all of a stack", () => {
    const bag = [item("linh_thao", 0, 0, 10, "a")];
    expect(applyOps(bag, planRemove(bag, 1, { tab: 0, cell: 0 }, 3)!)[0]!.qty).toBe(7);
    expect(applyOps(bag, planRemove(bag, 1, { tab: 0, cell: 0 })!)).toEqual([]);
    expect(planRemove(bag, 1, { tab: 0, cell: 0 }, 11)).toBeNull();
    expect(planRemove(bag, 1, { tab: 0, cell: 0 }, 0)).toBeNull();
    expect(planRemove(bag, 1, { tab: 0, cell: 5 })).toBeNull();
  });
});

describe("bagUsage", () => {
  it("counts used cells against the tabs owned", () => {
    expect(bagUsage([item("linh_thao", 0, 0, 1)], 2)).toEqual({ used: 1, total: 256 });
  });
});

describe("items and loot", () => {
  it("every stackable item is a consumable or material; equipment-like items must have a stack limit of 1", () => {
    for (const def of Object.values(ITEMS)) {
      expect(def.maxStack).toBeGreaterThanOrEqual(1);
      expect(def.nameVi.length).toBeGreaterThan(0);
      if (def.maxStack > 1) expect(["consumable", "material"]).toContain(def.category);
    }
  });

  it("loot tables only name known items with sane chances and quantities", () => {
    for (const table of Object.values(LOOT_TABLES)) {
      for (const e of table) {
        expect(ITEMS[e.item]).toBeDefined();
        expect(e.chance).toBeGreaterThan(0);
        expect(e.chance).toBeLessThanOrEqual(1);
        expect(e.min).toBeGreaterThanOrEqual(1);
        expect(e.max).toBeGreaterThanOrEqual(e.min);
      }
    }
  });

  it("rollLoot is deterministic under an injected RNG and respects chance and quantity bounds", () => {
    expect(rollLoot("normal", () => 0.99)).toEqual([]); // every chance misses
    const all = rollLoot("rare2", () => 0); // every chance hits, lowest quantity
    expect(all.map((d) => d.item).sort()).toEqual(["hoi_huyet_dan", "linh_thao", "yeu_dan"]);
    expect(all.find((d) => d.item === "linh_thao")!.qty).toBe(2);
    const high = rollLoot("rare2", () => 0.0001);
    expect(high.length).toBe(3);
    // qty roll just under 1 reaches the maximum: use a sequence (chance 0, qty 0.999...) per entry.
    let k = 0;
    const seq = () => (k++ % 2 === 0 ? 0 : 0.9999);
    expect(rollLoot("rare2", seq).find((d) => d.item === "linh_thao")!.qty).toBe(4);
  });

  it("rare monsters always drop a Yêu Đan from the rarest class", () => {
    expect(rollLoot("rare2", () => 0.999).some((d) => d.item === "yeu_dan")).toBe(true);
  });
});

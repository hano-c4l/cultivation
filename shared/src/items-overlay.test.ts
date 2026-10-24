import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, allItemDefs, getItemDef, itemOverlayProblem, itemsGeneration, setItemOverlays, type ItemOverlay } from "./items";
import { giftProblem, giftableItems } from "./gifts";
import { itemValue } from "./shop";

afterEach(() => setItemOverlays([]));

const custom = (over: Partial<ItemOverlay["def"]> = {}, disabled = false): ItemOverlay => ({
  id: "su_kien_dan",
  custom: true,
  disabled,
  def: { id: "su_kien_dan", nameVi: "Sự Kiện Đan", descVi: "Đan thử.", category: "consumable", maxStack: 50, rarity: "rare", grade: 2, healFraction: 0.5, ...over },
});

describe("the item catalogue overlay", () => {
  it("with no rows every item is exactly the one written in the code, generated ones included", () => {
    for (const id of Object.keys(ITEMS)) expect(getItemDef(id), id).toBe(ITEMS[id]);
    expect(allItemDefs().map((d) => d.id).sort()).toEqual(Object.keys(ITEMS).sort());
    expect(getItemDef("eq.weapon.1")).toBeUndefined();
  });

  it("changes only the name, description, rarity and grade of an item of the code, and keeps its mechanics", () => {
    const base = ITEMS.hoi_huyet_dan!;
    setItemOverlays([{ id: "hoi_huyet_dan", custom: false, disabled: false, def: { nameVi: "Hồi Máu Đan", grade: 2, healFraction: 1, maxStack: 1, category: "material" } }]);
    const def = getItemDef("hoi_huyet_dan")!;
    expect(def).toMatchObject({ nameVi: "Hồi Máu Đan", grade: 2, descVi: base.descVi, rarity: base.rarity, healFraction: base.healFraction, maxStack: base.maxStack, category: "consumable" });
    expect(ITEMS.hoi_huyet_dan).toBe(base); // the code's table is never touched
  });

  it("serves an item an admin made, lists it, and marks a soft deleted one disabled", () => {
    const before = itemsGeneration();
    setItemOverlays([custom()]);
    expect(itemsGeneration()).toBe(before + 1);
    expect(getItemDef("su_kien_dan")).toMatchObject({ nameVi: "Sự Kiện Đan", healFraction: 0.5 });
    expect(allItemDefs().some((d) => d.id === "su_kien_dan")).toBe(true);
    expect(giftableItems().some((d) => d.id === "su_kien_dan")).toBe(true);
    expect(giftProblem({ items: [{ type: "su_kien_dan", qty: 1 }] })).toBeNull();
    setItemOverlays([custom({}, true)]);
    expect(getItemDef("su_kien_dan")!.disabled).toBe(true);
    expect(giftableItems().some((d) => d.id === "su_kien_dan")).toBe(false);
    expect(giftProblem({ items: [{ type: "su_kien_dan", qty: 1 }] })).toBe("item");
  });

  it("gives an item made by an admin the value set in the tuning, like any other", () => {
    setItemOverlays([custom()]);
    expect(itemValue("su_kien_dan")).toBe(0);
  });

  it("checks an overlay row", () => {
    expect(itemOverlayProblem(custom())).toBeNull();
    expect(itemOverlayProblem({ id: "hoi_huyet_dan", custom: false, disabled: false, def: { nameVi: "X", grade: 3 } })).toBeNull();
    expect(itemOverlayProblem({ id: "hoi_huyet_dan", custom: false, disabled: false, def: { grade: 9 } })).toBe("bad grade");
    expect(itemOverlayProblem({ id: "hoi_huyet_dan", custom: false, disabled: false, def: { nameVi: "  " } })).toBe("bad name");
    expect(itemOverlayProblem({ id: "BAD id", custom: true, disabled: false, def: {} })).toBe("bad id");
    expect(itemOverlayProblem(custom({ id: "other" }))).toBe("a custom item needs its whole definition");
    expect(itemOverlayProblem({ ...custom(), id: "hoi_huyet_dan", def: { ...custom().def, id: "hoi_huyet_dan" } })).toBe("this id belongs to the code");
    expect(itemOverlayProblem({ ...custom(), id: "eq.x", def: custom().def })).toBe("bad id");
    expect(itemOverlayProblem(custom({ category: "equipment" }))).toBe("bad category");
    expect(itemOverlayProblem(custom({ category: "skill_book" }))).toBe("bad category");
    expect(itemOverlayProblem(custom({ maxStack: 0 }))).toBe("bad stack size");
    expect(itemOverlayProblem(custom({ healFraction: 1.5 }))).toBe("bad heal");
    expect(itemOverlayProblem(custom({ healFraction: undefined, healOverMs: 5000 }))).toBe("bad heal time");
    expect(itemOverlayProblem(custom({ category: "material" }))).toBe("only consumables heal or teach");
    expect(itemOverlayProblem(custom({ masteryPills: 100 }))).toBe("a consumable heals or raises mastery, not both");
  });
});

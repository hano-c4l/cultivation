import { describe, expect, it } from "vitest";
import { findOffer, itemValue, merchantOffers, sellPrice, shopCategoryOf, shopDay, shopElementOf, SELL_RATE, SHOP_CATEGORIES, SHOP_SELL_MANY_MAX } from "./shop";
import { parseClientMessage } from "./protocol";
import { getItemDef } from "./items";

describe("merchant offers", () => {
  it("every offer is a real item with a price and gear is in the buyer's own style", () => {
    for (const gender of ["male", "female", "male_wears_female", "female_wears_male"] as const) {
      const offers = merchantOffers(gender, "town");
      expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
      for (const o of offers) {
        expect(getItemDef(o.item), o.id).toBeDefined();
        expect(o.price).toBeGreaterThan(0);
        expect(o.id).toMatch(/^[a-z0-9_.]{1,60}$/);
      }
    }
    expect(merchantOffers("male", "town").some((o) => o.id.startsWith("eq.hat.f."))).toBe(false);
    expect(merchantOffers("male_wears_female", "town").some((o) => o.id.startsWith("eq.hat.f."))).toBe(true);
    expect(findOffer("female", "town", "eq.hat.m.0.1.1.kim")).toBeUndefined();
  });

  it("never pays more for an item than it sells it for", () => {
    for (const o of merchantOffers("male", "town")) expect(sellPrice(o.item)).toBeLessThan(o.price);
  });
});

describe("selling", () => {
  it("pays a fraction of the value, scaled by the wear, at least 1", () => {
    expect(sellPrice("ngo_dao_dan")).toBe(Math.floor(itemValue("ngo_dao_dan") * SELL_RATE));
    expect(sellPrice("linh_thao")).toBe(1);
    const sword = "eq.weapon.u.0.1.1";
    expect(sellPrice(sword, 50, 100)).toBeLessThan(sellPrice(sword, 100, 100));
    expect(sellPrice(sword, 0, 100)).toBe(1);
  });

  it("does not take what must not be sold", () => {
    expect(sellPrice("bt_pill_1")).toBe(0);
    expect(sellPrice("not.an.item")).toBe(0);
    expect(sellPrice("eqs.van_co_gioi")).toBe(0);
  });
});

describe("shop day", () => {
  it("rolls over at midnight in Vietnam (17:00 UTC)", () => {
    const DAY = 24 * 3600_000;
    expect(shopDay(10 * DAY + 16 * 3600_000)).toBe(shopDay(10 * DAY));
    expect(shopDay(10 * DAY + 17 * 3600_000)).toBe(shopDay(10 * DAY) + 1);
  });
});

describe("tabs, elements, books and the talisman", () => {
  it("every offer sits in a real tab and elemental gear says its element", () => {
    const offers = merchantOffers("male", "town");
    for (const o of offers) {
      expect(SHOP_CATEGORIES).toContain(o.category);
      expect(o.category).toBe(shopCategoryOf(o.item));
    }
    const hats = offers.filter((o) => o.id.startsWith("eq.hat."));
    expect(hats.map((o) => o.element).sort()).toEqual(["hoa", "hoa", "kim", "kim", "moc", "moc", "tho", "tho", "thuy", "thuy"]);
    expect(offers.find((o) => o.id === "eq.weapon.u.0.1.1.kim.kiem")?.category).toBe("gear");
    expect(offers.find((o) => o.id === "eq.charm.u.0.1.1.hoa")?.category).toBe("artifact");
    expect(shopElementOf("eq.charm.u.0.1.1.hoa")).toBe("hoa");
  });

  it("sells the basic books, the element books by element, and no breakthrough pill", () => {
    const books = merchantOffers("female", "town").filter((o) => o.category === "book");
    expect(books.map((o) => o.item)).toEqual(expect.arrayContaining(["bt_cuong_than", "bt_ngu_kiem_tram", "bt_kim_3", "bt_tho_3"]));
    expect(books.find((o) => o.item === "bt_kim_3")?.element).toBe("kim");
    expect(books.find((o) => o.item === "bt_cuong_than")?.element).toBeNull();
    expect(books.every((o) => o.dailyLimit === undefined)).toBe(true);
    expect(merchantOffers("male", "town").some((o) => o.item.startsWith("bt_pill"))).toBe(false);
  });

  it("the merchant of a town sells that town's talisman only", () => {
    expect(merchantOffers("male", "town").some((o) => o.item === "ttp_town" && o.category === "pill" && o.price === 2000)).toBe(true);
    expect(merchantOffers("male", "forest").some((o) => o.item.startsWith("ttp_"))).toBe(false);
    expect(getItemDef("ttp_town")?.teleportTo).toBe("town");
    expect(sellPrice("ttp_town")).toBeGreaterThan(0);
  });
});

describe("shop_sell_many", () => {
  const msg = (cells: unknown) => parseClientMessage(JSON.stringify({ t: "shop_sell_many", npc: "merchant", cells }));
  it("accepts distinct cells up to the limit and a worst case still fits the message limit", () => {
    expect(msg([{ tab: 0, cell: 1 }])).toEqual({ t: "shop_sell_many", npc: "merchant", cells: [{ tab: 0, cell: 1 }] });
    const worst = Array.from({ length: SHOP_SELL_MANY_MAX }, (_, i) => ({ tab: 9, cell: 40 + i }));
    expect(JSON.stringify({ t: "shop_sell_many", npc: "merchant", cells: worst }).length).toBeLessThan(512);
    expect(msg(worst)).not.toBeNull();
  });
  it("rejects empty, too many, repeated and malformed cells", () => {
    expect(msg([])).toBeNull();
    expect(msg(Array.from({ length: SHOP_SELL_MANY_MAX + 1 }, (_, i) => ({ tab: 0, cell: i })))).toBeNull();
    expect(msg([{ tab: 0, cell: 1 }, { tab: 0, cell: 1 }])).toBeNull();
    expect(msg([{ tab: 0, cell: 999 }])).toBeNull();
    expect(msg("x")).toBeNull();
  });
});

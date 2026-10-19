import { describe, expect, it } from "vitest";
import { findOffer, itemValue, merchantOffers, sellPrice, shopDay, SELL_RATE } from "./shop";
import { getItemDef } from "./items";

describe("merchant offers", () => {
  it("every offer is a real item with a price and gear is in the buyer's own style", () => {
    for (const gender of ["male", "female", "male_wears_female", "female_wears_male"] as const) {
      const offers = merchantOffers(gender);
      expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
      for (const o of offers) {
        expect(getItemDef(o.item), o.id).toBeDefined();
        expect(o.price).toBeGreaterThan(0);
        expect(o.id).toMatch(/^[a-z0-9_.]{1,60}$/);
      }
    }
    expect(merchantOffers("male").some((o) => o.id.startsWith("eq.hat.f"))).toBe(false);
    expect(merchantOffers("male_wears_female").some((o) => o.id.startsWith("eq.hat.f"))).toBe(true);
    expect(findOffer("female", "eq.hat.m.0.1.1")).toBeUndefined();
  });

  it("never pays more for an item than it sells it for", () => {
    for (const o of merchantOffers("male")) expect(sellPrice(o.item)).toBeLessThan(o.price);
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

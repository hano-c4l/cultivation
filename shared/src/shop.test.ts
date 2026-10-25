import { describe, expect, it } from "vitest";
import { setTuning, resetTuning, DEFAULT_TUNING } from "./tuning";
import { itemValue, sellPrice, shopCategoryOf, shopDay, shopElementOf, SELL_RATE, SHOP_CATEGORIES, SHOP_SELL_MANY_MAX } from "./shop";
import { findOffer, merchantOffers, merchantPays, setMerchants, DEFAULT_MERCHANTS, validMerchant } from "./merchants";
import { parseClientMessage } from "./protocol";
import { getItemDef } from "./items";

describe("merchant offers", () => {
  it("every offer is a real item with a price and gear is in the buyer's own style", () => {
    for (const gender of ["male", "female", "male_wears_female", "female_wears_male"] as const) {
      const offers = merchantOffers(gender, "merchant");
      expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
      for (const o of offers) {
        expect(getItemDef(o.item), o.id).toBeDefined();
        expect(o.price).toBeGreaterThan(0);
        expect(o.id).toMatch(/^[a-z0-9_.]{1,60}$/);
      }
    }
    expect(merchantOffers("male", "merchant").some((o) => o.id.startsWith("eq.hat.f."))).toBe(false);
    expect(merchantOffers("male_wears_female", "merchant").some((o) => o.id.startsWith("eq.hat.f."))).toBe(true);
    expect(findOffer("female", "merchant", "eq.hat.m.0.1.1.kim")).toBeUndefined();
  });

  it("never pays more for an item than it sells it for", () => {
    for (const o of merchantOffers("male", "merchant")) expect(sellPrice(o.item)).toBeLessThan(o.price);
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
    const offers = merchantOffers("male", "smith"); // the blacksmith's gear is the full range of the first town; the merchant only has the first bậc
    for (const o of [...offers, ...merchantOffers("male", "merchant"), ...merchantOffers("male", "alchemist")]) {
      expect(SHOP_CATEGORIES).toContain(o.category);
      expect(o.category).toBe(shopCategoryOf(o.item));
    }
    // Two bậc of each element, for each of the two realms the town sells (Luyện Khí and Trúc Cơ).
    const hats = offers.filter((o) => o.id.startsWith("eq.hat.") && !["loi", "bang", "phong"].includes(o.element ?? ""));
    expect(hats.map((o) => o.element).sort()).toEqual(["hoa", "hoa", "hoa", "hoa", "kim", "kim", "kim", "kim", "moc", "moc", "moc", "moc", "tho", "tho", "tho", "tho", "thuy", "thuy", "thuy", "thuy"]);
    const merchantHats = merchantOffers("male", "merchant").filter((o) => o.id.startsWith("eq.hat."));
    expect(merchantHats.length).toBe(hats.length / 2); // one bậc of the two
    expect(merchantHats.every((o) => !["loi", "bang", "phong"].includes(o.element ?? ""))).toBe(true);
    expect(offers.find((o) => o.id === "eq.weapon.u.0.1.1.kim.kiem")?.category).toBe("gear");
    expect(offers.find((o) => o.id === "eq.charm.u.0.1.1.hoa")?.category).toBe("artifact");
    expect(shopElementOf("eq.charm.u.0.1.1.hoa")).toBe("hoa");
  });

  it("sells the basic books, the element books by element, and no breakthrough pill", () => {
    const books = merchantOffers("female", "merchant").filter((o) => o.category === "book");
    expect(books.map((o) => o.item)).toEqual(expect.arrayContaining(["bt_cuong_than", "bt_ngu_kiem_tram", "bt_kim_3", "bt_tho_3"]));
    expect(books.find((o) => o.item === "bt_kim_3")?.element).toBe("kim");
    expect(books.find((o) => o.item === "bt_cuong_than")?.element).toBeNull();
    expect(books.every((o) => o.dailyLimit === undefined)).toBe(true);
    expect(merchantOffers("male", "merchant").some((o) => o.item.startsWith("bt_pill"))).toBe(false);
  });

  it("the merchant of a town sells that town's talisman only", () => {
    expect(merchantOffers("male", "merchant").some((o) => o.item === "ttp_town" && o.category === "pill" && o.price === 2000)).toBe(true);
    expect(merchantOffers("male", "nobody").some((o) => o.item.startsWith("ttp_"))).toBe(false);
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

describe("the second town's merchant", () => {
  it("sells the pills, books and gear of Kim Đan and Nguyên Anh, and the talisman of its own town only", async () => {
    const { merchantOffers } = await import("./merchants");
    const { equipmentInfo } = await import("./equipment-data");
    const offers = merchantOffers("male", "merchant2");
    const gear = offers.map((o) => equipmentInfo(o.item)).filter((e) => e !== undefined);
    expect(gear.length).toBeGreaterThan(50);
    expect(new Set(gear.map((e) => e!.realm))).toEqual(new Set([2, 3]));
    expect(offers.some((o) => o.item === "dai_hoi_huyet_dan")).toBe(true);
    expect(offers.some((o) => o.item === "linh_nguyen_dan")).toBe(false); // brewed by the alchemist now
    expect(offers.some((o) => o.item === "bt_hoa_4")).toBe(true);
    expect(offers.some((o) => o.item === "bt_kim_5")).toBe(true);
    expect(offers.some((o) => o.item === "ttp_town2")).toBe(true);
    expect(offers.some((o) => o.item === "ttp_town")).toBe(false);
    // The first town sells the gear of Luyện Khí and Trúc Cơ.
    const first = merchantOffers("male", "merchant").map((o) => equipmentInfo(o.item)).filter((e) => e !== undefined);
    expect(new Set(first.map((e) => e!.realm))).toEqual(new Set([0, 1]));
    expect(merchantOffers("male", "merchant").some((o) => o.item === "linh_nguyen_dan")).toBe(false);
  });

  it("every offer is a real item with a price", async () => {
    const { merchantOffers } = await import("./merchants");
    const { getItemDef } = await import("./items");
    for (const o of merchantOffers("female", "merchant2")) {
      expect(getItemDef(o.item), o.item).toBeDefined();
      expect(o.price, o.item).toBeGreaterThan(0);
    }
  });
});

describe("merchants as data", () => {
  it("the default merchants are valid and the two towns sell different things", () => {
    for (const m of Object.values(DEFAULT_MERCHANTS)) expect(validMerchant(m), m.id).toBe(true);
    expect(merchantOffers("male", "merchant").some((o) => o.item === "ttp_town2")).toBe(false);
    expect(merchantOffers("male", "merchant2").some((o) => o.item === "ttp_town")).toBe(false);
  });

  it("a second merchant in a town can sell its own things, and an unknown one sells nothing", () => {
    const base = DEFAULT_MERCHANTS.merchant!;
    const herbalist = { ...base, id: "herbalist", stock: [{ id: "linh_thao", kind: "item" as const, item: "linh_thao", price: 5 }], buys: ["material" as const] };
    expect(validMerchant(herbalist)).toBe(true);
    setMerchants({ ...DEFAULT_MERCHANTS, herbalist });
    try {
      expect(merchantOffers("male", "herbalist").map((o) => o.id)).toEqual(["linh_thao"]);
      expect(merchantOffers("male", "herbalist")[0]!.price).toBe(5);
      expect(merchantOffers("male", "nobody")).toEqual([]);
      // It buys only materials.
      expect(merchantPays("herbalist", "linh_thao")).toBeGreaterThan(0);
      expect(merchantPays("herbalist", "hoi_huyet_dan")).toBe(0);
      expect(merchantPays("merchant", "hoi_huyet_dan")).toBeGreaterThan(0);
    } finally {
      setMerchants(DEFAULT_MERCHANTS);
    }
  });

  it("a merchant's own sell rate sets what it pays, and rules that point at nothing are invalid", () => {
    const base = DEFAULT_MERCHANTS.merchant!;
    setMerchants({ ...DEFAULT_MERCHANTS, rich: { ...base, id: "rich", sellRate: 0.5 } });
    try {
      expect(merchantPays("rich", "yeu_dan")).toBe(20);
      expect(merchantPays("merchant", "yeu_dan")).toBe(sellPrice("yeu_dan"));
    } finally {
      setMerchants(DEFAULT_MERCHANTS);
    }
    expect(validMerchant({ ...base, stock: [{ id: "x", kind: "item", item: "not.an.item" }] })).toBe(false);
    expect(validMerchant({ ...base, stock: [{ id: "x", kind: "item", item: "bt_pill_1" }] })).toBe(false); // no value and no price
    expect(validMerchant({ ...base, stock: [base.stock[0], base.stock[0]] })).toBe(false); // the same rule id twice
    expect(validMerchant({ ...base, buys: ["nope"] })).toBe(false);
  });

  it("a merchant that buys nothing, or sells only some kinds, can be told from the offers", () => {
    const offers = merchantOffers("male", "merchant");
    expect(new Set(offers.map((o) => o.category))).toEqual(new Set(["pill", "gear", "artifact", "book", "material"]));
  });

  it("sells basic gear of the variant elements at 1.5 times the value", () => {
    const offers = merchantOffers("male", "smith"); // the blacksmith sells them; the merchant does not
    const mutant = offers.filter((o) => o.element === "loi" || o.element === "bang" || o.element === "phong");
    expect(mutant.length).toBeGreaterThan(0);
    const hat = offers.find((o) => o.id === "eq.hat.m.0.1.1.loi")!;
    expect(hat.price).toBe(Math.round(itemValue(hat.item) * 1.5));
    expect(offers.some((o) => o.id === "eq.hat.m.2.1.1.loi")).toBe(false); // the first town stops at Trúc Cơ
    expect(merchantOffers("male", "smith2").some((o) => o.id === "eq.hat.m.2.1.1.loi")).toBe(true);
    expect(merchantOffers("male", "merchant").some((o) => o.id === "eq.hat.m.0.1.1.loi")).toBe(false);
  });

  it("an edit of the item values reaches the prices on offer at once (no stale cache to buy low and sell high)", () => {
    const before = merchantOffers("male", "merchant").find((o) => o.item === "hoi_huyet_dan")!.price;
    setTuning({ itemValue: { ...DEFAULT_TUNING.itemValue, items: { ...DEFAULT_TUNING.itemValue.items, hoi_huyet_dan: before * 7 } } });
    try {
      expect(merchantOffers("male", "merchant").find((o) => o.item === "hoi_huyet_dan")!.price).toBe(before * 7);
      expect(merchantPays("merchant", "hoi_huyet_dan")).toBeLessThan(before * 7);
    } finally {
      resetTuning();
    }
    expect(merchantOffers("male", "merchant").find((o) => o.item === "hoi_huyet_dan")!.price).toBe(before);
  });
});

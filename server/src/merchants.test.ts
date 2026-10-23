import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_MERCHANTS, merchantOffers, setMerchants } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getMerchants, resetMerchantsCache } from "./merchants";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
  resetMerchantsCache();
  setMerchants(DEFAULT_MERCHANTS);
});

describe("the merchant tables", () => {
  it("are seeded from the defaults", async () => {
    const got = await getMerchants(db);
    expect(got).toEqual(DEFAULT_MERCHANTS);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM shop_merchants").get() as { n: number }).n).toBe(Object.keys(DEFAULT_MERCHANTS).length);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM shop_stock WHERE npc_id = 'merchant'").get() as { n: number }).n).toBe(DEFAULT_MERCHANTS.merchant!.stock.length);
  });

  it("take an edited stock and a new merchant when the version changes, and drop broken rows", async () => {
    await getMerchants(db);
    raw.prepare("UPDATE shop_stock SET def = ? WHERE npc_id = 'merchant' AND rule_id = 'hoi_huyet_dan'").run(JSON.stringify({ id: "hoi_huyet_dan", kind: "item", item: "hoi_huyet_dan", price: 77 }));
    raw.prepare("UPDATE shop_stock SET def = 'not json' WHERE npc_id = 'merchant' AND rule_id = 'ngo_dao_dan'").run();
    raw.exec("INSERT INTO shop_merchants (npc_id, map_id, name_vi, sell_rate, buys) VALUES ('herbalist', 'town', 'Dược sư', 0.2, '[\"material\"]')");
    raw.exec(`INSERT INTO shop_stock (npc_id, rule_id, sort, def) VALUES ('herbalist', 'linh_thao', 0, '{"id":"linh_thao","kind":"item","item":"linh_thao","price":4}')`);
    // Not picked up inside the cache window, picked up once the version moves.
    expect(Object.keys(await getMerchants(db))).toEqual(["merchant", "merchant2"]);
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'shop'");
    const later = await getMerchants(db, Date.now() + 60_000);
    expect(later.herbalist).toMatchObject({ mapId: "town", sellRate: 0.2, buys: ["material"] });
    expect(merchantOffers("male", "herbalist").map((o) => [o.id, o.price])).toEqual([["linh_thao", 4]]);
    expect(merchantOffers("male", "merchant").find((o) => o.id === "hoi_huyet_dan")!.price).toBe(77);
    expect(merchantOffers("male", "merchant").some((o) => o.id === "ngo_dao_dan")).toBe(false);
  });

  it("seed a merchant added to the code later and leave existing rows (edited or with deleted rules) alone", async () => {
    await getMerchants(db);
    raw.exec("DELETE FROM shop_stock WHERE npc_id = 'merchant' AND rule_id = 'hoi_huyet_dan'");
    raw.exec("UPDATE shop_merchants SET sell_rate = 0.3 WHERE npc_id = 'merchant'");
    raw.exec("DELETE FROM shop_merchants WHERE npc_id = 'merchant2'"); // as if it were new
    raw.exec("DELETE FROM shop_stock WHERE npc_id = 'merchant2'");
    resetMerchantsCache();
    const got = await getMerchants(db);
    expect(got.merchant2).toEqual(DEFAULT_MERCHANTS.merchant2); // seeded again, with its stock
    expect(got.merchant!.sellRate).toBe(0.3);
    expect(got.merchant!.stock.some((r) => r.id === "hoi_huyet_dan")).toBe(false); // the deleted rule did not come back
    // A disabled merchant stays disabled (not re-seeded) and is simply absent.
    raw.exec("UPDATE shop_merchants SET enabled = 0 WHERE npc_id = 'merchant2'");
    resetMerchantsCache();
    expect(Object.keys(await getMerchants(db))).toEqual(["merchant"]);
  });

  it("fall back to the default of a merchant whose row is invalid", async () => {
    await getMerchants(db);
    raw.exec("UPDATE shop_merchants SET sell_rate = 5 WHERE npc_id = 'merchant2'");
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'shop'");
    const later = await getMerchants(db, Date.now() + 60_000);
    expect(later.merchant2).toEqual(DEFAULT_MERCHANTS.merchant2);
  });
});

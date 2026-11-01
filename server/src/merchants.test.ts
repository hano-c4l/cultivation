import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_MERCHANTS, merchantOffers, setMerchants, validStockRule } from "@game/shared";
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
    expect(Object.keys(await getMerchants(db)).sort()).toEqual(Object.keys(DEFAULT_MERCHANTS).sort());
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
    expect(Object.keys(await getMerchants(db)).sort()).toEqual(Object.keys(DEFAULT_MERCHANTS).filter((k) => k !== "merchant2").sort());
  });

  it("fall back to the default of a merchant whose row is invalid", async () => {
    await getMerchants(db);
    raw.exec("UPDATE shop_merchants SET sell_rate = 5 WHERE npc_id = 'merchant2'");
    raw.exec("UPDATE config_versions SET version = version + 1 WHERE name = 'shop'");
    const later = await getMerchants(db, Date.now() + 60_000);
    expect(later.merchant2).toEqual(DEFAULT_MERCHANTS.merchant2);
  });
});

describe("the blacksmiths sell the bản mệnh and the flight pháp bảo", () => {
  it("each smith carries its artifact rule and offers both kinds", async () => {
    const got = await getMerchants(db);
    setMerchants(got);
    for (const [npc, rule, realm] of [["smith", "artifact_low", 0], ["smith2", "artifact_high", 2], ["smith3", "artifact_top", 4]] as const) {
      expect(got[npc]!.stock.some((r) => r.id === rule), npc).toBe(true);
      const ids = merchantOffers("male", npc).map((o) => o.id);
      expect(ids, npc).toContain(`eq.bonded.u.${realm}.1.1.kim`);
      expect(ids, npc).toContain(`eq.flight.u.${realm}.2.1.thuy`);
      expect(ids.some((id) => id.startsWith("eq.charm.")), npc).toBe(true); // the ordinary charms stay where they were
    }
  });

  it("a rule with a kind that is not a pháp bảo is refused", () => {
    expect(validStockRule({ id: "x", kind: "gear", realms: [0], tiers: [1], grade: 1, kinds: ["bonded", "flight"] })).toBe(true);
    expect(validStockRule({ id: "x", kind: "gear", realms: [0], tiers: [1], grade: 1, kinds: ["weapon"] })).toBe(false);
    expect(validStockRule({ id: "x", kind: "gear", realms: [0], tiers: [1], grade: 1, kinds: [] })).toBe(false);
  });

  it("the rules the migration writes into stored shops are valid and are the code's own", () => {
    const sql = readFileSync(new URL("../migrations/0061_tiennguc_market_trade.sql", import.meta.url), "utf8");
    const written = [...sql.matchAll(/json\('(\{"id":"artifact_[a-z]+".*?\})'\)/g)].map((m) => JSON.parse(m[1]!));
    expect(written).toHaveLength(3);
    for (const rule of written) {
      expect(validStockRule(rule)).toBe(true);
      const owner = Object.values(DEFAULT_MERCHANTS).find((m) => m.stock.some((r) => r.id === rule.id));
      expect(owner?.stock.find((r) => r.id === rule.id)).toEqual(rule);
    }
  });
});

import { describe, expect, it } from "vitest";
import { CURRENCY_GROUPS, currencyGroupLabel, currencyGroupOf, isCurrencyGroup, reasonKind } from "./economy";

describe("currency groups", () => {
  it("maps every reason the server writes today to the group it was meant for", () => {
    const expected: Record<string, string> = {
      monster_drop: "farm",
      "shop_buy:ren_giu_cap:1": "shop",
      shop_sell: "shop",
      quest: "quest",
      smith_upgrade: "enhance",
      smith_refine: "enhance",
      repair: "enhance",
      breakthrough: "enhance",
      path_choose: "enhance",
      path_swap: "enhance",
      path_drop: "enhance",
      path: "enhance",
      waygate: "travel",
      "admin_grant:gift": "admin",
      admin_grant: "admin",
      admin_gift: "admin",
      "admin_adjust:audit": "admin",
      bag_tab: "other",
      mail_claim: "other",
    };
    for (const [reason, group] of Object.entries(expected)) expect(currencyGroupOf(reason), reason).toBe(group);
  });

  it("puts anything unknown in 'other', and keeps trade reasons for later in 'trade'", () => {
    expect(currencyGroupOf("something_new")).toBe("other");
    expect(currencyGroupOf("")).toBe("other");
    expect(currencyGroupOf(":x")).toBe("other");
    expect(currencyGroupOf("trade:a")).toBe("trade");
    // the market (5a) and the sects (5c) have groups of their own, so the dashboard can tell their taxes and fees from the rest
    for (const r of ["market", "market:sale", "market_fee", "market_buy:x", "market_promote", "auction_bid:x", "auction"]) expect(currencyGroupOf(r), r).toBe("market");
    for (const r of ["sect:create", "sect:donate", "sect:weekly", "sect:task", "sect:shelf", "sect:disband"]) expect(currencyGroupOf(r), r).toBe("sect");
  });

  it("matches by the kind before the first colon only, not by a prefix of a plain word", () => {
    expect(reasonKind("shop_buy:a:b")).toBe("shop_buy");
    expect(currencyGroupOf("shop")).toBe("other");
    expect(currencyGroupOf("questing")).toBe("other");
  });

  it("every group has a label and a unique code, and the mapping only returns known groups", () => {
    expect(new Set(CURRENCY_GROUPS.map((g) => g.id)).size).toBe(CURRENCY_GROUPS.length);
    for (const g of CURRENCY_GROUPS) {
      expect(g.labelVi.length).toBeGreaterThan(0);
      expect(isCurrencyGroup(g.id)).toBe(true);
      expect(currencyGroupLabel(g.id)).toBe(g.labelVi);
    }
    expect(isCurrencyGroup("monster_drop")).toBe(false);
    expect(currencyGroupLabel("unknown")).toBe("unknown");
  });
});

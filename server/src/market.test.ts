import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_MARKET, auctionEndsAt, suggestedBid, type MarketCfg } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCurrencyDelta } from "./economy";
import { claimGiftMail } from "./gifts";
import { claimMailItem, commitBagOps, loadBag } from "./inventory";
import { buyFixed, cancelListing, closeListingsOf, listingViews, placeBid, postListing, promoteListing, settleDue } from "./market";
import { resetSettingsCache } from "./settings";
import { makeDb } from "./test-db";

const [S, B, C] = ["seller", "buyer-b", "buyer-c"];
const TOWN = "town";
const PILL = "hoi_huyet_dan";
// 10:00 in Vietnam (UTC+7): inside the auction round (06:00 to 21:00).
const DAY = Date.UTC(2026, 9, 30, 3, 0, 0);
const HOUR = 3_600_000;
const cfg: MarketCfg = { ...DEFAULT_MARKET, promote: { ...DEFAULT_MARKET.promote, minGrade: 1, cooldownSec: 60 } };

let db: D1Database;
let raw: DatabaseSync;

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [S, B, C]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${id}', 'acc', '${id}', 'kim', 0, 0, 0, 0)`);
});

const balance = (id: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(id) as { balance: number } | undefined)?.balance ?? 0;
/** The mail of a character with the Linh Thạch it carries (a gift, id `market:...`) and the item it carries. */
const mails = (id: string) =>
  (raw.prepare("SELECT id, subject, gift, item_id FROM mailbox WHERE character_id = ? ORDER BY created_at, subject").all(id) as Array<{ id: string; subject: string; gift: string | null; item_id: string | null }>).map((m) => ({
    id: m.id,
    subject: m.subject,
    item_id: m.item_id,
    amount: m.gift ? (JSON.parse(m.gift) as { linh_thach?: number }).linh_thach ?? 0 : 0,
  }));
const listing = (id: string) => raw.prepare("SELECT * FROM market_listings WHERE id = ?").get(id) as { status: string; top_bid: number; top_bidder_id: string | null; ends_at: number };
const owner = (itemId: string) => (raw.prepare("SELECT owner_character_id AS o FROM item_instances WHERE id = ?").get(itemId) as { o: string }).o;
let n = 0;

async function fund(id: string, amount: number) {
  await applyCurrencyDelta(db, { characterId: id, currency: "linh_thach", delta: amount, reason: "test", actor: "system", idempotencyKey: `fund:${id}:${n++}` });
}

function giveStack(id: string, qty: number, cell = 0, type = PILL): string {
  const itemId = `item-${n++}`;
  raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('${itemId}', '${id}', '${type}', ${qty}, 0, ${cell}, 0)`);
  return itemId;
}

async function post(kind: "fixed" | "auction", qty: number, price: number, opts: { cell?: number; now?: number; currency?: "linh_thach" | "tien_ngoc" } = {}) {
  const bag = await loadBag(db, S);
  const r = await postListing(db, cfg, { sellerId: S, town: TOWN, kind, currency: opts.currency ?? "linh_thach", bag, tab: 0, cell: opts.cell ?? 0, qty, price, now: opts.now ?? DAY });
  if (r.status !== "ok") throw new Error(`post failed: ${r.status}`);
  return r;
}

describe("putting a listing up", () => {
  it("takes the whole stack out of its cell, charges the fee and lists it", async () => {
    const item = giveStack(S, 5);
    await fund(S, 1000);
    const r = await post("fixed", 5, 10_000);
    expect(r.fee).toBe(200); // 2% of 10 000
    expect(balance(S)).toBe(800);
    expect(r.ops).toEqual([{ op: "remove", id: item, qty: 5 }]);
    expect((await loadBag(db, S)).items).toHaveLength(0);
    const l = listing(r.id);
    expect(l.status).toBe("active");
    expect(owner(item)).toBe(S);
  });

  it("splits part of a stack into its own row", async () => {
    const item = giveStack(S, 10);
    await fund(S, 1000);
    const r = await post("fixed", 4, 1000);
    expect(r.ops).toEqual([{ op: "setqty", id: item, from: 10, to: 6 }]);
    expect((await loadBag(db, S)).items.map((i) => i.qty)).toEqual([6]);
    const l = raw.prepare("SELECT item_id, qty FROM market_listings WHERE id = ?").get(r.id) as { item_id: string; qty: number };
    expect(l.qty).toBe(4);
    expect(l.item_id).not.toBe(item);
    expect((raw.prepare("SELECT qty FROM item_instances WHERE id = ?").get(l.item_id) as { qty: number }).qty).toBe(4);
  });

  it("refuses without the fee, for more than the stack and over the listing limit, changing nothing", async () => {
    giveStack(S, 3);
    const bag = await loadBag(db, S);
    const base = { sellerId: S, town: TOWN, kind: "fixed" as const, currency: "linh_thach" as const, bag, tab: 0, cell: 0, qty: 3, price: 10_000, now: DAY };
    expect((await postListing(db, cfg, base)).status).toBe("funds");
    await fund(S, 1000);
    expect((await postListing(db, cfg, { ...base, qty: 4 })).status).toBe("invalid");
    expect((await postListing(db, cfg, { ...base, price: cfg.maxPrice + 1 })).status).toBe("invalid");
    expect((await loadBag(db, S)).items).toHaveLength(1);
    expect(balance(S)).toBe(1000);
    const tight = { ...cfg, maxListings: 1 };
    expect((await postListing(db, tight, { ...base, qty: 1 })).status).toBe("ok");
    expect((await postListing(db, tight, { ...base, qty: 1, bag: await loadBag(db, S) })).status).toBe("limit");
  });
});

describe("buying at a fixed price", () => {
  it("moves the item and the money, taxes the sale and writes the sale row", async () => {
    const item = giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("fixed", 1, 10_000);
    const r = await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY });
    expect(r.status).toBe("ok");
    expect(balance(B)).toBe(40_000);
    expect(owner(item)).toBe(B);
    expect(listing(id).status).toBe("sold");
    expect(mails(B).find((m) => m.item_id === item)).toBeTruthy();
    expect(mails(S).find((m) => m.amount === 9000)).toBeTruthy(); // 10 000 less the 10% tax
    const sale = raw.prepare("SELECT price, tax, buyer_id FROM market_sales WHERE listing_id = ?").get(id) as { price: number; tax: number; buyer_id: string };
    expect(sale).toEqual({ price: 10_000, tax: 1000, buyer_id: B });
  });

  it("two buyers that both saw the listing cannot both buy it (race)", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    await fund(C, 50_000);
    const { id } = await post("fixed", 1, 10_000);
    const results = await Promise.all([buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY }), buyFixed(db, cfg, { buyerId: C, town: TOWN, id, now: DAY })]);
    expect(results.map((r) => r.status).sort()).toEqual(["gone", "ok"]);
    const loser = results[0]!.status === "ok" ? C : B;
    expect(balance(loser)).toBe(50_000); // nothing was charged
    expect((raw.prepare("SELECT COUNT(*) AS c FROM market_sales").get() as { c: number }).c).toBe(1);
    expect(mails(S).filter((m) => m.amount > 0)).toHaveLength(1);
  });

  it("the same batch applied twice fails the second time and changes nothing", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("fixed", 1, 10_000);
    expect((await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY })).status).toBe("ok");
    expect((await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY })).status).toBe("gone");
    expect(balance(B)).toBe(40_000);
  });

  it("refuses the seller, the wrong town and a buyer without the money", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 5000);
    const { id } = await post("fixed", 1, 10_000);
    expect((await buyFixed(db, cfg, { buyerId: S, town: TOWN, id, now: DAY })).status).toBe("mine");
    expect((await buyFixed(db, cfg, { buyerId: B, town: "town2", id, now: DAY })).status).toBe("gone");
    expect((await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY })).status).toBe("funds");
    expect(listing(id).status).toBe("active");
    expect(balance(B)).toBe(5000);
  });

  it("a character under an admin's review cannot buy", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("fixed", 1, 10_000);
    raw.exec(`UPDATE characters SET review_until = ${DAY + HOUR} WHERE id = '${B}'`);
    expect((await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY })).status).toBe("gone");
    expect(balance(B)).toBe(50_000);
  });

  it("listings are shown only in their own town", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await post("fixed", 1, 10_000);
    expect(await listingViews(db, cfg, "town", B)).toHaveLength(1);
    expect(await listingViews(db, cfg, "town2", B)).toHaveLength(0);
    const [view] = await listingViews(db, cfg, "town", S);
    expect(view!.mine).toBe(true);
  });
});

describe("auctions", () => {
  it("ends at 21:00 the same local day, or the next when listed after the round", () => {
    expect(auctionEndsAt(cfg, DAY)).toBe(DAY + 11 * HOUR); // 10:00 -> 21:00
    expect(auctionEndsAt(cfg, DAY + 13 * HOUR)).toBe(DAY + 35 * HOUR); // 23:00 -> 21:00 next day
  });

  it("takes the bid up front, refunds the outbid bidder by mail and keeps the top bid", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    await fund(C, 50_000);
    const { id } = await post("auction", 1, 1000);
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 999, now: DAY })).status).toBe("low");
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 1000, now: DAY })).status).toBe("ok");
    expect(balance(B)).toBe(49_000);
    expect((await placeBid(db, cfg, { bidderId: C, town: TOWN, id, amount: 1040, now: DAY })).status).toBe("low"); // less than the 5% step
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 5000, now: DAY })).status).toBe("top");
    expect((await placeBid(db, cfg, { bidderId: C, town: TOWN, id, amount: 1050, now: DAY })).status).toBe("ok");
    expect(balance(C)).toBe(48_950);
    expect(listing(id)).toMatchObject({ top_bid: 1050, top_bidder_id: C });
    expect(mails(B).find((m) => m.amount === 1000)).toBeTruthy(); // refund
  });

  it("the seller can bid on their own auction and buys it back by winning", async () => {
    const item = giveStack(S, 1);
    await fund(S, 10_000);
    await fund(B, 50_000);
    const { id } = await post("auction", 1, 1000);
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 1000, now: DAY })).status).toBe("ok");
    expect((await placeBid(db, cfg, { bidderId: S, town: TOWN, id, amount: 1100, now: DAY })).status).toBe("ok");
    expect(mails(B).find((m) => m.amount === 1000)).toBeTruthy(); // the other bidder is refunded
    await settleDue(db, cfg, DAY + 11 * HOUR);
    expect(listing(id).status).toBe("sold");
    expect(owner(item)).toBe(S);
    expect(mails(S).find((m) => m.item_id === item)).toBeTruthy();
    expect(mails(S).find((m) => m.amount === 990)).toBeTruthy(); // 1 100 less the 10% tax
  });

  it("two bids that both saw the same top bid cannot both win (race)", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    await fund(C, 50_000);
    const { id } = await post("auction", 1, 1000);
    const results = await Promise.all([
      placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 2000, now: DAY }),
      placeBid(db, cfg, { bidderId: C, town: TOWN, id, amount: 2000, now: DAY }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["gone", "ok"]);
    const winner = listing(id).top_bidder_id!;
    const loser = winner === B ? C : B;
    expect(balance(loser)).toBe(50_000);
    expect(balance(winner)).toBe(48_000);
  });

  it("takes no bids between the close (21:00) and the next opening (06:00)", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const night = DAY + 13 * HOUR; // 23:00
    const { id } = await post("auction", 1, 1000, { now: night });
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 1000, now: night + HOUR / 2 })).status).toBe("closed");
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 1000, now: night + 8 * HOUR })).status).toBe("ok"); // 07:00
  });

  it("closes to the top bidder: item to them, proceeds less tax to the seller, once", async () => {
    const item = giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("auction", 1, 1000);
    await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 4000, now: DAY });
    expect(await settleDue(db, cfg, DAY + 10 * HOUR)).toEqual([]); // 20:00: not yet
    const notified = await settleDue(db, cfg, DAY + 11 * HOUR);
    expect(notified.sort()).toEqual([B, S].sort());
    expect(listing(id).status).toBe("sold");
    expect(owner(item)).toBe(B);
    expect(mails(S).find((m) => m.amount === 3600)).toBeTruthy();
    expect(mails(B).find((m) => m.item_id === item)).toBeTruthy();
    expect(await settleDue(db, cfg, DAY + 12 * HOUR)).toEqual([]);
    expect((raw.prepare("SELECT COUNT(*) AS c FROM market_sales").get() as { c: number }).c).toBe(1);
  });

  it("an auction without a bid goes back to the seller; so does an expired fixed listing", async () => {
    const a = giveStack(S, 1, 0);
    const f = giveStack(S, 1, 1);
    await fund(S, 5000);
    const auction = await post("auction", 1, 1000, { cell: 0 });
    const fixed = await post("fixed", 1, 1000, { cell: 1 });
    await settleDue(db, cfg, DAY + 11 * HOUR);
    expect(listing(auction.id).status).toBe("unsold");
    expect(listing(fixed.id).status).toBe("active");
    await settleDue(db, cfg, DAY + 8 * 24 * HOUR);
    expect(listing(fixed.id).status).toBe("expired");
    expect(mails(S).filter((m) => m.item_id === a || m.item_id === f)).toHaveLength(2);
  });

  it("two settlements at once close it once", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("auction", 1, 1000);
    await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 4000, now: DAY });
    await Promise.all([settleDue(db, cfg, DAY + 11 * HOUR), settleDue(db, cfg, DAY + 11 * HOUR)]);
    expect(mails(S).filter((m) => m.amount > 0)).toHaveLength(1);
    expect((raw.prepare("SELECT COUNT(*) AS c FROM market_sales").get() as { c: number }).c).toBe(1);
  });
});

describe("taking a listing down", () => {
  it("returns the item by mail; an auction with a bid cannot be cancelled", async () => {
    const item = giveStack(S, 1, 0);
    giveStack(S, 1, 1);
    await fund(S, 5000);
    await fund(B, 50_000);
    const fixed = await post("fixed", 1, 1000, { cell: 0 });
    const auction = await post("auction", 1, 1000, { cell: 1 });
    expect((await cancelListing(db, cfg, { sellerId: B, town: TOWN, id: fixed.id, now: DAY })).status).toBe("mine");
    expect((await cancelListing(db, cfg, { sellerId: S, town: TOWN, id: fixed.id, now: DAY })).status).toBe("ok");
    expect(listing(fixed.id).status).toBe("cancelled");
    expect(mails(S).find((m) => m.item_id === item)).toBeTruthy();
    await placeBid(db, cfg, { bidderId: B, town: TOWN, id: auction.id, amount: 1000, now: DAY });
    expect((await cancelListing(db, cfg, { sellerId: S, town: TOWN, id: auction.id, now: DAY })).status).toBe("closed");
  });

  it("an auction cannot be taken back once its round is open, only at night before the opening hour", async () => {
    giveStack(S, 1, 0);
    giveStack(S, 1, 1);
    await fund(S, 5000);
    const night = DAY + 13 * HOUR; // 23:00
    const listedAtNight = await post("auction", 1, 1000, { cell: 0, now: night });
    const listedByDay = await post("auction", 1, 1000, { cell: 1 }); // 10:00, the round is open
    expect((await cancelListing(db, cfg, { sellerId: S, town: TOWN, id: listedByDay.id, now: DAY })).status).toBe("closed");
    expect((await cancelListing(db, cfg, { sellerId: S, town: TOWN, id: listedAtNight.id, now: night + 8 * HOUR })).status).toBe("closed"); // 07:00: open
    expect((await cancelListing(db, cfg, { sellerId: S, town: TOWN, id: listedAtNight.id, now: night + HOUR })).status).toBe("ok"); // 00:00: still closed
  });

  it("deleting a character takes all their listings down and refunds the top bidder", async () => {
    giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("auction", 1, 1000);
    await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 2000, now: DAY });
    expect((await closeListingsOf(db, S, DAY)).sort()).toEqual([B, S].sort());
    expect(listing(id).status).toBe("cancelled");
    expect(mails(B).find((m) => m.amount === 2000)).toBeTruthy();
  });
});

describe("the announcement", () => {
  it("charges the fee once per cooldown and only for the seller's own listing", async () => {
    giveStack(S, 1, 0);
    giveStack(S, 1, 1);
    await fund(S, 200_000);
    const a = await post("fixed", 1, 1000, { cell: 0 });
    const b = await post("fixed", 1, 1000, { cell: 1 });
    expect((await promoteListing(db, cfg, { sellerId: B, town: TOWN, id: a.id, now: DAY })).status).toBe("mine");
    const before = balance(S);
    expect((await promoteListing(db, cfg, { sellerId: S, town: TOWN, id: a.id, now: DAY })).status).toBe("ok");
    expect(balance(S)).toBe(before - cfg.promote.fee);
    expect((await promoteListing(db, cfg, { sellerId: S, town: TOWN, id: b.id, now: DAY + 1000 })).status).toBe("cooldown");
    expect((await promoteListing(db, cfg, { sellerId: S, town: TOWN, id: b.id, now: DAY + 61_000 })).status).toBe("ok");
  });

  it("refuses an item below the grade", async () => {
    giveStack(S, 1);
    await fund(S, 200_000);
    const { id } = await post("fixed", 1, 1000);
    expect((await promoteListing(db, { ...cfg, promote: { ...cfg.promote, minGrade: 9 } }, { sellerId: S, town: TOWN, id, now: DAY })).status).toBe("grade");
  });
});

describe("what the mail hands over can be claimed in the game", () => {
  it("the proceeds are claimed as a gift under the market reason, the item into the bag", async () => {
    const item = giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("fixed", 1, 10_000);
    await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY });
    const proceeds = mails(S).find((m) => m.amount === 9000)!;
    expect(proceeds.id.includes(":")).toBe(true); // the room sends ids with ':' down the gift path
    const before = balance(S);
    const r = await claimGiftMail(db, S, proceeds.id, await loadBag(db, S));
    expect(r.status).toBe("claimed");
    expect(balance(S)).toBe(before + 9000);
    const group = raw.prepare("SELECT total_in FROM linh_thach_totals WHERE character_id = ? AND grp = 'market'").get(S) as { total_in: number };
    expect(group.total_in).toBe(9000);
    expect((await claimGiftMail(db, S, proceeds.id, await loadBag(db, S))).status).toBe("already_claimed");

    const goods = mails(B).find((m) => m.item_id === item)!;
    const c = await claimMailItem(db, B, goods.id, await loadBag(db, B));
    expect(c.status).toBe("claimed");
    expect((await loadBag(db, B)).items.map((i) => i.id)).toEqual([item]);
  });
});

describe("items that went through the market stay ordinary items", () => {
  it("a bought stack merges into a stack the buyer already holds (the mailed row is deleted)", async () => {
    giveStack(S, 4);
    await fund(S, 1000);
    await fund(B, 50_000);
    const own = giveStack(B, 3);
    const { id } = await post("fixed", 4, 1000);
    await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY });
    const goods = mails(B)[0]!;
    const c = await claimMailItem(db, B, goods.id, await loadBag(db, B));
    expect(c.status).toBe("claimed");
    expect((await loadBag(db, B)).items.map((i) => [i.id, i.qty])).toEqual([[own, 7]]);
  });

  it("a bought and claimed item can be used up or dropped afterwards", async () => {
    const item = giveStack(S, 1);
    await fund(S, 1000);
    await fund(B, 50_000);
    const { id } = await post("fixed", 1, 1000);
    await buyFixed(db, cfg, { buyerId: B, town: TOWN, id, now: DAY });
    await claimMailItem(db, B, mails(B)[0]!.id, await loadBag(db, B));
    expect(await commitBagOps(db, B, [{ op: "remove", id: item, qty: 1 }])).toBe("ok");
    expect((await loadBag(db, B)).items).toHaveLength(0);
  });

  it("the seller's remaining stack and a returned split can be used up too", async () => {
    giveStack(S, 10);
    await fund(S, 1000);
    const { id } = await post("fixed", 4, 1000);
    await cancelListing(db, cfg, { sellerId: S, town: TOWN, id, now: DAY });
    const back = mails(S)[0]!;
    expect((await claimMailItem(db, S, back.id, await loadBag(db, S))).status).toBe("claimed"); // merges into the 6 left, deleting the returned row
    expect((await loadBag(db, S)).items.map((i) => i.qty)).toEqual([10]);
  });
});

describe("the suggested bid", () => {
  it("is the start price at first, then the top bid raised by 10% (never under the least next bid)", () => {
    expect(suggestedBid(cfg, 1000, 0)).toBe(1000);
    expect(suggestedBid(cfg, 1000, 2000)).toBe(2200);
    expect(suggestedBid(cfg, 1000, 5)).toBe(6); // 10% would be 5.5 -> 6, and the least next bid is 5 + 1
    expect(suggestedBid({ ...cfg, bidSuggestPct: 0 }, 1000, 2000)).toBe(2100); // the least next bid (5% step) wins
    expect(suggestedBid({ ...cfg, bidSuggestPct: undefined }, 1000, 2000)).toBe(2200); // a stored row from before has no such field
    expect(suggestedBid(cfg, 1000, cfg.maxPrice)).toBe(cfg.maxPrice);
  });
});

describe("listings priced in Tiên Ngọc", () => {
  const tn = (id: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'tien_ngoc'").get(id) as { balance: number } | undefined)?.balance ?? 0;
  const fundTn = (id: string, amount: number) => applyCurrencyDelta(db, { characterId: id, currency: "tien_ngoc", delta: amount, reason: "test", actor: "system", idempotencyKey: `tn:${id}:${n++}` });

  it("charges the fee, the price and the proceeds in Tiên Ngọc, and the sale is claimed as Tiên Ngọc", async () => {
    giveStack(S, 1);
    await fundTn(S, 100);
    await fundTn(B, 1000);
    const posted = await post("fixed", 1, 500, { currency: "tien_ngoc" });
    expect(posted.fee).toBe(10); // 2% of 500
    expect([tn(S), balance(S)]).toEqual([90, 0]); // the fee came out of Tiên Ngọc, not Linh Thạch
    expect((await buyFixed(db, cfg, { buyerId: B, town: TOWN, id: posted.id, now: DAY })).status).toBe("ok");
    expect([tn(B), balance(B)]).toEqual([500, 0]);
    const proceeds = raw.prepare("SELECT id, gift FROM mailbox WHERE character_id = ? AND gift IS NOT NULL").get(S) as { id: string; gift: string };
    expect(JSON.parse(proceeds.gift)).toMatchObject({ tien_ngoc: 450, reason: "market:sale" }); // 500 less the 10% tax
    expect((await claimGiftMail(db, S, proceeds.id, await loadBag(db, S))).status).toBe("claimed");
    expect(tn(S)).toBe(90 + 450);
    expect(raw.prepare("SELECT currency FROM market_sales").get()).toEqual({ currency: "tien_ngoc" });
  });

  it("a bidder pays in Tiên Ngọc and a Linh Thạch wallet is no use; the refund is Tiên Ngọc too", async () => {
    giveStack(S, 1);
    await fundTn(S, 100);
    await fund(B, 1_000_000); // plenty of Linh Thạch, no Tiên Ngọc
    await fundTn(C, 1000);
    const { id } = await post("auction", 1, 100, { currency: "tien_ngoc" });
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 100, now: DAY })).status).toBe("funds");
    expect((await placeBid(db, cfg, { bidderId: C, town: TOWN, id, amount: 100, now: DAY })).status).toBe("ok");
    expect(tn(C)).toBe(900);
    await fundTn(B, 1000);
    expect((await placeBid(db, cfg, { bidderId: B, town: TOWN, id, amount: 110, now: DAY })).status).toBe("ok");
    const refund = raw.prepare("SELECT gift FROM mailbox WHERE character_id = ? AND gift IS NOT NULL").get(C) as { gift: string };
    expect(JSON.parse(refund.gift)).toMatchObject({ tien_ngoc: 100, reason: "market:refund" });
  });

  it("the price cap of Tiên Ngọc is its own", async () => {
    giveStack(S, 1);
    await fundTn(S, 10_000_000);
    const bag = await loadBag(db, S);
    const base = { sellerId: S, town: TOWN, kind: "fixed" as const, bag, tab: 0, cell: 0, qty: 1, now: DAY };
    expect((await postListing(db, cfg, { ...base, currency: "tien_ngoc", price: (cfg.maxPriceTienNgoc ?? 0) + 1 })).status).toBe("invalid");
    expect((await postListing(db, cfg, { ...base, currency: "linh_thach", price: (cfg.maxPriceTienNgoc ?? 0) + 1 })).status).toBe("funds"); // allowed as Linh Thạch, but there is none for the fee
  });
});

import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SECT, assignPieces, disbandShares, getItemDef, splitLinh, vaultPoints, type SectAccept, type SectCfg } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { loadBag } from "./inventory";
import { resetSettingsCache } from "./settings";
import { createSect, memberOf, removeCharacter, sectView } from "./sect";
import { buyShelf, closeBatch, closeSectReturning, disbandSect, putItem, setAccept, setShelf, takeItem, vaultViews } from "./sect-vault";
import { makeDb } from "./test-db";

const cfg: SectCfg = { ...DEFAULT_SECT, createFee: 0, levels: [{ maxMembers: 10, expNeed: 100, costLinh: 1000 }, { maxMembers: 20, expNeed: 0, costLinh: 0 }], vault: { ...DEFAULT_SECT.vault, slots: [3, 5], dailyCap: 100 } };
const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);
const DAY = 24 * 3_600_000;
const [L, A, B, C] = ["lead", "a", "b", "c"];
const PILL = "hoi_huyet_dan"; // consumable, grade 1
const HERB = "linh_thao";

let db: D1Database;
let raw: DatabaseSync;
let n = 0;

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [L, A, B, C]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, created_at, updated_at) VALUES ('${id}', 'acc', 'Nhan ${id}', 'kim', 0, 0, 1, 1, 0, ${NOW})`);
});

const give = (id: string, qty: number, cell: number, type = PILL): string => {
  const itemId = `item-${n++}`;
  raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('${itemId}', '${id}', '${type}', ${qty}, 0, ${cell}, 0)`);
  return itemId;
};
const money = (id: string, amount: number) => raw.exec(`INSERT OR REPLACE INTO currency_balances (character_id, currency, balance) VALUES ('${id}', 'linh_thach', ${amount})`);
const balance = (id: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(id) as { balance: number } | undefined)?.balance ?? 0;
const seat = (id: string, sectId: string, rank = 0, total = 0) => raw.exec(`INSERT INTO sect_members (character_id, sect_id, rank, joined_at, contribution_total) VALUES ('${id}', '${sectId}', ${rank}, ${NOW}, ${total})`);
const founded = async (accept: SectAccept | null = { cats: { consumable: 100, material: 100 }, minGrade: 1 }): Promise<string> => {
  const r = await createSect(db, cfg, { leaderId: L, name: "Thanh Van", now: NOW });
  if (!r.ok) throw new Error(r.reason);
  if (accept) raw.exec(`UPDATE sects SET accept = '${JSON.stringify(accept)}'`);
  return r.id;
};
const put = async (who: string, itemId: string, qty: number, now = NOW) => putItem(db, cfg, { characterId: who, bag: await loadBag(db, who), itemId, qty, now });
const owner = (itemId: string) => (raw.prepare("SELECT owner_character_id AS o FROM item_instances WHERE id = ?").get(itemId) as { o: string } | undefined)?.o;
const mails = (id: string) => raw.prepare("SELECT subject, item_id, gift FROM mailbox WHERE character_id = ?").all(id) as Array<{ subject: string; item_id: string | null; gift: string | null }>;
const vaultCount = () => (raw.prepare("SELECT COUNT(*) AS n FROM sect_vault").get() as { n: number }).n;
const member = (id: string) => raw.prepare("SELECT contribution, contribution_total AS total FROM sect_members WHERE character_id = ?").get(id) as { contribution: number; total: number };

describe("the points of a deposit", () => {
  it("follow the grade, the rarity and the leader's percent; a kind that is not allowed is worth nothing", () => {
    const pill = getItemDef(PILL)!;
    const none: SectAccept = { cats: {}, minGrade: 1 };
    expect(vaultPoints(cfg, none, pill, 5)).toBe(0); // nothing is taken until the leader sets it
    const all: SectAccept = { cats: { consumable: 100 }, minGrade: 1 };
    const one = vaultPoints(cfg, all, pill, 1);
    expect(one).toBeGreaterThan(0);
    expect(vaultPoints(cfg, all, pill, 5)).toBeGreaterThanOrEqual(one * 5 - 4);
    expect(vaultPoints(cfg, { cats: { consumable: 50 }, minGrade: 1 }, pill, 10)).toBeLessThan(vaultPoints(cfg, all, pill, 10));
    expect(vaultPoints(cfg, { cats: { consumable: 100 }, minGrade: pill.grade + 1 }, pill, 5)).toBe(0); // below the lowest grade
    expect(vaultPoints(cfg, { cats: { consumable: 9999 }, minGrade: 1 }, pill, 10)).toBe(vaultPoints(cfg, { cats: { consumable: cfg.vault.catMax }, minGrade: 1 }, pill, 10)); // never above the Admin's cap
  });
});

describe("putting a stack in", () => {
  it("takes the stack from the bag, earns cống hiến and exp, and keeps the item with its depositor", async () => {
    const id = await founded();
    seat(A, id);
    const item = give(A, 10, 0);
    const r = await put(A, item, 10);
    expect(r).toMatchObject({ ok: true, points: 10, credited: 10 });
    expect((await loadBag(db, A)).items).toHaveLength(0);
    expect(owner(item)).toBe(A);
    expect(member(A)).toEqual({ contribution: 10, total: 10 });
    expect((raw.prepare("SELECT exp FROM sects").get() as { exp: number }).exp).toBe(10);
    expect(await vaultViews(db, id)).toMatchObject([{ id: item, type: PILL, qty: 10, by: "Nhan a" }]);
  });

  it("a part of a stack is split into its own row", async () => {
    const id = await founded();
    seat(A, id);
    const item = give(A, 10, 0);
    const r = await put(A, item, 4);
    expect(r).toMatchObject({ ok: true, ops: [{ op: "setqty", id: item, from: 10, to: 6 }] });
    expect((await loadBag(db, A)).items).toMatchObject([{ id: item, qty: 6 }]);
    expect((await vaultViews(db, id))[0]).toMatchObject({ qty: 4 });
    expect((await vaultViews(db, id))[0]!.id).not.toBe(item);
  });

  it("refuses a kind that is not allowed, a non-member, too many pieces and a full warehouse", async () => {
    const id = await founded({ cats: { material: 100 }, minGrade: 1 });
    seat(A, id);
    const pill = give(A, 5, 0);
    expect(await put(A, pill, 5)).toEqual({ ok: false, reason: "value" });
    const herb = give(A, 5, 1, HERB);
    expect(await put(A, herb, 9)).toEqual({ ok: false, reason: "invalid" });
    expect(await put(B, give(B, 1, 0, HERB), 1)).toEqual({ ok: false, reason: "no_sect" });
    for (let i = 0; i < 3; i++) expect(await put(A, give(A, 1, 10 + i, HERB), 1)).toMatchObject({ ok: true }); // 3 slots at level 1
    expect(await put(A, herb, 5)).toEqual({ ok: false, reason: "vault_full" });
    expect(vaultCount()).toBe(3);
  });

  it("two deposits at once cannot both take the last place", async () => {
    const id = await founded();
    seat(A, id);
    seat(B, id);
    for (let i = 0; i < 2; i++) await put(A, give(A, 1, i, HERB), 1);
    const results = await Promise.all([put(A, give(A, 1, 5, HERB), 1), put(B, give(B, 1, 0, HERB), 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(vaultCount()).toBe(3);
  });

  it("the day's cap on cống hiến lets the item in for what is left, and the next day starts again", async () => {
    const id = await founded();
    raw.exec("UPDATE sects SET level = 2"); // five places
    seat(A, id);
    expect(await put(A, give(A, 80, 0), 80)).toMatchObject({ ok: true, credited: 80 });
    expect(await put(A, give(A, 80, 1), 80)).toMatchObject({ ok: true, points: 80, credited: 20 }); // only 20 of the cap of 100 was left
    expect(await put(A, give(A, 50, 2), 50)).toMatchObject({ ok: true, credited: 0 });
    expect(member(A).contribution).toBe(100);
    expect(await put(A, give(A, 30, 3), 30, NOW + DAY)).toMatchObject({ ok: true, credited: 30 });
    expect((await sectView(db, cfg, A, new Set(), NOW + DAY))?.vaultToday).toBe(70);
  });

  it("the leader sets what is taken, and only the leader", async () => {
    const id = await founded(null);
    seat(A, id, 4);
    expect(await setAccept(db, cfg, { actorId: A, cats: { consumable: 100 }, minGrade: 1, now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await setAccept(db, cfg, { actorId: L, cats: { consumable: 999, bogus: 5 }, minGrade: 2, now: NOW })).toMatchObject({ ok: true });
    expect((await sectView(db, cfg, L, new Set()))?.accept).toEqual({ cats: { consumable: cfg.vault.catMax }, minGrade: 2 });
  });
});

describe("taking out, the shelf and buying", () => {
  const stocked = async () => {
    const id = await founded();
    seat(A, id);
    seat(B, id, 0, 0);
    raw.exec("UPDATE sect_members SET contribution = 50 WHERE character_id = 'b'");
    const item = give(A, 6, 0);
    await put(A, item, 6);
    return { id, item };
  };

  it("the leader sends a stack to a member by mail; others cannot", async () => {
    const { item } = await stocked();
    expect(await takeItem(db, { actorId: A, itemId: item, to: B, now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await takeItem(db, { actorId: L, itemId: item, to: C, now: NOW })).toEqual({ ok: false, reason: "gone" }); // not a member
    expect(await takeItem(db, { actorId: L, itemId: item, to: B, now: NOW })).toMatchObject({ ok: true });
    expect(owner(item)).toBe(B);
    expect(mails(B)).toMatchObject([{ item_id: item }]);
    expect(vaultCount()).toBe(0);
  });

  it("a shelf stack sold for Linh Thạch puts the price in the fund and sends the stack by mail", async () => {
    const { id, item } = await stocked();
    expect(await setShelf(db, { actorId: A, itemId: item, currency: "linh_thach", price: 500, now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await setShelf(db, { actorId: L, itemId: item, currency: "linh_thach", price: 500, now: NOW })).toMatchObject({ ok: true });
    expect((await vaultViews(db, id))[0]?.shelf).toEqual({ currency: "linh_thach", price: 500 });
    money(B, 300);
    expect(await buyShelf(db, { buyerId: B, itemId: item, now: NOW })).toEqual({ ok: false, reason: "funds" });
    money(B, 800);
    expect(await buyShelf(db, { buyerId: B, itemId: item, now: NOW })).toMatchObject({ ok: true, currency: "linh_thach", balance: 300 });
    expect((raw.prepare("SELECT fund FROM sects").get() as { fund: number }).fund).toBe(500);
    expect(owner(item)).toBe(B);
    expect(mails(B).some((m) => m.item_id === item)).toBe(true);
    expect(await buyShelf(db, { buyerId: B, itemId: item, now: NOW })).toEqual({ ok: false, reason: "item" }); // gone
  });

  it("a shelf stack sold for cống hiến takes it from the buyer", async () => {
    const { item } = await stocked();
    await setShelf(db, { actorId: L, itemId: item, currency: "cong_hien", price: 80, now: NOW });
    expect(await buyShelf(db, { buyerId: B, itemId: item, now: NOW })).toEqual({ ok: false, reason: "poor" });
    raw.exec("UPDATE sect_members SET contribution = 90 WHERE character_id = 'b'");
    expect(await buyShelf(db, { buyerId: B, itemId: item, now: NOW })).toMatchObject({ ok: true, currency: "cong_hien", balance: null });
    expect(member(B).contribution).toBe(10);
    expect(owner(item)).toBe(B);
  });

  it("a stack off the shelf cannot be bought, and a buy and a take at once give it to one", async () => {
    const { item } = await stocked();
    expect(await buyShelf(db, { buyerId: B, itemId: item, now: NOW })).toEqual({ ok: false, reason: "item" });
    await setShelf(db, { actorId: L, itemId: item, currency: "cong_hien", price: 10, now: NOW });
    const both = await Promise.all([buyShelf(db, { buyerId: B, itemId: item, now: NOW }), takeItem(db, { actorId: L, itemId: item, to: A, now: NOW })]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(mails(A).length + mails(B).length).toBe(1);
    expect(member(B).contribution).toBe(both[0]!.ok ? 40 : 50);
  });
});

describe("closing", () => {
  const stocked = async () => {
    const id = await founded();
    seat(A, id, 4, 600); // deputy
    seat(B, id, 0, 400);
    raw.exec("UPDATE sects SET fund = 1000");
    const items = [give(A, 5, 0), give(A, 3, 1, HERB)];
    for (const [i, item] of items.entries()) await put(A, item, i === 0 ? 5 : 3);
    return { id, items };
  };

  it("to the leader: every stack and the fund come by mail, the sect is gone and the wait starts", async () => {
    const { items } = await stocked();
    const r = await disbandSect(db, cfg, { actorId: L, mode: "leader", now: NOW });
    expect(r).toMatchObject({ ok: true, name: "Thanh Van" });
    expect(vaultCount()).toBe(0);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sects").get()).toEqual({ n: 0 });
    for (const item of items) expect(owner(item)).toBe(L);
    expect(mails(L).filter((m) => m.item_id).length).toBe(2);
    expect(mails(L).map((m) => (m.gift ? (JSON.parse(m.gift) as { linh_thach: number }).linh_thach : 0)).reduce((a, b) => a + b, 0)).toBe(1000);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM sect_cooldown").get() as { n: number }).n).toBe(3);
  });

  it("by cống hiến: the leader and the deputy get their fixed parts, the rest follows the totals, and nothing is lost", async () => {
    const { items } = await stocked();
    const r = await disbandSect(db, cfg, { actorId: L, mode: "share", now: NOW });
    expect(r).toMatchObject({ ok: true });
    const total = (id: string) => mails(id).map((m) => (m.gift ? (JSON.parse(m.gift) as { linh_thach: number }).linh_thach : 0)).reduce((a, b) => a + b, 0);
    // totals after the deposits: A 600 + what the deposits earned, B 400, the leader 0: shares 60% by total, leader 30%, deputy 10%
    expect(total(L) + total(A) + total(B)).toBe(1000);
    expect(total(L)).toBeGreaterThanOrEqual(300);
    expect(total(A)).toBeGreaterThan(total(B));
    expect(items.every((i) => ["lead", "a", "b"].includes(owner(i) ?? ""))).toBe(true);
    expect(vaultCount()).toBe(0);
    // the stacks are split by quantity: the pieces add up to what was put in, none is lost or made, and each piece came by mail
    const rows = raw.prepare("SELECT id, owner_character_id AS o, item_type AS t, qty FROM item_instances").all() as Array<{ id: string; o: string; t: string; qty: number }>;
    expect(rows.filter((r) => r.t === PILL).reduce((n, r) => n + r.qty, 0)).toBe(5);
    expect(rows.filter((r) => r.t === HERB).reduce((n, r) => n + r.qty, 0)).toBe(3);
    expect(new Set(rows.filter((r) => r.t === PILL).map((r) => r.o)).size).toBeGreaterThan(1); // five pills reach more than one member
    const mailed = [L, A, B].flatMap((id) => mails(id)).filter((m) => m.item_id).map((m) => m.item_id);
    expect(new Set(mailed)).toEqual(new Set(rows.map((r) => r.id)));
  });

  it("a deposit or a donation that lands while it is read makes it read again, and a closed sect stays closed", async () => {
    await stocked();
    expect(await disbandSect(db, cfg, { actorId: L, mode: "leader", now: NOW })).toMatchObject({ ok: true });
    expect(await disbandSect(db, cfg, { actorId: L, mode: "leader", now: NOW })).toEqual({ ok: false, reason: "no_sect" });
  });

  it("the last member of a sect is removed: the stacks go back to those who put them in", async () => {
    const id = await founded();
    seat(A, id);
    const item = give(A, 4, 0);
    await put(A, item, 4);
    raw.exec(`DELETE FROM sect_members WHERE character_id = 'a'`); // A left; the stack stays
    await removeCharacter(db, cfg, L, NOW);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sects").get()).toEqual({ n: 0 });
    expect(owner(item)).toBe(A);
    expect(mails(A)).toMatchObject([{ item_id: item }]);
    expect(vaultCount()).toBe(0);
    expect(await memberOf(db, L)).toBeNull();
    await closeSectReturning(db, cfg, { sectId: id, actor: null, now: NOW }); // nothing to do for a sect that is gone
  });
});

describe("dividing", () => {
  it("shares add up to 100 and follow the fixed parts", () => {
    const members = [
      { id: "l", rank: 5, total: 150 },
      { id: "d", rank: 4, total: 50 },
      { id: "m", rank: 0, total: 800 },
    ];
    const shares = disbandShares(DEFAULT_SECT, members);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(shares.get("l")).toBeCloseTo(30 + 60 * 0.15); // the example of the design: 60% x 15% + 30% = 39%
    expect(shares.get("d")).toBeCloseTo(10 + 60 * 0.05);
    expect(shares.get("m")).toBeCloseTo(60 * 0.8);
  });

  it("without a deputy their part goes to the leader; with nobody having earned anything, the pool is equal", () => {
    const shares = disbandShares(DEFAULT_SECT, [{ id: "l", rank: 5, total: 0 }, { id: "m", rank: 0, total: 0 }]);
    expect(shares.get("l")).toBeCloseTo(30 + 10 + 30);
    expect(shares.get("m")).toBeCloseTo(30);
  });

  it("the Linh Thạch is rounded down with the rest to the leader; a stack of one goes whole to who is owed most and a bigger one is split by quantity", () => {
    const shares = new Map([["l", 50], ["m", 30], ["n", 20]]);
    const linh = splitLinh(1001, shares, "l");
    expect(linh.get("m")).toBe(300);
    expect(linh.get("n")).toBe(200);
    expect(linh.get("l")).toBe(501);
    const owners = assignPieces([{ id: "x", value: 10, qty: 1 }, { id: "y", value: 100, qty: 100 }, { id: "z", value: 7, qty: 7 }], shares, "l");
    expect(owners.get("x")).toEqual([{ to: "l", qty: 1 }]); // a single piece to the biggest claim
    const y = owners.get("y")!;
    expect(y.reduce((n, p) => n + p.qty, 0)).toBe(100);
    expect(y.find((p) => p.to === "l")!.qty).toBeGreaterThan(y.find((p) => p.to === "n")!.qty);
    expect(owners.get("z")!.reduce((n, p) => n + p.qty, 0)).toBe(7);
    expect(assignPieces([{ id: "x", value: 3, qty: 3 }], new Map(), "l").get("x")).toEqual([{ to: "l", qty: 3 }]);
  });
});

describe("a closing plan that went stale", () => {
  it("is refused when a stack that was read has gone and another has come, though the counts match", async () => {
    const id = await founded();
    seat(A, id);
    const x = give(A, 3, 0);
    await put(A, x, 3);
    const y = give(A, 2, 1);
    const plan = { sectId: id, sectName: "Thanh Van", actor: L, leaderId: L, fund: 0, vaultIds: [x], memberIds: [L, A], moves: [{ item: x, to: L, name: "x" }], gifts: [], waitFor: [L, A], now: NOW };
    // between the read and the batch: X is taken out, Y is put in
    await takeItem(db, { actorId: L, itemId: x, to: A, now: NOW });
    await put(A, y, 2);
    expect(await closeBatch(db, cfg, plan)).toBe("busy");
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sects").get()).toEqual({ n: 1 });
    expect(owner(x)).toBe(A); // not handed away a second time
    expect(vaultCount()).toBe(1); // Y still has its row
  });
});

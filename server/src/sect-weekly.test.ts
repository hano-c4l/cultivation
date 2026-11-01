import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SECT, SECT_ROLES, type SectCfg } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { resetSettingsCache } from "./settings";
import { claimWeekly, createSect, setWeekly, sectView, weekOf } from "./sect";
import { makeDb } from "./test-db";

const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);
const [L, A, B] = ["lead", "a", "b"];
const HERB = "linh_thao";
const SWORD = "thanh_kiem_lk"; // not stackable: must be refused (looked up below)

const cfg: SectCfg = { ...DEFAULT_SECT, createFee: 0 };

let db: D1Database;
let raw: DatabaseSync;
let n = 0;

const noItems = (): null[] => SECT_ROLES.map(() => null);
const itemsFor = (rank: number, item: { item: string; qty: number } | null) => noItems().map((x, i) => (i === rank ? item : x));
const amounts = (rank: number, v: number) => SECT_ROLES.map((_, i) => (i === rank ? v : 0));
/** A stack in the warehouse: the item row (no cell) and its sect_vault row. */
const stack = (sectId: string, type: string, qty: number, shelf = false): string => {
  const id = `v-${n++}`;
  raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, created_at) VALUES ('${id}', '${L}', '${type}', ${qty}, 0)`);
  raw.exec(`INSERT INTO sect_vault (item_id, sect_id, depositor_id, item_type, qty, points, created_at${shelf ? ", shelf_currency, shelf_price" : ""}) VALUES ('${id}', '${sectId}', '${L}', '${type}', ${qty}, 10, 0${shelf ? ", 'cong_hien', 5" : ""})`);
  return id;
};
const held = (type: string) => (raw.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM sect_vault WHERE item_type = ?").get(type) as { q: number }).q;
const mailsOf = (id: string) => raw.prepare("SELECT item_id FROM mailbox WHERE character_id = ? AND item_id IS NOT NULL").all(id) as Array<{ item_id: string }>;
const fund = () => (raw.prepare("SELECT fund FROM sects").get() as { fund: number }).fund;
const claimed = (id: string) => raw.prepare("SELECT COUNT(*) AS c FROM sect_weekly WHERE character_id = ?").get(id) as { c: number };

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [L, A, B]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, created_at, updated_at) VALUES ('${id}', 'acc', 'Nhan ${id}', 'kim', 0, 0, 1, 1, 0, ${NOW})`);
});

async function founded(): Promise<string> {
  const r = await createSect(db, cfg, { leaderId: L, name: "Thanh Van", now: NOW });
  if (!r.ok) throw new Error(r.reason);
  for (const id of [A, B]) raw.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES (?, ?, 0, ?)").run(id, r.id, NOW);
  raw.exec(`UPDATE sects SET fund = 100000 WHERE id = '${r.id}'`);
  return r.id;
}

describe("the weekly item", () => {
  it("pays an item only: a new row by mail, the warehouse loses it, the week is taken", async () => {
    const id = await founded();
    stack(id, HERB, 30);
    expect((await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: HERB, qty: 10 }), now: NOW })).ok).toBe(true);
    const r = await claimWeekly(db, cfg, { characterId: A, now: NOW });
    expect(r).toMatchObject({ ok: true, amount: 0, balance: null });
    expect(held(HERB)).toBe(20);
    const mail = mailsOf(A);
    expect(mail).toHaveLength(1);
    expect(raw.prepare("SELECT owner_character_id AS o, item_type AS t, qty, cell FROM item_instances WHERE id = ?").get(mail[0]!.item_id)).toEqual({ o: A, t: HERB, qty: 10, cell: null });
    expect(fund()).toBe(100000);
    expect(await claimWeekly(db, cfg, { characterId: A, now: NOW })).toMatchObject({ ok: false, reason: "claimed" });
  });

  it("pays Linh Thạch and the item together", async () => {
    const id = await founded();
    stack(id, HERB, 30);
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 500), items: itemsFor(0, { item: HERB, qty: 5 }), now: NOW });
    const r = await claimWeekly(db, cfg, { characterId: A, now: NOW });
    expect(r).toMatchObject({ ok: true, amount: 500 });
    expect(fund()).toBe(99500);
    expect(held(HERB)).toBe(25);
    expect(mailsOf(A)).toHaveLength(1);
  });

  it("a short warehouse says `lack` and the week is not used; filling it lets the member claim", async () => {
    const id = await founded();
    stack(id, HERB, 3);
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 500), items: itemsFor(0, { item: HERB, qty: 10 }), now: NOW });
    expect(await claimWeekly(db, cfg, { characterId: A, now: NOW })).toMatchObject({ ok: false, reason: "lack" });
    expect(claimed(A).c).toBe(0);
    expect(fund()).toBe(100000); // the Linh Thạch was not paid either
    stack(id, HERB, 10);
    expect((await claimWeekly(db, cfg, { characterId: A, now: NOW })).ok).toBe(true);
    expect(held(HERB)).toBe(3);
  });

  it("a stack on the shelf is not paid out", async () => {
    const id = await founded();
    stack(id, HERB, 30, true);
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: HERB, qty: 5 }), now: NOW });
    expect(await claimWeekly(db, cfg, { characterId: A, now: NOW })).toMatchObject({ ok: false, reason: "lack" });
  });

  it("two members claiming the last stack at once: one gets it, the other keeps the week", async () => {
    const id = await founded();
    stack(id, HERB, 10);
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: HERB, qty: 10 }), now: NOW });
    const [x, y] = await Promise.all([claimWeekly(db, cfg, { characterId: A, now: NOW }), claimWeekly(db, cfg, { characterId: B, now: NOW })]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(held(HERB)).toBe(0);
    expect(claimed(A).c + claimed(B).c).toBe(1);
  });

  it("uses several stacks, at most the batch allows, and stays under 50 statements", async () => {
    const id = await founded();
    for (let i = 0; i < 8; i++) stack(id, HERB, 1);
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(5, 100_000), items: itemsFor(5, { item: HERB, qty: 8 }), now: NOW });
    raw.exec(`UPDATE sects SET fund = 200000 WHERE id = '${id}'`);
    let largest = 0;
    const real = db.batch.bind(db);
    (db as unknown as { batch: typeof db.batch }).batch = (async (list: D1PreparedStatement[]) => {
      largest = Math.max(largest, list.length);
      return real(list);
    }) as typeof db.batch;
    const r = await claimWeekly(db, cfg, { characterId: L, now: NOW });
    expect(r.ok).toBe(true);
    expect(largest).toBeLessThanOrEqual(50);
    expect(held(HERB)).toBe(0);
    // nine stacks are more than one payment may touch
    for (let i = 0; i < 9; i++) stack(id, HERB, 1);
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: HERB, qty: 9 }), now: NOW });
    expect(await claimWeekly(db, cfg, { characterId: B, now: NOW })).toMatchObject({ ok: false, reason: "lack" });
  });

  it("refuses an item that is not a plain stackable one, or a count past the stack", async () => {
    await founded();
    expect(await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: "no_such_item", qty: 1 }), now: NOW })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: SWORD, qty: 1 }), now: NOW })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: HERB, qty: 100_000 }), now: NOW })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await setWeekly(db, cfg, { actorId: A, amounts: amounts(0, 0), items: itemsFor(0, { item: HERB, qty: 1 }), now: NOW })).toMatchObject({ ok: false, reason: "perm" });
  });

  it("setting only the Linh Thạch leaves the items as they were", async () => {
    const id = await founded();
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(0, 0), items: itemsFor(0, { item: HERB, qty: 2 }), now: NOW });
    await setWeekly(db, cfg, { actorId: L, amounts: amounts(1, 100), now: NOW });
    const view = await sectView(db, cfg, L, new Set(), NOW);
    expect(view?.weeklyItems[0]).toEqual({ item: HERB, qty: 2 });
    expect(view?.weekly[1]).toBe(100);
    expect(id).toBeTruthy();
    expect(weekOf(NOW)).toBeGreaterThan(0);
  });
});

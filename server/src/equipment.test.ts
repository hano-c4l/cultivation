import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { applyBag, equipmentInfo, planAdd, planDeathWear, planEquip, planRemove, planRepair, planUnequip, type BagContents, type BagOp, type WearerCtx } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { applyCurrencyDelta } from "./economy";
import { claimMailItem, commitBagOps, deleteExpiredMail, listMail, loadBag, opStatements, type BagState } from "./inventory";
import { makeDb } from "./test-db";

const A = "char-a";
let db: D1Database;
let raw: DatabaseSync;
let n = 0;
const newId = () => `eq-${++n}`;
const NOW = 1_000_000;

const wearer: WearerCtx = { gender: "male", realm: 0, stage: 5, base: { canCot: 20, thanPhap: 5, ngoTinh: 5, linhLuc: 20, thanThuc: 20, phucDuyen: 5 } };
const SWORD = "eq.weapon.u.0.1.1";
const SWORD2 = "eq.weapon.u.0.2.1";
const RING = "eq.ring.u.0.1.1";

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-a', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('char-a', 'acc-a', 'A', 'kim', 0, 0, 0, 0)");
});

const st = (bag: BagState): BagContents => ({ items: bag.items, equipped: bag.equipped });

/** Adds a piece to the bag as the room would (loot plan), returns its id. */
async function give(type: string, dur = 100, max = 100): Promise<string> {
  const bag = await loadBag(db, A);
  const ops = planAdd(bag.items, bag.tabs, type, 1, newId, { dur, max })!;
  expect(await commitBagOps(db, A, ops)).toBe("ok");
  return (ops[0] as { id: string }).id;
}

/** Plans with the shared function against the real bag and commits; returns what the room's cache would hold. */
async function commit(ops: readonly BagOp[], opts: Parameters<typeof commitBagOps>[3] = {}) {
  const r = await commitBagOps(db, A, ops, opts);
  return r;
}

const row = (id: string) => raw.prepare("SELECT * FROM item_instances WHERE id = ?").get(id) as Record<string, unknown> | undefined;

describe("wearing and taking off", () => {
  it("a loot drop keeps its durability, and loading splits bag from worn pieces", async () => {
    const id = await give(SWORD, 100, 100);
    expect(row(id)).toMatchObject({ durability: 100, max_durability: 100, equip_slot: null });
    const bag = await loadBag(db, A);
    expect(bag.items).toEqual([{ id, type: SWORD, tab: 0, cell: 0, qty: 1, dur: 100, max: 100 }]);
    expect(bag.equipped).toEqual([]);
  });

  it("equip moves the row out of the bag into the slot, unequip brings it back to a free cell", async () => {
    const id = await give(SWORD);
    let bag = await loadBag(db, A);
    const eq = planEquip(st(bag), bag.tabs, { tab: 0, cell: 0 }, undefined, wearer);
    expect(eq.ok).toBe(true);
    expect(await commit(eq.ok ? eq.ops : [])).toBe("ok");
    expect(row(id)).toMatchObject({ equip_slot: "weapon", bag_tab: null, cell: null });
    bag = await loadBag(db, A);
    expect(bag.items).toEqual([]);
    expect(bag.equipped).toEqual([{ id, type: SWORD, slot: "weapon", dur: 100, max: 100 }]);

    const off = planUnequip(st(bag), bag.tabs, "weapon");
    expect(await commit(off.ok ? off.ops : [])).toBe("ok");
    expect(row(id)).toMatchObject({ equip_slot: null, bag_tab: 0, cell: 0 });
  });

  it("replacing swaps in one batch and keeps the unique slot", async () => {
    const a = await give(SWORD);
    const b = await give(SWORD2);
    let bag = await loadBag(db, A);
    const first = planEquip(st(bag), bag.tabs, { tab: 0, cell: 0 }, undefined, wearer);
    await commit(first.ok ? first.ops : []);
    bag = await loadBag(db, A);
    const second = planEquip(st(bag), bag.tabs, { tab: 0, cell: 1 }, undefined, wearer);
    expect(second.ok && second.ops[0]!.op).toBe("swapequip");
    expect(await commit(second.ok ? second.ops : [])).toBe("ok");
    expect(row(b)).toMatchObject({ equip_slot: "weapon", cell: null });
    expect(row(a)).toMatchObject({ equip_slot: null, bag_tab: 0, cell: 1 });
  });

  it("two pieces can never share a slot: a stale plan fails and changes nothing", async () => {
    const a = await give(SWORD);
    const b = await give(SWORD2);
    const bag = await loadBag(db, A);
    const planA = planEquip(st(bag), bag.tabs, { tab: 0, cell: 0 }, undefined, wearer);
    const planB = planEquip(st(bag), bag.tabs, { tab: 0, cell: 1 }, undefined, wearer); // planned before A was worn
    expect(await commit(planA.ok ? planA.ops : [])).toBe("ok");
    expect(await commit(planB.ok ? planB.ops : [])).toBe("stale");
    expect(row(a)).toMatchObject({ equip_slot: "weapon" });
    expect(row(b)).toMatchObject({ equip_slot: null, cell: 1 });
  });

  it("a plan made against a cache that no longer matches is refused (stale)", async () => {
    const id = await give(SWORD);
    const bag = await loadBag(db, A);
    const plan = planEquip(st(bag), bag.tabs, { tab: 0, cell: 0 }, undefined, wearer);
    raw.exec(`UPDATE item_instances SET cell = 5 WHERE id = '${id}'`);
    expect(await commit(plan.ok ? plan.ops : [])).toBe("stale");
    expect(row(id)).toMatchObject({ equip_slot: null, cell: 5 });
  });
});

describe("durability", () => {
  async function wear(type: string, dur = 100) {
    const id = await give(type, dur);
    const bag = await loadBag(db, A);
    const eq = planEquip(st(bag), bag.tabs, { tab: 0, cell: bag.items.find((i) => i.id === id)!.cell }, undefined, wearer);
    await commit(eq.ok ? eq.ops : []);
    return id;
  }

  it("death wears worn pieces by 5% in one guarded batch under a one-time key", async () => {
    const id = await wear(SWORD);
    const bag = await loadBag(db, A);
    const plan = planDeathWear(st(bag), bag.tabs, wearer, newId);
    expect(await commit(plan.ops, { grantKey: "death:1" })).toBe("ok");
    expect(row(id)).toMatchObject({ durability: 95 });
    // The same key again (a retry after a lost answer) changes nothing.
    expect(await commit(plan.ops, { grantKey: "death:1" })).toBe("duplicate");
    expect(row(id)).toMatchObject({ durability: 95 });
  });

  it("a piece that breaks goes to the bag, or into permanent mail when the bag is full, and stays in one place", async () => {
    const id = await wear(SWORD, 3);
    let bag = await loadBag(db, A);
    const plan = planDeathWear(st(bag), bag.tabs, wearer, newId);
    expect(await commit(plan.ops, { grantKey: "death:2" })).toBe("ok");
    expect(row(id)).toMatchObject({ durability: 0, equip_slot: null, bag_tab: 0, cell: 0 });

    // Fill the bag, wear another piece at 1 durability, then die: it must be mailed without an expiry.
    const other = await wear(RING, 1);
    for (let i = 0; i < 127; i++) {
      raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES (?, ?, 'linh_thao', 1, 0, ?, 0)").run(`fill-${i}`, A, i + 1);
    }
    bag = await loadBag(db, A);
    expect(bag.items.length).toBe(128);
    const p2 = planDeathWear(st(bag), bag.tabs, wearer, newId);
    expect(p2.ops.map((o) => o.op)).toEqual(["setdur", "mailequip"]);
    expect(await commit(p2.ops, { grantKey: "death:3" })).toBe("ok");
    expect(row(other)).toMatchObject({ durability: 0, equip_slot: null, bag_tab: null, cell: null });
    const mail = await listMail(db, A, NOW * 1000);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ expiresAt: null, item: { type: RING, qty: 1, dur: 0, max: 100 } });
    // The sweep leaves permanent mail (and its item) alone, however late it runs.
    await deleteExpiredMail(db, NOW * 1000 * 1000);
    expect(row(other)).toBeDefined();
  });

  it("gear that never wears out is untouched by death", async () => {
    const id = await give("eqs.van_co_gioi", 0, 0).catch(() => "");
    expect(id).toBe(""); // the starting durability of an unbreakable piece is NULL, not 0 (CHECK max_durability >= 1)
    const bag = await loadBag(db, A);
    const ops = planAdd(bag.items, bag.tabs, "eqs.van_co_gioi", 1, newId)!;
    expect(await commit(ops)).toBe("ok");
    const added = (ops[0] as { id: string }).id;
    expect(row(added)).toMatchObject({ durability: null, max_durability: null });
    const eq = planEquip(st(await loadBag(db, A)), 1, { tab: 0, cell: 0 }, undefined, wearer);
    await commit(eq.ok ? eq.ops : []);
    const after = await loadBag(db, A);
    expect(after.equipped[0]).toEqual({ id: added, type: "eqs.van_co_gioi", slot: "ring1" });
    expect(planDeathWear(st(after), after.tabs, wearer, newId).ops).toEqual([]);
  });

  it("repair debits Linh Thạch and restores durability in one batch; too little money changes nothing", async () => {
    const id = await wear("eq.weapon.u.0.1.4", 90); // grade 4: 8 per point, 10 points lost
    raw.exec("INSERT INTO currency_balances (character_id, currency, balance) VALUES ('char-a', 'linh_thach', 79)");
    raw.exec("INSERT INTO currency_ledger (character_id, currency, delta, reason, actor, idempotency_key, created_at) VALUES ('char-a', 'linh_thach', 79, 'seed', 'test', 'seed-1', 0)");
    const bag = await loadBag(db, A);
    const plan = planRepair(st(bag), "all");
    expect(plan.ok && plan.cost).toBe(80);
    const extra = plan.ok ? plan.ops.flatMap((op) => opStatements(db, A, op, NOW)) : [];
    const poor = await applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: -80, reason: "repair", actor: "system", idempotencyKey: "repair:1" }, extra);
    expect(poor.status).toBe("insufficient");
    expect(row(id)).toMatchObject({ durability: 90 });

    raw.exec("UPDATE currency_balances SET balance = 100 WHERE character_id = 'char-a'");
    const ok = await applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: -80, reason: "repair", actor: "system", idempotencyKey: "repair:2" }, extra);
    expect(ok).toEqual({ status: "applied", balance: 20 });
    expect(row(id)).toMatchObject({ durability: 100 });

    // The same repair planned against stale durability (already repaired) fails its guard and charges nothing.
    raw.exec("UPDATE currency_balances SET balance = 200 WHERE character_id = 'char-a'");
    await expect(applyCurrencyDelta(db, { characterId: A, currency: "linh_thach", delta: -80, reason: "repair", actor: "system", idempotencyKey: "repair:3" }, extra)).rejects.toThrow(/inv_guard/);
    expect((raw.prepare("SELECT balance FROM currency_balances WHERE character_id = 'char-a'").get() as { balance: number }).balance).toBe(200);
  });
});

describe("mail and discarding", () => {
  it("a bag-full drop mailed with durability keeps it, and claiming then discarding works with foreign keys on", async () => {
    const bag = await loadBag(db, A);
    expect(await commitBagOps(db, A, [], { mail: [{ type: SWORD, qty: 1, subject: "bag_full", dur: 70, max: 100 }], now: NOW })).toBe("ok");
    const mail = await listMail(db, A, NOW + 1);
    expect(mail[0]).toMatchObject({ item: { type: SWORD, dur: 70, max: 100 }, expiresAt: NOW + 30 * 60_000 });
    const claim = await claimMailItem(db, A, mail[0]!.id, bag, NOW + 2);
    expect(claim.status).toBe("claimed");
    const after = await loadBag(db, A);
    expect(after.items[0]).toMatchObject({ type: SWORD, dur: 70, max: 100 });
    // Discarding the claimed item must not trip over the mail row that used to point at it.
    const drop = planRemove(after.items, after.tabs, { tab: 0, cell: 0 })!;
    expect(await commitBagOps(db, A, drop)).toBe("ok");
    expect(raw.prepare("SELECT COUNT(*) AS n FROM item_instances").get()).toEqual({ n: 0 });
  });

  it("equipment taken off into mail is claimed back into the bag with its durability", async () => {
    const id = await give(RING, 40);
    const bag0 = await loadBag(db, A);
    const eq = planEquip(st(bag0), bag0.tabs, { tab: 0, cell: 0 }, undefined, wearer);
    await commit(eq.ok ? eq.ops : []);
    const op: BagOp = { op: "mailequip", id, slot: "ring1", mailId: "mail-1", subject: "equip_removed" };
    expect(await commit([op], { now: NOW })).toBe("ok");
    const bag = await loadBag(db, A);
    expect(bag.equipped).toEqual([]);
    const claim = await claimMailItem(db, A, "mail-1", bag, NOW + 1);
    expect(claim.status).toBe("claimed");
    const after = await loadBag(db, A);
    expect(after.items).toEqual([{ id, type: RING, tab: 0, cell: 0, qty: 1, dur: 40, max: 100 }]);
    expect(applyBag(st(bag), claim.status === "claimed" ? claim.ops : []).items[0]).toMatchObject({ id, dur: 40 });
  });
});

describe("migration 0010 (elements for old gear)", () => {
  it("gives six-part ids an element, weapons a family too, and leaves everything else alone", () => {
    const ins = (id: string, type: string) =>
      raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES (?, 'char-a', ?, 1, 0, ?, 0)").run(id, type, Number(id.slice(1)));
    ins("a0", "eq.weapon.u.0.1.1");
    ins("a1", "eq.robe.m.0.3.2");
    ins("a2", "eq.ring.u.1.4.3.moc"); // already has one
    ins("a3", "eqs.van_co_gioi");
    ins("a4", "linh_thao");
    raw.exec(readFileSync(new URL("../migrations/0010_gear_elements.sql", import.meta.url), "utf8"));
    const type = (id: string) => (raw.prepare("SELECT item_type FROM item_instances WHERE id = ?").get(id) as { item_type: string }).item_type;
    const w = equipmentInfo(type("a0"))!;
    expect(w.element).not.toBeNull();
    expect(w.weaponType).not.toBeNull();
    expect(type("a0").startsWith("eq.weapon.u.0.1.1.")).toBe(true);
    expect(equipmentInfo(type("a1"))).toMatchObject({ weaponType: null });
    expect(equipmentInfo(type("a1"))!.element).not.toBeNull();
    expect(type("a2")).toBe("eq.ring.u.1.4.3.moc");
    expect(type("a3")).toBe("eqs.van_co_gioi");
    expect(type("a4")).toBe("linh_thao");
  });
});

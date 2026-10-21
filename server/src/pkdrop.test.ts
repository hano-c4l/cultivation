import type { DatabaseSync } from "node:sqlite";
import { PK_DROP_CHANCE, applyBag, planAdd, planPkDrop, planPkLoss } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { commitBagOps, listMail, loadBag } from "./inventory";
import { makeDb } from "./test-db";

const A = "char-a"; // the victim
const B = "char-b"; // the killer
let db: D1Database;
let raw: DatabaseSync;
let n = 0;
const newId = () => `item-${++n}`;

beforeEach(() => {
  ({ db, raw } = makeDb());
  for (const [acc, ch, name] of [["acc-a", A, "A"], ["acc-b", B, "B"]] as const) {
    raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('${acc}', '${acc}@x.test', 'h', 's', 1, 0)`);
    raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${ch}', '${acc}', '${name}', 'kim', 0, 0, 0, 0)`);
  }
});

const rows = (owner: string) => raw.prepare("SELECT id, item_type, qty, bag_tab, cell, equip_slot FROM item_instances WHERE owner_character_id = ?").all(owner) as Array<{ id: string; item_type: string; qty: number; bag_tab: number | null; cell: number | null; equip_slot: string | null }>;

async function addStack(type: string, qty: number) {
  const bag = await loadBag(db, A);
  const ops = planAdd(bag.items, bag.tabs, type, qty, newId)!;
  expect(await commitBagOps(db, A, ops)).toBe("ok");
}

describe("planPkDrop", () => {
  const bag = { items: [{ id: "i1", type: "linh_thao", tab: 0, cell: 0, qty: 7 }, { id: "i2", type: "hoi_huyet_dan", tab: 0, cell: 1, qty: 3 }], equipped: [] };
  const ids = { newId: "n", mailId: "m" };

  it("white names never lose anything; the chance grows with the colour", () => {
    expect(planPkDrop(bag, 0, 0, 0, B, ids, "pk_drop")).toBeNull();
    expect(PK_DROP_CHANCE[1] < PK_DROP_CHANCE[2] && PK_DROP_CHANCE[2] < PK_DROP_CHANCE[3]).toBe(true);
    expect(planPkDrop(bag, 1, PK_DROP_CHANCE[1], 0, B, ids, "pk_drop")).toBeNull(); // the roll must be below the chance
    expect(planPkDrop(bag, 1, PK_DROP_CHANCE[1] - 0.001, 0, B, ids, "pk_drop")).not.toBeNull();
  });

  it("takes a whole stack, picked by the second number, and nothing from an empty bag", () => {
    expect(planPkDrop(bag, 3, 0, 0, B, ids, "pk_drop")).toMatchObject({ id: "i1", qty: 7, to: B });
    expect(planPkDrop(bag, 3, 0, 0.99, B, ids, "pk_drop")).toMatchObject({ id: "i2", qty: 3 });
    expect(planPkDrop({ items: [], equipped: [] }, 3, 0, 0, B, ids, "pk_drop")).toBeNull();
  });

  it("worn pieces can go too, with their wear", () => {
    const worn = { items: [], equipped: [{ id: "e1", type: "x", slot: "weapon" as const, dur: 30, max: 50 }] };
    expect(planPkDrop(worn, 2, 0, 0, B, ids, "pk_drop")).toMatchObject({ id: "e1", qty: 1, dur: 30, max: 50 });
  });
});

describe("the give op", () => {
  it("the victim loses the row and the killer gets one item with an unexpiring mail, in one batch", async () => {
    await addStack("linh_thao", 40);
    const bag = await loadBag(db, A);
    const op = planPkDrop(bag, 3, 0, 0, B, { newId: "new-1", mailId: "mail-1" }, "pk_drop")!;
    expect(await commitBagOps(db, A, [op], { grantKey: "pkdrop:1" })).toBe("ok");
    expect(rows(A)).toHaveLength(0);
    expect(rows(B)).toEqual([{ id: "new-1", item_type: "linh_thao", qty: 40, bag_tab: null, cell: null, equip_slot: null }]);
    const mail = await listMail(db, B);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ id: "mail-1", subject: "pk_drop" });
    expect((raw.prepare("SELECT expires_at FROM mailbox WHERE id = 'mail-1'").get() as { expires_at: number | null }).expires_at).toBeNull();
    // The room's cache after the op matches what is in D1.
    expect(applyBag({ items: bag.items, equipped: bag.equipped }, [op]).items).toEqual([]);
  });

  it("a repeated key gives nothing more", async () => {
    await addStack("linh_thao", 5);
    await addStack("hoi_huyet_dan", 5);
    const bag = await loadBag(db, A);
    const op = planPkDrop(bag, 3, 0, 0, B, { newId: "new-1", mailId: "mail-1" }, "pk_drop")!;
    expect(await commitBagOps(db, A, [op], { grantKey: "pkdrop:1" })).toBe("ok");
    const again = planPkDrop(await loadBag(db, A), 3, 0, 0, B, { newId: "new-2", mailId: "mail-2" }, "pk_drop")!;
    expect(await commitBagOps(db, A, [again], { grantKey: "pkdrop:1" })).toBe("duplicate");
    expect(rows(A)).toHaveLength(1);
    expect(rows(B)).toHaveLength(1);
  });

  it("a stale plan (the stack changed meanwhile) rolls everything back", async () => {
    await addStack("linh_thao", 10);
    const bag = await loadBag(db, A);
    const op = planPkDrop(bag, 3, 0, 0, B, { newId: "new-1", mailId: "mail-1" }, "pk_drop")!;
    raw.exec("UPDATE item_instances SET qty = 3 WHERE owner_character_id = 'char-a'");
    expect(await commitBagOps(db, A, [op], { grantKey: "pkdrop:2" })).toBe("stale");
    expect(rows(A)).toHaveLength(1);
    expect(rows(B)).toHaveLength(0);
    expect(await listMail(db, B)).toHaveLength(0);
  });
});

describe("a death with nobody to receive the item", () => {
  it("planPkLoss uses the same chance and choice, and the item is simply deleted (from the bag or from the slots)", async () => {
    const bag = { items: [{ id: "i1", type: "linh_thao", tab: 0, cell: 0, qty: 7 }], equipped: [{ id: "e1", type: "x", slot: "weapon" as const, dur: 5, max: 50 }] };
    expect(planPkLoss(bag, 0, 0, 0)).toBeNull();
    expect(planPkLoss(bag, 1, PK_DROP_CHANCE[1], 0)).toBeNull();
    const loss = planPkLoss(bag, 3, 0, 0.99)!;
    expect(loss).toMatchObject({ type: "x", qty: 1, op: { op: "remove", id: "e1", qty: 1 } });
    expect(applyBag(bag, [loss.op]).equipped).toEqual([]);

    await addStack("linh_thao", 9);
    const real = await loadBag(db, A);
    const plan = planPkLoss(real, 3, 0, 0)!;
    expect(await commitBagOps(db, A, [plan.op], { grantKey: "pkloss:1" })).toBe("ok");
    expect(rows(A)).toHaveLength(0);
    expect(rows(B)).toHaveLength(0); // nobody received anything
    expect(await listMail(db, B)).toHaveLength(0);
    expect(await commitBagOps(db, A, [plan.op], { grantKey: "pkloss:1" })).toBe("duplicate");
  });
});

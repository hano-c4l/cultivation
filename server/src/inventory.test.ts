import type { DatabaseSync } from "node:sqlite";
import { BAG_CELLS_PER_TAB, MAIL_ITEM_EXPIRY_MS, MAX_BAG_TABS, applyOps, planAdd, planMove, planRemove, planSort, planSplit, type BagItem, type BagOp } from "@game/shared";
import { ITEMS } from "@game/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimMailItem, commitBagOps, deleteExpiredMail, expandBag, listMail, loadBag, pruneGrants } from "./inventory";
import { makeDb } from "./test-db";

const A = "char-a";
const B = "char-b";
let db: D1Database;
let raw: DatabaseSync;
let n = 0;
const newId = () => `item-${++n}`;

/** These tests exercise the stack mechanics at a small, fixed limit (99): the real limit of these items is bigger and tuned, so the tests set it themselves. */
const SMALL_STACK = ["linh_thao", "thu_cot", "yeu_dan", "hoi_huyet_dan", "duong_huyet_dan", "dai_hoi_huyet_dan", "ngo_dao_dan"];
beforeAll(() => {
  for (const id of SMALL_STACK) if (ITEMS[id]) (ITEMS[id] as { maxStack: number }).maxStack = 99;
});

beforeEach(() => {
  ({ db, raw } = makeDb());
  for (const [acc, ch, name] of [["acc-a", A, "A"], ["acc-b", B, "B"]] as const) {
    raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('${acc}', '${acc}@x.test', 'h', 's', 1, 0)`);
    raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${ch}', '${acc}', '${name}', 'kim', 0, 0, 0, 0)`);
  }
});

const count = (table: string) => (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const totalQty = (type: string, owner = A) =>
  (raw.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = ? AND item_type = ?").get(owner, type) as { q: number }).q;

/** Plans and commits an add; returns the result and the cache the room would hold afterwards. */
async function give(owner: string, type: string, qty: number, key?: string) {
  const bag = await loadBag(db, owner);
  const ops = planAdd(bag.items, bag.tabs, type, qty, newId)!;
  const r = await commitBagOps(db, owner, ops, { grantKey: key });
  return { r, bag: applyOps(bag.items, ops) };
}

describe("loading and adding", () => {
  it("a new character has one empty tab", async () => {
    expect(await loadBag(db, A)).toEqual({ tabs: 1, items: [], equipped: [] });
  });

  it("an add is written and loaded back identical to the planned cache", async () => {
    const { r, bag } = await give(A, "linh_thao", 120, "loot:1");
    expect(r).toBe("ok");
    const loaded = await loadBag(db, A);
    expect(loaded.items.sort((x, y) => x.cell - y.cell)).toEqual(bag.sort((x, y) => x.cell - y.cell));
    expect(totalQty("linh_thao")).toBe(120);
  });

  it("the same loot key twice never creates the items twice", async () => {
    const bag = await loadBag(db, A);
    const ops = planAdd(bag.items, bag.tabs, "linh_thao", 5, newId)!;
    expect(await commitBagOps(db, A, ops, { grantKey: "loot:dup" })).toBe("ok");
    const again = planAdd(bag.items, bag.tabs, "linh_thao", 5, newId)!;
    expect(await commitBagOps(db, A, again, { grantKey: "loot:dup" })).toBe("duplicate");
    expect(totalQty("linh_thao")).toBe(5);
    expect(count("item_grants")).toBe(1);
  });

  it("stacks onto an existing row instead of adding a row", async () => {
    await give(A, "linh_thao", 10, "k1");
    await give(A, "linh_thao", 20, "k2");
    expect(count("item_instances")).toBe(1);
    expect(totalQty("linh_thao")).toBe(30);
  });
});

describe("a stale plan fails whole and leaves D1 untouched", () => {
  it("a changed quantity under the cache makes the write stale, and the loot key is not spent", async () => {
    await give(A, "linh_thao", 10, "k1");
    const cached = await loadBag(db, A);
    raw.exec("UPDATE item_instances SET qty = 4"); // something else changed the row after the cache was loaded
    const ops = planAdd(cached.items, cached.tabs, "linh_thao", 5, newId)!; // setqty from 10 to 15
    expect(await commitBagOps(db, A, ops, { grantKey: "loot:retry" })).toBe("stale");
    expect(totalQty("linh_thao")).toBe(4);
    expect(count("item_grants")).toBe(1); // only k1: the failed attempt rolled its key back too
    // Reload, plan again with the SAME key: now it goes through exactly once.
    const fresh = await loadBag(db, A);
    expect(await commitBagOps(db, A, planAdd(fresh.items, fresh.tabs, "linh_thao", 5, newId)!, { grantKey: "loot:retry" })).toBe("ok");
    expect(totalQty("linh_thao")).toBe(9);
  });

  it("two items planned into the same cell collide: nothing is written", async () => {
    const ops: BagOp[] = [
      { op: "add", id: "x1", type: "thu_cot", tab: 0, cell: 7, qty: 1 },
      { op: "add", id: "x2", type: "linh_thao", tab: 0, cell: 7, qty: 1 },
    ];
    expect(await commitBagOps(db, A, ops, { grantKey: "k" })).toBe("stale");
    expect(count("item_instances")).toBe(0);
    expect(count("item_grants")).toBe(0);
  });

  it("a plan that targets another character's item is refused", async () => {
    await give(B, "linh_thao", 10, "kb");
    const bItem = (await loadBag(db, B)).items[0]!;
    const ops: BagOp[] = [{ op: "remove", id: bItem.id, qty: bItem.qty }];
    expect(await commitBagOps(db, A, ops)).toBe("stale");
    expect(totalQty("linh_thao", B)).toBe(10);
  });

  it("removing an item that is already gone is stale, not silent", async () => {
    await give(A, "linh_thao", 3, "k1");
    const cached = await loadBag(db, A);
    raw.exec("DELETE FROM item_instances");
    const ops = planRemove(cached.items, cached.tabs, { tab: 0, cell: 0 })!;
    expect(await commitBagOps(db, A, ops)).toBe("stale");
  });
});

describe("moves keep every item", () => {
  async function bagWith(...specs: Array<[string, number, number]>) {
    for (const [type, qty, cell] of specs) {
      raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES (?, ?, ?, ?, 0, ?, 0)").run(newId(), A, type, qty, cell);
    }
    return loadBag(db, A);
  }

  it("a swap exchanges two cells through the unique index", async () => {
    const bag = await bagWith(["linh_thao", 1, 0], ["thu_cot", 2, 5]);
    const ops = planMove(bag.items, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 5 })!;
    expect(ops[0]!.op).toBe("swap");
    expect(await commitBagOps(db, A, ops)).toBe("ok");
    const after = await loadBag(db, A);
    expect(after.items.find((i) => i.type === "linh_thao")!.cell).toBe(5);
    expect(after.items.find((i) => i.type === "thu_cot")!.cell).toBe(0);
    expect(count("item_instances")).toBe(2);
  });

  it("a stale swap rolls back all three steps", async () => {
    const bag = await bagWith(["linh_thao", 1, 0], ["thu_cot", 2, 5]);
    const ops = planMove(bag.items, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 5 })!;
    raw.exec("UPDATE item_instances SET cell = 9 WHERE item_type = 'thu_cot'");
    expect(await commitBagOps(db, A, ops)).toBe("stale");
    const after = await loadBag(db, A);
    expect(after.items.find((i) => i.type === "linh_thao")!.cell).toBe(0); // not left parked in the NULL cell
    expect(after.items.find((i) => i.type === "thu_cot")!.cell).toBe(9);
  });

  it("merging stacks conserves the total quantity", async () => {
    const bag = await bagWith(["linh_thao", 60, 0], ["linh_thao", 50, 1]);
    const ops = planMove(bag.items, 1, { tab: 0, cell: 0 }, { tab: 0, cell: 1 })!;
    expect(await commitBagOps(db, A, ops)).toBe("ok");
    expect(totalQty("linh_thao")).toBe(110);
    expect((await loadBag(db, A)).items.every((i) => i.qty <= 99)).toBe(true);
  });

  it("a move onto an occupied cell that was planned as a plain move is refused", async () => {
    await bagWith(["linh_thao", 1, 0], ["thu_cot", 1, 1]);
    const ops: BagOp[] = [{ op: "move", id: (await loadBag(db, A)).items.find((i) => i.cell === 0)!.id, tab: 0, cell: 1, fromTab: 0, fromCell: 0 }];
    expect(await commitBagOps(db, A, ops)).toBe("stale");
    expect(count("item_instances")).toBe(2);
  });

  it("the database refuses a cell index outside a valid range type and a zero quantity", () => {
    expect(() => raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('z', ?, 'x', 0, 0, 0, 0)").run(A)).toThrow();
    expect(() => raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('z', ?, 'x', 1, -1, 0, 0)").run(A)).toThrow();
  });
});

describe("mail: items sent when the bag is full", () => {
  const NOW = 1_000_000;

  async function overflow(type = "linh_thao", qty = 3) {
    expect(await commitBagOps(db, A, [], { mail: [{ type, qty, subject: "Túi đồ đầy" }], now: NOW })).toBe("ok");
  }

  it("creates an unplaced item and a mail that expires in 30 minutes", async () => {
    await overflow();
    const mail = await listMail(db, A, NOW + 1000);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ item: { type: "linh_thao", qty: 3 }, expiresAt: NOW + MAIL_ITEM_EXPIRY_MS });
    expect((await loadBag(db, A)).items).toEqual([]); // the item exists but is not in the bag
    expect(count("item_instances")).toBe(1);
  });

  it("an expired mail is not listed and cannot be claimed; the sweep deletes the mail and its item", async () => {
    await overflow();
    const later = NOW + MAIL_ITEM_EXPIRY_MS + 1;
    expect(await listMail(db, A, later)).toEqual([]);
    const mailId = (await listMail(db, A, NOW))[0]!.id;
    expect(await claimMailItem(db, A, mailId, await loadBag(db, A), later)).toEqual({ status: "expired" });
    expect(await deleteExpiredMail(db, later, A)).toBe(1);
    expect(count("mailbox")).toBe(0);
    expect(count("item_instances")).toBe(0);
  });

  it("the sweep never touches a claimed mail or the item that is now in the bag", async () => {
    await overflow();
    const mailId = (await listMail(db, A, NOW))[0]!.id;
    const r = await claimMailItem(db, A, mailId, await loadBag(db, A), NOW + 5000);
    expect(r.status).toBe("claimed");
    expect(await deleteExpiredMail(db, NOW + MAIL_ITEM_EXPIRY_MS + 10)).toBe(0);
    expect(totalQty("linh_thao")).toBe(3);
  });

  it("claiming places the item in the first free cell, once", async () => {
    await overflow();
    const mailId = (await listMail(db, A, NOW))[0]!.id;
    const bag = await loadBag(db, A);
    const first = await claimMailItem(db, A, mailId, bag, NOW + 100);
    expect(first.status).toBe("claimed");
    expect((await loadBag(db, A)).items).toEqual([expect.objectContaining({ type: "linh_thao", qty: 3, tab: 0, cell: 0 })]);
    // A second claim with the same (now stale) bag changes nothing.
    expect((await claimMailItem(db, A, mailId, bag, NOW + 200)).status).toBe("already_claimed");
    expect(totalQty("linh_thao")).toBe(3);
    expect(await listMail(db, A, NOW + 300)).toEqual([]);
  });

  it("claiming merges into a stack that has room for all of it", async () => {
    await give(A, "linh_thao", 10, "k");
    await overflow("linh_thao", 5);
    const mailId = (await listMail(db, A, NOW))[0]!.id;
    const r = await claimMailItem(db, A, mailId, await loadBag(db, A), NOW + 100);
    expect(r.status).toBe("claimed");
    expect(count("item_instances")).toBe(1);
    expect(totalQty("linh_thao")).toBe(15);
  });

  it("claiming into a full bag fails and keeps the mail", async () => {
    for (let c = 0; c < BAG_CELLS_PER_TAB; c++) {
      raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES (?, ?, 'thu_cot', 99, 0, ?, 0)").run(newId(), A, c);
    }
    await overflow("linh_thao", 1);
    const mailId = (await listMail(db, A, NOW))[0]!.id;
    expect(await claimMailItem(db, A, mailId, await loadBag(db, A), NOW + 100)).toEqual({ status: "bag_full" });
    expect(await listMail(db, A, NOW + 200)).toHaveLength(1);
  });

  it("another character cannot claim the mail", async () => {
    await overflow();
    const mailId = (await listMail(db, A, NOW))[0]!.id;
    expect(await claimMailItem(db, B, mailId, await loadBag(db, B), NOW + 1)).toEqual({ status: "not_found" });
    expect(totalQty("linh_thao", B)).toBe(0);
  });

  it("loot and overflow in one grant: the items that fit go to the bag, the rest to mail, with one key", async () => {
    const bag = await loadBag(db, A);
    const ops = planAdd(bag.items, bag.tabs, "thu_cot", 1, newId)!;
    expect(await commitBagOps(db, A, ops, { grantKey: "loot:mix", mail: [{ type: "yeu_dan", qty: 1, subject: "Túi đồ đầy" }], now: NOW })).toBe("ok");
    expect(await commitBagOps(db, A, ops, { grantKey: "loot:mix", mail: [{ type: "yeu_dan", qty: 1, subject: "Túi đồ đầy" }], now: NOW })).toBe("duplicate");
    expect(count("item_instances")).toBe(2);
    expect(count("mailbox")).toBe(1);
  });
});

describe("bag tabs and grant pruning", () => {
  it("expanding adds tabs up to the cap, and the new tab is usable", async () => {
    expect(await expandBag(db, A, MAX_BAG_TABS)).toBe(2);
    expect((await loadBag(db, A)).tabs).toBe(2);
    for (let i = 0; i < MAX_BAG_TABS - 2; i++) await expandBag(db, A, MAX_BAG_TABS);
    expect(await expandBag(db, A, MAX_BAG_TABS)).toBeNull();
    expect((await loadBag(db, A)).tabs).toBe(MAX_BAG_TABS);
    expect(await expandBag(db, "nobody", MAX_BAG_TABS)).toBeNull();
  });

  it("old loot keys are pruned and recent ones kept", async () => {
    raw.exec("INSERT INTO item_grants (key, created_at) VALUES ('old', 0), ('new', 1000000000000)");
    await pruneGrants(db, 1_000_000_000_000 + 1000);
    expect((raw.prepare("SELECT key FROM item_grants").all() as { key: string }[]).map((r) => r.key)).toEqual(["new"]);
  });
});

describe("invariant", () => {
  it("after a mixed sequence no two items share a cell and every quantity is within its stack limit", async () => {
    for (let i = 0; i < 12; i++) await give(A, i % 2 ? "linh_thao" : "thu_cot", 37, `k${i}`);
    const bag = await loadBag(db, A);
    for (let i = 0; i < 6; i++) {
      const moved = planMove(bag.items, 1, { tab: 0, cell: i }, { tab: 0, cell: i + 3 });
      if (moved) await commitBagOps(db, A, moved);
    }
    const final = (await loadBag(db, A)).items as BagItem[];
    const cells = final.map((i) => `${i.tab}:${i.cell}`);
    expect(new Set(cells).size).toBe(cells.length);
    expect(final.every((i) => i.qty >= 1 && i.qty <= 99)).toBe(true);
    expect(totalQty("linh_thao") + totalQty("thu_cot")).toBe(12 * 37);
  });
});

describe("sort and split in D1", () => {
  const put = (type: string, qty: number, tab: number, cell: number) =>
    raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES (?, ?, ?, ?, ?, ?, 0)").run(newId(), A, type, qty, tab, cell);

  it("a sort merges split stacks, deletes the merged rows and packs the bag, matching the planned cache", async () => {
    put("linh_thao", 40, 0, 10);
    put("linh_thao", 70, 0, 3);
    put("yeu_dan", 2, 0, 50);
    put("thu_cot", 5, 0, 0);
    const bag = await loadBag(db, A);
    const ops = planSort(bag.items, bag.tabs, "rarity")!;
    expect(await commitBagOps(db, A, ops)).toBe("ok");
    const after = await loadBag(db, A);
    const planned = applyOps(bag.items, ops);
    const key = (i: BagItem) => `${i.tab}:${i.cell}:${i.type}:${i.qty}`;
    expect(after.items.map(key).sort()).toEqual(planned.map(key).sort());
    expect(count("item_instances")).toBe(4); // 40 + 70 merged into 99 + 11
    expect(totalQty("linh_thao")).toBe(110);
    expect(after.items.find((i) => i.cell === 0)!.type).toBe("yeu_dan"); // rarest first
  });

  it("a large bag sorts in chunks within D1's parameter limit and keeps every item", async () => {
    for (let i = 0; i < 200; i++) put(i % 2 ? "linh_thao" : "thu_cot", 1 + (i % 9), Math.floor(i / 64), i % 64);
    for (let t = 0; t < 3; t++) await expandBag(db, A, MAX_BAG_TABS);
    const bag = await loadBag(db, A);
    const ops = planSort(bag.items, bag.tabs, "name")!;
    expect(await commitBagOps(db, A, ops)).toBe("ok");
    const before = { herb: totalQty("linh_thao"), bone: totalQty("thu_cot") };
    const final = (await loadBag(db, A)).items;
    expect(final.reduce((s, i) => s + i.qty, 0)).toBe(before.herb + before.bone);
    expect(new Set(final.map((i) => `${i.tab}:${i.cell}`)).size).toBe(final.length);
    expect(final.every((i) => i.qty <= 99)).toBe(true);
    // Sorting again changes nothing.
    expect(planSort(final, bag.tabs, "name")).toBeNull();
  });

  it("a stale sort rolls back entirely: nothing is left parked, merged or deleted", async () => {
    put("linh_thao", 40, 0, 10);
    put("linh_thao", 70, 0, 3);
    const cached = await loadBag(db, A);
    raw.exec("UPDATE item_instances SET qty = qty + 1"); // the rows changed after the cache was loaded
    const ops = planSort(cached.items, cached.tabs, "name")!;
    expect(await commitBagOps(db, A, ops)).toBe("stale");
    const rows = raw.prepare("SELECT qty, bag_tab, cell FROM item_instances ORDER BY cell").all() as Array<{ qty: number; bag_tab: number | null; cell: number | null }>;
    expect(rows).toEqual([{ qty: 71, bag_tab: 0, cell: 3 }, { qty: 41, bag_tab: 0, cell: 10 }]);
  });

  it("a sort cannot touch another character's rows", async () => {
    put("linh_thao", 5, 0, 4);
    raw.prepare("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('b1', ?, 'thu_cot', 7, 0, 9, 0)").run(B);
    const cached = await loadBag(db, A);
    const evil: BagOp[] = [{ op: "arrange", before: [...cached.items, { id: "b1", type: "thu_cot", tab: 0, cell: 9, qty: 7 }], after: [{ id: "b1", type: "thu_cot", tab: 0, cell: 0, qty: 7 }] }];
    expect(await commitBagOps(db, A, evil)).toBe("stale");
    expect((raw.prepare("SELECT cell FROM item_instances WHERE id = 'b1'").get() as { cell: number }).cell).toBe(9);
  });

  it("a split writes the reduced stack and the new one together", async () => {
    put("linh_thao", 10, 0, 0);
    const bag = await loadBag(db, A);
    const ops = planSplit(bag.items, bag.tabs, { tab: 0, cell: 0 }, 4, newId)!;
    expect(await commitBagOps(db, A, ops)).toBe("ok");
    const after = (await loadBag(db, A)).items.sort((x, y) => x.cell - y.cell);
    expect(after.map((i) => [i.cell, i.qty])).toEqual([[0, 6], [1, 4]]);
    expect(totalQty("linh_thao")).toBe(10);
  });

  it("a split planned against a stale stack fails and creates nothing", async () => {
    put("linh_thao", 10, 0, 0);
    const bag = await loadBag(db, A);
    const ops = planSplit(bag.items, bag.tabs, { tab: 0, cell: 0 }, 4, newId)!;
    raw.exec("UPDATE item_instances SET qty = 3");
    expect(await commitBagOps(db, A, ops)).toBe("stale");
    expect(count("item_instances")).toBe(1);
    expect(totalQty("linh_thao")).toBe(3);
  });
});

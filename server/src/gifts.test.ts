import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { GIFT_MAX_RECIPIENTS, currencyGroupOf, giftProblem, giftableItems, stackLimit } from "@game/shared";
import { claimGiftMail, countCharacters, listGiftBatches, resolveRecipients, sendGift, batchCharacterIds } from "./gifts";
import { listMail, mailViews, type BagState } from "./inventory";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const ids = ["char-a", "char-b", "char-c"];
const emptyBag: BagState = { tabs: 1, items: [], equipped: [] };

beforeEach(() => {
  ({ db, raw } = makeDb());
  ids.forEach((id, i) => {
    raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc-${i}', 'acc-${i}@x.test', 'h', 's', 1, 0)`);
    raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${id}', 'acc-${i}', 'Đạo ${i}', 'kim', 0, 0, 0, 0)`);
  });
});

const n = (sql: string, ...args: unknown[]) => (raw.prepare(sql).get(...(args as never[])) as { n: number }).n;
const send = (batchId: string, extra: Partial<Parameters<typeof sendGift>[3]> = {}) =>
  sendGift(db, "admin@x.test", "admin-acc", { batchId, subject: "Quà sự kiện", body: "Chúc mừng\nnăm mới", audience: { kind: "all" }, gift: { linh_thach: 1000, items: [{ type: "hoi_huyet_dan", qty: 5 }] }, expiresInDays: null, ...extra });

describe("sending a gift", () => {
  it("sends one mail per character of a list, and nothing is created but the mails", async () => {
    const res = await send("batch0001", { audience: { kind: "list", characterIds: ["char-a", "char-c", "nobody"] } });
    expect(res).toEqual({ ok: true, recipients: 2, duplicate: false });
    expect(n("SELECT COUNT(*) AS n FROM mailbox")).toBe(2);
    expect(n("SELECT COUNT(*) AS n FROM item_instances")).toBe(0);
    expect(n("SELECT COUNT(*) AS n FROM currency_balances")).toBe(0);
    expect(await batchCharacterIds(db, "batch0001")).toEqual(expect.arrayContaining(["char-a", "char-c"]));
    const mail = await listMail(db, "char-a");
    expect(mailViews(mail)[0]).toMatchObject({ subject: "Quà sự kiện", body: "Chúc mừng\nnăm mới", gift: { linh_thach: 1000, items: [{ type: "hoi_huyet_dan", qty: 5 }] }, expiresInMs: null });
    expect(await listMail(db, "char-b")).toHaveLength(0);
  });

  it("sends to the whole server and records the batch and the log", async () => {
    expect(await countCharacters(db)).toBe(3);
    expect(await send("batch0002")).toEqual({ ok: true, recipients: 3, duplicate: false });
    const hist = await listGiftBatches(db, 1, 10);
    expect(hist.rows[0]).toMatchObject({ id: "batch0002", audience: "all", recipients: 3, claimed: 0, adminEmail: "admin@x.test" });
    const log = raw.prepare("SELECT screen, content FROM admin_log").get() as { screen: string; content: string };
    expect(log.screen).toBe("Gửi quà");
    expect(log.content).toContain("toàn bộ server");
    expect(log.content).toContain("3 nhân vật");
  });

  it("answers a repeated batch id with the first send and sends nothing twice", async () => {
    await send("batch0003");
    expect(await send("batch0003")).toEqual({ ok: true, recipients: 3, duplicate: true });
    expect(n("SELECT COUNT(*) AS n FROM mailbox")).toBe(3);
    expect(n("SELECT COUNT(*) AS n FROM gift_batches")).toBe(1);
  });

  it("rejects bad input and a list that matches nobody, leaving no batch behind", async () => {
    expect(await send("x")).toMatchObject({ ok: false, error: "invalid_batch" });
    expect(await send("batch0004", { subject: "  " })).toMatchObject({ error: "invalid_text" });
    expect(await send("batch0004", { subject: "a".repeat(81) })).toMatchObject({ error: "invalid_text" });
    expect(await send("batch0004", { gift: { items: [] } })).toMatchObject({ error: "invalid_gift" });
    expect(await send("batch0004", { gift: { items: [{ type: "no_such_item", qty: 1 }] } })).toMatchObject({ error: "invalid_gift" });
    expect(await send("batch0004", { gift: { items: [{ type: "hoi_huyet_dan", qty: 100000 }] } })).toMatchObject({ error: "invalid_gift" });
    expect(await send("batch0004", { expiresInDays: 0 })).toMatchObject({ error: "invalid_expiry" });
    expect(await send("batch0004", { audience: { kind: "list", characterIds: [] } })).toMatchObject({ error: "invalid_audience" });
    expect(await send("batch0004", { audience: { kind: "list", characterIds: Array(GIFT_MAX_RECIPIENTS + 1).fill("a") } })).toMatchObject({ error: "invalid_audience" });
    expect(await send("batch0004", { audience: { kind: "list", characterIds: ["nobody"] } })).toMatchObject({ error: "no_recipients" });
    expect(n("SELECT COUNT(*) AS n FROM mailbox")).toBe(0);
    expect(n("SELECT COUNT(*) AS n FROM gift_batches")).toBe(0);
    expect(n("SELECT COUNT(*) AS n FROM admin_log")).toBe(0);
    // The same id can be used again once there is someone to send to.
    expect(await send("batch0004", { audience: { kind: "list", characterIds: ["char-a"] } })).toEqual({ ok: true, recipients: 1, duplicate: false });
  });

  it("refuses equipment and counts the problems of a gift", () => {
    expect(giftProblem({ items: [{ type: "eq.weapon.1", qty: 1 }] })).toBe("item");
    expect(giftProblem({ linh_thach: -5, items: [] })).toBe("currency");
    expect(giftProblem({ items: Array(6).fill({ type: "hoi_huyet_dan", qty: 1 }) })).toBe("too_many_items");
    expect(giftProblem({ items: [{ type: "hoi_huyet_dan", qty: 1 }, { type: "hoi_huyet_dan", qty: 1 }] })).toBe("duplicate_item");
    expect(giftableItems().length).toBeGreaterThan(5);
    expect(giftableItems().every((i) => i.maxStack >= 1)).toBe(true);
  });

  it("gives mail an expiry in days, and the list hides it afterwards", async () => {
    await send("batch0005", { expiresInDays: 2 }, );
    const mail = (await listMail(db, "char-a", Date.now()))[0]!;
    expect(mail.expiresAt).toBeGreaterThan(Date.now() + 1.9 * 86_400_000);
    expect(await listMail(db, "char-a", Date.now() + 3 * 86_400_000)).toHaveLength(0);
  });

  it("finds characters by exact name (A-Z without case) and reports the names that matched nobody", async () => {
    const r = await resolveRecipients(db, ["Đạo 1", "Đạo 2", "Ai đó", "Đạo 1"]);
    expect(r.found.map((c) => c.id).sort()).toEqual(["char-b", "char-c"]);
    expect(r.missing).toEqual(["Ai đó"]);
  });
});

describe("claiming a gift", () => {
  const mailId = (batch: string, ch: string) => `${batch}:${ch}`;

  it("gives the currencies and the items together, in the Admin group, once", async () => {
    await send("batch0010", { gift: { linh_thach: 1000, tien_ngoc: 7, items: [{ type: "hoi_huyet_dan", qty: 5 }] } });
    const r = await claimGiftMail(db, "char-a", mailId("batch0010", "char-a"), emptyBag);
    expect(r.status).toBe("claimed");
    if (r.status !== "claimed") return;
    expect(r.wallet).toMatchObject({ linh_thach: 1000, tien_ngoc: 7, cong_hien: 0 });
    expect(r.ops).toHaveLength(1);
    expect(n("SELECT COUNT(*) AS n FROM item_instances WHERE owner_character_id = 'char-a' AND item_type = 'hoi_huyet_dan' AND bag_tab IS NOT NULL")).toBe(1);
    // The totals of both currencies sit in the Admin group, with the sending admin as the actor, and the history keeps the Linh Thạch.
    expect(currencyGroupOf("admin_gift")).toBe("admin");
    expect(raw.prepare("SELECT grp, total_in FROM linh_thach_totals WHERE character_id = 'char-a'").get()).toEqual({ grp: "admin", total_in: 1000 });
    expect(raw.prepare("SELECT grp, total_in FROM tien_ngoc_totals WHERE character_id = 'char-a'").get()).toEqual({ grp: "admin", total_in: 7 });
    expect(raw.prepare("SELECT actor, reason FROM linh_thach_ledger WHERE character_id = 'char-a'").get()).toEqual({ actor: "admin-acc", reason: "admin_gift" });
    expect((await listGiftBatches(db, 1, 10)).rows[0]!.claimed).toBe(1);
    expect(await listMail(db, "char-a")).toHaveLength(0);
    // A second claim changes nothing.
    expect((await claimGiftMail(db, "char-a", mailId("batch0010", "char-a"), emptyBag)).status).toBe("already_claimed");
    expect(n("SELECT balance AS n FROM currency_balances WHERE character_id = 'char-a' AND currency = 'linh_thach'")).toBe(1000);
  });

  it("merges into a stack that has room", async () => {
    await send("batch0011", { gift: { items: [{ type: "hoi_huyet_dan", qty: 5 }] } });
    raw.exec("INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('stack1', 'char-a', 'hoi_huyet_dan', 10, 0, 0, 0)");
    const bag: BagState = { tabs: 1, items: [{ id: "stack1", type: "hoi_huyet_dan", tab: 0, cell: 0, qty: 10 }], equipped: [] };
    const r = await claimGiftMail(db, "char-a", mailId("batch0011", "char-a"), bag);
    expect(r.status).toBe("claimed");
    expect(n("SELECT qty AS n FROM item_instances WHERE id = 'stack1'")).toBe(15);
    expect(n("SELECT COUNT(*) AS n FROM item_instances WHERE owner_character_id = 'char-a'")).toBe(1);
  });

  it("changes nothing when the bag has no room, then works once there is", async () => {
    await send("batch0012", { gift: { linh_thach: 500, items: [{ type: "hoi_huyet_dan", qty: 5 }] } });
    const full: BagState = { tabs: 1, items: Array.from({ length: 64 }, (_, i) => ({ id: `junk${i}`, type: "yeu_dan", tab: 0, cell: i, qty: stackLimit("yeu_dan") })), equipped: [] };
    expect((await claimGiftMail(db, "char-a", mailId("batch0012", "char-a"), full)).status).toBe("bag_full");
    expect(n("SELECT COUNT(*) AS n FROM currency_balances")).toBe(0);
    expect(n("SELECT COUNT(*) AS n FROM mailbox WHERE claimed_at IS NOT NULL")).toBe(0);
    expect((await claimGiftMail(db, "char-a", mailId("batch0012", "char-a"), emptyBag)).status).toBe("claimed");
  });

  it("refuses an expired mail, someone else's mail and an unknown id", async () => {
    await send("batch0013", { expiresInDays: 1 });
    const soon = Date.now() + 2 * 86_400_000;
    expect((await claimGiftMail(db, "char-a", mailId("batch0013", "char-a"), emptyBag, soon)).status).toBe("expired");
    expect((await claimGiftMail(db, "char-b", mailId("batch0013", "char-a"), emptyBag)).status).toBe("not_found");
    expect((await claimGiftMail(db, "char-a", "nope:char-a", emptyBag)).status).toBe("not_found");
    expect(n("SELECT COUNT(*) AS n FROM currency_balances")).toBe(0);
  });

  it("does not give an item that left the catalogue, and nothing else of that gift either", async () => {
    await send("batch0014", { gift: { linh_thach: 100, items: [{ type: "hoi_huyet_dan", qty: 1 }] } });
    raw.exec(`UPDATE mailbox SET gift = replace(gift, 'hoi_huyet_dan', 'gone_item') WHERE id LIKE 'batch0014:%'`);
    expect((await claimGiftMail(db, "char-a", mailId("batch0014", "char-a"), emptyBag)).status).toBe("not_found");
    expect(n("SELECT COUNT(*) AS n FROM currency_balances")).toBe(0);
  });
});

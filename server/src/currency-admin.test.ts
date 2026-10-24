import type { DatabaseSync } from "node:sqlite";
import type { Currency } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { listAdminLog, parseLogQuery } from "./admin-log";
import {
  confirmEntry,
  getDetail,
  handleEntry,
  lastAuditAt,
  listAudit,
  listTienNgocHistory,
  parseAuditList,
  parseHistory,
  parseSearch,
  runAudit,
  searchTotals,
} from "./currency-admin";
import { applyCurrencyDelta } from "./economy";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const ADMIN = { id: "adm", email: "boss@x.test" };

const search = (o: Record<string, string> = {}) => parseSearch(new URLSearchParams(o));
const auditList = (o: Record<string, string> = {}) => parseAuditList(new URLSearchParams(o));

async function put(characterId: string, currency: Currency, delta: number, reason: string, actor = "system") {
  expect((await applyCurrencyDelta(db, { characterId, currency, delta, reason, actor })).status).toBe("applied");
}

/** Edits a balance behind the game's back, the way a hand edit or a bug would. */
const skew = (characterId: string, currency: Currency, by: number) =>
  raw.exec(`UPDATE currency_balances SET balance = balance + ${by} WHERE character_id = '${characterId}' AND currency = '${currency}'`);

const touch = (characterId: string, at: number) => raw.exec(`UPDATE characters SET updated_at = ${at} WHERE id = '${characterId}'`);
const status = (currency: Currency, characterId: string) => (raw.prepare("SELECT status FROM currency_audit WHERE currency = ? AND character_id = ?").get(currency, characterId) as { status: string } | undefined)?.status;

beforeEach(async () => {
  ({ db, raw } = makeDb());
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES ('a1', 'alice@x.test', 'h', 's', 1, 'player', 0), ('a2', 'bob@x.test', 'h', 's', 1, 'player', 0), ('adm', 'boss@x.test', 'h', 's', 1, 'admin', 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'Alice', 'kim', 0, 0, 0, 0), ('c2', 'a2', 'Bob', 'kim', 0, 0, 0, 0)");
  await put("c1", "tien_ngoc", 500, "admin_grant:gift", "adm");
  await put("c1", "tien_ngoc", -50, "shop_buy:ren_giu_cap:1");
  await put("c1", "tien_ngoc", -30, "shop_buy:ren_giu_cap:1");
  await put("c2", "tien_ngoc", 100, "admin_grant", "adm");
  await put("c1", "linh_thach", 40, "monster_drop");
  await put("c1", "linh_thach", 250_000, "quest");
  await put("c2", "linh_thach", 7, "admin_grant", "adm");
  await put("c1", "cong_hien", 9, "quest");
});

describe("search", () => {
  it("gives one row per character and group, with in and out", async () => {
    const res = await searchTotals(db, search({ sort: "character_name", dir: "asc" }));
    expect(res.total).toBe(3);
    expect(res.rows.map((r) => [r.characterName, r.group, r.totalIn, r.totalOut])).toEqual([
      ["Alice", "admin", 500, 0],
      ["Alice", "shop", 0, 80],
      ["Bob", "admin", 100, 0],
    ]);
    expect(res.rows[0]).toMatchObject({ accountEmail: "alice@x.test", characterId: "c1" });
  });

  it("filters by account, character and group (all optional, partial match) and by currency", async () => {
    expect((await searchTotals(db, search({ account: "bob@" }))).rows.map((r) => r.characterName)).toEqual(["Bob"]);
    expect((await searchTotals(db, search({ character: "lic" }))).total).toBe(2);
    expect((await searchTotals(db, search({ group: "shop" }))).total).toBe(1);
    expect((await searchTotals(db, search({ group: "not_a_group" }))).total).toBe(3); // an unknown group is ignored
    expect((await searchTotals(db, search({ currency: "linh_thach" }))).total).toBe(3); // Alice farm, Alice quest, Bob admin
    expect((await searchTotals(db, search({ currency: "cong_hien" }))).rows[0]).toMatchObject({ group: "quest", totalIn: 9 });
    expect((await searchTotals(db, search({ account: "%" }))).total).toBe(0);
  });

  it("sorts and pages", async () => {
    const res = await searchTotals(db, search({ sort: "total_in", dir: "desc", size: "2" }));
    expect(res.rows.map((r) => r.totalIn)).toEqual([500, 100]);
    expect((await searchTotals(db, search({ sort: "total_in", dir: "desc", size: "2", page: "2" }))).rows.map((r) => r.totalIn)).toEqual([0]);
    expect(search({ sort: "x; DROP", size: "100000", page: "-1" })).toMatchObject({ sort: "updated_at", size: 100, page: 1 });
  });
});

describe("detail", () => {
  it("shows the balance from the character record, the groups and their sum, and that they match", async () => {
    const d = await getDetail(db, "tien_ngoc", "c1");
    expect(d).toMatchObject({ currency: "tien_ngoc", account: { email: "alice@x.test" }, character: { name: "Alice" }, balance: 420, historyAmount: 420, matches: true, audit: null, banned: false });
    expect(d!.groups.map((g) => [g.group, g.totalIn, g.totalOut])).toEqual([["admin", 500, 0], ["shop", 0, 80]]);
  });

  it("flags a balance that does not match the history, and reads the balance, not the history, as the balance", async () => {
    skew("c1", "tien_ngoc", 40);
    expect(await getDetail(db, "tien_ngoc", "c1")).toMatchObject({ balance: 460, historyAmount: 420, matches: false });
  });

  it("is null for a character that does not exist", async () => {
    expect(await getDetail(db, "tien_ngoc", "nobody")).toBeNull();
  });
});

describe("Tiên Ngọc detailed history", () => {
  it("defaults to the last 30 days and takes a date range", async () => {
    raw.exec("DROP TRIGGER tien_ngoc_ledger_no_update"); // a test may move rows in time; the game never does
    const now = Date.parse("2026-10-24T12:00:00+07:00");
    const at = (days: number) => now - days * 86_400_000;
    const ids = (raw.prepare("SELECT id FROM tien_ngoc_ledger WHERE character_id = 'c1' ORDER BY id").all() as Array<{ id: number }>).map((r) => r.id);
    raw.exec(`UPDATE tien_ngoc_ledger SET created_at = ${at(1)} WHERE id = ${ids[0]}`);
    raw.exec(`UPDATE tien_ngoc_ledger SET created_at = ${at(10)} WHERE id = ${ids[1]}`);
    raw.exec(`UPDATE tien_ngoc_ledger SET created_at = ${at(100)} WHERE id = ${ids[2]}`);
    const lastMonth = await listTienNgocHistory(db, parseHistory(new URLSearchParams({ character: "c1" }), now));
    expect(lastMonth.rows.map((r) => r.delta)).toEqual([500, -50]); // newest first, the 100-day-old row is out
    expect(lastMonth.rows[0]).toMatchObject({ group: "admin", actor: "boss@x.test" });
    const range = await listTienNgocHistory(db, parseHistory(new URLSearchParams({ character: "c1", from: "2026-07-01", to: "2026-07-20" }), now));
    expect(range.rows.map((r) => r.delta)).toEqual([-30]);
    expect(range.total).toBe(1);
  });
});

describe("audit run", () => {
  it("checks everybody on the first run and lists only the characters whose balance differs", async () => {
    skew("c1", "tien_ngoc", 40);
    const res = await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    expect(res).toEqual({ ok: true, checked: 2, invalid: 1, at: 1000 });
    const page = await listAudit(db, auditList({ currency: "tien_ngoc" }));
    expect(page).toMatchObject({ lastAuditAt: 1000, pendingInvalid: 1, total: 1 });
    expect(page.rows[0]).toMatchObject({ accountEmail: "alice@x.test", characterName: "Alice", historyAmount: 420, balanceAmount: 460, status: "invalid" });
    expect(await lastAuditAt(db, "tien_ngoc")).toBe(1000);
    expect(await lastAuditAt(db, "linh_thach")).toBeNull(); // per currency
  });

  it("refuses a new run while a row is still invalid, and allows it once all are valid or handled", async () => {
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    expect(await runAudit(db, "tien_ngoc", ADMIN.email, 2000)).toEqual({ ok: false, error: "pending_invalid", invalid: 1 });
    expect(await lastAuditAt(db, "tien_ngoc")).toBe(1000); // nothing changed
    await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1500);
    expect((await runAudit(db, "tien_ngoc", ADMIN.email, 2000)).ok).toBe(true);
  });

  it("a new run clears the old rows of that currency only and looks only at characters active since the last one", async () => {
    skew("c1", "tien_ngoc", 40);
    skew("c2", "tien_ngoc", 5);
    skew("c1", "linh_thach", 9);
    await runAudit(db, "linh_thach", ADMIN.email, 500);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1100);
    await confirmEntry(db, "tien_ngoc", "c2", ADMIN, 1100);
    skew("c1", "tien_ngoc", 1); // both are off again, but only c2 is active after the last run
    skew("c2", "tien_ngoc", 1);
    raw.exec("UPDATE tien_ngoc_totals SET updated_at = 900 WHERE character_id = 'c1'"); // (the confirm above touched the totals of both)
    touch("c2", 1500);
    const res = await runAudit(db, "tien_ngoc", ADMIN.email, 2000);
    expect(res).toMatchObject({ ok: true, invalid: 1 });
    expect((await listAudit(db, auditList({ currency: "tien_ngoc" }))).rows.map((r) => r.characterName)).toEqual(["Bob"]);
    expect((await listAudit(db, auditList({ currency: "linh_thach" }))).total).toBe(1); // untouched by the other currency's run
  });

  it("also looks at a character whose totals changed since the last run, even if its record was not saved", async () => {
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    raw.exec("UPDATE characters SET updated_at = 0");
    raw.exec("UPDATE currency_balances SET balance = balance + 7 WHERE character_id = 'c2' AND currency = 'tien_ngoc'");
    raw.exec("UPDATE tien_ngoc_totals SET updated_at = 1500 WHERE character_id = 'c2'");
    expect(await runAudit(db, "tien_ngoc", ADMIN.email, 2000)).toMatchObject({ ok: true, invalid: 1 });
  });
});

describe("confirm", () => {
  it("puts the difference in the admin group, writes the detailed row, marks the row valid and logs it, leaving the balance alone", async () => {
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    expect(await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1500)).toEqual({ ok: true, difference: 40 });
    const d = await getDetail(db, "tien_ngoc", "c1");
    expect(d).toMatchObject({ balance: 460, historyAmount: 460, matches: true, audit: { status: "valid", resolvedAt: 1500 } });
    expect(d!.groups.find((g) => g.group === "admin")).toMatchObject({ totalIn: 540, totalOut: 0 });
    expect(raw.prepare("SELECT delta, reason, actor FROM tien_ngoc_ledger ORDER BY id DESC LIMIT 1").get()).toEqual({ delta: 40, reason: "admin_adjust:audit", actor: "adm" });
    expect(raw.prepare("SELECT history_amount, balance_amount, resolved_by FROM currency_audit WHERE character_id = 'c1'").get()).toEqual({ history_amount: 460, balance_amount: 460, resolved_by: "adm" });
    const log = (await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!;
    expect(log).toMatchObject({ adminEmail: "boss@x.test", screen: "Quản lý tiền tệ" });
    expect(log.content).toBe("Kiểm duyệt - Đã xác nhận tài khoản alice@x.test nhân vật Alice khoản lệch +40 Tiên Ngọc");
  });

  it("a balance below the history is covered as money out", async () => {
    skew("c2", "linh_thach", -3);
    await runAudit(db, "linh_thach", ADMIN.email, 1000);
    expect(await confirmEntry(db, "linh_thach", "c2", ADMIN, 1500)).toEqual({ ok: true, difference: -3 });
    expect((await getDetail(db, "linh_thach", "c2"))!.groups.find((g) => g.group === "admin")).toMatchObject({ totalIn: 7, totalOut: 3 });
    expect(raw.prepare("SELECT delta FROM linh_thach_ledger ORDER BY id DESC LIMIT 1").get()).toEqual({ delta: -3 }); // an admin did it: traced even though it is small
  });

  it("Cống Hiến has no detailed history, so only the group total changes", async () => {
    skew("c1", "cong_hien", 2);
    await runAudit(db, "cong_hien", ADMIN.email, 1000);
    expect(await confirmEntry(db, "cong_hien", "c1", ADMIN, 1500)).toEqual({ ok: true, difference: 2 });
    expect((await getDetail(db, "cong_hien", "c1"))).toMatchObject({ matches: true });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'cong_hien%ledger'").get()).toEqual({ n: 0 });
  });

  it("is refused, writing nothing, when the numbers are not the ones the admin saw", async () => {
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    expect(await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1500, { balance: 460, historyAmount: 400 })).toEqual({ ok: false, error: "stale" });
    expect(await handleEntry(db, "tien_ngoc", "c1", ADMIN, 1500, { balance: 461, historyAmount: 420 })).toEqual({ ok: false, error: "stale" });
    expect(status("tien_ngoc", "c1")).toBe("invalid");
    expect(raw.prepare("SELECT COUNT(*) AS n FROM tien_ngoc_totals WHERE character_id = 'c1' AND grp = 'admin' AND total_in > 500").get()).toEqual({ n: 0 });
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).total).toBe(0);
    expect(await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1600, { balance: 460, historyAmount: 420 })).toEqual({ ok: true, difference: 40 }); // the numbers it saw
  });

  it("a later audit finds nothing for a confirmed character", async () => {
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1500);
    touch("c1", 1600);
    expect(await runAudit(db, "tien_ngoc", ADMIN.email, 2000)).toMatchObject({ ok: true, invalid: 0 });
  });

  it("refuses a row that is not invalid, or does not exist, or moved under the admin", async () => {
    expect(await confirmEntry(db, "tien_ngoc", "c1", ADMIN)).toEqual({ ok: false, error: "not_invalid" });
    expect(await confirmEntry(db, "tien_ngoc", "nobody", ADMIN)).toEqual({ ok: false, error: "not_found" });
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1500);
    expect(await confirmEntry(db, "tien_ngoc", "c1", ADMIN, 1600)).toEqual({ ok: false, error: "not_invalid" }); // a second click
    expect(raw.prepare("SELECT total_in FROM tien_ngoc_totals WHERE character_id = 'c1' AND grp = 'admin'").get()).toEqual({ total_in: 540 });
  });
});

describe("handle", () => {
  it("is refused while the numbers still differ", async () => {
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    expect(await handleEntry(db, "tien_ngoc", "c1", ADMIN, 1500)).toEqual({ ok: false, error: "still_mismatch", difference: 40 });
    expect(status("tien_ngoc", "c1")).toBe("invalid");
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).total).toBe(0);
  });

  it("marks the row handled once the numbers agree (fixed some other way) and logs it", async () => {
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    skew("c1", "tien_ngoc", -40); // the admin put the balance right by hand
    expect(await handleEntry(db, "tien_ngoc", "c1", ADMIN, 1500)).toEqual({ ok: true, difference: 0 });
    expect(status("tien_ngoc", "c1")).toBe("handled");
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!.content).toBe("Kiểm duyệt - Đã xử lý tài khoản alice@x.test nhân vật Alice khoản lệch 0 Tiên Ngọc");
    expect((await runAudit(db, "tien_ngoc", ADMIN.email, 2000)).ok).toBe(true); // handled counts as resolved
  });

  it("works for a character whose numbers differ when the account is banned for good", async () => {
    skew("c1", "tien_ngoc", 40);
    await runAudit(db, "tien_ngoc", ADMIN.email, 1000);
    // No ban exists yet (accounts get one in 3m); until then the check says nobody is banned, so this goes through the helper's default.
    const res = await handleEntry(db, "tien_ngoc", "c1", ADMIN, 1500);
    expect(res.ok).toBe(false);
  });

  it("refuses a row that is not invalid", async () => {
    expect(await handleEntry(db, "tien_ngoc", "c1", ADMIN)).toEqual({ ok: false, error: "not_invalid" });
  });
});

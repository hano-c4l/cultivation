import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { banAccount, getAccountDetail, listAccounts, makeTempPassword, parseAccountQuery, setTempPassword, unbanAccount } from "./accounts-admin";
import { isPermanentlyBanned } from "./currency-admin";
import type { Env } from "./env";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
let evicted: string[];
let env: Env;
const ADMIN = "admin@x.test";
const hasher = { hash: async (p: string, s: string) => `h:${p}:${s}`, iterations: 7, newSalt: () => "salt" };

beforeEach(() => {
  ({ db, raw } = makeDb());
  evicted = [];
  env = {
    DB: db,
    CHAR_LOCK: { idFromName: (n: string) => n, get: (n: string) => ({ evict: async () => void evicted.push(n) }) },
    CHAT_HUB: { idFromName: (n: string) => n, get: () => ({ kick: async () => undefined }) },
  } as unknown as Env;
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'alice@x.test', 'h', 's', 1, 100), ('a2', 'bob@x.test', 'h', 's', 1, 200)");
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES ('ad', 'boss@x.test', 'h', 's', 1, 'admin', 50)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c1', 'a1', 'Lan Tu', 'kim', 0, 0, 0, 0)");
  raw.exec("INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES ('t1', 'a1', 9999999999999, 150), ('t2', 'a1', 9999999999999, 160)");
  raw.exec("INSERT INTO currency_balances (character_id, currency, balance) VALUES ('c1', 'linh_thach', 42)");
});

const logs = async () => (await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows.map((r) => r.content);
const query = (s = "") => parseAccountQuery(new URLSearchParams(s));

describe("the account list", () => {
  it("lists accounts with their character and last session, newest first, and searches email or character name", async () => {
    const all = await listAccounts(db, query());
    expect(all.total).toBe(3);
    expect(all.rows[0]!.email).toBe("bob@x.test");
    expect(all.rows.find((r) => r.email === "alice@x.test")).toMatchObject({ character: "Lan Tu", lastSession: 160, banned: false });
    expect((await listAccounts(db, query("q=lan"))).rows.map((r) => r.email)).toEqual(["alice@x.test"]);
    expect((await listAccounts(db, query("q=bob"))).total).toBe(1);
    expect((await listAccounts(db, query("q=%25"))).total).toBe(0); // a typed % is literal
    expect((await listAccounts(db, query("sort=email&dir=asc"))).rows[0]!.email).toBe("alice@x.test");
    expect((await listAccounts(db, query("size=1&page=2"))).rows.length).toBe(1);
  });

  it("shows the detail with the character and wallet", async () => {
    const d = (await getAccountDetail(db, "a1"))!;
    expect(d.character).toMatchObject({ name: "Lan Tu", wallet: { linh_thach: 42 } });
    expect(d.account).toMatchObject({ sessions: 2, banned: false });
    expect(await getAccountDetail(db, "nope")).toBeNull();
  });
});

describe("banning", () => {
  it("bans for some days: the sessions end, the character is kicked, the reason is kept and the log says so", async () => {
    const now = 1_000_000;
    expect(await banAccount(env, ADMIN, "a1", { forever: false, days: 3, reason: "Dùng phần mềm ngoài" }, now)).toMatchObject({ ok: true, kicked: true });
    expect(evicted).toEqual(["c1"]);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sessions WHERE account_id = 'a1'").get()).toEqual({ n: 0 });
    const d = (await getAccountDetail(db, "a1", now + 1))!;
    expect(d.account).toMatchObject({ banned: true, banForever: false, banUntil: now + 3 * 86_400_000, banReason: "Dùng phần mềm ngoài", bannedBy: ADMIN });
    expect((await getAccountDetail(db, "a1", now + 4 * 86_400_000))!.account.banned).toBe(false); // it ran out
    expect((await logs())[0]).toContain("Ban tài khoản alice@x.test: 3 ngày");
    expect(await isPermanentlyBanned(db, "a1")).toBe(false);
  });

  it("bans for good, which the currency screen's Xử lý counts, and lifting it clears everything", async () => {
    await banAccount(env, ADMIN, "a1", { forever: true, reason: "Gian lận" });
    expect(await isPermanentlyBanned(db, "a1")).toBe(true);
    expect((await unbanAccount(env, ADMIN, "a1")).ok).toBe(true);
    expect(await isPermanentlyBanned(db, "a1")).toBe(false);
    expect((await getAccountDetail(db, "a1"))!.account).toMatchObject({ banned: false, banReason: null });
    expect(await unbanAccount(env, ADMIN, "a1")).toEqual({ ok: false, error: "unchanged" });
  });

  it("refuses a missing reason, a bad length, an admin account and an unknown one; an account with no character just has no kick", async () => {
    expect(await banAccount(env, ADMIN, "a1", { forever: true, reason: "  " })).toEqual({ ok: false, error: "invalid" });
    expect(await banAccount(env, ADMIN, "a1", { forever: false, days: 0, reason: "x" })).toEqual({ ok: false, error: "invalid" });
    expect(await banAccount(env, ADMIN, "a1", { forever: false, days: 99999, reason: "x" })).toEqual({ ok: false, error: "invalid" });
    expect(await banAccount(env, ADMIN, "a1", { forever: true, reason: "x".repeat(201) })).toEqual({ ok: false, error: "invalid" });
    expect(await banAccount(env, ADMIN, "ad", { forever: true, reason: "x" })).toEqual({ ok: false, error: "forbidden" });
    expect(await banAccount(env, ADMIN, "zz", { forever: true, reason: "x" })).toEqual({ ok: false, error: "not_found" });
    expect(await banAccount(env, ADMIN, "a2", { forever: true, reason: "x" })).toMatchObject({ ok: true, kicked: false });
  });
});

describe("the temporary password", () => {
  it("is random, stored hashed with its own salt, ends the sessions and kicks; an admin's cannot be set", async () => {
    const res = await setTempPassword(env, ADMIN, "a1", hasher);
    expect(res.ok && res.password).toMatch(/^[A-Za-z0-9]{14}$/);
    if (!res.ok) throw new Error("not ok");
    expect(raw.prepare("SELECT pw_hash, pw_salt, pw_iterations FROM accounts WHERE id = 'a1'").get()).toEqual({ pw_hash: `h:${res.password}:salt`, pw_salt: "salt", pw_iterations: 7 });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sessions WHERE account_id = 'a1'").get()).toEqual({ n: 0 });
    expect(evicted).toEqual(["c1"]);
    const log = (await logs())[0]!;
    expect(log).toContain("Đặt mật khẩu tạm");
    expect(log).not.toContain(res.password!);
    expect(await setTempPassword(env, ADMIN, "ad", hasher)).toEqual({ ok: false, error: "forbidden" });
    expect(makeTempPassword()).not.toBe(makeTempPassword());
  });
});

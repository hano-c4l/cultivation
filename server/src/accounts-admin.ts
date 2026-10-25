import { logStatement } from "./admin-log";
import type { Env } from "./env";

/**
 * The admin side of the accounts (docs/PHASE3.md 3m): a searchable list, a detail screen, banning (for some days or for good, with the reason the player is
 * shown at login), lifting a ban and setting a temporary password (shown once). A ban or a new password ends the account's sessions and kicks its character
 * out of the game (CharacterLock.evict saves it first). Accounts with the admin role cannot be banned or have their password set here.
 */
export const ACCOUNT_LOG_SCREEN = "Tài khoản";
export const REASON_MAX = 200;
export const MAX_BAN_DAYS = 3650;
const SORTS: Record<string, string> = { email: "a.email", created: "a.created_at", name: "c.name", realm: "c.realm * 10 + c.stage", login: "lastSession" };

export interface AccountRow {
  id: string;
  email: string;
  role: string;
  createdAt: number;
  character: string | null;
  realm: number | null;
  stage: number | null;
  lastSession: number | null;
  banned: boolean;
  banForever: boolean;
  banUntil: number | null;
}

export interface AccountQuery {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  size: number;
}

export function parseAccountQuery(params: URLSearchParams): AccountQuery {
  const page = Number(params.get("page") ?? "1");
  const size = Number(params.get("size") ?? "20");
  return {
    q: (params.get("q") ?? "").trim().slice(0, 64),
    sort: params.get("sort") ?? "created",
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
    size: Number.isInteger(size) && size >= 1 ? Math.min(size, 100) : 20,
  };
}

const like = (q: string) => `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
const isBanned = (forever: number, until: number | null, now: number) => forever === 1 || (until !== null && until > now);

interface Raw {
  id: string;
  email: string;
  role: string;
  created_at: number;
  ban_until: number | null;
  ban_forever: number;
  name: string | null;
  realm: number | null;
  stage: number | null;
  lastSession: number | null;
}

export async function listAccounts(db: D1Database, query: AccountQuery, now = Date.now()): Promise<{ rows: AccountRow[]; total: number }> {
  // The tombstone accounts that deleted characters were moved to (see characters-admin deleteCharacter) are not accounts.
  const where = query.q ? "WHERE a.id NOT LIKE 'deleted:%' AND (a.email LIKE ?1 ESCAPE '!' OR c.name LIKE ?1 ESCAPE '!')" : "WHERE a.id NOT LIKE 'deleted:%'";
  const args = query.q ? [like(query.q)] : [];
  const order = `${SORTS[query.sort] ?? SORTS.created} ${query.dir === "asc" ? "ASC" : "DESC"}, a.id`;
  const from = "FROM accounts a LEFT JOIN characters c ON c.account_id = a.id";
  const [page, count] = await Promise.all([
    db
      .prepare(`SELECT a.id, a.email, a.role, a.created_at, a.ban_until, a.ban_forever, c.name, c.realm, c.stage, COALESCE(a.last_login_at, (SELECT MAX(s.created_at) FROM sessions s WHERE s.account_id = a.id)) AS lastSession ${from} ${where} ORDER BY ${order} LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}`)
      .bind(...args)
      .all<Raw>(),
    db.prepare(`SELECT COUNT(*) AS n ${from} ${where}`).bind(...args).first<{ n: number }>(),
  ]);
  return {
    rows: page.results.map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at, character: r.name, realm: r.realm, stage: r.stage, lastSession: r.lastSession, banned: isBanned(r.ban_forever, r.ban_until, now), banForever: r.ban_forever === 1, banUntil: r.ban_until })),
    total: count?.n ?? 0,
  };
}

export interface AccountDetail {
  account: { id: string; email: string; role: string; createdAt: number; banned: boolean; banForever: boolean; banUntil: number | null; banReason: string | null; bannedBy: string | null; sessions: number; lastSession: number | null };
  character: { id: string; name: string; gender: string; realm: number; stage: number; map: string; wallet: Record<string, number> } | null;
}

export async function getAccountDetail(db: D1Database, id: string, now = Date.now()): Promise<AccountDetail | null> {
  const a = await db
    .prepare("SELECT id, email, role, created_at, ban_until, ban_forever, ban_reason, banned_by, (SELECT COUNT(*) FROM sessions s WHERE s.account_id = accounts.id AND s.expires_at > ?) AS sessions, COALESCE(last_login_at, (SELECT MAX(created_at) FROM sessions s WHERE s.account_id = accounts.id)) AS lastSession FROM accounts WHERE id = ?")
    .bind(now, id)
    .first<{ id: string; email: string; role: string; created_at: number; ban_until: number | null; ban_forever: number; ban_reason: string | null; banned_by: string | null; sessions: number; lastSession: number | null }>();
  if (!a) return null;
  const c = await db.prepare("SELECT id, name, gender, realm, stage, map_id FROM characters WHERE account_id = ?").bind(id).first<{ id: string; name: string; gender: string; realm: number; stage: number; map_id: string }>();
  const wallet: Record<string, number> = {};
  if (c) for (const r of (await db.prepare("SELECT currency, balance FROM currency_balances WHERE character_id = ?").bind(c.id).all<{ currency: string; balance: number }>()).results) wallet[r.currency] = r.balance;
  return {
    account: { id: a.id, email: a.email, role: a.role, createdAt: a.created_at, banned: isBanned(a.ban_forever, a.ban_until, now), banForever: a.ban_forever === 1, banUntil: a.ban_until, banReason: a.ban_reason, bannedBy: a.banned_by, sessions: a.sessions, lastSession: a.lastSession },
    character: c ? { id: c.id, name: c.name, gender: c.gender, realm: c.realm, stage: c.stage, map: c.map_id, wallet } : null,
  };
}

export type AccountResult = { ok: true; password?: string; kicked?: boolean } | { ok: false; error: "invalid" | "not_found" | "forbidden" | "unchanged" };

async function target(db: D1Database, id: string): Promise<{ id: string; email: string; role: string; character: string | null } | null> {
  return db.prepare("SELECT a.id, a.email, a.role, c.id AS character FROM accounts a LEFT JOIN characters c ON c.account_id = a.id WHERE a.id = ?").bind(id).first();
}

/** Kicks a character out of the game and the chat (used by the character review too: the accounts' sessions were already ended). */
export function kickCharacter(env: Env, characterId: string, _accountId: string): Promise<boolean> {
  return kick(env, characterId);
}

/** Ends the character's connection (saving it first). A failure is only logged: the sessions are gone, so it cannot come back. */
export async function kick(env: Env, characterId: string | null): Promise<boolean> {
  if (!characterId) return false;
  try {
    await env.CHAR_LOCK.get(env.CHAR_LOCK.idFromName(characterId)).evict(characterId);
    // The chat socket is a separate connection (it only checks the session when it is opened).
    await env.CHAT_HUB.get(env.CHAT_HUB.idFromName("global"), { locationHint: "apac" }).kick(characterId);
    return true;
  } catch (err) {
    console.error("kick failed", characterId, err);
    return false;
  }
}

export interface BanInput {
  forever: boolean;
  days?: number;
  reason: string;
}

export async function banAccount(env: Env, adminEmail: string, id: string, input: BanInput, now = Date.now()): Promise<AccountResult> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 1 || reason.length > REASON_MAX) return { ok: false, error: "invalid" };
  if (!input.forever && !(Number.isInteger(input.days) && input.days! >= 1 && input.days! <= MAX_BAN_DAYS)) return { ok: false, error: "invalid" };
  const t = await target(env.DB, id);
  if (!t) return { ok: false, error: "not_found" };
  if (t.role === "admin") return { ok: false, error: "forbidden" };
  const until = input.forever ? null : now + input.days! * 86_400_000;
  await env.DB.batch([
    env.DB.prepare("UPDATE accounts SET ban_until = ?, ban_forever = ?, ban_reason = ?, banned_by = ? WHERE id = ?").bind(until, input.forever ? 1 : 0, reason, adminEmail, id),
    env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(id),
    logStatement(env.DB, { adminEmail, screen: ACCOUNT_LOG_SCREEN, content: `Ban tài khoản ${t.email}: ${input.forever ? "vĩnh viễn" : `${input.days} ngày`}, lý do: ${reason}` }, now),
  ]);
  return { ok: true, kicked: await kick(env, t.character) };
}

export async function unbanAccount(env: Env, adminEmail: string, id: string, now = Date.now()): Promise<AccountResult> {
  const t = await target(env.DB, id);
  if (!t) return { ok: false, error: "not_found" };
  const row = await env.DB.prepare("SELECT ban_until, ban_forever FROM accounts WHERE id = ?").bind(id).first<{ ban_until: number | null; ban_forever: number }>();
  if (!row || (row.ban_forever === 0 && row.ban_until === null)) return { ok: false, error: "unchanged" };
  await env.DB.batch([
    env.DB.prepare("UPDATE accounts SET ban_until = NULL, ban_forever = 0, ban_reason = NULL, banned_by = NULL WHERE id = ?").bind(id),
    logStatement(env.DB, { adminEmail, screen: ACCOUNT_LOG_SCREEN, content: `Bỏ ban tài khoản ${t.email}` }, now),
  ]);
  return { ok: true };
}

const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
}

/** How the caller hashes a password (the hashing lives in a Durable Object, which this file must not import): `hash(password, salt)` and the iteration count it uses. */
export interface Hasher {
  hash: (password: string, salt: string) => Promise<string>;
  iterations: number;
  newSalt: () => string;
}

/** Sets a random temporary password (returned once, never stored in clear), ends the sessions and kicks the character. */
export async function setTempPassword(env: Env, adminEmail: string, id: string, hasher: Hasher, now = Date.now()): Promise<AccountResult> {
  const t = await target(env.DB, id);
  if (!t) return { ok: false, error: "not_found" };
  if (t.role === "admin") return { ok: false, error: "forbidden" };
  const password = makeTempPassword();
  const salt = hasher.newSalt();
  const hash = await hasher.hash(password, salt);
  await env.DB.batch([
    env.DB.prepare("UPDATE accounts SET pw_hash = ?, pw_salt = ?, pw_iterations = ? WHERE id = ?").bind(hash, salt, hasher.iterations, id),
    env.DB.prepare("DELETE FROM sessions WHERE account_id = ?").bind(id),
    logStatement(env.DB, { adminEmail, screen: ACCOUNT_LOG_SCREEN, content: `Đặt mật khẩu tạm cho tài khoản ${t.email}` }, now),
  ]);
  return { ok: true, password, kicked: await kick(env, t.character) };
}

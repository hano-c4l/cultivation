import { CURRENCIES, currencyGroupOf, isCurrencyGroup, type Currency } from "@game/shared";
import { logStatement } from "./admin-log";
import { HISTORY_TABLE, TOTALS_TABLE } from "./economy";

/**
 * The currency management screens (phase 3b): search the totals per character and group, the detail of one character and currency, and the
 * balance audit (`currency_audit`): run it, confirm a difference (the difference is put in the "admin" group so the history adds up) or mark it handled.
 * Everything here is for admins; the handlers in admin.ts check that.
 */

export const CURRENCY_LABEL_VI: Record<Currency, string> = { tien_ngoc: "Tiên Ngọc", linh_thach: "Linh Thạch", cong_hien: "Cống Hiến" };
export const AUDIT_SCREEN = "Quản lý tiền tệ";
export const MAX_PAGE_SIZE = 100;
export type AuditStatus = "invalid" | "valid" | "handled";

export function parseCurrency(value: string | null): Currency {
  return (CURRENCIES as readonly string[]).includes(value ?? "") ? (value as Currency) : "tien_ngoc";
}

function pageParams(params: URLSearchParams): { page: number; size: number; dir: "asc" | "desc" } {
  const page = Number(params.get("page") ?? "1");
  const size = Number(params.get("size") ?? "20");
  return {
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
    size: Number.isInteger(size) && size >= 1 ? Math.min(size, MAX_PAGE_SIZE) : 20,
    dir: params.get("dir") === "asc" ? "asc" : "desc",
  };
}

function likePattern(q: string): string {
  // "!" is the ESCAPE character in the queries below, so a typed % or _ matches literally.
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
}

/** Dates arrive as YYYY-MM-DD and mean the whole day in Vietnam time (UTC+7), the time zone the game's days follow. */
function dayStart(text: string | null): number | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const ms = Date.parse(`${text}T00:00:00+07:00`);
  return Number.isNaN(ms) ? null : ms;
}

const DAY_MS = 24 * 3600 * 1000;

/** The banned-for-good check of "Xử lý". Accounts cannot be banned yet (that comes with the account screens, 3m), so nobody is. */
export async function isPermanentlyBanned(_db: D1Database, _accountId: string): Promise<boolean> {
  return false;
}

// ---- search: one row per (character, group) ----

export interface SearchQuery {
  currency: Currency;
  account: string;
  character: string;
  group: string;
  sort: (typeof SEARCH_SORTS)[number];
  dir: "asc" | "desc";
  page: number;
  size: number;
}

export const SEARCH_SORTS = ["updated_at", "character_name", "account", "group", "total_in", "total_out"] as const;
const SEARCH_COLUMN: Record<(typeof SEARCH_SORTS)[number], string> = { updated_at: "t.updated_at", character_name: "c.name", account: "a.email", group: "t.grp", total_in: "t.total_in", total_out: "t.total_out" };

export function parseSearch(params: URLSearchParams): SearchQuery {
  const group = params.get("group") ?? "";
  return {
    currency: parseCurrency(params.get("currency")),
    account: (params.get("account") ?? "").trim().slice(0, 64),
    character: (params.get("character") ?? "").trim().slice(0, 64),
    group: isCurrencyGroup(group) ? group : "",
    sort: SEARCH_SORTS.find((s) => s === params.get("sort")) ?? "updated_at",
    ...pageParams(params),
  };
}

export interface SearchRow {
  accountEmail: string | null;
  characterId: string;
  characterName: string | null;
  group: string;
  totalIn: number;
  totalOut: number;
  updatedAt: number;
}

/** The totals of a currency per character and group, filtered by account (email), character (name) and group; every filter is optional. */
export async function searchTotals(db: D1Database, q: SearchQuery): Promise<{ rows: SearchRow[]; total: number }> {
  const table = TOTALS_TABLE[q.currency];
  const parts: string[] = [];
  const args: unknown[] = [];
  if (q.account) {
    parts.push("a.email LIKE ? ESCAPE '!'");
    args.push(likePattern(q.account));
  }
  if (q.character) {
    parts.push("c.name LIKE ? ESCAPE '!'");
    args.push(likePattern(q.character));
  }
  if (q.group) {
    parts.push("t.grp = ?");
    args.push(q.group);
  }
  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  const from = `${table} t LEFT JOIN characters c ON c.id = t.character_id LEFT JOIN accounts a ON a.id = c.account_id`;
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM ${from} ${where}`).bind(...args).first<{ n: number }>();
  // `table`, `sort` and `dir` come from closed lists, so they are safe to put into the statement text.
  const { results } = await db
    .prepare(
      `SELECT a.email AS email, t.character_id, c.name AS name, t.grp, t.total_in, t.total_out, t.updated_at FROM ${from} ${where} ` +
        `ORDER BY ${SEARCH_COLUMN[q.sort]} ${q.dir}, t.character_id, t.grp LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`,
    )
    .bind(...args)
    .all<{ email: string | null; character_id: string; name: string | null; grp: string; total_in: number; total_out: number; updated_at: number }>();
  return {
    rows: results.map((r) => ({ accountEmail: r.email, characterId: r.character_id, characterName: r.name, group: r.grp, totalIn: r.total_in, totalOut: r.total_out, updatedAt: r.updated_at })),
    total: total?.n ?? 0,
  };
}

// ---- detail ----

export interface GroupRow {
  group: string;
  totalIn: number;
  totalOut: number;
  updatedAt: number;
}

export interface Detail {
  currency: Currency;
  account: { id: string; email: string } | null;
  character: { id: string; name: string };
  /** The money the character has now (`currency_balances`), not computed from the history. */
  balance: number;
  groups: GroupRow[];
  /** Money in minus money out over the groups. */
  historyAmount: number;
  /** balance === historyAmount. */
  matches: boolean;
  audit: { status: AuditStatus; checkedAt: number; resolvedAt: number | null } | null;
  banned: boolean;
}

async function readAmounts(db: D1Database, currency: Currency, characterId: string): Promise<{ balance: number; groups: GroupRow[]; historyAmount: number }> {
  const bal = await db.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = ?").bind(characterId, currency).first<{ balance: number }>();
  const { results } = await db
    .prepare(`SELECT grp, total_in, total_out, updated_at FROM ${TOTALS_TABLE[currency]} WHERE character_id = ? ORDER BY grp`)
    .bind(characterId)
    .all<{ grp: string; total_in: number; total_out: number; updated_at: number }>();
  const groups = results.map((r) => ({ group: r.grp, totalIn: r.total_in, totalOut: r.total_out, updatedAt: r.updated_at }));
  return { balance: bal?.balance ?? 0, groups, historyAmount: groups.reduce((n, g) => n + g.totalIn - g.totalOut, 0) };
}

/** The detail of one character and currency; null when the character does not exist. */
export async function getDetail(db: D1Database, currency: Currency, characterId: string): Promise<Detail | null> {
  const ch = await db
    .prepare("SELECT c.id, c.name, a.id AS account_id, a.email FROM characters c LEFT JOIN accounts a ON a.id = c.account_id WHERE c.id = ?")
    .bind(characterId)
    .first<{ id: string; name: string; account_id: string | null; email: string | null }>();
  if (!ch) return null;
  const amounts = await readAmounts(db, currency, characterId);
  const audit = await db
    .prepare("SELECT status, checked_at, resolved_at FROM currency_audit WHERE currency = ? AND character_id = ?")
    .bind(currency, characterId)
    .first<{ status: AuditStatus; checked_at: number; resolved_at: number | null }>();
  return {
    currency,
    account: ch.account_id && ch.email ? { id: ch.account_id, email: ch.email } : null,
    character: { id: ch.id, name: ch.name },
    ...amounts,
    matches: amounts.balance === amounts.historyAmount,
    audit: audit ? { status: audit.status, checkedAt: audit.checked_at, resolvedAt: audit.resolved_at } : null,
    banned: ch.account_id ? await isPermanentlyBanned(db, ch.account_id) : false,
  };
}

// ---- the detailed Tiên Ngọc history (the popup) ----

export interface HistoryQuery {
  characterId: string;
  from: number;
  to: number;
  page: number;
  size: number;
}

export const HISTORY_DEFAULT_DAYS = 30;

/** The range defaults to the last 30 days so the popup never loads a whole history. A date range given in full is used as asked. */
export function parseHistory(params: URLSearchParams, now = Date.now()): HistoryQuery {
  const fromDay = dayStart(params.get("from"));
  const toDay = dayStart(params.get("to"));
  const to = toDay !== null ? toDay + DAY_MS - 1 : now;
  const from = fromDay !== null ? fromDay : to - HISTORY_DEFAULT_DAYS * DAY_MS;
  const { page, size } = pageParams(params);
  return { characterId: (params.get("character") ?? "").slice(0, 64), from: Math.min(from, to), to, page, size };
}

export interface HistoryRow {
  id: number;
  at: number;
  delta: number;
  reason: string;
  group: string;
  actor: string;
}

/** One page of the detailed Tiên Ngọc history of a character within the range, newest first. */
export async function listTienNgocHistory(db: D1Database, q: HistoryQuery): Promise<{ rows: HistoryRow[]; total: number }> {
  const table = HISTORY_TABLE.tien_ngoc;
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE character_id = ? AND created_at BETWEEN ? AND ?`).bind(q.characterId, q.from, q.to).first<{ n: number }>();
  const { results } = await db
    .prepare(
      `SELECT l.id, l.created_at, l.delta, l.reason, l.actor, act.email AS actor_email FROM ${table} l LEFT JOIN accounts act ON act.id = l.actor ` +
        `WHERE l.character_id = ? AND l.created_at BETWEEN ? AND ? ORDER BY l.created_at DESC, l.id DESC LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`,
    )
    .bind(q.characterId, q.from, q.to)
    .all<{ id: number; created_at: number; delta: number; reason: string; actor: string; actor_email: string | null }>();
  return { rows: results.map((r) => ({ id: r.id, at: r.created_at, delta: r.delta, reason: r.reason, group: currencyGroupOf(r.reason), actor: r.actor_email ?? r.actor })), total: total?.n ?? 0 };
}

// ---- the audit ----

const lastKey = (currency: Currency) => `currency_audit_last:${currency}`;

/** When the audit of a currency last ran (a raw key in `game_settings`, which the typed settings loader ignores); null when it never did. */
export async function lastAuditAt(db: D1Database, currency: Currency): Promise<number | null> {
  const row = await db.prepare("SELECT value FROM game_settings WHERE key = ?").bind(lastKey(currency)).first<{ value: string }>();
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const AUDIT_SORTS = ["status", "character_name", "account", "history_amount", "balance_amount", "checked_at"] as const;
const AUDIT_COLUMN: Record<(typeof AUDIT_SORTS)[number], string> = {
  status: "CASE d.status WHEN 'invalid' THEN 0 ELSE 1 END",
  character_name: "c.name",
  account: "a.email",
  history_amount: "d.history_amount",
  balance_amount: "d.balance_amount",
  checked_at: "d.checked_at",
};

export interface AuditRow {
  accountEmail: string | null;
  characterId: string;
  characterName: string | null;
  historyAmount: number;
  balanceAmount: number;
  status: AuditStatus;
  checkedAt: number;
}

export interface AuditPage {
  currency: Currency;
  lastAuditAt: number | null;
  /** Rows still "invalid": while there are any, a new audit cannot start. */
  pendingInvalid: number;
  rows: AuditRow[];
  total: number;
}

export function parseAuditList(params: URLSearchParams): { currency: Currency; sort: (typeof AUDIT_SORTS)[number]; dir: "asc" | "desc"; page: number; size: number } {
  const { page, size, dir } = pageParams(params);
  return { currency: parseCurrency(params.get("currency")), sort: AUDIT_SORTS.find((s) => s === params.get("sort")) ?? "status", dir: params.get("sort") ? dir : "asc", page, size };
}

export async function listAudit(db: D1Database, q: ReturnType<typeof parseAuditList>): Promise<AuditPage> {
  const total = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(status = 'invalid'), 0) AS invalid FROM currency_audit WHERE currency = ?").bind(q.currency).first<{ n: number; invalid: number }>();
  const { results } = await db
    .prepare(
      `SELECT a.email AS email, d.character_id, c.name AS name, d.history_amount, d.balance_amount, d.status, d.checked_at FROM currency_audit d ` +
        `LEFT JOIN characters c ON c.id = d.character_id LEFT JOIN accounts a ON a.id = c.account_id WHERE d.currency = ? ` +
        `ORDER BY ${AUDIT_COLUMN[q.sort]} ${q.dir}, c.name LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}`,
    )
    .bind(q.currency)
    .all<{ email: string | null; character_id: string; name: string | null; history_amount: number; balance_amount: number; status: AuditStatus; checked_at: number }>();
  return {
    currency: q.currency,
    lastAuditAt: await lastAuditAt(db, q.currency),
    pendingInvalid: total?.invalid ?? 0,
    rows: results.map((r) => ({ accountEmail: r.email, characterId: r.character_id, characterName: r.name, historyAmount: r.history_amount, balanceAmount: r.balance_amount, status: r.status, checkedAt: r.checked_at })),
    total: total?.n ?? 0,
  };
}

export type RunResult = { ok: true; checked: number; invalid: number; at: number } | { ok: false; error: "pending_invalid"; invalid: number };

/**
 * Runs the audit of one currency. Refused while any row of the currency is still "invalid". Otherwise: the old rows go, and every character that
 * was active since the last run (its record saved, or this currency's totals changed; everybody on the first run) whose balance differs from
 * money in minus money out is put in the table as "invalid". The run time becomes the new "last audit" time (taken before the work, so
 * changes made during the run are looked at by the next one).
 */
export async function runAudit(db: D1Database, currency: Currency, adminEmail: string, now = Date.now()): Promise<RunResult> {
  const pending = await db.prepare("SELECT COUNT(*) AS n FROM currency_audit WHERE currency = ? AND status = 'invalid'").bind(currency).first<{ n: number }>();
  if ((pending?.n ?? 0) > 0) return { ok: false, error: "pending_invalid", invalid: pending!.n };
  const last = await lastAuditAt(db, currency);
  const table = TOTALS_TABLE[currency];
  await db.batch([
    db.prepare("DELETE FROM currency_audit WHERE currency = ?").bind(currency),
    db
      .prepare(
        `INSERT INTO currency_audit (currency, character_id, history_amount, balance_amount, status, checked_at) ` +
          `SELECT ?1, c.id, COALESCE(h.net, 0), COALESCE(b.balance, 0), 'invalid', ?2 FROM characters c ` +
          `LEFT JOIN (SELECT character_id, SUM(total_in) - SUM(total_out) AS net FROM ${table} GROUP BY character_id) h ON h.character_id = c.id ` +
          `LEFT JOIN currency_balances b ON b.character_id = c.id AND b.currency = ?1 ` +
          `WHERE COALESCE(h.net, 0) <> COALESCE(b.balance, 0) ` +
          `AND (?3 IS NULL OR c.updated_at > ?3 OR c.id IN (SELECT character_id FROM ${table} WHERE updated_at > ?3))`,
      )
      .bind(currency, now, last),
    db
      .prepare("INSERT INTO game_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
      .bind(lastKey(currency), String(now), now, adminEmail),
  ]);
  const counted = await db.prepare("SELECT COUNT(*) AS n FROM currency_audit WHERE currency = ?").bind(currency).first<{ n: number }>();
  const checked = await db
    .prepare(`SELECT COUNT(*) AS n FROM characters c WHERE ?1 IS NULL OR c.updated_at > ?1 OR c.id IN (SELECT character_id FROM ${table} WHERE updated_at > ?1)`)
    .bind(last)
    .first<{ n: number }>();
  return { ok: true, checked: checked?.n ?? 0, invalid: counted?.n ?? 0, at: now };
}

/** What the admin saw on the detail screen; a resolve is refused (`stale`) when the numbers are not those any more. */
export interface Seen {
  balance: number;
  historyAmount: number;
}

export type ResolveResult =
  | { ok: true; difference: number }
  | { ok: false; error: "not_found" | "not_invalid" | "stale" | "still_mismatch"; difference?: number };

const signed = (n: number) => (n > 0 ? `+${n.toLocaleString("vi-VN")}` : n.toLocaleString("vi-VN"));

interface Admin {
  id: string;
  email: string;
}

async function loadForResolve(db: D1Database, currency: Currency, characterId: string) {
  const detail = await getDetail(db, currency, characterId);
  if (!detail) return null;
  return detail;
}

/** The guard statements that make a resolve fail (and roll back) when the audit row or the numbers moved since they were read. */
function guards(db: D1Database, currency: Currency, characterId: string, balance: number, history: number, needMatch: boolean): D1PreparedStatement[] {
  const totals = TOTALS_TABLE[currency];
  const list = [db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM currency_audit WHERE currency = ? AND character_id = ? AND status = 'invalid')").bind(currency, characterId)];
  const changed = `COALESCE((SELECT balance FROM currency_balances WHERE character_id = ?1 AND currency = ?2), 0) <> ?3 OR COALESCE((SELECT SUM(total_in) - SUM(total_out) FROM ${totals} WHERE character_id = ?1), 0) <> ?4`;
  list.push(db.prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE ${changed}`).bind(characterId, currency, balance, history));
  if (needMatch) list.push(db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE ?1 <> ?2").bind(balance, history));
  return list;
}

function resolveError(err: unknown): ResolveResult {
  if (String(err).includes("inv_guard")) return { ok: false, error: "stale" };
  throw err;
}

/**
 * "Xác nhận": the difference between the balance and the history is accepted. It goes into the history as an adjustment in the "admin" group
 * (money in when the balance is higher, money out when it is lower) so that the two agree and the next audit finds nothing; the balance
 * is not touched. Tiên Ngọc and Linh Thạch also get a detailed history row (an admin did it). The audit row becomes "valid" and the admin
 * log gets a line, all in one batch that fails if anything moved since it was read.
 */
export async function confirmEntry(db: D1Database, currency: Currency, characterId: string, admin: Admin, now = Date.now(), seen?: Seen): Promise<ResolveResult> {
  const d = await loadForResolve(db, currency, characterId);
  if (!d) return { ok: false, error: "not_found" };
  if (d.audit?.status !== "invalid") return { ok: false, error: "not_invalid" };
  if (seen && (seen.balance !== d.balance || seen.historyAmount !== d.historyAmount)) return { ok: false, error: "stale" };
  const diff = d.balance - d.historyAmount;
  const statements = guards(db, currency, characterId, d.balance, d.historyAmount, false);
  if (diff !== 0) {
    statements.push(
      db
        .prepare(
          `INSERT INTO ${TOTALS_TABLE[currency]} (character_id, grp, total_in, total_out, updated_at) VALUES (?, 'admin', ?, ?, ?) ` +
            "ON CONFLICT (character_id, grp) DO UPDATE SET total_in = total_in + excluded.total_in, total_out = total_out + excluded.total_out, updated_at = excluded.updated_at",
        )
        .bind(characterId, diff > 0 ? diff : 0, diff < 0 ? -diff : 0, now),
    );
    const history = HISTORY_TABLE[currency];
    if (history) statements.push(db.prepare(`INSERT INTO ${history} (character_id, delta, reason, actor, created_at) VALUES (?, ?, 'admin_adjust:audit', ?, ?)`).bind(characterId, diff, admin.id, now));
  }
  statements.push(
    db.prepare("UPDATE currency_audit SET status = 'valid', history_amount = ?, resolved_by = ?, resolved_at = ? WHERE currency = ? AND character_id = ?").bind(d.balance, admin.id, now, currency, characterId),
    logStatement(db, { adminEmail: admin.email, screen: AUDIT_SCREEN, content: `Kiểm duyệt - Đã xác nhận tài khoản ${d.account?.email ?? "?"} nhân vật ${d.character.name} khoản lệch ${signed(diff)} ${CURRENCY_LABEL_VI[currency]}` }, now),
  );
  try {
    await db.batch(statements);
  } catch (err) {
    return resolveError(err);
  }
  return { ok: true, difference: diff };
}

/**
 * "Xử lý": the audit row is marked "handled" when the numbers agree now (the admin dealt with it some other way) or the account is banned for
 * good (then they do not have to agree). Otherwise it is refused and nothing changes.
 */
export async function handleEntry(db: D1Database, currency: Currency, characterId: string, admin: Admin, now = Date.now(), seen?: Seen): Promise<ResolveResult> {
  const d = await loadForResolve(db, currency, characterId);
  if (!d) return { ok: false, error: "not_found" };
  if (d.audit?.status !== "invalid") return { ok: false, error: "not_invalid" };
  if (seen && (seen.balance !== d.balance || seen.historyAmount !== d.historyAmount)) return { ok: false, error: "stale" };
  const diff = d.balance - d.historyAmount;
  if (diff !== 0 && !d.banned) return { ok: false, error: "still_mismatch", difference: diff };
  const statements = guards(db, currency, characterId, d.balance, d.historyAmount, diff !== 0 ? false : true);
  statements.push(
    db.prepare("UPDATE currency_audit SET status = 'handled', resolved_by = ?, resolved_at = ? WHERE currency = ? AND character_id = ?").bind(admin.id, now, currency, characterId),
    logStatement(db, { adminEmail: admin.email, screen: AUDIT_SCREEN, content: `Kiểm duyệt - Đã xử lý tài khoản ${d.account?.email ?? "?"} nhân vật ${d.character.name} khoản lệch ${signed(diff)} ${CURRENCY_LABEL_VI[currency]}${diff !== 0 ? " (tài khoản bị khóa vĩnh viễn)" : ""}` }, now),
  );
  try {
    await db.batch(statements);
  } catch (err) {
    return resolveError(err);
  }
  return { ok: true, difference: diff };
}

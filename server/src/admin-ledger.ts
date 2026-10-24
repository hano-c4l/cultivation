import { CURRENCIES, type Currency } from "@game/shared";

/**
 * Read-only views of the currency tables for the admin screens (restructure of 2026-10-24, docs/PHASE3.md):
 *  - the detailed history of one currency (`tien_ngoc_ledger`, `linh_thach_ledger`: Linh Thạch has only its big changes and the admin's),
 *  - the totals per character and reason group (`<currency>_totals`, small tables: the fast view, with the balance next to the net).
 * Each currency has its own tables, so a query on one never reads another's rows.
 */

export interface CurrencyFilter {
  currency: Currency;
  /** Searches the character name, the owner's email and (history only) the reason. */
  q: string;
  /** A reason group: the reason up to the first ":" ("shop_buy" matches "shop_buy" and "shop_buy:ren_giu_cap:1"). */
  reason: string;
  /** Exact character id; empty for everybody. */
  character: string;
  /** Inclusive time range in ms (history only); null for open ended. */
  from: number | null;
  to: number | null;
}

export const HISTORY_SORTS = ["id", "created_at", "delta", "reason", "character_name"] as const;
export const TOTALS_SORTS = ["character_name", "total_in", "total_out", "net", "entries", "balance", "diff"] as const;
export const MAX_PAGE_SIZE = 100;

export interface PageQuery<S extends string> {
  sort: S;
  dir: "asc" | "desc";
  page: number;
  size: number;
}

const HISTORY_TABLE: Partial<Record<Currency, string>> = { tien_ngoc: "tien_ngoc_ledger", linh_thach: "linh_thach_ledger" };
const TOTALS_TABLE: Record<Currency, string> = { tien_ngoc: "tien_ngoc_totals", linh_thach: "linh_thach_totals", cong_hien: "cong_hien_totals" };

/** Dates arrive as YYYY-MM-DD and mean the whole day in Vietnam time (UTC+7), the time zone the game's days follow. */
function dayStart(text: string | null): number | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const ms = Date.parse(`${text}T00:00:00+07:00`);
  return Number.isNaN(ms) ? null : ms;
}

function dayEnd(text: string | null): number | null {
  const start = dayStart(text);
  return start === null ? null : start + 24 * 3600 * 1000 - 1;
}

/** Reads the filter; a currency outside `allowed` (or missing) becomes the first allowed one. */
export function parseCurrencyFilter(params: URLSearchParams, allowed: readonly Currency[]): CurrencyFilter {
  const asked = params.get("currency") ?? "";
  const currency = (CURRENCIES as readonly string[]).includes(asked) && allowed.includes(asked as Currency) ? (asked as Currency) : allowed[0]!;
  const reason = (params.get("reason") ?? params.get("group") ?? "").trim();
  const character = (params.get("character") ?? "").trim();
  return {
    currency,
    q: (params.get("q") ?? "").trim().slice(0, 64),
    reason: /^[a-z_]{1,40}$/.test(reason) ? reason : "",
    character: character.length <= 64 ? character : "",
    from: dayStart(params.get("from")),
    to: dayEnd(params.get("to")),
  };
}

export function parsePageQuery<S extends string>(params: URLSearchParams, sorts: readonly S[], defaultSort: S): PageQuery<S> {
  const sort = sorts.find((s) => s === params.get("sort")) ?? defaultSort;
  const page = Number(params.get("page") ?? "1");
  const size = Number(params.get("size") ?? "20");
  return {
    sort,
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
    size: Number.isInteger(size) && size >= 1 ? Math.min(size, MAX_PAGE_SIZE) : 20,
  };
}

function likePattern(q: string): string {
  // "!" is the ESCAPE character in the queries below, so a typed % or _ matches literally.
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
}

const GROUP_EXPR = "CASE WHEN instr(l.reason, ':') > 0 THEN substr(l.reason, 1, instr(l.reason, ':') - 1) ELSE l.reason END";

interface Where {
  sql: string;
  args: unknown[];
}

/** `alias` is the table with the character_id (and reason/grp) column; `reasonSql` the SQL for its reason group. */
function whereOf(f: CurrencyFilter, alias: string, opts: { reasonColumn: string | null; groupSql: string; withGroup: boolean; withTime: boolean }): Where {
  const parts: string[] = [];
  const args: unknown[] = [];
  if (f.q) {
    const p = likePattern(f.q);
    const reason = opts.reasonColumn ? ` OR ${opts.reasonColumn} LIKE ? ESCAPE '!'` : "";
    parts.push(`(c.name LIKE ? ESCAPE '!' OR a.email LIKE ? ESCAPE '!'${reason})`);
    args.push(p, p, ...(opts.reasonColumn ? [p] : []));
  }
  if (opts.withGroup && f.reason) {
    parts.push(`${opts.groupSql} = ?`);
    args.push(f.reason);
  }
  if (f.character) {
    parts.push(`${alias}.character_id = ?`);
    args.push(f.character);
  }
  if (opts.withTime && f.from !== null) {
    parts.push(`${alias}.created_at >= ?`);
    args.push(f.from);
  }
  if (opts.withTime && f.to !== null) {
    parts.push(`${alias}.created_at <= ?`);
    args.push(f.to);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", args };
}

const JOINS = "LEFT JOIN characters c ON c.id = l.character_id LEFT JOIN accounts a ON a.id = c.account_id";

export interface HistoryRow {
  id: number;
  at: number;
  delta: number;
  reason: string;
  characterId: string;
  characterName: string | null;
  email: string | null;
  /** Who caused it: an admin's email, or "system". */
  actor: string;
}

export interface GroupTotals {
  group: string;
  entries: number;
  totalIn: number;
  totalOut: number;
}

export interface HistoryPage {
  rows: HistoryRow[];
  total: number;
  /** Over everything the filter matches (not just this page): money in and money out, both as positive numbers. */
  summary: { totalIn: number; totalOut: number };
  /** The totals per reason group for the filter without its reason group (so the breakdown stays while one group is picked). */
  groups: GroupTotals[];
}

const HISTORY_COLUMN: Record<(typeof HISTORY_SORTS)[number], string> = { id: "l.id", created_at: "l.created_at", delta: "l.delta", reason: "l.reason", character_name: "c.name" };

/** One page of a currency's history table. Only Tiên Ngọc and Linh Thạch have one. */
export async function listHistory(db: D1Database, f: CurrencyFilter, page: PageQuery<(typeof HISTORY_SORTS)[number]>): Promise<HistoryPage> {
  const table = HISTORY_TABLE[f.currency];
  if (!table) throw new Error(`no history table for ${f.currency}`);
  const opts = { reasonColumn: "l.reason", groupSql: `(${GROUP_EXPR})`, withGroup: true, withTime: true };
  const w = whereOf(f, "l", opts);
  const totals = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN l.delta > 0 THEN l.delta END), 0) AS total_in, COALESCE(-SUM(CASE WHEN l.delta < 0 THEN l.delta END), 0) AS total_out FROM ${table} l ${JOINS} ${w.sql}`)
    .bind(...w.args)
    .first<{ n: number; total_in: number; total_out: number }>();
  // `table`, `sort` and `dir` come from closed lists, so they are safe to put into the statement text.
  const { results } = await db
    .prepare(
      `SELECT l.id, l.created_at, l.delta, l.reason, l.character_id, c.name AS character_name, a.email AS email, l.actor, act.email AS actor_email ` +
        `FROM ${table} l ${JOINS} LEFT JOIN accounts act ON act.id = l.actor ${w.sql} ` +
        `ORDER BY ${HISTORY_COLUMN[page.sort]} ${page.dir}, l.id DESC LIMIT ${page.size} OFFSET ${(page.page - 1) * page.size}`,
    )
    .bind(...w.args)
    .all<{ id: number; created_at: number; delta: number; reason: string; character_id: string; character_name: string | null; email: string | null; actor: string; actor_email: string | null }>();
  const g = whereOf(f, "l", { ...opts, withGroup: false });
  const { results: groups } = await db
    .prepare(
      `SELECT ${GROUP_EXPR} AS grp, COUNT(*) AS n, COALESCE(SUM(CASE WHEN l.delta > 0 THEN l.delta END), 0) AS total_in, COALESCE(-SUM(CASE WHEN l.delta < 0 THEN l.delta END), 0) AS total_out ` +
        `FROM ${table} l ${JOINS} ${g.sql} GROUP BY grp ORDER BY n DESC LIMIT 40`,
    )
    .bind(...g.args)
    .all<{ grp: string; n: number; total_in: number; total_out: number }>();
  return {
    rows: results.map((r) => ({ id: r.id, at: r.created_at, delta: r.delta, reason: r.reason, characterId: r.character_id, characterName: r.character_name, email: r.email, actor: r.actor_email ?? r.actor })),
    total: totals?.n ?? 0,
    summary: { totalIn: totals?.total_in ?? 0, totalOut: totals?.total_out ?? 0 },
    groups: groups.map((r) => ({ group: r.grp, entries: r.n, totalIn: r.total_in, totalOut: r.total_out })),
  };
}

export interface TotalsRow {
  characterId: string;
  characterName: string | null;
  email: string | null;
  entries: number;
  totalIn: number;
  /** Money out as a positive number (the totals table keeps it unsigned). */
  totalOut: number;
  net: number;
  /** The balance now (`currency_balances`). */
  balance: number;
  /** balance - net: anything but 0 means the two disagree (a balance edited by hand, or a bug). */
  diff: number;
}

export interface TotalsPage {
  rows: TotalsRow[];
  /** Characters matching the filter. */
  total: number;
  summary: { totalIn: number; totalOut: number; net: number; balance: number };
  /** The totals per reason group for the filter without its group. */
  groups: GroupTotals[];
}

const TOTALS_COLUMN: Record<(typeof TOTALS_SORTS)[number], string> = { character_name: "c.name", total_in: "total_in", total_out: "total_out", net: "net", entries: "entries", balance: "balance", diff: "ABS(diff)" };

/** The per-character totals of one currency from its `<currency>_totals` table, with the balance next to the net. */
export async function listTotals(db: D1Database, f: CurrencyFilter, page: PageQuery<(typeof TOTALS_SORTS)[number]>): Promise<TotalsPage> {
  const table = TOTALS_TABLE[f.currency];
  const opts = { reasonColumn: null, groupSql: "l.grp", withGroup: true, withTime: false };
  const w = whereOf(f, "l", opts);
  const per = `SELECT l.character_id, SUM(l.total_in) AS total_in, SUM(l.total_out) AS total_out, SUM(l.entries) AS entries FROM ${table} l ${JOINS} ${w.sql} GROUP BY l.character_id`;
  const count = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_in), 0) AS total_in, COALESCE(SUM(total_out), 0) AS total_out FROM (${per})`).bind(...w.args).first<{ n: number; total_in: number; total_out: number }>();
  const { results } = await db
    .prepare(
      `SELECT p.character_id, c.name AS character_name, a.email AS email, p.entries, p.total_in, p.total_out, p.total_in - p.total_out AS net, ` +
        `COALESCE(b.balance, 0) AS balance, COALESCE(b.balance, 0) - (p.total_in - p.total_out) AS diff ` +
        `FROM (${per}) p LEFT JOIN characters c ON c.id = p.character_id LEFT JOIN accounts a ON a.id = c.account_id ` +
        `LEFT JOIN currency_balances b ON b.character_id = p.character_id AND b.currency = '${f.currency}' ` +
        `ORDER BY ${TOTALS_COLUMN[page.sort]} ${page.dir}, p.character_id LIMIT ${page.size} OFFSET ${(page.page - 1) * page.size}`,
    )
    .bind(...w.args)
    .all<{ character_id: string; character_name: string | null; email: string | null; entries: number; total_in: number; total_out: number; net: number; balance: number; diff: number }>();
  // The balance of everyone the filter matches (not only this page), to put next to the net of the whole set.
  const bal = await db
    .prepare(`SELECT COALESCE(SUM(b.balance), 0) AS balance FROM currency_balances b WHERE b.currency = '${f.currency}' AND b.character_id IN (SELECT character_id FROM (${per}))`)
    .bind(...w.args)
    .first<{ balance: number }>();
  const g = whereOf(f, "l", { ...opts, withGroup: false });
  const { results: groups } = await db
    .prepare(`SELECT l.grp AS grp, SUM(l.entries) AS n, SUM(l.total_in) AS total_in, SUM(l.total_out) AS total_out FROM ${table} l ${JOINS} ${g.sql} GROUP BY l.grp ORDER BY n DESC LIMIT 40`)
    .bind(...g.args)
    .all<{ grp: string; n: number; total_in: number; total_out: number }>();
  return {
    rows: results.map((r) => ({ characterId: r.character_id, characterName: r.character_name, email: r.email, entries: r.entries, totalIn: r.total_in, totalOut: r.total_out, net: r.net, balance: r.balance, diff: r.diff })),
    total: count?.n ?? 0,
    summary: { totalIn: count?.total_in ?? 0, totalOut: count?.total_out ?? 0, net: (count?.total_in ?? 0) - (count?.total_out ?? 0), balance: bal?.balance ?? 0 },
    groups: groups.map((r) => ({ group: r.grp, entries: r.n, totalIn: r.total_in, totalOut: r.total_out })),
  };
}

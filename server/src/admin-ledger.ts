import { CURRENCIES, type Currency } from "@game/shared";

/** Read-only views of the currency ledger for the admin "Lịch sử Tiên Ngọc" screens (and the other two currencies). */

export type LedgerCurrency = Currency | "all";

export interface LedgerFilter {
  /** One currency, or "all". Tiên Ngọc is the default of the screen. */
  currency: LedgerCurrency;
  /** Searches the character name, the owner's email and the reason. */
  q: string;
  /** A reason group: the reason up to the first ":" ("shop_buy" matches "shop_buy" and "shop_buy:ren_giu_cap:1"). */
  reason: string;
  /** Exact character id; empty for everybody. */
  character: string;
  /** Inclusive time range in ms; null for open ended. */
  from: number | null;
  to: number | null;
}

export const LEDGER_SORTS = ["id", "created_at", "delta", "reason", "character_name"] as const;
export const PEOPLE_SORTS = ["character_name", "total_in", "total_out", "net", "entries", "balance"] as const;
export const LEDGER_MAX_PAGE_SIZE = 100;

export interface PageQuery<S extends string> {
  sort: S;
  dir: "asc" | "desc";
  page: number;
  size: number;
}

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

export function parseLedgerFilter(params: URLSearchParams): LedgerFilter {
  const currencyParam = params.get("currency");
  const currency: LedgerCurrency = currencyParam === "all" ? "all" : (CURRENCIES as readonly string[]).includes(currencyParam ?? "") ? (currencyParam as Currency) : "tien_ngoc";
  const reason = (params.get("reason") ?? "").trim();
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
    size: Number.isInteger(size) && size >= 1 ? Math.min(size, LEDGER_MAX_PAGE_SIZE) : 20,
  };
}

function likePattern(q: string): string {
  // "!" is the ESCAPE character in the queries below, so a typed % or _ matches literally.
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
}

const FROM_CLAUSE = "currency_ledger l LEFT JOIN characters c ON c.id = l.character_id LEFT JOIN accounts a ON a.id = c.account_id";
const GROUP_EXPR = "CASE WHEN instr(l.reason, ':') > 0 THEN substr(l.reason, 1, instr(l.reason, ':') - 1) ELSE l.reason END";

function whereOf(f: LedgerFilter, withReason = true): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  if (f.currency !== "all") {
    parts.push("l.currency = ?");
    args.push(f.currency);
  }
  if (f.q) {
    parts.push("(c.name LIKE ? ESCAPE '!' OR a.email LIKE ? ESCAPE '!' OR l.reason LIKE ? ESCAPE '!')");
    const p = likePattern(f.q);
    args.push(p, p, p);
  }
  if (withReason && f.reason) {
    parts.push("(l.reason = ? OR l.reason LIKE ? ESCAPE '!')");
    args.push(f.reason, `${f.reason.replace(/[!%_]/g, (ch) => `!${ch}`)}:%`);
  }
  if (f.character) {
    parts.push("l.character_id = ?");
    args.push(f.character);
  }
  if (f.from !== null) {
    parts.push("l.created_at >= ?");
    args.push(f.from);
  }
  if (f.to !== null) {
    parts.push("l.created_at <= ?");
    args.push(f.to);
  }
  return { sql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", args };
}

export interface LedgerRow {
  id: number;
  at: number;
  currency: Currency;
  delta: number;
  reason: string;
  characterId: string;
  characterName: string | null;
  email: string | null;
  /** Who caused it: an admin's email, or "system". */
  actor: string;
}

export interface LedgerGroup {
  reason: string;
  entries: number;
  totalIn: number;
  totalOut: number;
}

export interface LedgerPage {
  rows: LedgerRow[];
  total: number;
  /** Over everything the filter matches (not just this page): money in, money out (negative), entry count. */
  summary: { totalIn: number; totalOut: number };
  /** The same totals per reason group, for the filter without the reason (so the breakdown stays visible while one reason is picked). */
  groups: LedgerGroup[];
}

const SORT_COLUMN: Record<(typeof LEDGER_SORTS)[number], string> = { id: "l.id", created_at: "l.created_at", delta: "l.delta", reason: "l.reason", character_name: "c.name" };

/** One page of ledger rows with the totals of the whole filtered set and the per-reason breakdown. */
export async function listLedger(db: D1Database, f: LedgerFilter, page: PageQuery<(typeof LEDGER_SORTS)[number]>): Promise<LedgerPage> {
  const w = whereOf(f);
  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN l.delta > 0 THEN l.delta END), 0) AS total_in, COALESCE(SUM(CASE WHEN l.delta < 0 THEN l.delta END), 0) AS total_out FROM ${FROM_CLAUSE} ${w.sql}`,
    )
    .bind(...w.args)
    .first<{ n: number; total_in: number; total_out: number }>();
  // `sort` and `dir` come from closed lists (parsePageQuery), so they are safe to put into the statement text.
  const { results } = await db
    .prepare(
      `SELECT l.id, l.created_at, l.currency, l.delta, l.reason, l.character_id, c.name AS character_name, a.email AS email, l.actor, act.email AS actor_email ` +
        `FROM ${FROM_CLAUSE} LEFT JOIN accounts act ON act.id = l.actor ${w.sql} ` +
        `ORDER BY ${SORT_COLUMN[page.sort]} ${page.dir}, l.id DESC LIMIT ${page.size} OFFSET ${(page.page - 1) * page.size}`,
    )
    .bind(...w.args)
    .all<{ id: number; created_at: number; currency: Currency; delta: number; reason: string; character_id: string; character_name: string | null; email: string | null; actor: string; actor_email: string | null }>();
  const g = whereOf(f, false);
  const { results: groups } = await db
    .prepare(
      `SELECT ${GROUP_EXPR} AS grp, COUNT(*) AS n, COALESCE(SUM(CASE WHEN l.delta > 0 THEN l.delta END), 0) AS total_in, COALESCE(SUM(CASE WHEN l.delta < 0 THEN l.delta END), 0) AS total_out ` +
        `FROM ${FROM_CLAUSE} ${g.sql} GROUP BY grp ORDER BY n DESC LIMIT 40`,
    )
    .bind(...g.args)
    .all<{ grp: string; n: number; total_in: number; total_out: number }>();
  return {
    rows: results.map((r) => ({
      id: r.id,
      at: r.created_at,
      currency: r.currency,
      delta: r.delta,
      reason: r.reason,
      characterId: r.character_id,
      characterName: r.character_name,
      email: r.email,
      actor: r.actor_email ?? r.actor,
    })),
    total: totals?.n ?? 0,
    summary: { totalIn: totals?.total_in ?? 0, totalOut: totals?.total_out ?? 0 },
    groups: groups.map((r) => ({ reason: r.grp, entries: r.n, totalIn: r.total_in, totalOut: r.total_out })),
  };
}

export interface PeopleRow {
  characterId: string;
  characterName: string | null;
  email: string | null;
  entries: number;
  totalIn: number;
  totalOut: number;
  net: number;
  /** The balance now, not within the filtered range. */
  balance: number;
}

const PEOPLE_COLUMN: Record<(typeof PEOPLE_SORTS)[number], string> = { character_name: "c.name", total_in: "total_in", total_out: "total_out", net: "net", entries: "entries", balance: "balance" };

/** Per character: how much came in and went out of one currency within the filter. "all" is not meaningful here and counts as Tiên Ngọc. */
export async function listPeople(db: D1Database, filter: LedgerFilter, page: PageQuery<(typeof PEOPLE_SORTS)[number]>): Promise<{ rows: PeopleRow[]; total: number }> {
  const f: LedgerFilter = { ...filter, currency: filter.currency === "all" ? "tien_ngoc" : filter.currency };
  const w = whereOf(f);
  const count = await db.prepare(`SELECT COUNT(DISTINCT l.character_id) AS n FROM ${FROM_CLAUSE} ${w.sql}`).bind(...w.args).first<{ n: number }>();
  const { results } = await db
    .prepare(
      `SELECT l.character_id, c.name AS character_name, a.email AS email, COUNT(*) AS entries, ` +
        `COALESCE(SUM(CASE WHEN l.delta > 0 THEN l.delta END), 0) AS total_in, COALESCE(SUM(CASE WHEN l.delta < 0 THEN l.delta END), 0) AS total_out, ` +
        `SUM(l.delta) AS net, COALESCE(b.balance, 0) AS balance ` +
        `FROM ${FROM_CLAUSE} LEFT JOIN currency_balances b ON b.character_id = l.character_id AND b.currency = l.currency ${w.sql} ` +
        `GROUP BY l.character_id ORDER BY ${PEOPLE_COLUMN[page.sort]} ${page.dir}, l.character_id LIMIT ${page.size} OFFSET ${(page.page - 1) * page.size}`,
    )
    .bind(...w.args)
    .all<{ character_id: string; character_name: string | null; email: string | null; entries: number; total_in: number; total_out: number; net: number; balance: number }>();
  return {
    rows: results.map((r) => ({ characterId: r.character_id, characterName: r.character_name, email: r.email, entries: r.entries, totalIn: r.total_in, totalOut: r.total_out, net: r.net, balance: r.balance })),
    total: count?.n ?? 0,
  };
}

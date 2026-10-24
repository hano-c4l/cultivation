/** The admin change log (table `admin_audit`): one row per admin action, written after the action succeeded. */

export interface AuditEntry {
  adminId: string;
  adminEmail: string;
  /** Short machine name of the action, e.g. "currency_grant", "setting_change". */
  action: string;
  /** What kind of thing was changed ("character", "setting", "constitution_catalogue"...) and which one. */
  targetType: string;
  targetId?: string;
  /** One line a person can read in the list. */
  summary?: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditRow {
  id: number;
  at: number;
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
}

export interface AuditDetail extends AuditRow {
  before: unknown;
  after: unknown;
}

const MAX_JSON_CHARS = 60_000;

function toJson(value: unknown): string | null {
  if (value === undefined) return null;
  const text = JSON.stringify(value);
  // A whole catalogue can be big: keep the log row bounded rather than refusing the action that is being logged.
  return text.length > MAX_JSON_CHARS ? JSON.stringify({ truncated: true, chars: text.length }) : text;
}

/**
 * Records one admin action. It never throws: the action already happened, so a log failure is reported to the console and the
 * caller carries on. Returns the new row id, or null when the write failed.
 */
export async function recordAudit(db: D1Database, entry: AuditEntry): Promise<number | null> {
  try {
    const row = await db
      .prepare(
        "INSERT INTO admin_audit (at, admin_id, admin_email, action, target_type, target_id, summary, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
      )
      .bind(
        Date.now(),
        entry.adminId,
        entry.adminEmail,
        entry.action.slice(0, 60),
        entry.targetType.slice(0, 60),
        (entry.targetId ?? "").slice(0, 80),
        (entry.summary ?? "").slice(0, 300),
        toJson(entry.before),
        toJson(entry.after),
      )
      .first<{ id: number }>();
    return row?.id ?? null;
  } catch (err) {
    console.error("audit write failed", entry.action, err);
    return null;
  }
}

export const AUDIT_SORTS = ["id", "at", "admin_email", "action", "target_type"] as const;
export type AuditSort = (typeof AUDIT_SORTS)[number];

export interface AuditQuery {
  q: string;
  sort: AuditSort;
  dir: "asc" | "desc";
  page: number;
  size: number;
}

export const AUDIT_MAX_PAGE_SIZE = 100;

/** Parses list parameters from the query string, clamping anything out of range to a safe default. */
export function parseAuditQuery(params: URLSearchParams): AuditQuery {
  const sort = AUDIT_SORTS.find((s) => s === params.get("sort")) ?? "id";
  const page = Number(params.get("page") ?? "1");
  const size = Number(params.get("size") ?? "20");
  return {
    q: (params.get("q") ?? "").trim().slice(0, 64),
    sort,
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
    size: Number.isInteger(size) && size >= 1 ? Math.min(size, AUDIT_MAX_PAGE_SIZE) : 20,
  };
}

function likePattern(q: string): string {
  // "!" is the ESCAPE character in the query below, so a typed % or _ matches literally.
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
}

type RawRow = { id: number; at: number; admin_id: string; admin_email: string; action: string; target_type: string; target_id: string; summary: string };

function toRow(r: RawRow): AuditRow {
  return { id: r.id, at: r.at, adminId: r.admin_id, adminEmail: r.admin_email, action: r.action, targetType: r.target_type, targetId: r.target_id, summary: r.summary };
}

/** One page of the log (searched over admin, action, target and summary) and the number of matching rows. */
export async function listAudit(db: D1Database, query: AuditQuery): Promise<{ rows: AuditRow[]; total: number }> {
  const where = query.q
    ? "WHERE admin_email LIKE ?1 ESCAPE '!' OR action LIKE ?1 ESCAPE '!' OR target_type LIKE ?1 ESCAPE '!' OR target_id LIKE ?1 ESCAPE '!' OR summary LIKE ?1 ESCAPE '!'"
    : "";
  const args = query.q ? [likePattern(query.q)] : [];
  const totalRow = await db.prepare(`SELECT COUNT(*) AS n FROM admin_audit ${where}`).bind(...args).first<{ n: number }>();
  // `sort` and `dir` come from closed lists (parseAuditQuery), so they are safe to put into the statement text.
  const { results } = await db
    .prepare(
      `SELECT id, at, admin_id, admin_email, action, target_type, target_id, summary FROM admin_audit ${where} ORDER BY ${query.sort} ${query.dir}, id DESC LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}`,
    )
    .bind(...args)
    .all<RawRow>();
  return { rows: results.map(toRow), total: totalRow?.n ?? 0 };
}

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** One log row with its before and after values, or null when there is no such row. */
export async function getAuditEntry(db: D1Database, id: number): Promise<AuditDetail | null> {
  const r = await db
    .prepare("SELECT id, at, admin_id, admin_email, action, target_type, target_id, summary, before, after FROM admin_audit WHERE id = ?")
    .bind(id)
    .first<RawRow & { before: string | null; after: string | null }>();
  return r ? { ...toRow(r), before: parseJson(r.before), after: parseJson(r.after) } : null;
}

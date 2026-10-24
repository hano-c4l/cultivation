/**
 * The admin log (table `admin_log`): one row for every action of an admin that changes data in the database: when, who, on which screen
 * and a sentence saying what was done. No before/after values. Rows are only added.
 */

export interface AdminLogEntry {
  adminEmail: string;
  /** The screen (or area) the action belongs to, e.g. "Quản lý tiền tệ", "Cài đặt game". */
  screen: string;
  /** What was done, in a sentence a person can read. */
  content: string;
}

export interface AdminLogRow {
  id: number;
  at: number;
  adminEmail: string;
  screen: string;
  content: string;
}

/** The INSERT as a statement, so an action can write its log row in the same batch as the change itself. */
export function logStatement(db: D1Database, entry: AdminLogEntry, now = Date.now()): D1PreparedStatement {
  return db
    .prepare("INSERT INTO admin_log (at, admin_email, screen, content) VALUES (?, ?, ?, ?)")
    .bind(now, entry.adminEmail.slice(0, 120), entry.screen.slice(0, 60), entry.content.slice(0, 500));
}

/** Writes one row after the action succeeded. Never throws: the action already happened, so a failed log write only goes to the console. */
export async function logAdmin(db: D1Database, entry: AdminLogEntry): Promise<void> {
  try {
    await logStatement(db, entry).run();
  } catch (err) {
    console.error("admin log write failed", entry.screen, err);
  }
}

export const LOG_MAX_PAGE_SIZE = 100;

export interface LogQuery {
  q: string;
  page: number;
  size: number;
}

export function parseLogQuery(params: URLSearchParams): LogQuery {
  const page = Number(params.get("page") ?? "1");
  const size = Number(params.get("size") ?? "20");
  return {
    q: (params.get("q") ?? "").trim().slice(0, 64),
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
    size: Number.isInteger(size) && size >= 1 ? Math.min(size, LOG_MAX_PAGE_SIZE) : 20,
  };
}

function likePattern(q: string): string {
  // "!" is the ESCAPE character in the query below, so a typed % or _ matches literally.
  return `%${q.replace(/[!%_]/g, (ch) => `!${ch}`)}%`;
}

/** One page of the log, newest first, searched over admin, screen and content. */
export async function listAdminLog(db: D1Database, query: LogQuery): Promise<{ rows: AdminLogRow[]; total: number }> {
  const where = query.q ? "WHERE admin_email LIKE ?1 ESCAPE '!' OR screen LIKE ?1 ESCAPE '!' OR content LIKE ?1 ESCAPE '!'" : "";
  const args = query.q ? [likePattern(query.q)] : [];
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM admin_log ${where}`).bind(...args).first<{ n: number }>();
  const { results } = await db
    .prepare(`SELECT id, at, admin_email, screen, content FROM admin_log ${where} ORDER BY at DESC, id DESC LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}`)
    .bind(...args)
    .all<{ id: number; at: number; admin_email: string; screen: string; content: string }>();
  return { rows: results.map((r) => ({ id: r.id, at: r.at, adminEmail: r.admin_email, screen: r.screen, content: r.content })), total: total?.n ?? 0 };
}

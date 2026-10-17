import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/**
 * Minimal D1 stand-in over real SQLite (node:sqlite) with the real migrations applied, so constraint, trigger, index
 * and rollback behaviour is the real thing. `batch` runs in a transaction and rolls back when a statement throws,
 * like D1. Test-only: it is excluded from the server's tsc project because it needs Node types.
 */
export function makeDb(): { db: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) raw.exec(readFileSync(new URL(f, dir), "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => {
      // D1 accepts at most 100 bound parameters per statement; enforce it here so chunking bugs show up in tests.
      if (a.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${a.length} > 100)`);
      return stmt(sql, a);
    },
    run: async () => {
      raw.prepare(sql).run(...(args as never[]));
      return {};
    },
    first: async () => (raw.prepare(sql).get(...(args as never[])) as unknown) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...(args as never[])) as unknown[] }),
  });
  const db = {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      raw.exec("BEGIN");
      try {
        const out = [];
        for (const s of list) out.push(await s.all());
        raw.exec("COMMIT");
        return out;
      } catch (err) {
        raw.exec("ROLLBACK");
        throw err;
      }
    },
  } as unknown as D1Database;
  return { db, raw };
}

import { beforeEach, describe, expect, it } from "vitest";
import { getAuditEntry, listAudit, parseAuditQuery, recordAudit } from "./admin-audit";
import { makeDb } from "./test-db";

let db: D1Database;

const entry = (n: number, over: Record<string, unknown> = {}) => ({
  adminId: "a1",
  adminEmail: "boss@example.test",
  action: "setting_change",
  targetType: "setting",
  targetId: `k${n}`,
  summary: `change ${n}`,
  before: { v: n },
  after: { v: n + 1 },
  ...over,
});

beforeEach(() => {
  db = makeDb().db;
});

describe("recordAudit", () => {
  it("stores the row with before and after and returns its id", async () => {
    const id = await recordAudit(db, entry(1));
    expect(id).toBe(1);
    const got = await getAuditEntry(db, 1);
    expect(got).toMatchObject({ adminEmail: "boss@example.test", action: "setting_change", targetId: "k1", before: { v: 1 }, after: { v: 2 } });
  });

  it("keeps null for missing before and after", async () => {
    await recordAudit(db, { adminId: "a1", adminEmail: "boss@example.test", action: "x", targetType: "t" });
    expect(await getAuditEntry(db, 1)).toMatchObject({ before: null, after: null, targetId: "", summary: "" });
  });

  it("replaces a huge value instead of failing the action it logs", async () => {
    await recordAudit(db, entry(1, { after: { blob: "x".repeat(70_000) } }));
    expect((await getAuditEntry(db, 1))?.after).toMatchObject({ truncated: true });
  });

  it("never throws: a failed write returns null", async () => {
    const broken = { prepare: () => { throw new Error("D1 down"); } } as unknown as D1Database;
    expect(await recordAudit(broken, entry(1))).toBeNull();
  });

  it("refuses to update or lose rows through this module (append only, ids grow)", async () => {
    await recordAudit(db, entry(1));
    await recordAudit(db, entry(2));
    expect((await listAudit(db, parseAuditQuery(new URLSearchParams()))).rows.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe("listAudit", () => {
  beforeEach(async () => {
    for (let i = 1; i <= 25; i++) await recordAudit(db, entry(i, i % 2 ? { action: "currency_grant", adminEmail: "other@example.test" } : {}));
  });

  it("pages and counts", async () => {
    const p1 = await listAudit(db, parseAuditQuery(new URLSearchParams({ size: "10" })));
    expect(p1.total).toBe(25);
    expect(p1.rows).toHaveLength(10);
    expect(p1.rows[0]!.id).toBe(25);
    const p3 = await listAudit(db, parseAuditQuery(new URLSearchParams({ size: "10", page: "3" })));
    expect(p3.rows.map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it("sorts ascending and by another column", async () => {
    const asc = await listAudit(db, parseAuditQuery(new URLSearchParams({ sort: "id", dir: "asc", size: "3" })));
    expect(asc.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    const byAction = await listAudit(db, parseAuditQuery(new URLSearchParams({ sort: "action", dir: "asc", size: "100" })));
    expect(byAction.rows[0]!.action).toBe("currency_grant");
  });

  it("searches over admin, action, target and summary", async () => {
    expect((await listAudit(db, parseAuditQuery(new URLSearchParams({ q: "other@" })))).total).toBe(13);
    expect((await listAudit(db, parseAuditQuery(new URLSearchParams({ q: "change 7" })))).total).toBe(1);
    expect((await listAudit(db, parseAuditQuery(new URLSearchParams({ q: "k2" })))).total).toBe(7); // k2, k20-k25
  });

  it("treats % and _ in the search literally", async () => {
    expect((await listAudit(db, parseAuditQuery(new URLSearchParams({ q: "%" })))).total).toBe(0);
    expect((await listAudit(db, parseAuditQuery(new URLSearchParams({ q: "setting_c" })))).total).toBe(12);
    expect((await listAudit(db, parseAuditQuery(new URLSearchParams({ q: "setting%c" })))).total).toBe(0);
  });
});

describe("parseAuditQuery", () => {
  it("clamps bad input to safe defaults", () => {
    expect(parseAuditQuery(new URLSearchParams({ sort: "id; DROP TABLE x", dir: "sideways", page: "-4", size: "100000" }))).toEqual({ q: "", sort: "id", dir: "desc", page: 1, size: 100 });
    expect(parseAuditQuery(new URLSearchParams({ page: "abc", size: "0" }))).toMatchObject({ page: 1, size: 20 });
  });
});

describe("getAuditEntry", () => {
  it("returns null for an unknown id", async () => {
    expect(await getAuditEntry(db, 99)).toBeNull();
  });
});

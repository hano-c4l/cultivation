import { beforeEach, describe, expect, it } from "vitest";
import { listAdminLog, logAdmin, logStatement, parseLogQuery } from "./admin-log";
import { makeDb } from "./test-db";

let db: D1Database;
beforeEach(() => {
  db = makeDb().db;
});

describe("admin log", () => {
  it("lists newest first with the admin, the screen and the content", async () => {
    await db.batch([
      logStatement(db, { adminEmail: "a@x.test", screen: "Cài đặt game", content: "Đổi cài đặt bag_tab_price: 1000 → 1234" }, 100),
      logStatement(db, { adminEmail: "b@x.test", screen: "Quản lý tiền tệ", content: "Cộng 300 Tiên Ngọc cho nhân vật An" }, 300),
      logStatement(db, { adminEmail: "a@x.test", screen: "Thiên phú", content: "Lưu danh mục thể chất" }, 200),
    ]);
    const res = await listAdminLog(db, parseLogQuery(new URLSearchParams()));
    expect(res.total).toBe(3);
    expect(res.rows.map((r) => r.at)).toEqual([300, 200, 100]);
    expect(res.rows[0]).toMatchObject({ adminEmail: "b@x.test", screen: "Quản lý tiền tệ", content: "Cộng 300 Tiên Ngọc cho nhân vật An" });
  });

  it("searches admin, screen and content, treats % literally, and pages", async () => {
    for (let i = 1; i <= 25; i++) await logAdmin(db, { adminEmail: i % 2 ? "odd@x.test" : "even@x.test", screen: "Tiền", content: `việc ${i}` });
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams({ q: "odd@" })))).total).toBe(13);
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams({ q: "việc 7" })))).total).toBe(1);
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams({ q: "%" })))).total).toBe(0);
    const p2 = await listAdminLog(db, parseLogQuery(new URLSearchParams({ size: "10", page: "3" })));
    expect(p2.rows).toHaveLength(5);
  });

  it("never throws when the write fails", async () => {
    const broken = { prepare: () => { throw new Error("D1 down"); } } as unknown as D1Database;
    await expect(logAdmin(broken, { adminEmail: "a@x.test", screen: "x", content: "y" })).resolves.toBeUndefined();
  });

  it("clamps bad paging to safe defaults", () => {
    expect(parseLogQuery(new URLSearchParams({ page: "-4", size: "100000" }))).toEqual({ q: "", page: 1, size: 100 });
    expect(parseLogQuery(new URLSearchParams({ page: "abc", size: "0" }))).toMatchObject({ page: 1, size: 20 });
  });
});

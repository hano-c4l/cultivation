import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { SEED_QUESTS, givesPathItem, type QuestDef } from "@game/shared";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { getQuestCatalog, resetQuestCache } from "./quests";
import { deleteQuest, listQuests, saveQuest } from "./quests-admin";
import { resetNpcsCache } from "./npcs";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db, raw } = makeDb());
  resetQuestCache();
  resetNpcsCache();
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('char', 'acc', 'A', 'kim', 0, 0, 0, 0)");
});

const n = (sql: string, ...args: unknown[]) => (raw.prepare(sql).get(...(args as never[])) as { n: number }).n;
const version = () => n("SELECT version AS n FROM config_versions WHERE name = 'quests'");
const base = (over: Partial<QuestDef> = {}): QuestDef => ({
  id: "my_quest",
  chain: "events",
  seq: 1,
  giver: "elder",
  titleVi: "Thử thách mới",
  descVi: "Hạ năm con quái.",
  enabled: true,
  requires: null,
  objective: { kind: "kill", count: 5, map: "forest" },
  rewards: { linhThach: 100, items: [{ item: "hoi_huyet_dan", qty: 2 }] },
  ...over,
});
const find = async (id: string) => (await listQuests(db)).find((q) => q.def.id === id);
const give = (quest: string, state: "active" | "done") => raw.exec(`INSERT INTO character_quests (character_id, quest_id, state, progress, accepted_at, done_at) VALUES ('char', '${quest}', '${state}', 0, 1, ${state === "done" ? 2 : "NULL"})`);

describe("saving a quest", () => {
  it("lists the seeded catalogue with progress counts", async () => {
    give("newbie_1", "done");
    const list = await listQuests(db);
    expect(list.length).toBeGreaterThanOrEqual(20);
    expect(list.find((q) => q.def.id === "newbie_1")).toMatchObject({ done: 1, active: 0, deleted: false });
  });

  it("creates a quest that the game catalogue then serves, and logs it", async () => {
    const before = version();
    const res = await saveQuest(db, ADMIN, base(), true, 0);
    expect(res).toMatchObject({ ok: true });
    expect(version()).toBe(before + 1);
    resetQuestCache();
    expect((await getQuestCatalog(db)).find((d) => d.id === "my_quest")?.rewards.linhThach).toBe(100);
    const log = (await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!;
    expect(log).toMatchObject({ screen: "Nhiệm vụ", adminEmail: ADMIN });
    expect(log.content).toContain("Thêm nhiệm vụ");
  });

  it("changes a quest once per token: the second save with the same token is a conflict", async () => {
    await saveQuest(db, ADMIN, base(), true, 0);
    const token = (await find("my_quest"))!.updatedAt;
    expect(await saveQuest(db, ADMIN, base({ titleVi: "Tên mới" }), false, token, token + 10)).toMatchObject({ ok: true });
    expect(await saveQuest(db, ADMIN, base({ titleVi: "Tên khác" }), false, token, token + 20)).toEqual({ ok: false, error: "version_conflict" });
    expect((await find("my_quest"))!.def.titleVi).toBe("Tên mới");
    expect(await saveQuest(db, ADMIN, base({ titleVi: "Tên mới" }), false, (await find("my_quest"))!.updatedAt)).toEqual({ ok: false, error: "unchanged" });
  });

  it("refuses an invalid result and leaves the database and the version alone", async () => {
    const before = version();
    const bad = [
      base({ giver: "merchant" }), // a merchant does not open the quest window
      base({ giver: "nobody" }),
      base({ requires: "no_such_quest" }),
      base({ objective: { kind: "kill", count: 5, map: "atlantis" } }),
      base({ rewards: { items: [{ item: "eq.weapon.1", qty: 1 }] } }),
      base({ rewards: { items: [{ item: "no_such_item", qty: 1 }] } }),
      base({ titleVi: "a".repeat(81) }),
      base({ id: "Bad Id" }),
    ];
    for (const q of bad) expect(await saveQuest(db, ADMIN, q, true, 0), JSON.stringify(q.objective) + q.giver + q.requires).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveQuest(db, ADMIN, "nope", true, 0)).toMatchObject({ ok: false, error: "invalid" });
    expect(n("SELECT COUNT(*) AS n FROM quests WHERE id = 'my_quest'")).toBe(0);
    expect(version()).toBe(before);
  });

  it("refuses an id that exists or that characters still hold, and a missing quest", async () => {
    expect(await saveQuest(db, ADMIN, base({ id: "newbie_1" }), true, 0)).toMatchObject({ ok: false, error: "exists" });
    give("old_quest", "done");
    expect(await saveQuest(db, ADMIN, base({ id: "old_quest" }), true, 0)).toMatchObject({ ok: false, error: "has_progress" });
    expect(await saveQuest(db, ADMIN, base({ id: "ghost" }), false, 1)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("keeps the objective kind, the path and the repeat of a quest characters hold", async () => {
    await saveQuest(db, ADMIN, base(), true, 0);
    give("my_quest", "active");
    const token = (await find("my_quest"))!.updatedAt;
    expect(await saveQuest(db, ADMIN, base({ objective: { kind: "talk", npc: "merchant" } }), false, token)).toEqual({ ok: false, error: "locked_field", problems: ["objective"] });
    expect(await saveQuest(db, ADMIN, base({ repeat: "daily" }), false, token)).toEqual({ ok: false, error: "locked_field", problems: ["repeat"] });
    expect(await saveQuest(db, ADMIN, base({ objective: { kind: "kill", count: 9, map: "forest" } }), false, token, token + 5)).toMatchObject({ ok: true });
  });
});

describe("deleting a quest", () => {
  it("removes a quest nobody holds once nothing requires it any more", async () => {
    await saveQuest(db, ADMIN, base({ id: "step_a", seq: 1 }), true, 0);
    await saveQuest(db, ADMIN, base({ id: "step_b", seq: 2, requires: "step_a" }), true, 0);
    await saveQuest(db, ADMIN, base({ id: "step_c", seq: 3, requires: "step_b" }), true, 0);
    // step_c still needs step_b: refused, with the quests that use it listed, and nothing changes.
    const before = version();
    const refused = await deleteQuest(db, ADMIN, "step_b", (await find("step_b"))!.updatedAt);
    expect(refused).toEqual({ ok: false, error: "in_use", problems: ["step_c — Thử thách mới"] });
    expect(await find("step_b")).toBeDefined();
    expect((await find("step_c"))!.def.requires).toBe("step_b");
    expect(version()).toBe(before);
    // Take the link out of step_c first, then it goes.
    const c = (await find("step_c"))!;
    expect(await saveQuest(db, ADMIN, { ...c.def, requires: null }, false, c.updatedAt, c.updatedAt + 5)).toMatchObject({ ok: true });
    expect(await deleteQuest(db, ADMIN, "step_b", (await find("step_b"))!.updatedAt)).toEqual({ ok: true, mode: "hard" });
    expect(await find("step_b")).toBeUndefined();
    expect(n("SELECT COUNT(*) AS n FROM quests WHERE id = 'step_b'")).toBe(0); // an admin-made quest leaves no row
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams({ q: "Xóa cứng" })))).total).toBe(1);
  });

  it("only takes a quest out of play when a character holds it, even a finished one, and then it is read-only", async () => {
    give("newbie_2", "done");
    // newbie_3 requires it: refused until that link is removed.
    expect(await deleteQuest(db, ADMIN, "newbie_2", (await find("newbie_2"))!.updatedAt)).toMatchObject({ ok: false, error: "in_use" });
    const next = (await find("newbie_3"))!;
    await saveQuest(db, ADMIN, { ...next.def, requires: "newbie_1" }, false, next.updatedAt, next.updatedAt + 5);
    const res = await deleteQuest(db, ADMIN, "newbie_2", (await find("newbie_2"))!.updatedAt);
    expect(res).toEqual({ ok: true, mode: "soft" });
    const gone = (await find("newbie_2"))!;
    expect(gone).toMatchObject({ deleted: true, done: 1 });
    expect(gone.def.enabled).toBe(false);
    expect((await find("newbie_3"))!.def.requires).toBe("newbie_1");
    expect(await saveQuest(db, ADMIN, { ...gone.def, enabled: true }, false, gone.updatedAt)).toEqual({ ok: false, error: "deleted" });
    expect(await deleteQuest(db, ADMIN, "newbie_2", gone.updatedAt)).toEqual({ ok: false, error: "deleted" });
    // The game still serves it, disabled, so a character on it can finish.
    resetQuestCache();
    expect((await getQuestCatalog(db)).find((d) => d.id === "newbie_2")?.enabled).toBe(false);
  });

  it("does not bring a deleted quest of the seed catalogue back, and its id stays taken", async () => {
    // Nothing requires daily_kill (it requires newbie_3), so it can go.
    expect(await deleteQuest(db, ADMIN, "daily_kill", (await find("daily_kill"))!.updatedAt)).toEqual({ ok: true, mode: "hard" });
    expect(n("SELECT tomb AS n FROM quests WHERE id = 'daily_kill'")).toBe(1);
    resetQuestCache();
    const defs = await getQuestCatalog(db);
    expect(defs.find((d) => d.id === "daily_kill")).toBeUndefined();
    expect(defs.find((d) => d.id === "daily_herb")).toBeDefined();
    expect(await find("daily_kill")).toBeUndefined();
    expect(await saveQuest(db, ADMIN, base({ id: "daily_kill" }), true, 0)).toMatchObject({ ok: false, error: "exists" });
  });

  it("refuses a delete that would break the catalogue, a stale token and an unknown quest", async () => {
    const last = SEED_PATH_LAST_STEP();
    const res = await deleteQuest(db, ADMIN, last, (await find(last))!.updatedAt);
    expect(res).toMatchObject({ ok: false, error: "invalid" });
    expect(await find(last)).toBeDefined();
    expect(await deleteQuest(db, ADMIN, "newbie_1", 1)).toEqual({ ok: false, error: "version_conflict" });
    expect(await deleteQuest(db, ADMIN, "nope", 1)).toEqual({ ok: false, error: "not_found" });
  });
});

/** A quest that hands out a path item: removing it hard would leave its path without the item. */
function SEED_PATH_LAST_STEP(): string {
  return SEED_QUESTS.find((q) => givesPathItem(q))!.id;
}

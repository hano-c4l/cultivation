import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SECT, sectKillCounts, sectKillOpen, sectTaskMode, validSect, type SectCfg, type SectTask } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { resetSettingsCache } from "./settings";
import { createSect, sectView } from "./sect";
import { claimKillTask, prepareTask, saveSectKills } from "./sect-task";
import { makeDb } from "./test-db";

const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);
const DAY = Math.floor((NOW + 7 * 3_600_000) / 86_400_000);
const [L, A, B] = ["lead", "a", "b"];

const killTask = (over: Partial<SectTask> = {}): SectTask => ({
  id: "k1",
  kind: "hunt",
  name: "Săn",
  item: "thu_cot",
  qty: 20,
  perDay: 2,
  minLevel: 1,
  kill: { count: 3, pct: 100 },
  reward: { contribution: 25, exp: 12, fundLinh: 2000, memberLinh: 300 },
  ...over,
});
const cfgOf = (tasks: SectTask[]): SectCfg => ({ ...DEFAULT_SECT, createFee: 0, tasks, taskIncomeCap: [100_000, 100_000] });

let db: D1Database;
let raw: DatabaseSync;

const kills = (id: string, task = "k1") => (raw.prepare("SELECT kills, n FROM sect_task_log WHERE character_id = ? AND task_id = ? AND day = ?").get(id, task, DAY) as { kills: number; n: number } | undefined) ?? { kills: 0, n: 0 };
const member = (id: string) => raw.prepare("SELECT contribution FROM sect_members WHERE character_id = ?").get(id) as { contribution: number };

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [L, A, B]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, created_at, updated_at) VALUES ('${id}', 'acc', 'Nhan ${id}', 'kim', 0, 0, 1, 1, 0, ${NOW})`);
});

async function founded(cfg: SectCfg): Promise<string> {
  const r = await createSect(db, cfg, { leaderId: L, name: "Thanh Van", now: NOW });
  if (!r.ok) throw new Error(r.reason);
  for (const id of [A, B]) raw.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES (?, ?, 0, ?)").run(id, r.id, NOW);
  return r.id;
}

describe("the draw of the mode", () => {
  it("is deterministic and follows the percent", () => {
    const t = killTask({ kill: { count: 3, pct: 40 } });
    expect(sectTaskMode(t, A, DAY)).toBe(sectTaskMode(t, A, DAY));
    expect(sectTaskMode(killTask({ kill: { count: 3, pct: 0 } }), A, DAY)).toBe("item");
    expect(sectTaskMode(killTask({ kill: { count: 3, pct: 100 } }), A, DAY)).toBe("kill");
    expect(sectTaskMode({ id: "x" }, A, DAY)).toBe("item"); // a task without a kill objective
    let kill = 0;
    for (let d = 0; d < 400; d++) if (sectTaskMode(t, A, d) === "kill") kill++;
    expect(kill).toBeGreaterThan(110);
    expect(kill).toBeLessThan(210);
  });

  it("the kill filter follows the map and the rare flag", () => {
    const t = killTask({ kill: { count: 1, pct: 100, rare: true, map: "forest" } });
    expect(sectKillCounts(t, "forest", true)).toBe(true);
    expect(sectKillCounts(t, "forest", false)).toBe(false);
    expect(sectKillCounts(t, "cave", true)).toBe(false);
    expect(sectKillCounts({}, "forest", true)).toBe(false);
  });
});

describe("counting and claiming kills", () => {
  it("stops counting at what the task can ask for in a day (count x perDay)", () => {
    const t = killTask(); // 3 a turn, 2 turns
    expect(sectKillOpen(t, 0)).toBe(true);
    expect(sectKillOpen(t, 5)).toBe(true);
    expect(sectKillOpen(t, 6)).toBe(false);
    expect(sectKillOpen({ perDay: 2 }, 0)).toBe(false);
  });

  it("writes cumulative kills capped at count x perDay", async () => {
    await founded(cfgOf([killTask()]));
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 4, cap: 6 }]);
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 5, cap: 6 }]);
    expect(kills(A).kills).toBe(6);
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 100, cap: 6 }]);
    expect(kills(A).kills).toBe(6);
  });

  it("too few kills: refused with `lack`; enough: paid, and the next turn needs twice as many", async () => {
    const cfg = cfgOf([killTask()]);
    await founded(cfg);
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 2, cap: 6 }]);
    expect(await prepareTask(db, cfg, { characterId: A, taskId: "k1", now: NOW })).toMatchObject({ ok: false, reason: "lack" });
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 1, cap: 6 }]);
    const p1 = await prepareTask(db, cfg, { characterId: A, taskId: "k1", now: NOW });
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    expect(p1.prep.mode).toBe("kill");
    expect((await claimKillTask(db, cfg, p1.prep, A, NOW)).ok).toBe(true);
    expect(kills(A).n).toBe(1);
    expect(member(A).contribution).toBe(25);
    // the second turn needs 6 in all
    expect(await prepareTask(db, cfg, { characterId: A, taskId: "k1", now: NOW })).toMatchObject({ ok: false, reason: "lack" });
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 3, cap: 6 }]);
    const p2 = await prepareTask(db, cfg, { characterId: A, taskId: "k1", now: NOW });
    expect(p2.ok).toBe(true);
    if (p2.ok) expect((await claimKillTask(db, cfg, p2.prep, A, NOW)).ok).toBe(true);
    expect(await prepareTask(db, cfg, { characterId: A, taskId: "k1", now: NOW })).toMatchObject({ ok: false, reason: "limit" });
  });

  it("two claims at once with kills for one: only one goes through", async () => {
    const cfg = cfgOf([killTask()]);
    await founded(cfg);
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 3, cap: 6 }]);
    const p = await prepareTask(db, cfg, { characterId: A, taskId: "k1", now: NOW });
    if (!p.ok) throw new Error(p.reason);
    const [x, y] = await Promise.all([claimKillTask(db, cfg, p.prep, A, NOW), claimKillTask(db, cfg, p.prep, A, NOW)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(kills(A).n).toBe(1);
  });

  it("on an item day the task is still a hand-in (the server decides the mode, not the client)", async () => {
    const cfg = cfgOf([killTask({ kill: { count: 3, pct: 0 } })]);
    await founded(cfg);
    const p = await prepareTask(db, cfg, { characterId: A, taskId: "k1", now: NOW });
    expect(p.ok && p.prep.mode).toBe("item");
  });

  it("the window shows today's mode and the kills", async () => {
    const cfg = cfgOf([killTask(), killTask({ id: "plain", kill: undefined })]);
    await founded(cfg);
    await saveSectKills(db, A, [{ task: "k1", day: DAY, add: 2, cap: 6 }]);
    const view = await sectView(db, cfg, A, new Set(), NOW);
    expect(view?.taskMode).toEqual({ k1: "kill" });
    expect(view?.taskKills).toEqual({ k1: 2 });
  });
});

describe("the stored rows", () => {
  it("a task without a kill objective is valid, a bad one is not", () => {
    expect(validSect({ ...DEFAULT_SECT, tasks: DEFAULT_SECT.tasks.map(({ kill: _k, ...t }) => t) })).toBe(true);
    expect(validSect({ ...DEFAULT_SECT, tasks: [killTask({ kill: { count: 0, pct: 50 } })] })).toBe(false);
    expect(validSect({ ...DEFAULT_SECT, tasks: [killTask({ kill: { count: 3, pct: 101 } })] })).toBe(false);
    expect(validSect(DEFAULT_SECT)).toBe(true);
  });

  it("migration 0068 gives the hunting tasks their kill objective and keeps edits", () => {
    const { raw: r } = makeDb();
    const edited = { ...DEFAULT_SECT, createFee: 77, tasks: DEFAULT_SECT.tasks.map(({ kill: _k, ...t }) => t) };
    r.exec("DELETE FROM game_tuning WHERE name = 'sect'");
    r.prepare("INSERT INTO game_tuning (name, value, updated_at, updated_by) VALUES ('sect', ?, 0, 'admin')").run(JSON.stringify(edited));
    const sql = readFileSync(new URL("../migrations/0068_sect_kill_tasks.sql", import.meta.url), "utf8");
    r.exec(sql.split(String.fromCharCode(10)).filter((l) => l.startsWith("UPDATE game_tuning")).join(String.fromCharCode(10)));
    const row = JSON.parse((r.prepare("SELECT value FROM game_tuning WHERE name = 'sect'").get() as { value: string }).value);
    expect(validSect(row)).toBe(true);
    expect(row.createFee).toBe(77);
    expect(row.tasks[1].kill).toEqual({ count: 15, pct: 50 });
    expect(row.tasks[2].kill).toEqual({ count: 2, pct: 50, rare: true });
    expect(row.tasks[0].kill).toBeUndefined();
  });
});

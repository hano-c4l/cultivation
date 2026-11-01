import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SECT, validSect, type SectCfg, type SectTask } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { commitBagOps, loadBag } from "./inventory";
import { resetSettingsCache } from "./settings";
import { createSect, memberOf, upgradeSect } from "./sect";
import { planTask, prepareTask, resetRankCache, sectRanking } from "./sect-task";
import { putItem, setShelf, takeItem } from "./sect-vault";
import { makeDb } from "./test-db";

const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);
const DAY = 24 * 3_600_000;
const [L, A, B] = ["lead", "a", "b"];
const ORE = "ren_lk";
const BONE = "thu_cot";

const task = (over: Partial<SectTask> = {}): SectTask => ({ id: "t1", kind: "mine", name: "Đào", item: ORE, qty: 10, perDay: 2, minLevel: 1, reward: { contribution: 20, exp: 10, fundLinh: 3000, memberLinh: 500 }, ...over });
const baseCfg = (tasks: SectTask[], over: Partial<SectCfg> = {}): SectCfg => ({
  ...DEFAULT_SECT,
  createFee: 0,
  tasks,
  taskIncomeCap: [5000, 10_000],
  levels: [{ maxMembers: 10, expNeed: 100, costLinh: 1000, costItems: [{ item: BONE, qty: 10 }] }, { maxMembers: 20, expNeed: 0, costLinh: 0, costItems: [] }],
  vault: { ...DEFAULT_SECT.vault, slots: [3, 5], dailyCap: 1000 },
  ...over,
});

let db: D1Database;
let raw: DatabaseSync;
let n = 0;

beforeEach(() => {
  resetSettingsCache();
  resetRankCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [L, A, B]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, created_at, updated_at) VALUES ('${id}', 'acc', 'Nhan ${id}', 'kim', 0, 0, 1, 1, 0, ${NOW})`);
});

const give = (id: string, qty: number, cell: number, type = ORE): string => {
  const itemId = `item-${n++}`;
  raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('${itemId}', '${id}', '${type}', ${qty}, 0, ${cell}, 0)`);
  return itemId;
};
const founded = async (cfg: SectCfg): Promise<string> => {
  const r = await createSect(db, cfg, { leaderId: L, name: "Thanh Van", now: NOW });
  if (!r.ok) throw new Error(r.reason);
  raw.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES (?, ?, 0, ?)").run(A, r.id, NOW);
  return r.id;
};
const sect = () => raw.prepare("SELECT level, exp, fund, income_today AS income FROM sects").get() as { level: number; exp: number; fund: number; income: number };
const member = (id: string) => raw.prepare("SELECT contribution, contribution_total AS total FROM sect_members WHERE character_id = ?").get(id) as { contribution: number; total: number };
const linh = (id: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(id) as { balance: number } | undefined)?.balance ?? 0;
const vault = () => raw.prepare("SELECT item_type AS t, qty, points FROM sect_vault ORDER BY item_type, qty").all() as Array<{ t: string; qty: number; points: number }>;
const owned = (id: string, type: string) => (raw.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM item_instances WHERE owner_character_id = ? AND item_type = ? AND cell IS NOT NULL").get(id, type) as { q: number }).q;

/** A hand-in as the room does it: the checks, then the bag change and the rest in one batch. */
async function hand(cfg: SectCfg, who: string, id: string, now = NOW) {
  const prep = await prepareTask(db, cfg, { characterId: who, taskId: id, now });
  if (!prep.ok) return prep;
  const bag = await loadBag(db, who);
  const plan = planTask(db, cfg, prep.prep, who, bag, now);
  if (!plan) return { ok: false as const, reason: "lack" as const };
  const r = await commitBagOps(db, who, plan.ops, { extra: plan.extra });
  return r === "ok" ? { ok: true as const } : { ok: false as const, reason: "busy" as const };
}

describe("handing in a task", () => {
  it("uses the items from several stacks, pays the member and the sect, and adds to the fund and the warehouse", async () => {
    const cfg = baseCfg([task({ reward: { contribution: 20, exp: 10, fundLinh: 3000, memberLinh: 500, vault: { item: BONE, qty: 5 } } })]);
    await founded(cfg);
    give(A, 4, 0);
    give(A, 4, 1);
    give(A, 4, 2); // 12 in three stacks: 10 are used
    expect(await hand(cfg, A, "t1")).toEqual({ ok: true });
    expect(owned(A, ORE)).toBe(2);
    expect(member(A)).toEqual({ contribution: 20, total: 20 });
    expect(sect()).toMatchObject({ exp: 10, fund: 2500, income: 3000 }); // 3000 added by the system, 500 paid to the member
    expect(linh(A)).toBe(500);
    expect(vault()).toEqual([{ t: BONE, qty: 5, points: 0 }]);
  });

  it("is refused without enough items, below the sect level, for an unknown task and for a non-member", async () => {
    const cfg = baseCfg([task(), task({ id: "t2", minLevel: 2 })]);
    await founded(cfg);
    give(A, 5, 0);
    expect(await hand(cfg, A, "t1")).toEqual({ ok: false, reason: "lack" });
    expect(await hand(cfg, A, "t2")).toEqual({ ok: false, reason: "perm" });
    expect(await hand(cfg, A, "nope")).toEqual({ ok: false, reason: "task" });
    give(B, 10, 0);
    expect(await hand(cfg, B, "t1")).toEqual({ ok: false, reason: "no_sect" });
    expect(owned(A, ORE)).toBe(5);
  });

  it("the daily limit holds, two at once for the last place give one, and leaving and joining again does not reset it", async () => {
    const cfg = baseCfg([task({ perDay: 1, reward: { contribution: 5, exp: 1, fundLinh: 0, memberLinh: 0 } })]);
    const id = await founded(cfg);
    give(A, 40, 0);
    const both = await Promise.all([hand(cfg, A, "t1"), hand(cfg, A, "t1")]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(owned(A, ORE)).toBe(30);
    expect(await hand(cfg, A, "t1")).toEqual({ ok: false, reason: "limit" });
    raw.exec("DELETE FROM sect_members WHERE character_id = 'a'");
    raw.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES (?, ?, 0, ?)").run(A, id, NOW);
    expect(await hand(cfg, A, "t1")).toEqual({ ok: false, reason: "limit" });
    expect(await hand(cfg, A, "t1", NOW + DAY)).toEqual({ ok: true }); // the next day
  });

  it("the day's income cap stops the system's Linh Thạch and the warehouse items, not the member's cống hiến", async () => {
    const cfg = baseCfg([task({ perDay: 10, reward: { contribution: 10, exp: 5, fundLinh: 3000, memberLinh: 0, vault: { item: BONE, qty: 2 } } })]);
    await founded(cfg);
    give(A, 100, 0);
    expect(await hand(cfg, A, "t1")).toEqual({ ok: true });
    expect(sect().fund).toBe(3000);
    expect(await hand(cfg, A, "t1")).toEqual({ ok: true }); // only 2000 of the cap of 5000 was left
    expect(sect()).toMatchObject({ fund: 5000, income: 5000 });
    expect(vault().reduce((s, v) => s + v.qty, 0)).toBe(4);
    expect(await hand(cfg, A, "t1")).toEqual({ ok: true }); // past the cap: nothing for the fund or the warehouse
    expect(sect()).toMatchObject({ fund: 5000, income: 5000, exp: 15 });
    expect(vault().reduce((s, v) => s + v.qty, 0)).toBe(4);
    expect(member(A).contribution).toBe(30);
    expect(await hand(cfg, A, "t1", NOW + DAY)).toEqual({ ok: true }); // the next day the cap starts again
    expect(sect().fund).toBe(8000);
  });

  it("two members at the cap at once cannot both add what is left", async () => {
    const cfg = baseCfg([task({ perDay: 10, reward: { contribution: 1, exp: 1, fundLinh: 4000, memberLinh: 0 } })]);
    const id = await founded(cfg);
    raw.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES (?, ?, 0, ?)").run(B, id, NOW);
    give(A, 20, 0);
    give(B, 20, 0);
    const results = await Promise.all([hand(cfg, A, "t1"), hand(cfg, B, "t1")]);
    expect(sect().income).toBeLessThanOrEqual(5000);
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
    expect(sect().fund).toBeLessThanOrEqual(5000);
  });

  it("the income dial scales what the system adds to the fund and the warehouse", async () => {
    const cfg = baseCfg([task({ reward: { contribution: 1, exp: 1, fundLinh: 1000, memberLinh: 0, vault: { item: BONE, qty: 10 } } })], { balance: { upgradeCostPct: 100, incomePct: 50 } });
    await founded(cfg);
    give(A, 10, 0);
    await hand(cfg, A, "t1");
    expect(sect().fund).toBe(500);
    expect(vault()).toEqual([{ t: BONE, qty: 5, points: 0 }]);
  });

  it("a full warehouse takes no items but the task goes through", async () => {
    const cfg = baseCfg([task({ reward: { contribution: 1, exp: 1, fundLinh: 100, memberLinh: 0, vault: { item: BONE, qty: 2 } } })], { vault: { ...DEFAULT_SECT.vault, slots: [1, 1] } });
    await founded(cfg);
    raw.exec("UPDATE sects SET fund = 0");
    give(A, 20, 0);
    await hand(cfg, A, "t1");
    await hand(cfg, A, "t1");
    expect(vault()).toHaveLength(1); // the first filled the only place
    expect(sect().fund).toBe(200);
    expect(member(A).contribution).toBe(2);
  });

  it("a member paid more than the fund holds is refused, with nothing taken", async () => {
    const cfg = baseCfg([task({ reward: { contribution: 1, exp: 1, fundLinh: 0, memberLinh: 900 } })]);
    await founded(cfg);
    give(A, 10, 0);
    expect(await hand(cfg, A, "t1")).toEqual({ ok: false, reason: "fund" });
    expect(owned(A, ORE)).toBe(10);
    expect(linh(A)).toBe(0);
  });
});

describe("an untradable item", () => {
  it("cannot be put in the warehouse", async () => {
    const cfg = baseCfg([]);
    await founded(cfg);
    raw.exec(`UPDATE sects SET accept = '${JSON.stringify({ cats: { material: 100 }, minGrade: 1 })}'`);
    const item = give(A, 2, 0, "path_item_kiem");
    expect(await putItem(db, cfg, { characterId: A, bag: await loadBag(db, A), itemId: item, qty: 2, now: NOW })).toEqual({ ok: false, reason: "untradable" });
    expect(vault()).toEqual([]);
    expect(owned(A, "path_item_kiem")).toBe(2);
  });
});

describe("the item costs of a level", () => {
  const stocked = async (cfg: SectCfg) => {
    const id = await founded(cfg);
    raw.exec("UPDATE sects SET exp = 100, fund = 1000");
    raw.exec(`UPDATE sects SET accept = '${JSON.stringify({ cats: { material: 100 }, minGrade: 1 })}'`);
    const bag = async (who: string) => loadBag(db, who);
    const stacks = [give(A, 4, 0, BONE), give(A, 3, 1, BONE), give(A, 6, 2, BONE)];
    for (const [i, s] of stacks.entries()) expect(await putItem(db, cfg, { characterId: A, bag: await bag(A), itemId: s, qty: [4, 3, 6][i]!, now: NOW + i })).toMatchObject({ ok: true });
    return { id, stacks };
  };

  it("uses up warehouse stacks, the smallest first, whole or in part, and scales the points of a part", async () => {
    const cfg = baseCfg([]);
    await stocked(cfg);
    expect(await upgradeSect(db, cfg, { actorId: L, now: NOW })).toMatchObject({ ok: true, level: 2 });
    // 10 bones needed from 3, 4 and 6: the 3 and the 4 whole, 3 of the 6
    expect(vault()).toEqual([{ t: BONE, qty: 3, points: expect.any(Number) }]);
    const left = raw.prepare("SELECT qty FROM item_instances WHERE item_type = ? AND cell IS NULL").all(BONE) as Array<{ qty: number }>;
    expect(left).toEqual([{ qty: 3 }]);
    expect(sect()).toMatchObject({ level: 2, exp: 13, fund: 0 }); // 100 spent of the 113 (13 came from the deposits)
  });

  it("is refused when the warehouse is short, and a stack on the shelf does not count", async () => {
    const cfg = baseCfg([]);
    const { stacks } = await stocked(cfg);
    await setShelf(db, { actorId: L, itemId: stacks[2]!, currency: "linh_thach", price: 10, now: NOW });
    expect(await upgradeSect(db, cfg, { actorId: L, now: NOW })).toEqual({ ok: false, reason: "lack" }); // 3 + 4 on the shelf-free stacks
    expect(sect().level).toBe(1);
    expect(vault().reduce((s, v) => s + v.qty, 0)).toBe(13);
  });

  it("fits a D1 batch when it uses the most stacks it may (14), and is refused beyond that", async () => {
    const cfg = baseCfg([], { levels: [{ maxMembers: 10, expNeed: 0, costLinh: 0, costItems: [{ item: BONE, qty: 15 }] }, { maxMembers: 20, expNeed: 0, costLinh: 0, costItems: [] }], vault: { ...DEFAULT_SECT.vault, slots: [40, 40], dailyCap: 100_000 } });
    await founded(cfg);
    raw.exec(`UPDATE sects SET accept = '${JSON.stringify({ cats: { material: 100 }, minGrade: 1 })}'`);
    for (let i = 0; i < 15; i++) await putItem(db, cfg, { characterId: A, bag: await loadBag(db, A).then(async (b) => (give(A, 1, 40 + i, BONE), loadBag(db, A))), itemId: `item-${n - 1}`, qty: 1, now: NOW + i });
    expect(vault()).toHaveLength(15);
    expect(await upgradeSect(db, cfg, { actorId: L, now: NOW })).toEqual({ ok: false, reason: "lack" }); // 15 stacks: more than a batch can touch
    const few: SectCfg = { ...cfg, levels: [{ ...cfg.levels[0]!, costItems: [{ item: BONE, qty: 14 }] }, cfg.levels[1]!] };
    expect(await upgradeSect(db, few, { actorId: L, now: NOW })).toMatchObject({ ok: true, level: 2 }); // 14 stacks: 46 statements
    expect(vault()).toHaveLength(1);
  });

  it("a take at the same moment cannot be spent twice: one of the two wins", async () => {
    const cfg = baseCfg([]);
    const { stacks } = await stocked(cfg);
    const both = await Promise.all([upgradeSect(db, cfg, { actorId: L, now: NOW }), takeItem(db, { actorId: L, itemId: stacks[0]!, to: L, now: NOW })]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    const bones = vault().reduce((n, v) => n + v.qty, 0);
    expect(bones).toBe(both[0].ok ? 3 : 9); // the upgrade used 10 of 13, or the take sent the 4 away and the upgrade (short) did not run
    expect(sect().level).toBe(both[0].ok ? 2 : 1);
  });
});

describe("the ranking and the migration", () => {
  it("lists the sects best first and says where the player's own stands", async () => {
    const cfg = baseCfg([]);
    const first = await founded(cfg);
    raw.exec(`INSERT INTO sects (id, name, leader_id, level, exp, created_at) VALUES ('s2', 'Khac', '${B}', 2, 0, ${NOW})`);
    raw.exec(`INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES ('${B}', 's2', 5, ${NOW})`);
    const r = await sectRanking(db, A, NOW);
    expect(r.sects.map((s) => s.name)).toEqual(["Khac", "Thanh Van"]);
    expect(r.mine).toBe(2);
    expect((await sectRanking(db, B, NOW)).mine).toBe(1);
    expect(first).toBeTruthy();
  });

  it("migration 0065 fills the keys an old edited row lacks and keeps what was edited", () => {
    const { raw: r } = makeDb();
    const old = { createRealm: 3, createFee: 77, nameMin: 2, nameMax: 14, noticeMax: 200, rejoinHours: 24, inviteSec: 30, inviteRange: 8, applyMax: 3, requestsMax: 50, levels: [{ maxMembers: 12 }, { maxMembers: 35 }, { maxMembers: 50 }, { maxMembers: 70 }, { maxMembers: 100 }], perms: DEFAULT_SECT.perms, maxDeputies: 2, maxElders: 5, leaderIdleDays: 30 };
    expect(validSect(old)).toBe(false);
    r.exec("DELETE FROM game_tuning WHERE name = 'sect'");
    r.prepare("INSERT INTO game_tuning (name, value, updated_at, updated_by) VALUES ('sect', ?, 0, 'admin')").run(JSON.stringify(old));
    const sql = readFileSync(new URL("../migrations/0065_sect_tasks.sql", import.meta.url), "utf8");
    const later = readFileSync(new URL("../migrations/0066_sect_skills.sql", import.meta.url), "utf8"); // the group grew again after 0065
    r.exec((sql + later).split(String.fromCharCode(10)).filter((l) => l.startsWith("UPDATE game_tuning")).join(String.fromCharCode(10)));
    const row = JSON.parse((r.prepare("SELECT value FROM game_tuning WHERE name = 'sect'").get() as { value: string }).value);
    expect(validSect(row)).toBe(true);
    expect(row.createFee).toBe(77); // the edits stay
    expect(row.levels[0].maxMembers).toBe(12);
    expect(row.levels[0].costItems).toEqual(DEFAULT_SECT.levels[0]!.costItems);
    expect(row.tasks).toHaveLength(DEFAULT_SECT.tasks.length);
  });
});

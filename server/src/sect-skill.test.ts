import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SECT, getSkill, validSect, type SectCfg } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { resetSettingsCache } from "./settings";
import { buySectSkill, createSect, kickMember, leaveSect, skillShopCheck } from "./sect";
import { disbandSect } from "./sect-vault";
import { makeDb } from "./test-db";

const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);
const [L, A, B] = ["lead", "a", "b"];
const SKILL = "tm_ho_than";

const cfg: SectCfg = { ...DEFAULT_SECT, createFee: 0, skills: [{ skill: SKILL, cost: 100, minLevel: 1, minRank: 0 }, { skill: "tm_tran_phap", cost: 100, minLevel: 2, minRank: 0 }, { skill: "cuong_than", cost: 1, minLevel: 1, minRank: 0 }] };

let db: D1Database;
let raw: DatabaseSync;

const skillRows = (id: string) => raw.prepare("SELECT skill_id AS id, source FROM character_skills WHERE character_id = ? AND source = 'sect'").all(id) as Array<{ id: string; source: string }>;
const points = (id: string) => (raw.prepare("SELECT contribution FROM sect_members WHERE character_id = ?").get(id) as { contribution: number } | undefined)?.contribution;

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [L, A, B]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, created_at, updated_at) VALUES ('${id}', 'acc', 'Nhan ${id}', 'kim', 0, 0, 1, 1, 0, ${NOW})`);
});

async function founded(): Promise<string> {
  const r = await createSect(db, cfg, { leaderId: L, name: "Thanh Van", now: NOW });
  if (!r.ok) throw new Error(r.reason);
  for (const id of [A, B]) raw.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at, contribution, contribution_total) VALUES (?, ?, 0, ?, 250, 250)").run(id, r.id, NOW);
  return r.id;
}

describe("the sect skill shop", () => {
  it("the skills of the default catalogue exist and are sect skills", () => {
    for (const s of DEFAULT_SECT.skills) expect(getSkill(s.skill)?.source).toBe("sect");
    expect(validSect(DEFAULT_SECT)).toBe(true);
  });

  it("buys a skill: the cống hiến goes and the row is stored as a sect skill", async () => {
    const id = await founded();
    const chk = await skillShopCheck(db, cfg, A, SKILL);
    expect(chk.ok).toBe(true);
    const r = await buySectSkill(db, { characterId: A, sectId: id, skill: SKILL, cost: 100, realm: 0, now: NOW });
    expect(r.ok).toBe(true);
    expect(points(A)).toBe(150);
    expect(skillRows(A)).toEqual([{ id: SKILL, source: "sect" }]);
  });

  it("refuses by sect level, by price, by an id that is not a sect skill, and by not being in a sect", async () => {
    await founded();
    expect(await skillShopCheck(db, cfg, A, "tm_tran_phap")).toMatchObject({ ok: false, reason: "perm" });
    expect(await skillShopCheck(db, cfg, A, "cuong_than")).toMatchObject({ ok: false, reason: "item" });
    expect(await skillShopCheck(db, cfg, A, "no_such")).toMatchObject({ ok: false, reason: "item" });
    raw.exec("UPDATE sect_members SET contribution = 50 WHERE character_id = 'a'");
    expect(await skillShopCheck(db, cfg, A, SKILL)).toMatchObject({ ok: false, reason: "poor" });
    raw.exec("DELETE FROM sect_members WHERE character_id = 'b'");
    expect(await skillShopCheck(db, cfg, B, SKILL)).toMatchObject({ ok: false, reason: "no_sect" });
  });

  it("two clicks at once buy it once and take the price once", async () => {
    const id = await founded();
    const buy = () => buySectSkill(db, { characterId: A, sectId: id, skill: SKILL, cost: 100, realm: 0, now: NOW });
    const [x, y] = await Promise.all([buy(), buy()]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(points(A)).toBe(150);
    expect(skillRows(A)).toHaveLength(1);
  });

  it("a price that is no longer there (spent meanwhile) rolls the buy back", async () => {
    const id = await founded();
    raw.exec("UPDATE sect_members SET contribution = 10 WHERE character_id = 'a'");
    const r = await buySectSkill(db, { characterId: A, sectId: id, skill: SKILL, cost: 100, realm: 0, now: NOW });
    expect(r.ok).toBe(false);
    expect(skillRows(A)).toHaveLength(0);
    expect(points(A)).toBe(10);
  });
});

describe("losing the sect skills", () => {
  const buyFor = async (sectId: string, who: string) => {
    const r = await buySectSkill(db, { characterId: who, sectId, skill: SKILL, cost: 100, realm: 0, now: NOW });
    expect(r.ok).toBe(true);
  };

  it("leaving takes them, other skills stay", async () => {
    const id = await founded();
    raw.exec(`INSERT INTO character_skills (character_id, skill_id, learned_at, source, realm) VALUES ('a', 'cuong_than', 0, 'learned', 0)`);
    await buyFor(id, A);
    expect((await leaveSect(db, cfg, { characterId: A, now: NOW })).ok).toBe(true);
    expect(skillRows(A)).toHaveLength(0);
    expect(raw.prepare("SELECT skill_id FROM character_skills WHERE character_id = 'a' AND source = 'learned'").all()).toHaveLength(1);
  });

  it("being sent away takes them", async () => {
    const id = await founded();
    await buyFor(id, A);
    await buyFor(id, B);
    expect((await kickMember(db, cfg, { actorId: L, targetId: A, now: NOW })).ok).toBe(true);
    expect(skillRows(A)).toHaveLength(0);
    expect(skillRows(B)).toHaveLength(1);
  });

  it("disbanding takes them from every member", async () => {
    const id = await founded();
    await buyFor(id, A);
    await buyFor(id, B);
    const r = await disbandSect(db, cfg, { actorId: L, mode: "leader", now: NOW });
    expect(r.ok).toBe(true);
    expect(skillRows(A)).toHaveLength(0);
    expect(skillRows(B)).toHaveLength(0);
  });
});

describe("the tuning row", () => {
  it("a stored row without `skills` is invalid, and migration 0066 fills it keeping the edits", () => {
    const { raw: r } = makeDb();
    const { skills: _skills, ...old } = { ...DEFAULT_SECT, createFee: 77 };
    expect(validSect(old)).toBe(false);
    r.exec("DELETE FROM game_tuning WHERE name = 'sect'");
    r.prepare("INSERT INTO game_tuning (name, value, updated_at, updated_by) VALUES ('sect', ?, 0, 'admin')").run(JSON.stringify(old));
    const sql = readFileSync(new URL("../migrations/0066_sect_skills.sql", import.meta.url), "utf8");
    r.exec(sql.split(String.fromCharCode(10)).filter((l) => l.startsWith("UPDATE game_tuning")).join(String.fromCharCode(10)));
    const row = JSON.parse((r.prepare("SELECT value FROM game_tuning WHERE name = 'sect'").get() as { value: string }).value);
    expect(validSect(row)).toBe(true);
    expect(row.createFee).toBe(77);
    expect(row.skills).toEqual(DEFAULT_SECT.skills);
  });
});

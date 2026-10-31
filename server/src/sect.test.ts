import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SECT, type SectCfg } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { resetSettingsCache } from "./settings";
import { acceptInvite, answerRequest, applyTo, cooldownUntil, createSect, disbandSect, inviteProblem, kickMember, leaveSect, memberOf, removeCharacter, sectDirectory, sectNameOf, sectView, setNotice, setRole, succeedIdleLeader, transferLeader, validateSectName } from "./sect";
import { makeDb } from "./test-db";

const cfg: SectCfg = { ...DEFAULT_SECT, createFee: 1000, levels: [{ maxMembers: 4 }] };
const NOW = Date.UTC(2026, 10, 1, 3, 0, 0);
const HOUR = 3_600_000;
const [L, A, B, C, D, E] = ["lead", "a", "b", "c", "d", "e"];

let db: D1Database;
let raw: DatabaseSync;

beforeEach(() => {
  resetSettingsCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  for (const id of [L, A, B, C, D, E]) raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, created_at, updated_at) VALUES ('${id}', 'acc', 'Nhan ${id}', 'kim', 0, 0, 1, 1, 0, ${NOW})`);
  raw.exec(`INSERT INTO currency_balances (character_id, currency, balance) VALUES ('${L}', 'linh_thach', 5000)`);
});

const found = async (name = "Thanh Van") => {
  const r = await createSect(db, cfg, { leaderId: L, name, now: NOW });
  if (!r.ok) throw new Error(`create failed: ${r.reason}`);
  return r.id;
};
/** Puts a character straight into the sect at a rank (the rules for joining are tested on their own). */
const seat = (id: string, sectId: string, rank = 0) => raw.exec(`INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES ('${id}', '${sectId}', ${rank}, ${NOW})`);
const rankOf = async (id: string) => (await memberOf(db, id))?.rank;
const balance = (id: string) => (raw.prepare("SELECT balance FROM currency_balances WHERE character_id = ? AND currency = 'linh_thach'").get(id) as { balance: number } | undefined)?.balance ?? 0;

describe("founding", () => {
  it("takes the fee and makes the founder the leader", async () => {
    const id = await found();
    expect(balance(L)).toBe(4000);
    expect((await memberOf(db, L))?.rank).toBe(5);
    expect(await sectNameOf(db, L)).toBe("Thanh Van");
    expect(raw.prepare("SELECT leader_id FROM sects WHERE id = ?").get(id)).toEqual({ leader_id: L });
  });

  it("refuses a bad or taken name, a low realm, a member, short funds and a wait", async () => {
    expect(await createSect(db, cfg, { leaderId: L, name: "x", now: NOW })).toEqual({ ok: false, reason: "name" });
    expect(await createSect(db, cfg, { leaderId: L, name: "<b>hi</b>", now: NOW })).toEqual({ ok: false, reason: "name" });
    expect(validateSectName("  Thanh   Van ", cfg)).toBe("Thanh Van");
    await found();
    expect(await createSect(db, cfg, { leaderId: A, name: "thanh van", now: NOW })).toEqual({ ok: false, reason: "taken" });
    expect(await createSect(db, cfg, { leaderId: L, name: "Khac", now: NOW })).toEqual({ ok: false, reason: "in_sect" });
    raw.exec("UPDATE characters SET realm = 0 WHERE id = 'a'");
    expect(await createSect(db, cfg, { leaderId: A, name: "Moi", now: NOW })).toEqual({ ok: false, reason: "realm" });
    raw.exec("UPDATE characters SET realm = 1 WHERE id = 'a'");
    expect(await createSect(db, cfg, { leaderId: A, name: "Moi", now: NOW })).toEqual({ ok: false, reason: "funds" });
    raw.exec(`INSERT INTO sect_cooldown (character_id, until) VALUES ('a', ${NOW + HOUR})`);
    expect(await createSect(db, cfg, { leaderId: A, name: "Moi", now: NOW })).toEqual({ ok: false, reason: "cooldown" });
    expect(balance(A)).toBe(0);
  });

  it("charges nothing when the founding fails", async () => {
    await found();
    raw.exec(`INSERT INTO currency_balances (character_id, currency, balance) VALUES ('a', 'linh_thach', 5000)`);
    expect(await createSect(db, cfg, { leaderId: A, name: "THANH VAN", now: NOW })).toEqual({ ok: false, reason: "taken" });
    expect(balance(A)).toBe(5000);
  });
});

describe("joining", () => {
  it("an invitation brings a member in, within the room of the level, and only once", async () => {
    const id = await found();
    expect(await inviteProblem(db, cfg, L, A, NOW)).toBeNull();
    expect(await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: A, now: NOW })).toMatchObject({ ok: true, sectName: "Thanh Van" });
    expect(await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: A, now: NOW })).toEqual({ ok: false, reason: "in_sect" });
    await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: B, now: NOW });
    await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: C, now: NOW });
    expect(await inviteProblem(db, cfg, L, D, NOW)).toBe("full");
    expect(await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: D, now: NOW })).toEqual({ ok: false, reason: "full" });
  });

  it("two commands for the last place cannot both win", async () => {
    const id = await found();
    for (const m of [A, B]) await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: m, now: NOW });
    const results = await Promise.all([C, D].map((m) => acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: m, now: NOW })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM sect_members").get() as { n: number }).n).toBe(4);
  });

  it("a plain disciple cannot invite, and a leaver waits before joining again", async () => {
    const id = await found();
    seat(A, id);
    expect(await inviteProblem(db, cfg, A, B, NOW)).toBe("perm");
    expect(await acceptInvite(db, cfg, { sectId: id, inviterId: A, characterId: B, now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await leaveSect(db, cfg, { characterId: A, now: NOW })).toMatchObject({ ok: true });
    expect(await cooldownUntil(db, A)).toBe(NOW + 24 * HOUR);
    expect(await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: A, now: NOW + HOUR })).toEqual({ ok: false, reason: "cooldown" });
    expect(await acceptInvite(db, cfg, { sectId: id, inviterId: L, characterId: A, now: NOW + 25 * HOUR })).toMatchObject({ ok: true });
  });

  it("applications: limits, approval by a rank that may, and a refusal", async () => {
    const id = await found();
    seat(A, id, 0);
    seat(B, id, 3); // elder
    expect(await applyTo(db, cfg, { characterId: C, sectId: id, on: true, now: NOW })).toEqual({ ok: true });
    expect(await applyTo(db, cfg, { characterId: D, sectId: id, on: true, now: NOW })).toEqual({ ok: true });
    expect((await sectDirectory(db, cfg, C))[0]).toMatchObject({ name: "Thanh Van", members: 3, applied: true, leader: "Nhan lead" });
    expect(await answerRequest(db, cfg, { actorId: A, applicantId: C, ok: true, now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await answerRequest(db, cfg, { actorId: B, applicantId: C, ok: true, now: NOW })).toMatchObject({ ok: true });
    expect(await rankOf(C)).toBe(0);
    expect(await answerRequest(db, cfg, { actorId: B, applicantId: D, ok: false, now: NOW })).toMatchObject({ ok: true });
    expect(await memberOf(db, D)).toBeNull();
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sect_requests").get()).toEqual({ n: 0 });
    // joining another sect clears the other applications
    expect(await applyTo(db, cfg, { characterId: E, sectId: id, on: true, now: NOW })).toEqual({ ok: true });
    expect(await applyTo(db, cfg, { characterId: E, sectId: id, on: false, now: NOW })).toEqual({ ok: true });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sect_requests").get()).toEqual({ n: 0 });
  });
});

describe("ranks", () => {
  it("kicks only a lower rank, with the right to, and starts the wait", async () => {
    const id = await found();
    seat(A, id, 4); // deputy
    seat(B, id, 3); // elder
    seat(C, id, 0);
    expect(await kickMember(db, cfg, { actorId: B, targetId: C, now: NOW })).toEqual({ ok: false, reason: "perm" }); // an elder may not kick
    expect(await kickMember(db, cfg, { actorId: A, targetId: L, now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await kickMember(db, cfg, { actorId: A, targetId: C, now: NOW })).toMatchObject({ ok: true });
    expect(await memberOf(db, C)).toBeNull();
    expect(await cooldownUntil(db, C)).toBe(NOW + 24 * HOUR);
    expect(await kickMember(db, cfg, { actorId: L, targetId: A, now: NOW })).toMatchObject({ ok: true });
  });

  it("only the leader appoints, below themselves, within the limits", async () => {
    const id = await found();
    for (const m of [A, B, C]) seat(m, id);
    expect(await setRole(db, cfg, { actorId: A, targetId: B, role: "elder", now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await setRole(db, cfg, { actorId: L, targetId: A, role: "deputy", now: NOW })).toMatchObject({ ok: true });
    expect(await rankOf(A)).toBe(4);
    const tight: SectCfg = { ...cfg, maxDeputies: 1 };
    expect(await setRole(db, tight, { actorId: L, targetId: B, role: "deputy", now: NOW })).toEqual({ ok: false, reason: "limit" });
    expect(await setRole(db, tight, { actorId: L, targetId: B, role: "elder", now: NOW })).toMatchObject({ ok: true });
    expect(await setRole(db, cfg, { actorId: L, targetId: A, role: "disciple", now: NOW })).toMatchObject({ ok: true });
    expect(await rankOf(A)).toBe(0);
  });

  it("the leadership moves to a member and the old leader becomes a deputy; the leader cannot leave", async () => {
    const id = await found();
    seat(A, id);
    expect(await leaveSect(db, cfg, { characterId: L, now: NOW })).toEqual({ ok: false, reason: "leader" });
    expect(await transferLeader(db, { actorId: A, targetId: L, now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await transferLeader(db, { actorId: L, targetId: A, now: NOW })).toMatchObject({ ok: true });
    expect(await rankOf(A)).toBe(5);
    expect(await rankOf(L)).toBe(4);
    expect(raw.prepare("SELECT leader_id FROM sects").get()).toEqual({ leader_id: A });
    expect(await leaveSect(db, cfg, { characterId: L, now: NOW })).toMatchObject({ ok: true });
  });

  it("the notice is for a deputy and up, and cleaned", async () => {
    const id = await found();
    seat(A, id, 3);
    expect(await setNotice(db, cfg, { actorId: A, text: "hi", now: NOW })).toEqual({ ok: false, reason: "perm" });
    expect(await setNotice(db, cfg, { actorId: L, text: "  Hop  luc  ", now: NOW })).toMatchObject({ ok: true });
    expect(raw.prepare("SELECT notice FROM sects").get()).toEqual({ notice: "Hop luc" });
  });
});

describe("closing and the end of a member", () => {
  it("disbanding sends everyone away with the wait and removes the sect", async () => {
    const id = await found();
    seat(A, id);
    seat(B, id, 4);
    expect(await disbandSect(db, cfg, { actorId: A, now: NOW })).toEqual({ ok: false, reason: "perm" });
    const r = await disbandSect(db, cfg, { actorId: L, now: NOW });
    expect(r).toMatchObject({ ok: true, name: "Thanh Van" });
    expect((r as { members: string[] }).members.sort()).toEqual([A, B, L]);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sects").get()).toEqual({ n: 0 });
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sect_members").get()).toEqual({ n: 0 });
    for (const m of [L, A, B]) expect(await cooldownUntil(db, m)).toBe(NOW + 24 * HOUR);
  });

  it("an idle leader hands the sect to the highest rank, the earliest among equals", async () => {
    const id = await found();
    seat(A, id, 3);
    raw.exec(`INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES ('b', '${id}', 4, ${NOW + 5})`);
    expect(await succeedIdleLeader(db, cfg, id, NOW)).toBeNull();
    raw.exec(`UPDATE characters SET updated_at = ${NOW - 31 * 24 * HOUR} WHERE id = 'lead'`);
    expect(await succeedIdleLeader(db, cfg, id, NOW)).toBe(B);
    expect(await rankOf(B)).toBe(5);
    expect(await rankOf(L)).toBe(4);
  });

  it("a deleted character leaves without the wait; a deleted leader passes the sect on or closes it", async () => {
    const id = await found();
    seat(A, id);
    seat(B, id, 3);
    await removeCharacter(db, A, NOW);
    expect(await memberOf(db, A)).toBeNull();
    expect(await cooldownUntil(db, A)).toBe(0);
    await removeCharacter(db, L, NOW);
    expect(await rankOf(B)).toBe(5);
    await removeCharacter(db, B, NOW);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sects").get()).toEqual({ n: 0 });
  });
});

describe("what the window shows", () => {
  it("lists the members best rank first and the applications only to a rank that approves", async () => {
    const id = await found();
    seat(A, id, 3);
    seat(B, id, 0);
    await applyTo(db, cfg, { characterId: C, sectId: id, on: true, now: NOW });
    const view = await sectView(db, cfg, L, new Set([L]));
    expect(view).toMatchObject({ name: "Thanh Van", myRank: 5, maxMembers: 4 });
    expect(view?.members.map((m) => m.id)).toEqual([L, A, B]);
    expect(view?.members[0]).toMatchObject({ online: true, lv: 11 });
    expect(view?.requests.map((r) => r.id)).toEqual([C]);
    expect((await sectView(db, cfg, B, new Set()))?.requests).toEqual([]);
    expect(await sectView(db, cfg, D, new Set())).toBeNull();
  });
});

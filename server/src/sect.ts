import { SECT_RANK, sectMaxMembers, type SectCfg, type SectError, type SectListItem, type SectRole, type SectView } from "@game/shared";
import { applyCurrencyDelta } from "./economy";
import { filterChat } from "./chat";
import { actorGuard } from "./market";

/**
 * The players' sects (docs/PHASE5.md, 5c-1). The state crosses every map and channel, so no map room can serialize it: every change is ONE D1 batch whose
 * preconditions are guard statements that throw (the pattern of the market and of direct trade), so two commands that meet (the last place, an invitation
 * answered twice, a kick against a promotion) cannot both win. A friendlier reason is worked out first from plain reads; the guards are what makes it safe.
 */
export type SectResult<T = object> = ({ ok: true } & T) | { ok: false; reason: SectError };

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

interface MemberRow {
  character_id: string;
  sect_id: string;
  rank: number;
  contribution: number;
  contribution_total: number;
  joined_at: number;
}

interface SectRow {
  id: string;
  name: string;
  leader_id: string;
  level: number;
  exp: number;
  fund: number;
  notice: string;
  created_at: number;
}

/** True for the errors of a failed guard (the state changed under the caller); anything else is a bug and is rethrown. */
function isGuardFailure(err: unknown): boolean {
  return /inv_guard|idx_sect_|sect_members|sects\.|sect_requests|sect_cooldown|CHECK constraint/.test(String(err));
}

/** Runs a batch; a failed guard comes back as `fallback`. */
async function run(db: D1Database, statements: D1PreparedStatement[], fallback: SectError = "gone"): Promise<SectError | null> {
  try {
    await db.batch(statements);
    return null;
  } catch (err) {
    if (/sects\.name/.test(String(err))) return "taken";
    if (isGuardFailure(err)) return fallback;
    throw err;
  }
}

/** A statement that throws (rolling the whole batch back) when `badIf` holds. */
const guard = (db: D1Database, badIf: string, ...args: unknown[]): D1PreparedStatement => db.prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE ${badIf}`).bind(...args);

const logStatement = (db: D1Database, sectId: string, actor: string | null, action: string, target: string | null, detail: string, now: number): D1PreparedStatement =>
  db.prepare("INSERT INTO sect_log (id, sect_id, actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), sectId, actor, action, target, detail, now);

/** The rank of the guards below: one row of `sect_members` of this sect for this character with at least this rank. */
const hasRank = (id: string, sectId: string, rank: number) => ({ sql: "EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ? AND rank >= ?)", args: [id, sectId, rank] as unknown[] });

export async function memberOf(db: D1Database, characterId: string): Promise<MemberRow | null> {
  return db.prepare("SELECT * FROM sect_members WHERE character_id = ?").bind(characterId).first<MemberRow>();
}

export async function sectById(db: D1Database, id: string): Promise<SectRow | null> {
  return db.prepare("SELECT * FROM sects WHERE id = ?").bind(id).first<SectRow>();
}

export async function cooldownUntil(db: D1Database, characterId: string): Promise<number> {
  return (await db.prepare("SELECT until FROM sect_cooldown WHERE character_id = ?").bind(characterId).first<{ until: number }>())?.until ?? 0;
}

/** The sect name drawn above a character, or undefined. */
export async function sectNameOf(db: D1Database, characterId: string): Promise<string | undefined> {
  const row = await db.prepare("SELECT s.name FROM sect_members m JOIN sects s ON s.id = m.sect_id WHERE m.character_id = ?").bind(characterId).first<{ name: string }>();
  return row?.name;
}

/** The name as a sect would carry it (single spaces, trimmed, letters and digits only, clean of bad words), or null. */
export function validateSectName(raw: unknown, cfg: SectCfg): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const length = [...name].length;
  if (length < cfg.nameMin || length > cfg.nameMax) return null;
  if (!/^[\p{L}\p{N} ]+$/u.test(name)) return null;
  return filterChat(name) === name ? name : null;
}

const memberCount = async (db: D1Database, sectId: string): Promise<number> => (await db.prepare("SELECT COUNT(*) AS n FROM sect_members WHERE sect_id = ?").bind(sectId).first<{ n: number }>())?.n ?? 0;

/** Founds a sect: the fee, the sect and its leader in one batch. */
export async function createSect(db: D1Database, cfg: SectCfg, p: { leaderId: string; name: unknown; now: number }): Promise<SectResult<{ id: string; name: string }>> {
  const name = validateSectName(p.name, cfg);
  if (!name) return { ok: false, reason: "name" };
  const me = await db.prepare("SELECT realm FROM characters WHERE id = ? AND deleted_at IS NULL").bind(p.leaderId).first<{ realm: number }>();
  if (!me) return { ok: false, reason: "gone" };
  if (me.realm < cfg.createRealm) return { ok: false, reason: "realm" };
  if (await memberOf(db, p.leaderId)) return { ok: false, reason: "in_sect" };
  if ((await cooldownUntil(db, p.leaderId)) > p.now) return { ok: false, reason: "cooldown" };
  if (await db.prepare("SELECT 1 AS x FROM sects WHERE name = ?").bind(name).first()) return { ok: false, reason: "taken" };

  const id = crypto.randomUUID();
  const statements = [
    actorGuard(db, p.leaderId, p.now),
    guard(db, "EXISTS (SELECT 1 FROM sect_members WHERE character_id = ?)", p.leaderId),
    guard(db, "EXISTS (SELECT 1 FROM sect_cooldown WHERE character_id = ? AND until > ?)", p.leaderId, p.now),
    db.prepare("INSERT INTO sects (id, name, leader_id, created_at) VALUES (?, ?, ?, ?)").bind(id, name, p.leaderId, p.now),
    db.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES (?, ?, ?, ?)").bind(p.leaderId, id, SECT_RANK.leader, p.now),
    db.prepare("DELETE FROM sect_requests WHERE character_id = ?").bind(p.leaderId),
    logStatement(db, id, p.leaderId, "create", null, name, p.now),
  ];
  try {
    if (cfg.createFee > 0) {
      const res = await applyCurrencyDelta(db, { characterId: p.leaderId, currency: "linh_thach", delta: -cfg.createFee, reason: "sect:create", actor: "system" }, statements);
      if (res.status === "insufficient") return { ok: false, reason: "funds" };
      if (res.status !== "applied") return { ok: false, reason: "gone" };
    } else {
      await db.batch(statements);
    }
  } catch (err) {
    if (/sects\.name/.test(String(err))) return { ok: false, reason: "taken" };
    if (isGuardFailure(err)) return { ok: false, reason: "gone" };
    throw err;
  }
  return { ok: true, id, name };
}

/** The statements that put a character in a sect. The guards throw when the character is in one, waits out a cooldown, or the sect is full or gone. */
function joinStatements(db: D1Database, cfg: SectCfg, sect: SectRow, characterId: string, actor: string | null, how: string, now: number): D1PreparedStatement[] {
  return [
    actorGuard(db, characterId, now),
    guard(db, "EXISTS (SELECT 1 FROM sect_members WHERE character_id = ?)", characterId),
    guard(db, "EXISTS (SELECT 1 FROM sect_cooldown WHERE character_id = ? AND until > ?)", characterId, now),
    guard(db, "NOT EXISTS (SELECT 1 FROM sects WHERE id = ?)", sect.id),
    // `sect.level` can only have risen since it was read, so the cap read from it is never too high.
    guard(db, "(SELECT COUNT(*) FROM sect_members WHERE sect_id = ?) >= ?", sect.id, sectMaxMembers(cfg, sect.level)),
    db.prepare("INSERT INTO sect_members (character_id, sect_id, rank, joined_at) VALUES (?, ?, 0, ?)").bind(characterId, sect.id, now),
    db.prepare("DELETE FROM sect_requests WHERE character_id = ?").bind(characterId),
    logStatement(db, sect.id, actor, how, characterId, "", now),
  ];
}

/** Why `characterId` cannot join `sect` right now, from plain reads. */
async function joinProblem(db: D1Database, cfg: SectCfg, sect: SectRow, characterId: string, now: number): Promise<SectError | null> {
  if (await memberOf(db, characterId)) return "in_sect";
  if ((await cooldownUntil(db, characterId)) > now) return "cooldown";
  if ((await memberCount(db, sect.id)) >= sectMaxMembers(cfg, sect.level)) return "full";
  return null;
}

/** The invited player said yes. `inviterId` must still be allowed to invite. */
export async function acceptInvite(db: D1Database, cfg: SectCfg, p: { sectId: string; inviterId: string; characterId: string; now: number }): Promise<SectResult<{ sectName: string }>> {
  const sect = await sectById(db, p.sectId);
  if (!sect) return { ok: false, reason: "gone" };
  const inviter = await memberOf(db, p.inviterId);
  if (!inviter || inviter.sect_id !== sect.id || inviter.rank < cfg.perms.invite) return { ok: false, reason: "perm" };
  const problem = await joinProblem(db, cfg, sect, p.characterId, p.now);
  if (problem) return { ok: false, reason: problem };
  const failed = await run(db, joinStatements(db, cfg, sect, p.characterId, p.inviterId, "join:invite", p.now), "full");
  return failed ? { ok: false, reason: failed } : { ok: true, sectName: sect.name };
}

/** Why an invitation cannot go out (before it is sent): the inviter's rank and the sect's room. */
export async function inviteProblem(db: D1Database, cfg: SectCfg, inviterId: string, targetId: string, now: number): Promise<SectError | null> {
  const me = await memberOf(db, inviterId);
  if (!me) return "no_sect";
  if (me.rank < cfg.perms.invite) return "perm";
  const sect = await sectById(db, me.sect_id);
  if (!sect) return "gone";
  return joinProblem(db, cfg, sect, targetId, now);
}

/** Applies to a sect, or withdraws the application. */
export async function applyTo(db: D1Database, cfg: SectCfg, p: { characterId: string; sectId: string; on: boolean; now: number }): Promise<SectResult> {
  if (!p.on) {
    await db.prepare("DELETE FROM sect_requests WHERE character_id = ? AND sect_id = ?").bind(p.characterId, p.sectId).run();
    return { ok: true };
  }
  const sect = await sectById(db, p.sectId);
  if (!sect) return { ok: false, reason: "gone" };
  if (await memberOf(db, p.characterId)) return { ok: false, reason: "in_sect" };
  if ((await cooldownUntil(db, p.characterId)) > p.now) return { ok: false, reason: "cooldown" };
  const mine = (await db.prepare("SELECT COUNT(*) AS n FROM sect_requests WHERE character_id = ?").bind(p.characterId).first<{ n: number }>())?.n ?? 0;
  const held = (await db.prepare("SELECT COUNT(*) AS n FROM sect_requests WHERE sect_id = ?").bind(p.sectId).first<{ n: number }>())?.n ?? 0;
  if (mine >= cfg.applyMax || held >= cfg.requestsMax) return { ok: false, reason: "limit" };
  const failed = await run(db, [
    actorGuard(db, p.characterId, p.now),
    guard(db, "EXISTS (SELECT 1 FROM sect_members WHERE character_id = ?)", p.characterId),
    db.prepare("INSERT OR IGNORE INTO sect_requests (character_id, sect_id, created_at) VALUES (?, ?, ?)").bind(p.characterId, p.sectId, p.now),
  ]);
  return failed ? { ok: false, reason: failed } : { ok: true };
}

/** A member with the right to approve takes in (or turns down) an applicant. */
export async function answerRequest(db: D1Database, cfg: SectCfg, p: { actorId: string; applicantId: string; ok: boolean; now: number }): Promise<SectResult<{ sectName: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < cfg.perms.approve) return { ok: false, reason: "perm" };
  const sect = await sectById(db, me.sect_id);
  if (!sect) return { ok: false, reason: "gone" };
  const req = await db.prepare("SELECT 1 AS x FROM sect_requests WHERE character_id = ? AND sect_id = ?").bind(p.applicantId, sect.id).first();
  if (!req) return { ok: false, reason: "gone" };
  if (!p.ok) {
    await db.prepare("DELETE FROM sect_requests WHERE character_id = ? AND sect_id = ?").bind(p.applicantId, sect.id).run();
    return { ok: true, sectName: sect.name };
  }
  const problem = await joinProblem(db, cfg, sect, p.applicantId, p.now);
  if (problem) {
    if (problem === "in_sect" || problem === "cooldown") await db.prepare("DELETE FROM sect_requests WHERE character_id = ? AND sect_id = ?").bind(p.applicantId, sect.id).run();
    return { ok: false, reason: problem };
  }
  const failed = await run(db, [guard(db, `NOT ${hasRank(p.actorId, sect.id, cfg.perms.approve).sql}`, ...hasRank(p.actorId, sect.id, cfg.perms.approve).args), ...joinStatements(db, cfg, sect, p.applicantId, p.actorId, "join:request", p.now)], "full");
  return failed ? { ok: false, reason: failed } : { ok: true, sectName: sect.name };
}

/** The statements that take a member out and start the wait before the next sect. */
function leaveStatements(db: D1Database, cfg: SectCfg, sectId: string, characterId: string, now: number): D1PreparedStatement[] {
  return [
    db.prepare("INSERT OR REPLACE INTO sect_cooldown (character_id, until) VALUES (?, ?)").bind(characterId, now + cfg.rejoinHours * HOUR_MS),
    db.prepare("DELETE FROM sect_members WHERE character_id = ? AND sect_id = ?").bind(characterId, sectId),
  ];
}

/** A member leaves. The leader cannot: they hand the sect on or disband it. */
export async function leaveSect(db: D1Database, cfg: SectCfg, p: { characterId: string; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.characterId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank >= SECT_RANK.leader) return { ok: false, reason: "leader" };
  const failed = await run(db, [
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ? AND rank < ?)", p.characterId, me.sect_id, SECT_RANK.leader),
    ...leaveStatements(db, cfg, me.sect_id, p.characterId, p.now),
    logStatement(db, me.sect_id, p.characterId, "leave", p.characterId, "", p.now),
  ]);
  return failed ? { ok: false, reason: failed } : { ok: true, sectId: me.sect_id };
}

/** A member sends a lower-ranked one away. */
export async function kickMember(db: D1Database, cfg: SectCfg, p: { actorId: string; targetId: string; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  const target = await memberOf(db, p.targetId);
  if (!target || target.sect_id !== me.sect_id || p.actorId === p.targetId) return { ok: false, reason: "gone" };
  if (me.rank < cfg.perms.kick || me.rank <= target.rank) return { ok: false, reason: "perm" };
  const failed = await run(db, [
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_members a JOIN sect_members t ON t.sect_id = a.sect_id WHERE a.character_id = ? AND t.character_id = ? AND a.rank >= ? AND a.rank > t.rank)", p.actorId, p.targetId, cfg.perms.kick),
    ...leaveStatements(db, cfg, me.sect_id, p.targetId, p.now),
    logStatement(db, me.sect_id, p.actorId, "kick", p.targetId, "", p.now),
  ]);
  return failed ? { ok: false, reason: failed } : { ok: true, sectId: me.sect_id };
}

/** Appoints a member to a role (disciple, elder or deputy), within the limits of the sect. */
export async function setRole(db: D1Database, cfg: SectCfg, p: { actorId: string; targetId: string; role: SectRole; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  const target = await memberOf(db, p.targetId);
  if (!target || target.sect_id !== me.sect_id || p.actorId === p.targetId) return { ok: false, reason: "gone" };
  const rank = SECT_RANK[p.role];
  if (me.rank < cfg.perms.appoint || target.rank >= me.rank || rank >= me.rank) return { ok: false, reason: "perm" };
  const cap = p.role === "deputy" ? cfg.maxDeputies : p.role === "elder" ? cfg.maxElders : Infinity;
  const failed = await run(
    db,
    [
      guard(db, "NOT EXISTS (SELECT 1 FROM sect_members a JOIN sect_members t ON t.sect_id = a.sect_id WHERE a.character_id = ? AND t.character_id = ? AND a.rank >= ? AND a.rank > t.rank)", p.actorId, p.targetId, cfg.perms.appoint),
      ...(Number.isFinite(cap) ? [guard(db, "(SELECT COUNT(*) FROM sect_members WHERE sect_id = ? AND rank = ? AND character_id <> ?) >= ?", me.sect_id, rank, p.targetId, cap)] : []),
      db.prepare("UPDATE sect_members SET rank = ? WHERE character_id = ? AND sect_id = ?").bind(rank, p.targetId, me.sect_id),
      logStatement(db, me.sect_id, p.actorId, "role", p.targetId, p.role, p.now),
    ],
    "limit",
  );
  return failed ? { ok: false, reason: failed } : { ok: true, sectId: me.sect_id };
}

/** The leader gives the leadership to a member and becomes a deputy. */
export async function transferLeader(db: D1Database, p: { actorId: string; targetId: string; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < SECT_RANK.leader) return { ok: false, reason: "perm" };
  const target = await memberOf(db, p.targetId);
  if (!target || target.sect_id !== me.sect_id || p.actorId === p.targetId) return { ok: false, reason: "gone" };
  const failed = await run(db, [
    guard(db, "NOT EXISTS (SELECT 1 FROM sects WHERE id = ? AND leader_id = ?)", me.sect_id, p.actorId),
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ?)", p.targetId, me.sect_id),
    // the one-leader index: the old leader steps down before the new one steps up
    db.prepare("UPDATE sect_members SET rank = ? WHERE character_id = ? AND sect_id = ?").bind(SECT_RANK.deputy, p.actorId, me.sect_id),
    db.prepare("UPDATE sect_members SET rank = ? WHERE character_id = ? AND sect_id = ?").bind(SECT_RANK.leader, p.targetId, me.sect_id),
    db.prepare("UPDATE sects SET leader_id = ? WHERE id = ?").bind(p.targetId, me.sect_id),
    logStatement(db, me.sect_id, p.actorId, "transfer", p.targetId, "", p.now),
  ]);
  return failed ? { ok: false, reason: failed } : { ok: true, sectId: me.sect_id };
}

/** The leader closes the sect: everyone leaves with the wait, the sect goes. (The fund and the warehouse come with 5c-2 and 5c-3: they are divided here.) */
export async function disbandSect(db: D1Database, cfg: SectCfg, p: { actorId: string; now: number }): Promise<SectResult<{ sectId: string; members: string[]; name: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < SECT_RANK.leader) return { ok: false, reason: "perm" };
  const sect = await sectById(db, me.sect_id);
  if (!sect) return { ok: false, reason: "gone" };
  const members = (await db.prepare("SELECT character_id FROM sect_members WHERE sect_id = ?").bind(sect.id).all<{ character_id: string }>()).results.map((r) => r.character_id);
  const failed = await run(db, [
    guard(db, "NOT EXISTS (SELECT 1 FROM sects WHERE id = ? AND leader_id = ?)", sect.id, p.actorId),
    // a member that joined since the read is covered too: the cooldown is written from the table itself
    db.prepare("INSERT OR REPLACE INTO sect_cooldown (character_id, until) SELECT character_id, ? FROM sect_members WHERE sect_id = ?").bind(p.now + cfg.rejoinHours * HOUR_MS, sect.id),
    db.prepare("DELETE FROM sect_requests WHERE sect_id = ?").bind(sect.id),
    db.prepare("DELETE FROM sect_members WHERE sect_id = ?").bind(sect.id),
    db.prepare("DELETE FROM sects WHERE id = ?").bind(sect.id),
    logStatement(db, sect.id, p.actorId, "disband", null, sect.name, p.now),
  ]);
  return failed ? { ok: false, reason: failed } : { ok: true, sectId: sect.id, members, name: sect.name };
}

export async function setNotice(db: D1Database, cfg: SectCfg, p: { actorId: string; text: unknown; now: number }): Promise<SectResult<{ sectId: string }>> {
  const me = await memberOf(db, p.actorId);
  if (!me) return { ok: false, reason: "no_sect" };
  if (me.rank < cfg.perms.notice) return { ok: false, reason: "perm" };
  const text = typeof p.text === "string" ? filterChat(p.text.normalize("NFC").replace(/\s+/g, " ").trim()).slice(0, cfg.noticeMax) : "";
  const failed = await run(db, [
    guard(db, `NOT ${hasRank(p.actorId, me.sect_id, cfg.perms.notice).sql}`, ...hasRank(p.actorId, me.sect_id, cfg.perms.notice).args),
    db.prepare("UPDATE sects SET notice = ? WHERE id = ?").bind(text, me.sect_id),
    logStatement(db, me.sect_id, p.actorId, "notice", null, text, p.now),
  ]);
  return failed ? { ok: false, reason: failed } : { ok: true, sectId: me.sect_id };
}

/**
 * A leader who has been away for more than `leaderIdleDays` hands the sect to the highest-ranked member (the earliest to join among equals). Read when
 * a member opens the sect, so no timer is needed. Returns the new leader's id when it happened.
 */
export async function succeedIdleLeader(db: D1Database, cfg: SectCfg, sectId: string, now: number): Promise<string | null> {
  const sect = await sectById(db, sectId);
  if (!sect) return null;
  const leader = await db.prepare("SELECT updated_at FROM characters WHERE id = ?").bind(sect.leader_id).first<{ updated_at: number }>();
  if (!leader || leader.updated_at > now - cfg.leaderIdleDays * DAY_MS) return null;
  const next = await db
    .prepare("SELECT m.character_id AS id FROM sect_members m JOIN characters c ON c.id = m.character_id WHERE m.sect_id = ? AND m.character_id <> ? AND c.deleted_at IS NULL ORDER BY m.rank DESC, m.joined_at ASC LIMIT 1")
    .bind(sectId, sect.leader_id)
    .first<{ id: string }>();
  if (!next) return null;
  const done = await run(db, [
    guard(db, "NOT EXISTS (SELECT 1 FROM sects WHERE id = ? AND leader_id = ?)", sectId, sect.leader_id),
    db.prepare("UPDATE sect_members SET rank = ? WHERE character_id = ? AND sect_id = ?").bind(SECT_RANK.deputy, sect.leader_id, sectId),
    db.prepare("UPDATE sect_members SET rank = ? WHERE character_id = ? AND sect_id = ?").bind(SECT_RANK.leader, next.id, sectId),
    db.prepare("UPDATE sects SET leader_id = ? WHERE id = ?").bind(next.id, sectId),
    logStatement(db, sectId, null, "succeed", next.id, "idle", now),
  ]);
  return done ? null : next.id;
}

/**
 * A character is being deleted: a member leaves without the wait; a leader hands the sect on (as above, whoever is highest) or, with nobody left, the sect closes.
 * Applications go either way.
 */
export async function removeCharacter(db: D1Database, characterId: string, now: number): Promise<void> {
  const me = await memberOf(db, characterId);
  await db.prepare("DELETE FROM sect_requests WHERE character_id = ?").bind(characterId).run();
  await db.prepare("DELETE FROM sect_cooldown WHERE character_id = ?").bind(characterId).run();
  if (!me) return;
  if (me.rank < SECT_RANK.leader) {
    await db.batch([db.prepare("DELETE FROM sect_members WHERE character_id = ?").bind(characterId), logStatement(db, me.sect_id, characterId, "removed", characterId, "", now)]);
    return;
  }
  const next = await db.prepare("SELECT character_id AS id FROM sect_members WHERE sect_id = ? AND character_id <> ? ORDER BY rank DESC, joined_at ASC LIMIT 1").bind(me.sect_id, characterId).first<{ id: string }>();
  if (next) {
    await db.batch([
      db.prepare("DELETE FROM sect_members WHERE character_id = ?").bind(characterId),
      db.prepare("UPDATE sect_members SET rank = ? WHERE character_id = ?").bind(SECT_RANK.leader, next.id),
      db.prepare("UPDATE sects SET leader_id = ? WHERE id = ?").bind(next.id, me.sect_id),
      logStatement(db, me.sect_id, characterId, "removed", next.id, "leader", now),
    ]);
    return;
  }
  await db.batch([
    db.prepare("DELETE FROM sect_requests WHERE sect_id = ?").bind(me.sect_id),
    db.prepare("DELETE FROM sect_members WHERE sect_id = ?").bind(me.sect_id),
    db.prepare("DELETE FROM sects WHERE id = ?").bind(me.sect_id),
    logStatement(db, me.sect_id, characterId, "removed", null, "disband", now),
  ]);
}

/** What the sect window shows a member. `online` says which characters are connected right now. */
export async function sectView(db: D1Database, cfg: SectCfg, characterId: string, online: ReadonlySet<string>): Promise<SectView | null> {
  const me = await memberOf(db, characterId);
  if (!me) return null;
  const sect = await sectById(db, me.sect_id);
  if (!sect) return null;
  const rows = (
    await db
      .prepare(
        "SELECT m.character_id AS id, c.name AS name, m.rank AS rank, c.realm * 10 + c.stage AS lv, m.joined_at AS joined_at, m.contribution_total AS total FROM sect_members m JOIN characters c ON c.id = m.character_id WHERE m.sect_id = ? ORDER BY m.rank DESC, m.contribution_total DESC, m.joined_at ASC",
      )
      .bind(sect.id)
      .all<{ id: string; name: string; rank: number; lv: number; joined_at: number; total: number }>()
  ).results;
  const requests =
    me.rank >= cfg.perms.approve
      ? (
          await db
            .prepare("SELECT r.character_id AS id, c.name AS name, c.realm * 10 + c.stage AS lv, r.created_at AS at FROM sect_requests r JOIN characters c ON c.id = r.character_id WHERE r.sect_id = ? AND c.deleted_at IS NULL ORDER BY r.created_at LIMIT 100")
            .bind(sect.id)
            .all<{ id: string; name: string; lv: number; at: number }>()
        ).results
      : [];
  return {
    id: sect.id,
    name: sect.name,
    level: sect.level,
    maxMembers: sectMaxMembers(cfg, sect.level),
    notice: sect.notice,
    fund: sect.fund,
    exp: sect.exp,
    myRank: me.rank,
    members: rows.map((r) => ({ id: r.id, name: r.name, rank: r.rank, lv: r.lv, online: online.has(r.id), joinedAt: r.joined_at, total: r.total })),
    requests,
    contribution: me.contribution,
  };
}

/** The sects a player can apply to, the biggest first. */
export async function sectDirectory(db: D1Database, cfg: SectCfg, characterId: string): Promise<SectListItem[]> {
  const rows = (
    await db
      .prepare(
        "SELECT s.id AS id, s.name AS name, s.level AS level, s.notice AS notice, c.name AS leader, (SELECT COUNT(*) FROM sect_members WHERE sect_id = s.id) AS members, EXISTS (SELECT 1 FROM sect_requests r WHERE r.sect_id = s.id AND r.character_id = ?) AS applied FROM sects s JOIN characters c ON c.id = s.leader_id ORDER BY members DESC, s.created_at ASC LIMIT 60",
      )
      .bind(characterId)
      .all<{ id: string; name: string; level: number; notice: string; leader: string; members: number; applied: number }>()
  ).results;
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level, members: r.members, maxMembers: sectMaxMembers(cfg, r.level), leader: r.leader, notice: r.notice, applied: r.applied === 1 }));
}

/** Every member of a sect (ids), for telling them something changed. */
export async function memberIds(db: D1Database, sectId: string): Promise<string[]> {
  return (await db.prepare("SELECT character_id FROM sect_members WHERE sect_id = ?").bind(sectId).all<{ character_id: string }>()).results.map((r) => r.character_id);
}

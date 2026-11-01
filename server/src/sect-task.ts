import { getItemDef, scaledIncome, sectTaskMode, vaultSlotsOf, type BagOp, type SectCfg, type SectRankItem, type SectTask } from "@game/shared";
import { currencyStatements, linhThachTraceMin } from "./economy";
import type { BagState } from "./inventory";
import { actorGuard } from "./market";
import { earnStatements, memberOf, sectById, vnDay, type SectResult } from "./sect";

/**
 * The daily tasks of a sect (docs/PHASE5.md, 5c-4): a member hands in items at the sect NPC. The items are used up; the member earns cống hiến, the sect earns exp, the
 * system adds Linh Thạch to the fund (scaled by the Admin's dial, capped per sect per day) and maybe items to the warehouse, and the member may be paid out of the fund.
 * One batch with the bag change; a guard on the member's count of the day and on the sect's income of the day lets two hand-ins at once only through up to the limit.
 */
const guard = (db: D1Database, badIf: string, ...args: unknown[]): D1PreparedStatement => db.prepare(`INSERT INTO inv_guard (ok) SELECT NULL WHERE ${badIf}`).bind(...args);

export interface TaskPrep {
  task: SectTask;
  /** Today's mode of the task for this member: hand in items, or have killed enough monsters. */
  mode: "kill" | "item";
  /** The kills counted for a kill day (read from D1). */
  kills: number;
  /** How many times it was done today. */
  done: number;
  sectId: string;
  level: number;
  day: number;
  /** What goes into the fund (after the dial and the day's cap), and what into the warehouse. */
  fundGain: number;
  incomeCap: number;
  vaultQty: number;
  slots: number;
  traceMin: number;
}

/** Checks everything that does not need the bag: the member, the task, the limit of the day, and works out the income of this hand-in. */
export async function prepareTask(db: D1Database, cfg: SectCfg, p: { characterId: string; taskId: string; now: number }): Promise<SectResult<{ prep: TaskPrep }>> {
  const task = cfg.tasks.find((t) => t.id === p.taskId);
  if (!task || (!task.kill && !getItemDef(task.item))) return { ok: false, reason: "task" };
  const me = await memberOf(db, p.characterId);
  if (!me) return { ok: false, reason: "no_sect" };
  const sect = await sectById(db, me.sect_id);
  if (!sect) return { ok: false, reason: "gone" };
  if (sect.level < task.minLevel) return { ok: false, reason: "perm" };
  const day = vnDay(p.now);
  const row = await db.prepare("SELECT n, kills FROM sect_task_log WHERE character_id = ? AND task_id = ? AND day = ?").bind(p.characterId, task.id, day).first<{ n: number; kills: number }>();
  const done = row?.n ?? 0;
  if (done >= task.perDay) return { ok: false, reason: "limit" };
  const mode = sectTaskMode(task, p.characterId, day);
  if (mode === "item" && !getItemDef(task.item)) return { ok: false, reason: "task" };
  const kills = row?.kills ?? 0;
  if (mode === "kill" && kills < (done + 1) * (task.kill?.count ?? 1)) return { ok: false, reason: "lack" }; // not enough monsters killed yet
  const cap = cfg.taskIncomeCap[Math.min(Math.max(1, sect.level), cfg.taskIncomeCap.length) - 1] ?? 0;
  const had = sect.income_day === day ? sect.income_today : 0;
  const fundGain = Math.max(0, Math.min(scaledIncome(cfg, task.reward.fundLinh), cap - had));
  if (task.reward.memberLinh > sect.fund + fundGain) return { ok: false, reason: "fund" }; // the fund cannot pay the member
  // past the day's cap the warehouse gets nothing either
  const wants = task.reward.vault && cap - had > 0 ? scaledIncome(cfg, task.reward.vault.qty) : 0;
  return {
    ok: true,
    prep: { task, mode, kills, done, sectId: sect.id, level: sect.level, day, fundGain, incomeCap: cap, vaultQty: wants, slots: vaultSlotsOf(cfg, sect.level), traceMin: await linhThachTraceMin(db) },
  };
}

/** What the bag gives up for the hand-in and the statements of the whole change, or null when the bag does not hold enough. */
export function planTask(db: D1Database, cfg: SectCfg, prep: TaskPrep, characterId: string, bag: BagState, now: number): { ops: BagOp[]; extra: D1PreparedStatement[] } | null {
  const { task } = prep;
  const stacks = bag.items.filter((i) => i.type === task.item).sort((a, b) => a.tab - b.tab || a.cell - b.cell);
  if (stacks.reduce((n, s) => n + s.qty, 0) < task.qty) return null;
  const ops: BagOp[] = [];
  let left = task.qty;
  for (const s of stacks) {
    if (left <= 0) break;
    const take = Math.min(s.qty, left);
    left -= take;
    ops.push(take === s.qty ? { op: "remove", id: s.id, qty: s.qty } : { op: "setqty", id: s.id, from: s.qty, to: s.qty - take });
  }
  return { ops, extra: rewardStatements(db, cfg, prep, characterId, now) };
}

/** A kill day's hand-in: nothing leaves the bag, the kills counted so far must cover this turn (a guard, so two claims at once get through only up to what was killed). */
export async function claimKillTask(db: D1Database, cfg: SectCfg, prep: TaskPrep, characterId: string, now: number): Promise<SectResult> {
  try {
    // the turns already taken are read from the row itself (not from the earlier read), so a second claim at the same time needs the kills of the next turn
    await db.batch([guard(db, "NOT EXISTS (SELECT 1 FROM sect_task_log WHERE character_id = ? AND task_id = ? AND day = ? AND kills >= (n + 1) * ?)", characterId, prep.task.id, prep.day, prep.task.kill?.count ?? 1), ...rewardStatements(db, cfg, prep, characterId, now)]);
    return { ok: true };
  } catch (err) {
    if (/inv_guard|CHECK constraint|sect_members/.test(String(err))) return { ok: false, reason: "busy" };
    throw err;
  }
}

/** The statements that pay a finished task (for either mode): the member's turn of the day, the rewards of the member and of the sect, the fund and its income cap. */
function rewardStatements(db: D1Database, cfg: SectCfg, prep: TaskPrep, characterId: string, now: number): D1PreparedStatement[] {
  const { task } = prep;
  const extra: D1PreparedStatement[] = [];
  const r = task.reward;
  extra.push(
    actorGuard(db, characterId, now),
    guard(db, "NOT EXISTS (SELECT 1 FROM sect_members WHERE character_id = ? AND sect_id = ?)", characterId, prep.sectId),
    guard(db, "(SELECT COALESCE((SELECT n FROM sect_task_log WHERE character_id = ? AND task_id = ? AND day = ?), 0)) >= ?", characterId, task.id, prep.day, task.perDay),
  );
  if (prep.fundGain > 0) {
    extra.push(guard(db, "EXISTS (SELECT 1 FROM sects WHERE id = ? AND (CASE WHEN income_day = ? THEN income_today ELSE 0 END) + ? > ?)", prep.sectId, prep.day, prep.fundGain, prep.incomeCap));
  }
  extra.push(
    db.prepare("INSERT INTO sect_task_log (character_id, task_id, day, n) VALUES (?, ?, ?, 1) ON CONFLICT (character_id, task_id, day) DO UPDATE SET n = n + 1").bind(characterId, task.id, prep.day),
    ...earnStatements(db, cfg, characterId, prep.sectId, r.contribution, r.exp),
    // the fund: what the system adds less what the member is paid (the CHECK on the fund throws when it cannot pay), and the day's income
    db
      .prepare("UPDATE sects SET fund = fund + ?, income_today = (CASE WHEN income_day = ? THEN income_today ELSE 0 END) + ?, income_day = ? WHERE id = ?")
      .bind(prep.fundGain - r.memberLinh, prep.day, prep.fundGain, prep.day, prep.sectId),
  );
  if (r.memberLinh > 0) extra.push(...currencyStatements(db, { characterId, currency: "linh_thach", delta: r.memberLinh, reason: "sect:task", actor: "system" }, prep.traceMin, now));
  if (prep.vaultQty > 0 && r.vault) {
    const id = crypto.randomUUID();
    const room = "(SELECT COUNT(*) FROM sect_vault WHERE sect_id = ?) < ?";
    // both rows or neither: the same test on the room left, and the vault row only when the item row went in
    extra.push(
      db.prepare(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, created_at) SELECT ?, ?, ?, ?, ? WHERE ${room}`).bind(id, characterId, r.vault.item, prep.vaultQty, now, prep.sectId, prep.slots),
      db
        .prepare(`INSERT INTO sect_vault (item_id, sect_id, depositor_id, item_type, qty, points, created_at) SELECT ?, ?, ?, ?, ?, 0, ? WHERE EXISTS (SELECT 1 FROM item_instances WHERE id = ?)`)
        .bind(id, prep.sectId, characterId, r.vault.item, prep.vaultQty, now, id),
    );
  }
  extra.push(db.prepare("INSERT INTO sect_log (id, sect_id, actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), prep.sectId, characterId, "task", null, `${task.id} +${prep.fundGain}`, now));
  return extra;
}

/** Writes the kills a room counted for a member: per task and day, capped at what the task can still ask for that day. */
export async function saveSectKills(db: D1Database, characterId: string, list: ReadonlyArray<{ task: string; day: number; add: number; cap: number }>): Promise<void> {
  if (list.length === 0) return;
  const results = await db.batch(
    list.map((k) =>
      db
        .prepare("INSERT INTO sect_task_log (character_id, task_id, day, n, kills) VALUES (?, ?, ?, 0, MIN(?, ?)) ON CONFLICT (character_id, task_id, day) DO UPDATE SET kills = MIN(?, kills + ?)")
        .bind(characterId, k.task, k.day, k.cap, k.add, k.cap, k.add),
    ),
  );
  // Logged so `wrangler tail` shows the real D1 write cost of counting kills (docs/PHASE5.md, 5c-6).
  console.log("sect kills rows_written", list.length, results.reduce((n, r) => n + (r.meta?.rows_written ?? 0), 0));
}

let rankCache: { at: number; list: SectRankItem[] } | null = null;
const RANK_TTL_MS = 60_000;

/** The sects best first (level, then exp, then members), top 30, cached about a minute; and the place of the player's own sect (null with none). */
export async function sectRanking(db: D1Database, characterId: string, now: number): Promise<{ sects: SectRankItem[]; mine: number | null }> {
  if (!rankCache || now - rankCache.at > RANK_TTL_MS) {
    const rows = (
      await db
        .prepare(
          "SELECT s.id AS id, s.name AS name, s.level AS level, s.exp AS exp, c.name AS leader, (SELECT COUNT(*) FROM sect_members WHERE sect_id = s.id) AS members FROM sects s JOIN characters c ON c.id = s.leader_id ORDER BY s.level DESC, s.exp DESC, members DESC, s.created_at ASC LIMIT 30",
        )
        .all<SectRankItem>()
    ).results;
    rankCache = { at: now, list: rows };
  }
  const me = await memberOf(db, characterId);
  let mine: number | null = null;
  if (me) {
    const row = await sectById(db, me.sect_id);
    if (row) {
      const count = (await db.prepare("SELECT COUNT(*) AS n FROM sect_members WHERE sect_id = ?").bind(row.id).first<{ n: number }>())?.n ?? 0;
      const ahead = (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM sects s WHERE s.level > ? OR (s.level = ? AND s.exp > ?) OR (s.level = ? AND s.exp = ? AND (SELECT COUNT(*) FROM sect_members WHERE sect_id = s.id) > ?) " +
              "OR (s.level = ? AND s.exp = ? AND (SELECT COUNT(*) FROM sect_members WHERE sect_id = s.id) = ? AND s.created_at < ?)",
          )
          .bind(row.level, row.level, row.exp, row.level, row.exp, count, row.level, row.exp, count, row.created_at)
          .first<{ n: number }>()
      )?.n;
      mine = (ahead ?? 0) + 1;
    }
  }
  return { sects: rankCache.list, mine };
}

/** Forget the cached ranking (tests). */
export function resetRankCache(): void {
  rankCache = null;
}

import { MAP_IDS, PATHS, PATH_IDS, REALMS, SEED_QUESTS, allNpcIds, giftableItems, isEquipmentType, validateQuests, type QuestDef, type QuestObjective, type QuestRewards } from "@game/shared";
import { logStatement } from "./admin-log";
import { getNpcs } from "./npcs";
import { getQuestCatalog, resetQuestCache } from "./quests";

/**
 * The admin side of the quest catalogue (docs/PHASE3.md 3e). The catalogue is the `quests` table (one JSON definition per quest); a save checks the
 * WHOLE catalogue as it would be afterwards (validateQuests plus the checks below), then writes in one batch: the row (guarded by the `updated_at` the
 * admin saw), the quests whose prerequisite was removed, the `config_versions.quests` bump and the admin log row.
 *
 * Deleting: a quest any character has a row for (active or done) is only taken out of play (soft delete: disabled, read-only, kept so they can finish it);
 * otherwise it is removed. A removed quest of the seed catalogue leaves a tombstone row so the seeding does not put it back. Either way the quests that
 * required it now require what it required (the chain closes up).
 */
export const QUEST_LOG_SCREEN = "Nhiệm vụ";
const TITLE_MAX = 80;
const DESC_MAX = 500;

interface Row {
  id: string;
  def: string;
  enabled: number;
  updated_at: number;
  deleted_at: number | null;
  tomb: number;
}

export interface QuestListItem {
  def: QuestDef;
  updatedAt: number;
  /** Taken out by an admin but kept for the characters who hold it: read-only. */
  deleted: boolean;
  active: number;
  done: number;
}

export interface QuestMeta {
  /** NPCs a quest can be given by (the ones that open the quest window) and the ones it can send the player to talk to. */
  givers: Array<{ id: string; name: string; maps: string[] }>;
  npcs: Array<{ id: string; name: string; maps: string[] }>;
  items: Array<{ id: string; nameVi: string; maxStack: number }>;
  maps: string[];
  realms: Array<{ id: number; nameVi: string }>;
  paths: Array<{ id: string; nameVi: string; itemId: string }>;
  chains: string[];
  limits: { title: number; description: number };
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function liveDef(r: Row): QuestDef {
  return { ...(JSON.parse(r.def) as QuestDef), enabled: r.enabled === 1 };
}

async function allRows(db: D1Database): Promise<Row[]> {
  try {
    await getQuestCatalog(db); // seeds the catalogue the first time and installs the NPCs; a catalogue that is broken right now must not stop an admin from fixing it
  } catch (err) {
    console.error("quest catalogue is not valid while the admin reads it", err);
  }
  return (await db.prepare("SELECT id, def, enabled, updated_at, deleted_at, tomb FROM quests ORDER BY chain, seq, id").all<Row>()).results;
}

async function progressCounts(db: D1Database): Promise<Map<string, { active: number; done: number }>> {
  const { results } = await db.prepare("SELECT quest_id, state, COUNT(*) AS n FROM character_quests GROUP BY quest_id, state").all<{ quest_id: string; state: string; n: number }>();
  const out = new Map<string, { active: number; done: number }>();
  for (const r of results) {
    const c = out.get(r.quest_id) ?? { active: 0, done: 0 };
    if (r.state === "active") c.active = r.n;
    else c.done = r.n;
    out.set(r.quest_id, c);
  }
  return out;
}

export async function listQuests(db: D1Database): Promise<QuestListItem[]> {
  const [rows, counts] = await Promise.all([allRows(db), progressCounts(db)]);
  return rows
    .filter((r) => r.tomb === 0)
    .map((r) => ({ def: liveDef(r), updatedAt: r.updated_at, deleted: r.deleted_at !== null, active: counts.get(r.id)?.active ?? 0, done: counts.get(r.id)?.done ?? 0 }));
}

export async function questMeta(db: D1Database, chains: readonly string[]): Promise<QuestMeta> {
  const spots = await getNpcs(db);
  const group = (list: typeof spots) => {
    const byId = new Map<string, { id: string; name: string; maps: string[] }>();
    for (const s of list) {
      const e = byId.get(s.id) ?? { id: s.id, name: s.name ?? s.id, maps: [] };
      e.maps.push(s.mapId);
      byId.set(s.id, e);
    }
    return [...byId.values()];
  };
  return {
    givers: group(spots.filter((s) => s.kind === "quest")),
    npcs: group(spots),
    items: giftableItems(),
    maps: [...MAP_IDS],
    realms: REALMS.map((r) => ({ id: r.id, nameVi: r.nameVi })),
    paths: PATH_IDS.map((id) => ({ id, nameVi: PATHS[id].nameVi, itemId: PATHS[id].item })),
    chains: [...new Set(chains)].sort(),
    limits: { title: TITLE_MAX, description: DESC_MAX },
  };
}

function cleanItems(raw: unknown, max: number): Array<{ item: string; qty: number }> | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: Array<{ item: string; qty: number }> = [];
  for (const it of raw) {
    if (!it || typeof it !== "object" || !isStr((it as { item?: unknown }).item, 60) || !isInt((it as { qty?: unknown }).qty)) return null;
    out.push({ item: (it as { item: string }).item, qty: (it as { qty: number }).qty });
  }
  return out;
}

/** Picks the known fields of a posted quest with the right types (anything else is dropped); a string is the problem found. */
export function cleanQuest(raw: unknown): QuestDef | string {
  if (!raw || typeof raw !== "object") return "quest: not an object";
  const q = raw as Record<string, unknown>;
  if (!isStr(q.id, 40) || !isStr(q.chain, 24) || !isInt(q.seq) || !isStr(q.giver, 24) || !isStr(q.titleVi, 400) || !isStr(q.descVi, 4000) || typeof q.enabled !== "boolean") return "quest: a field is missing or has the wrong type";
  if (q.requires !== null && !isStr(q.requires, 40)) return "quest: bad prerequisite";
  const title = q.titleVi.normalize("NFC").trim();
  const desc = q.descVi.normalize("NFC").trim();
  if ([...title].length > TITLE_MAX || [...desc].length > DESC_MAX) return `quest ${q.id}: the title is limited to ${TITLE_MAX} and the description to ${DESC_MAX} characters`;
  const o = q.objective as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return "quest: bad objective";
  let objective: QuestObjective;
  if (o.kind === "talk" && isStr(o.npc, 24)) objective = { kind: "talk", npc: o.npc };
  else if (o.kind === "kill" && isInt(o.count) && (o.map === undefined || isStr(o.map, 24)) && (o.rare === undefined || typeof o.rare === "boolean"))
    objective = { kind: "kill", count: o.count, ...(o.map ? { map: o.map as string } : {}), ...(o.rare ? { rare: true } : {}) };
  else if (o.kind === "collect" && isStr(o.item, 60) && isInt(o.qty)) {
    const also = cleanItems(o.also, 4);
    if (!also) return "quest: bad extra items";
    objective = { kind: "collect", item: o.item, qty: o.qty, ...(also.length ? { also } : {}) };
  } else if (o.kind === "reach" && isInt(o.realm) && isInt(o.stage)) objective = { kind: "reach", realm: o.realm, stage: o.stage };
  else return "quest: bad objective";
  const r = (q.rewards ?? {}) as Record<string, unknown>;
  const items = cleanItems(r.items, 5);
  if (!items) return "quest: bad reward items";
  const rewards: QuestRewards = {
    ...(r.linhThach !== undefined && r.linhThach !== 0 ? { linhThach: r.linhThach as number } : {}),
    ...(r.congHien !== undefined && r.congHien !== 0 ? { congHien: r.congHien as number } : {}),
    ...(r.exp !== undefined && r.exp !== 0 ? { exp: r.exp as number } : {}),
    ...(items.length ? { items } : {}),
  };
  for (const k of ["linhThach", "congHien", "exp"] as const) if (rewards[k] !== undefined && !isInt(rewards[k])) return `quest ${q.id}: the ${k} reward must be a whole number`;
  if (q.minRealm !== undefined && !isInt(q.minRealm)) return "quest: bad minimum realm";
  if (q.minStage !== undefined && !isInt(q.minStage)) return "quest: bad minimum stage";
  if (q.path !== undefined && typeof q.path !== "string") return "quest: bad path";
  if (q.repeat !== undefined && typeof q.repeat !== "string") return "quest: bad repeat";
  return {
    id: q.id,
    chain: q.chain,
    seq: q.seq,
    giver: q.giver,
    titleVi: title,
    descVi: desc,
    enabled: q.enabled,
    requires: q.requires,
    ...(q.minRealm !== undefined ? { minRealm: q.minRealm as number } : {}),
    ...(q.minStage !== undefined ? { minStage: q.minStage as number } : {}),
    ...(q.path !== undefined ? { path: q.path as QuestDef["path"] } : {}),
    ...(q.repeat !== undefined ? { repeat: q.repeat as QuestDef["repeat"] } : {}),
    objective,
    rewards,
  };
}

/** What validateQuests does not check: the giver opens the quest window, the kill map exists, no equipment (it has no durability or rolled stats here). */
async function extraProblems(db: D1Database, only: readonly QuestDef[]): Promise<string[]> {
  const givers = new Set((await getNpcs(db)).filter((s) => s.kind === "quest").map((s) => s.id));
  const problems: string[] = [];
  for (const q of only) {
    if (!givers.has(q.giver)) problems.push(`quest ${q.id}: ${q.giver} is not an NPC that gives quests`);
    if (q.objective.kind === "kill" && q.objective.map !== undefined && !(MAP_IDS as readonly string[]).includes(q.objective.map)) problems.push(`quest ${q.id}: unknown map ${q.objective.map}`);
    const items = [...(q.rewards.items ?? []).map((i) => i.item), ...(q.objective.kind === "collect" ? [q.objective.item, ...(q.objective.also ?? []).map((i) => i.item)] : [])];
    for (const item of items) if (isEquipmentType(item)) problems.push(`quest ${q.id}: equipment (${item}) cannot be a reward or a requested item yet`);
  }
  return problems;
}

const FIELD_LABELS: Array<[keyof QuestDef, string]> = [
  ["titleVi", "tiêu đề"],
  ["descVi", "mô tả"],
  ["enabled", "bật/tắt"],
  ["giver", "người giao"],
  ["requires", "nhiệm vụ trước"],
  ["chain", "chuỗi"],
  ["seq", "thứ tự"],
  ["minRealm", "cảnh giới tối thiểu"],
  ["minStage", "tầng tối thiểu"],
  ["path", "hướng tu"],
  ["repeat", "lặp lại"],
  ["objective", "yêu cầu"],
  ["rewards", "phần thưởng"],
];

function changedFields(before: QuestDef, after: QuestDef): string[] {
  return FIELD_LABELS.filter(([k]) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)).map(([, label]) => label);
}

export type QuestSaveResult =
  | { ok: true; updatedAt: number; changed: string[] }
  | { ok: false; error: "invalid" | "exists" | "has_progress" | "not_found" | "deleted" | "version_conflict" | "locked_field" | "unchanged" | "busy"; problems?: string[] };

type QuestFailure = Exclude<QuestSaveResult, { ok: true }>;

function mapBatchError(err: unknown): QuestFailure {
  const msg = String(err);
  if (msg.includes("inv_guard")) return { ok: false, error: "busy" };
  if (msg.includes("quests.def") || msg.includes("NOT NULL")) return { ok: false, error: "version_conflict" };
  if (msg.includes("quests.id")) return { ok: false, error: "exists" };
  throw err;
}

const bump = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'quests'").bind(at);

async function hasProgress(db: D1Database, id: string): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 AS x FROM character_quests WHERE quest_id = ? LIMIT 1").bind(id).first());
}

/** Creates (`isNew`) or changes a quest. `updatedAt` is the token of the row the admin was looking at (ignored for a new quest). */
export async function saveQuest(db: D1Database, adminEmail: string, posted: unknown, isNew: boolean, updatedAt: number, now = Date.now()): Promise<QuestSaveResult> {
  const cleaned = cleanQuest(posted);
  if (typeof cleaned === "string") return { ok: false, error: "invalid", problems: [cleaned] };
  const rows = await allRows(db);
  const current = rows.find((r) => r.id === cleaned.id);
  if (isNew && (current || (await hasProgress(db, cleaned.id)))) return { ok: false, error: current ? "exists" : "has_progress" };
  if (!isNew) {
    if (!current || current.tomb === 1) return { ok: false, error: "not_found" };
    if (current.deleted_at !== null) return { ok: false, error: "deleted" };
    if (current.updated_at !== updatedAt) return { ok: false, error: "version_conflict" };
  }
  const before = current ? liveDef(current) : null;
  if (before && (await hasProgress(db, cleaned.id))) {
    // These change what the rows of the characters mean: progress counts of another kind of objective, a path's one-time item key, a daily reset.
    if (before.objective.kind !== cleaned.objective.kind) return { ok: false, error: "locked_field", problems: ["objective"] };
    if ((before.path ?? null) !== (cleaned.path ?? null)) return { ok: false, error: "locked_field", problems: ["path"] };
    if ((before.repeat ?? null) !== (cleaned.repeat ?? null)) return { ok: false, error: "locked_field", problems: ["repeat"] };
  }
  const after = rows.filter((r) => r.tomb === 0 && r.id !== cleaned.id).map(liveDef);
  after.push(cleaned);
  const problems = [...validateQuests(after, allNpcIds()), ...(await extraProblems(db, [cleaned]))];
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const changed = before ? changedFields(before, cleaned) : [];
  if (before && changed.length === 0) return { ok: false, error: "unchanged" };
  const stamp = Math.max(now, updatedAt + 1);
  const statements = before
    ? [
        db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM quests WHERE id = ? AND tomb = 0 AND deleted_at IS NULL)").bind(cleaned.id),
        db
          .prepare("UPDATE quests SET def = CASE WHEN updated_at = ? THEN ? ELSE NULL END, chain = ?, seq = ?, enabled = ?, updated_at = ? WHERE id = ?")
          .bind(updatedAt, JSON.stringify(cleaned), cleaned.chain, cleaned.seq, cleaned.enabled ? 1 : 0, stamp, cleaned.id),
      ]
    : [db.prepare("INSERT INTO quests (id, chain, seq, enabled, def, updated_at, deleted_at, tomb) VALUES (?, ?, ?, ?, ?, ?, NULL, 0)").bind(cleaned.id, cleaned.chain, cleaned.seq, cleaned.enabled ? 1 : 0, JSON.stringify(cleaned), stamp)];
  statements.push(
    bump(db, stamp),
    logStatement(db, { adminEmail, screen: QUEST_LOG_SCREEN, content: before ? `Sửa nhiệm vụ «${cleaned.titleVi}» (${cleaned.id}): ${changed.join(", ")}` : `Thêm nhiệm vụ «${cleaned.titleVi}» (${cleaned.id}), chuỗi ${cleaned.chain}` }, now),
  );
  try {
    await db.batch(statements);
  } catch (err) {
    return mapBatchError(err);
  }
  resetQuestCache();
  return { ok: true, updatedAt: stamp, changed };
}

export type QuestDeleteResult = { ok: true; mode: "soft" | "hard"; relinked: string[] } | Exclude<QuestSaveResult, { ok: true }>;

/** Deletes a quest (see the top of the file): soft when any character has a row for it, otherwise hard (a tombstone for a seeded one). */
export async function deleteQuest(db: D1Database, adminEmail: string, id: string, updatedAt: number, now = Date.now()): Promise<QuestDeleteResult> {
  const rows = await allRows(db);
  const row = rows.find((r) => r.id === id);
  if (!row || row.tomb === 1) return { ok: false, error: "not_found" };
  if (row.deleted_at !== null) return { ok: false, error: "deleted" };
  if (row.updated_at !== updatedAt) return { ok: false, error: "version_conflict" };
  const target = liveDef(row);
  const soft = await hasProgress(db, id);
  // The quests that required this one now require what it required.
  const dependents = rows.filter((r) => r.tomb === 0 && r.id !== id && liveDef(r).requires === id).map((r) => ({ row: r, def: { ...liveDef(r), requires: target.requires } }));
  const remaining = rows.filter((r) => r.tomb === 0 && r.id !== id).map((r) => dependents.find((d) => d.row.id === r.id)?.def ?? liveDef(r));
  const after = soft ? [...remaining, { ...target, enabled: false }] : remaining;
  const problems = validateQuests(after, allNpcIds());
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const stamp = Math.max(now, updatedAt + 1);
  const statements: D1PreparedStatement[] = [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM quests WHERE id = ? AND updated_at = ? AND tomb = 0 AND deleted_at IS NULL)").bind(id, updatedAt),
  ];
  if (soft) {
    statements.push(db.prepare("UPDATE quests SET enabled = 0, deleted_at = ?, updated_at = ?, def = ? WHERE id = ?").bind(now, stamp, JSON.stringify({ ...target, enabled: false }), id));
  } else {
    // Nobody may have taken it between the check and the batch.
    statements.push(db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE EXISTS (SELECT 1 FROM character_quests WHERE quest_id = ?)").bind(id));
    statements.push(
      SEED_QUESTS.some((q) => q.id === id)
        ? db.prepare("UPDATE quests SET enabled = 0, deleted_at = ?, tomb = 1, updated_at = ? WHERE id = ?").bind(now, stamp, id)
        : db.prepare("DELETE FROM quests WHERE id = ?").bind(id),
    );
  }
  for (const d of dependents) statements.push(db.prepare("UPDATE quests SET def = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(d.def), stamp, d.row.id));
  statements.push(
    bump(db, stamp),
    logStatement(
      db,
      {
        adminEmail,
        screen: QUEST_LOG_SCREEN,
        content: `Xóa ${soft ? "mềm" : "cứng"} nhiệm vụ «${target.titleVi}» (${id})${soft ? ": còn người chơi giữ tiến độ nên chỉ ngừng phát" : ""}${dependents.length ? `; nối lại nhiệm vụ trước của: ${dependents.map((d) => d.row.id).join(", ")} → ${target.requires ?? "không có"}` : ""}`,
      },
      now,
    ),
  );
  try {
    await db.batch(statements);
  } catch (err) {
    const failure = mapBatchError(err);
    // The first guard fails when the row changed since the admin looked: that is a stale token, not a character taking the quest.
    if (failure.error === "busy" && (await db.prepare("SELECT 1 AS x FROM quests WHERE id = ? AND updated_at = ? AND tomb = 0 AND deleted_at IS NULL").bind(id, updatedAt).first()) === null) return { ok: false, error: "version_conflict" };
    return failure;
  }
  resetQuestCache();
  return { ok: true, mode: soft ? "soft" : "hard", relinked: dependents.map((d) => d.row.id) };
}

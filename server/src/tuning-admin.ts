import { ADMIN_TUNING_SCREENS, CLUSTERS, DEFAULT_TUNING, GUARD_KIND, MAP_REALM, MONSTERS, adminScreenFields, adminTuningScreen, getPath, setPath, validTuningGroup, type Tuning, type TuningField, type TuningPage } from "@game/shared";
import { logStatement } from "./admin-log";
import { getTuning, resetTuningCache } from "./tuning";

/**
 * The admin side of `game_tuning` (screen "Chỉ số khác", PHASE3 3c): read the groups of ADMIN_TUNING_SCREENS and save one group.
 * A save is one batch: the group row (guarded by the `updated_at` the admin saw), the `config_versions.tuning` bump that makes every isolate
 * reload within its cache time, and the admin log row.
 */
export const TUNING_LOG_SCREEN = "Chỉ số khác";

export interface TuningGroupView {
  group: string;
  title: string;
  note: string;
  fields: TuningField[];
  /** The value in force (the stored one, or the default when the stored row cannot be used). */
  value: unknown;
  default: unknown;
  /** Version token of the row: send it back with a save. */
  updatedAt: number;
  updatedBy: string | null;
  /** False: the stored row no longer fits the group's shape, so the game runs on the defaults until a save replaces it. */
  stored: boolean;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

interface Row {
  name: string;
  value: string;
  updated_at: number;
  updated_by: string | null;
}

async function readRows(db: D1Database): Promise<Map<string, Row>> {
  await getTuning(db); // seeds the rows that do not exist yet
  const names = ADMIN_TUNING_SCREENS.map((g) => g.group);
  const { results } = await db
    .prepare(`SELECT name, value, updated_at, updated_by FROM game_tuning WHERE name IN (${names.map(() => "?").join(",")})`)
    .bind(...names)
    .all<Row>();
  return new Map(results.map((r) => [r.name, r]));
}

function usable(group: string, raw: string | undefined): unknown | undefined {
  if (raw === undefined) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    return validTuningGroup(group, v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Every group of an admin page (default: "Chỉ số khác") with its value and version token. */
export async function listTuningGroups(db: D1Database, page: TuningPage = "misc"): Promise<TuningGroupView[]> {
  const rows = await readRows(db);
  return ADMIN_TUNING_SCREENS.filter((g) => g.page === page).map((g) => {
    const row = rows.get(g.group);
    const stored = usable(g.group, row?.value);
    return {
      group: g.group,
      title: g.title,
      note: g.note ?? "",
      fields: adminScreenFields(g),
      value: stored ?? clone(DEFAULT_TUNING[g.group]),
      default: clone(DEFAULT_TUNING[g.group]),
      updatedAt: row?.updated_at ?? 0,
      updatedBy: row?.updated_by ?? null,
      stored: stored !== undefined || row === undefined,
    };
  });
}

function fmt(v: unknown): string {
  return String(v);
}

/** "label: a → b; ..." for the leaves that differ, cut short enough for the log's 500 characters. */
export function describeChanges(fields: readonly TuningField[], before: unknown, after: unknown, limit = 380): { text: string; count: number } {
  const parts = fields.filter((f) => getPath(before, f.path) !== getPath(after, f.path)).map((f) => `${f.label}: ${fmt(getPath(before, f.path))} → ${fmt(getPath(after, f.path))}`);
  let text = "";
  let shown = 0;
  for (const p of parts) {
    if (text.length + p.length + 2 > limit && shown > 0) break;
    text += (shown > 0 ? "; " : "") + p.slice(0, limit);
    shown++;
  }
  if (shown < parts.length) text += `; (và ${parts.length - shown} thay đổi nữa)`;
  return { text, count: parts.length };
}

export type SaveTuningResult =
  | { ok: true; updatedAt: number; changes: number }
  | { ok: false; error: "unknown_group" | "invalid" | "unchanged" | "version_conflict"; problems?: string[] };

/**
 * Checks that depend on the game's content and so are not in `validTuningGroup` (which only checks structure, because the loader runs it): which species may be
 * the boss of a map. A species that stands in a cluster of any map would turn every such monster into a "boss" (no respawn, boss tag, shared reward), the guard
 * species has its own rules, a map without a realm (a town) has no boss, and the boss of a map cannot change while that boss is on the map (its claim in D1).
 */
async function groupProblems(db: D1Database, group: string, before: unknown, after: unknown): Promise<string[]> {
  if (group !== "boss") return [];
  const out: string[] = [];
  const was = (before as Tuning["boss"]).species;
  const now = (after as Tuning["boss"]).species;
  const inClusters = new Set(Object.values(CLUSTERS).flatMap((list) => list.map((c) => c.kind)));
  // A claim older than the boss's time limit is treated as lost by the game (the room that held it never came back), so it does not count here either.
  const ttl = (before as Tuning["boss"]).claimTtlMs;
  const claimed = new Set((await db.prepare("SELECT map_id FROM world_boss WHERE claimed_at > ?").bind(Date.now() - ttl).all<{ map_id: string }>()).results.map((r) => r.map_id));
  for (const [map, species] of Object.entries(now)) {
    if (species === (was[map] ?? null)) continue;
    if (species === null) continue;
    if (!(species in MONSTERS)) out.push(`${map}: loài ${species} không tồn tại`);
    else if (inClusters.has(species)) out.push(`${map}: loài ${species} đang có trong bãi quái, chọn loài khác (nếu không mọi con quái loài đó thành boss)`);
    else if (species === GUARD_KIND) out.push(`${map}: vệ binh không thể làm boss`);
    if ((MAP_REALM as Record<string, number | null>)[map] === null || !(map in MAP_REALM)) out.push(`${map}: bản đồ không có cảnh giới nên không có boss`);
  }
  for (const map of Object.keys({ ...was, ...now })) if ((was[map] ?? null) !== (now[map] ?? null) && claimed.has(map)) out.push(`${map}: boss đang có mặt, chờ nó bị hạ (hoặc gỡ nó bằng nút GM trong game) rồi hãy đổi loài`);
  return out;
}

/**
 * Saves one group. `posted` carries a number for each field of the group (anything else in it is ignored); the rest of the stored value is
 * kept, and the result must pass validTuningGroup. `expectedUpdatedAt` is the token of the row the admin was looking at: a mismatch rolls the
 * whole batch back (the CASE writes NULL into a NOT NULL column), so two admins cannot overwrite each other.
 */
export async function saveTuningGroup(db: D1Database, group: string, posted: unknown, expectedUpdatedAt: number, adminEmail: string, now = Date.now()): Promise<SaveTuningResult> {
  const screen = adminTuningScreen(group);
  if (!screen) return { ok: false, error: "unknown_group" };
  const rows = await readRows(db);
  const row = rows.get(group);
  if (!row) return { ok: false, error: "unknown_group" };
  const current = (usable(group, row.value) ?? clone(DEFAULT_TUNING[screen.group])) as Tuning[typeof screen.group];
  const next = clone(current);
  const fields = adminScreenFields(screen);
  for (const f of fields) {
    const v = getPath(posted, f.path);
    const typeOk =
      f.kind === "color"
        ? typeof v === "string" && v.length > 0 && v.length <= 60
        : f.kind === "species"
          ? v === null || (typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v))
          : typeof v === "number" && Number.isFinite(v) && (f.kind !== "int" || Number.isInteger(v));
    if (!typeOk) return { ok: false, error: "invalid" };
    if (!setPath(next, f.path, v)) return { ok: false, error: "invalid" };
  }
  if (!validTuningGroup(group, next)) return { ok: false, error: "invalid" };
  const diff = describeChanges(fields, current, next);
  if (diff.count === 0) return { ok: false, error: "unchanged" };
  const problems = await groupProblems(db, group, current, next);
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  const updatedAt = Math.max(now, expectedUpdatedAt + 1);
  try {
    await db.batch([
      db
        .prepare("UPDATE game_tuning SET value = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE name = ?")
        .bind(expectedUpdatedAt, JSON.stringify(next), updatedAt, adminEmail, group),
      db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'tuning'").bind(updatedAt),
      logStatement(db, { adminEmail, screen: TUNING_LOG_SCREEN, content: `${screen.title} — ${diff.text}` }, now),
    ]);
  } catch (err) {
    if (String(err).includes("game_tuning")) return { ok: false, error: "version_conflict" };
    throw err;
  }
  resetTuningCache();
  return { ok: true, updatedAt, changes: diff.count };
}

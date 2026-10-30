import { DEFAULT_TUNING, validTuningGroup, type TuningGroup } from "@game/shared";
import { logStatement } from "./admin-log";
import { getTuning, resetTuningCache } from "./tuning";

/**
 * The admin side of the picture groups of `game_tuning` (PHASE4 4i): which model draws a species, what an NPC wears, how a map is drawn, which icon an item or a
 * skill has, which look a skill's effect has... Every value is one of the choices that already exist (the Admin picks, nothing is uploaded), so a group is saved
 * whole: the structure is checked by `validTuningGroup`, and the version token of the row keeps two admins from overwriting each other (the same batch as the
 * numbers of "Chỉ số khác": the row guarded by `updated_at`, the `config_versions.tuning` bump that reloads every isolate, and the admin log row).
 */
export const LOOKS_LOG_SCREEN = "Hình ảnh";

export const LOOK_GROUPS = ["outfits", "monsterModels", "monsterTints", "mapArt", "npcLooks", "flightLooks", "skillLooks", "iconLooks"] as const satisfies readonly TuningGroup[];
export type LookGroup = (typeof LOOK_GROUPS)[number];

export interface LookGroupView {
  group: LookGroup;
  value: unknown;
  default: unknown;
  /** Version token of the row: send it back with a save. */
  updatedAt: number;
  updatedBy: string | null;
}

interface Row {
  name: string;
  value: string;
  updated_at: number;
  updated_by: string | null;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isLookGroup = (g: string): g is LookGroup => (LOOK_GROUPS as readonly string[]).includes(g);

async function readRows(db: D1Database): Promise<Map<string, Row>> {
  await getTuning(db); // seeds the rows that do not exist yet
  const { results } = await db
    .prepare(`SELECT name, value, updated_at, updated_by FROM game_tuning WHERE name IN (${LOOK_GROUPS.map(() => "?").join(",")})`)
    .bind(...LOOK_GROUPS)
    .all<Row>();
  return new Map(results.map((r) => [r.name, r]));
}

function usable(group: LookGroup, raw: string | undefined): unknown | undefined {
  if (raw === undefined) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    return validTuningGroup(group, v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** The picture groups with their value in force (the stored one, or the default when the stored row cannot be used), the default and the version token. */
export async function listLookGroups(db: D1Database): Promise<LookGroupView[]> {
  const rows = await readRows(db);
  return LOOK_GROUPS.map((group) => {
    const row = rows.get(group);
    return { group, value: usable(group, row?.value) ?? clone(DEFAULT_TUNING[group]), default: clone(DEFAULT_TUNING[group]), updatedAt: row?.updated_at ?? 0, updatedBy: row?.updated_by ?? null };
  });
}

/** `path: value` for every leaf of a value (arrays by index), to tell what a save changed. */
function leaves(value: unknown, path = "", out = new Map<string, string>()): Map<string, string> {
  if (typeof value === "object" && value !== null) for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  else out.set(path, String(value));
  return out;
}

/** "path: a → b; ..." for the leaves that differ, cut short enough for the log's 500 characters. */
export function describeLookChanges(before: unknown, after: unknown, limit = 380): { text: string; count: number } {
  const a = leaves(before);
  const b = leaves(after);
  const parts: string[] = [];
  for (const [k, v] of b) if (a.get(k) !== v) parts.push(`${k}: ${a.get(k) ?? "(không có)"} → ${v}`);
  for (const k of a.keys()) if (!b.has(k)) parts.push(`${k}: ${a.get(k)} → (xóa)`);
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

export type SaveLookResult = { ok: true; updatedAt: number; changes: number } | { ok: false; error: "unknown_group" | "invalid" | "unchanged" | "version_conflict" };

/** Saves one picture group whole. `expectedUpdatedAt` is the token of the row the admin was looking at: a mismatch rolls the whole batch back. */
export async function saveLookGroup(db: D1Database, group: string, value: unknown, expectedUpdatedAt: number, adminEmail: string, now = Date.now()): Promise<SaveLookResult> {
  if (!isLookGroup(group)) return { ok: false, error: "unknown_group" };
  if (!validTuningGroup(group, value)) return { ok: false, error: "invalid" };
  const row = (await readRows(db)).get(group);
  if (!row) return { ok: false, error: "unknown_group" };
  const current = usable(group, row.value) ?? clone(DEFAULT_TUNING[group]);
  const diff = describeLookChanges(current, value);
  if (diff.count === 0) return { ok: false, error: "unchanged" };
  const updatedAt = Math.max(now, expectedUpdatedAt + 1);
  try {
    await db.batch([
      db
        .prepare("UPDATE game_tuning SET value = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE name = ?")
        .bind(expectedUpdatedAt, JSON.stringify(value), updatedAt, adminEmail, group),
      db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'tuning'").bind(updatedAt),
      logStatement(db, { adminEmail, screen: LOOKS_LOG_SCREEN, content: `${group} — ${diff.text}` }, now),
    ]);
  } catch (err) {
    if (String(err).includes("game_tuning")) return { ok: false, error: "version_conflict" };
    throw err;
  }
  resetTuningCache();
  return { ok: true, updatedAt, changes: diff.count };
}

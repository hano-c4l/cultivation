import { DEFAULT_ALCHEMY, allItemDefs, getItemDef, isEquipmentType, validAlchemy, type AlchemyCfg } from "@game/shared";
import { logStatement } from "./admin-log";
import { getItemOverlays } from "./items-live";
import { getTuning, resetTuningCache } from "./tuning";

/**
 * The admin side of the alchemist's recipes (docs/PHASE3.md 3k): the tuning group `alchemy` (how many brewings at once, and the recipes). One save replaces the
 * group in one batch guarded by the `updated_at` of its row, with the tuning version bump and the admin log row. Whether the items exist is checked here, not in
 * the validator that also runs when the game reads the group (an item taken out of play later must not make the whole group unreadable). A brewing already going
 * keeps its result: the row copies the item and quantity when it starts.
 */
export const ALCHEMY_LOG_SCREEN = "NPC";

export interface AlchemyAdminView {
  alchemy: AlchemyCfg;
  updatedAt: number;
  items: Array<{ id: string; nameVi: string }>;
}

async function readRow(db: D1Database): Promise<{ value: AlchemyCfg; updatedAt: number }> {
  await getTuning(db); // seeds the group the first time
  const row = await db.prepare("SELECT value, updated_at FROM game_tuning WHERE name = 'alchemy'").first<{ value: string; updated_at: number }>();
  let value = DEFAULT_ALCHEMY;
  try {
    const parsed: unknown = row ? JSON.parse(row.value) : null;
    if (validAlchemy(parsed)) value = parsed;
  } catch {
    // an unreadable row counts as the defaults, as the game does
  }
  return { value, updatedAt: row?.updated_at ?? 0 };
}

/** The recipes that name an item as their result or a material (for the item screen: such an item cannot be deleted). */
export async function alchemyReferences(db: D1Database, id: string): Promise<string[]> {
  const { value } = await readRow(db);
  return value.recipes.filter((r) => r.output === id || r.inputs.some((i) => i.item === id)).map((r) => `Công thức luyện đan ${r.nameVi} (${r.id})`);
}

export async function getAlchemyAdmin(db: D1Database): Promise<AlchemyAdminView> {
  await getItemOverlays(db);
  const { value, updatedAt } = await readRow(db);
  return { alchemy: value, updatedAt, items: allItemDefs().filter((d) => !d.disabled && !isEquipmentType(d.id)).map((d) => ({ id: d.id, nameVi: d.nameVi })) };
}

export type AlchemyResult = { ok: true; updatedAt: number } | { ok: false; error: "invalid" | "unchanged" | "version_conflict" | "busy"; problems?: string[] };

export async function saveAlchemy(db: D1Database, adminEmail: string, posted: unknown, updatedAt: number, now = Date.now()): Promise<AlchemyResult> {
  await getItemOverlays(db);
  if (!validAlchemy(posted)) return { ok: false, error: "invalid", problems: ["structure"] };
  const current = await readRow(db);
  if (current.updatedAt !== updatedAt) return { ok: false, error: "version_conflict" };
  // Only a recipe that is new or changed has to name items that exist: an item taken out of play later must not stop the admin from saving the others.
  const stored = new Map(current.value.recipes.map((r) => [r.id, JSON.stringify(r)]));
  const problems: string[] = [];
  for (const r of posted.recipes) {
    if (stored.get(r.id) === JSON.stringify(r)) continue;
    const usable = (item: string) => {
      const def = getItemDef(item);
      return def !== undefined && def.disabled !== true;
    };
    if (!usable(r.output)) problems.push(`${r.id}: output ${r.output}`);
    for (const i of r.inputs) if (!usable(i.item)) problems.push(`${r.id}: input ${i.item}`);
  }
  if (problems.length > 0) return { ok: false, error: "invalid", problems };
  if (JSON.stringify(current.value) === JSON.stringify(posted)) return { ok: false, error: "unchanged" };
  const stamp = Math.max(now, updatedAt + 1);
  const before = new Map(current.value.recipes.map((r) => [r.id, JSON.stringify(r)]));
  const added = posted.recipes.filter((r) => !before.has(r.id)).map((r) => r.id);
  const edited = posted.recipes.filter((r) => before.has(r.id) && before.get(r.id) !== JSON.stringify(r)).map((r) => r.id);
  const removed = [...before.keys()].filter((id) => !posted.recipes.some((r) => r.id === id));
  const parts = [
    ...(added.length ? [`thêm ${added.join(", ")}`] : []),
    ...(edited.length ? [`sửa ${edited.join(", ")}`] : []),
    ...(removed.length ? [`bỏ ${removed.join(", ")}`] : []),
    ...(current.value.maxJobs !== posted.maxJobs ? [`số mẻ cùng lúc ${current.value.maxJobs} → ${posted.maxJobs}`] : []),
  ];
  try {
    await db.batch([
      db.prepare("UPDATE game_tuning SET value = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE name = 'alchemy'").bind(updatedAt, JSON.stringify(posted), stamp, adminEmail),
      db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'tuning'").bind(stamp),
      logStatement(db, { adminEmail, screen: ALCHEMY_LOG_SCREEN, content: `Sửa công thức luyện đan: ${parts.join("; ")}` }, now),
    ]);
  } catch (err) {
    if (String(err).includes("NOT NULL") && !(await db.prepare("SELECT 1 AS x FROM game_tuning WHERE name = 'alchemy' AND updated_at = ?").bind(updatedAt).first())) return { ok: false, error: "version_conflict" };
    console.error("alchemy save failed", err);
    return { ok: false, error: "busy" };
  }
  resetTuningCache();
  return { ok: true, updatedAt: stamp };
}

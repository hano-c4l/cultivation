import { CUSTOM_ITEM_CATEGORIES, CUSTOM_ITEM_ID, EDITABLE_ITEM_FIELDS, ITEMS, ITEM_DESC_MAX, ITEM_NAME_MAX, ITEM_RARITIES, MAX_ITEM_GRADE, allItemDefs, getItemDef, isEquipmentType, itemOverlayProblem, validTuningGroup, type ItemDef, type ItemOverlay, type Tuning } from "@game/shared";
import { logStatement } from "./admin-log";
import { getItemOverlays, resetItemsCache } from "./items-live";
import { getQuestCatalog } from "./quests";
import { alchemyReferences } from "./alchemy-admin";
import { lootReferences } from "./monsters-admin";
import { getTuning, resetTuningCache } from "./tuning";

/**
 * The admin side of the item catalogue (docs/PHASE3.md 3g). Items written in the code can only have their name, description, rarity and grade
 * changed (their mechanics stay as written) and are never deleted; items an admin made can be changed freely until someone owns them, and are deleted
 * by the same rules as quests: refused while a quest reward or a merchant still names the item, a soft delete (disabled, still shown in bags) while
 * a character owns any, otherwise removed. The sell value lives in `tuning.itemValue.items` and is saved in the same batch, each guarded by its own
 * token. Gear is not here: it comes from templates (the master tables are 3g-b).
 */
export const ITEM_LOG_SCREEN = "Vật phẩm";

interface Row {
  id: string;
  custom: number;
  disabled: number;
  def: string;
  updated_at: number;
}

export interface ItemListEntry {
  def: ItemDef;
  /** An item an admin made (otherwise it belongs to the code). */
  custom: boolean;
  /** Soft deleted: read-only. */
  disabled: boolean;
  /** Token of the overlay row (0: no row yet). */
  updatedAt: number;
  /** Sell value in Linh Thạch (0: none). */
  value: number;
  /** Total quantity characters own, and the largest single stack. */
  owned: number;
  maxQty: number;
  /** Unclaimed gift mails that hold it. */
  gifts: number;
}

export interface ItemListResult {
  items: ItemListEntry[];
  /** Token of the sell values (`game_tuning` row `itemValue`). */
  valueToken: number;
  meta: { categories: readonly string[]; rarities: readonly string[]; maxGrade: number; limits: { name: number; description: number } };
}

async function itemValueRow(db: D1Database): Promise<{ items: Record<string, number>; updatedAt: number; raw: Tuning["itemValue"] }> {
  const live = await getTuning(db); // seeds the group the first time
  const row = await db.prepare("SELECT value, updated_at FROM game_tuning WHERE name = 'itemValue'").first<{ value: string; updated_at: number }>();
  let raw = live.itemValue;
  try {
    const parsed: unknown = row ? JSON.parse(row.value) : null;
    if (parsed && validTuningGroup("itemValue", parsed)) raw = parsed as Tuning["itemValue"];
  } catch {
    // the live copy (defaults) stands
  }
  return { items: raw.items, updatedAt: row?.updated_at ?? 0, raw };
}

async function overlayRows(db: D1Database): Promise<Row[]> {
  await getItemOverlays(db); // installs the rows, so getItemDef sees them
  return (await db.prepare("SELECT id, custom, disabled, def, updated_at FROM items").all<Row>()).results;
}

type OwnerRows = { owners: Array<{ item_type: string; total: number; biggest: number }>; gifts: Array<{ item: string; n: number }> };
let ownerCache: { at: number; rows: OwnerRows } | null = null;

/** How many of each item are held and waiting in mail: two scans over every item row and every mail, so the Admin list may reuse them for `maxAgeMs`. */
async function ownerRows(db: D1Database, maxAgeMs: number): Promise<OwnerRows> {
  const now = Date.now();
  if (ownerCache && now - ownerCache.at < maxAgeMs) return ownerCache.rows;
  const [owners, gifts] = await Promise.all([
    db.prepare("SELECT item_type, SUM(qty) AS total, MAX(qty) AS biggest FROM item_instances GROUP BY item_type").all<{ item_type: string; total: number; biggest: number }>(),
    db
      .prepare("SELECT json_extract(j.value, '$.type') AS item, COUNT(*) AS n FROM mailbox m, json_each(m.gift, '$.items') j WHERE m.claimed_at IS NULL AND m.gift IS NOT NULL GROUP BY item")
      .all<{ item: string; n: number }>(),
  ]);
  ownerCache = { at: now, rows: { owners: owners.results, gifts: gifts.results } };
  return ownerCache.rows;
}

export async function listItems(db: D1Database, ownersMaxAgeMs = 0): Promise<ItemListResult> {
  const [rows, value, held] = await Promise.all([overlayRows(db), itemValueRow(db), ownerRows(db, ownersMaxAgeMs)]);
  const token = new Map(rows.map((r) => [r.id, r]));
  const own = new Map(held.owners.map((o) => [o.item_type, o]));
  const giftCount = new Map(held.gifts.map((g) => [g.item, g.n]));
  return {
    valueToken: value.updatedAt,
    meta: { categories: CUSTOM_ITEM_CATEGORIES, rarities: ITEM_RARITIES, maxGrade: MAX_ITEM_GRADE, limits: { name: ITEM_NAME_MAX, description: ITEM_DESC_MAX } },
    items: allItemDefs().map((def) => {
      const row = token.get(def.id);
      return {
        def,
        custom: row?.custom === 1,
        disabled: row?.disabled === 1,
        updatedAt: row?.updated_at ?? 0,
        value: value.items[def.id] ?? 0,
        owned: own.get(def.id)?.total ?? 0,
        maxQty: own.get(def.id)?.biggest ?? 0,
        gifts: giftCount.get(def.id) ?? 0,
      };
    }),
  };
}

export type ItemFailure = {
  ok: false;
  error: "invalid" | "exists" | "has_owner" | "not_found" | "deleted" | "version_conflict" | "locked_field" | "unchanged" | "bound" | "in_use" | "busy";
  problems?: string[];
};
export type ItemSaveResult = { ok: true; updatedAt: number; changed: string[] } | ItemFailure;
export type ItemDeleteResult = { ok: true; mode: "soft" | "hard" } | ItemFailure;

const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const bumpItems = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'items'").bind(at);

function mapBatchError(err: unknown): ItemFailure {
  const msg = String(err);
  if (msg.includes("inv_guard")) return { ok: false, error: "busy" };
  if (msg.includes("items.id")) return { ok: false, error: "exists" };
  if (msg.includes("NOT NULL")) return { ok: false, error: "version_conflict" };
  throw err;
}

async function ownersOf(db: D1Database, id: string): Promise<{ total: number; biggest: number; gifts: number; biggestGift: number }> {
  const inst = await db.prepare("SELECT COALESCE(SUM(qty), 0) AS total, COALESCE(MAX(qty), 0) AS biggest FROM item_instances WHERE item_type = ?").bind(id).first<{ total: number; biggest: number }>();
  const gifts = await db
    .prepare("SELECT COUNT(*) AS n, COALESCE(MAX(json_extract(j.value, '$.qty')), 0) AS biggest FROM mailbox m, json_each(m.gift, '$.items') j WHERE m.claimed_at IS NULL AND m.gift IS NOT NULL AND json_extract(j.value, '$.type') = ?")
    .bind(id)
    .first<{ n: number; biggest: number }>();
  // A brewing waiting to be collected holds the item too (the pill appears in the bag when it is collected), like a gift not yet claimed.
  const brewing = await db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(qty), 0) AS biggest FROM brew_jobs WHERE item = ? AND collected_at IS NULL").bind(id).first<{ n: number; biggest: number }>();
  return { total: inst?.total ?? 0, biggest: inst?.biggest ?? 0, gifts: (gifts?.n ?? 0) + (brewing?.n ?? 0), biggestGift: Math.max(gifts?.biggest ?? 0, brewing?.biggest ?? 0) };
}

const FIELD_LABELS: Array<[keyof ItemDef, string]> = [
  ["nameVi", "tên"],
  ["descVi", "mô tả"],
  ["rarity", "độ hiếm"],
  ["grade", "phẩm cấp"],
  ["category", "loại"],
  ["maxStack", "số xếp chồng"],
  ["healFraction", "hồi máu"],
  ["healOverMs", "thời gian hồi"],
  ["masteryPills", "điểm thuần thục"],
];

/**
 * Creates (`isNew`) or changes an item. `posted` carries the fields of the form; `updatedAt` is the token of the overlay row the admin saw (0 when the
 * item had none); `value` is the new sell value (a whole number), `null` to take the value away, `undefined` to leave it; `valueToken` goes with it.
 */
export async function saveItem(
  db: D1Database,
  adminEmail: string,
  posted: Record<string, unknown>,
  isNew: boolean,
  updatedAt: number,
  value: number | null | undefined,
  valueToken: number,
  now = Date.now(),
): Promise<ItemSaveResult> {
  const id = posted.id;
  if (!isStr(id) || !/^[a-z0-9_]{1,40}$/.test(id) || !isStr(posted.nameVi) || !isStr(posted.descVi) || !isStr(posted.rarity) || !isInt(posted.grade)) return { ok: false, error: "invalid", problems: ["a field is missing or has the wrong type"] };
  if (isEquipmentType(id) || id.startsWith("eq.")) return { ok: false, error: "invalid", problems: ["equipment is not an item you can edit here"] };
  if (value !== undefined && value !== null && !(isInt(value) && value >= 0 && value <= 1_000_000_000)) return { ok: false, error: "invalid", problems: ["the value must be a whole number from 0 to 1.000.000.000"] };
  const rows = await overlayRows(db);
  const row = rows.find((r) => r.id === id);
  const inCode = Object.prototype.hasOwnProperty.call(ITEMS, id);
  const text = { nameVi: posted.nameVi.normalize("NFC").trim(), descVi: posted.descVi.normalize("NFC").trim() };
  let overlay: ItemOverlay;
  let before: ItemDef | undefined;
  if (inCode) {
    if (isNew) return { ok: false, error: "exists" };
    before = getItemDef(id);
    const base = ITEMS[id]!;
    const edited: Partial<ItemDef> = {};
    const next: Record<string, unknown> = { nameVi: text.nameVi, descVi: text.descVi, rarity: posted.rarity, grade: posted.grade };
    for (const k of EDITABLE_ITEM_FIELDS) if (next[k] !== base[k]) (edited as Record<string, unknown>)[k] = next[k];
    overlay = { id, custom: false, disabled: false, def: edited };
  } else {
    if (isNew) {
      if (row) return { ok: false, error: "exists" };
      if (!CUSTOM_ITEM_ID.test(id)) return { ok: false, error: "invalid", problems: ["id: lower-case letters, digits and _, starting with a letter"] };
      if ((await ownersOf(db, id)).total > 0) return { ok: false, error: "has_owner" };
    } else {
      if (!row || row.custom !== 1) return { ok: false, error: "not_found" };
      if (row.disabled === 1) return { ok: false, error: "deleted" };
      if (row.updated_at !== updatedAt) return { ok: false, error: "version_conflict" };
      before = getItemDef(id);
    }
    const def: Partial<ItemDef> = {
      id,
      nameVi: text.nameVi,
      descVi: text.descVi,
      category: posted.category as ItemDef["category"],
      maxStack: posted.maxStack as number,
      rarity: posted.rarity as ItemDef["rarity"],
      grade: posted.grade,
      ...(posted.healFraction !== undefined && posted.healFraction !== null ? { healFraction: posted.healFraction as number } : {}),
      ...(posted.healOverMs !== undefined && posted.healOverMs !== null ? { healOverMs: posted.healOverMs as number } : {}),
      ...(posted.masteryPills !== undefined && posted.masteryPills !== null ? { masteryPills: posted.masteryPills as number } : {}),
    };
    overlay = { id, custom: true, disabled: false, def };
    if (before) {
      const owners = await ownersOf(db, id);
      if (owners.total > 0 || owners.gifts > 0) {
        if (before.category !== def.category) return { ok: false, error: "locked_field", problems: ["category"] };
        if (isInt(def.maxStack) && def.maxStack < Math.max(owners.biggest, owners.biggestGift)) return { ok: false, error: "locked_field", problems: ["maxStack"] };
      }
    }
  }
  const problem = itemOverlayProblem(overlay);
  if (problem) return { ok: false, error: "invalid", problems: [problem] };

  // The change, for the log and for "nothing changed".
  const after: ItemDef | undefined = inCode ? { ...ITEMS[id]!, ...overlay.def } : (overlay.def as ItemDef);
  const changed = before && after ? FIELD_LABELS.filter(([k]) => JSON.stringify(before![k] ?? null) !== JSON.stringify(after[k] ?? null)).map(([, label]) => label) : [];
  const valueRow = value !== undefined ? await itemValueRow(db) : null;
  let newValues: Tuning["itemValue"] | null = null;
  if (valueRow && value !== undefined) {
    const had = valueRow.items[id];
    if (value === null ? had !== undefined : had !== value) {
      const items = { ...valueRow.items };
      if (value === null || value === 0) delete items[id];
      else items[id] = value;
      newValues = { ...valueRow.raw, items };
      if (valueRow.updatedAt !== valueToken) return { ok: false, error: "version_conflict" };
      changed.push("giá trị");
    }
  }
  if (!isNew && changed.length === 0) return { ok: false, error: "unchanged" };

  const stamp = Math.max(now, updatedAt + 1, valueToken + 1);
  const json = JSON.stringify(overlay.def);
  const statements: D1PreparedStatement[] = [];
  const writeOverlay = !inCode || row !== undefined || Object.keys(overlay.def).length > 0; // an item of the code with nothing edited needs no row
  if (!writeOverlay) {
    // only its value changes
  } else if (row) {
    statements.push(db.prepare("UPDATE items SET def = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE id = ?").bind(updatedAt, json, stamp, adminEmail, id));
  } else {
    // A row made by someone else a moment ago fails on the primary key.
    statements.push(db.prepare("INSERT INTO items (id, custom, disabled, def, updated_at, updated_by) VALUES (?, ?, 0, ?, ?, ?)").bind(id, overlay.custom ? 1 : 0, json, stamp, adminEmail));
  }
  if (newValues) {
    statements.push(
      db.prepare("UPDATE game_tuning SET value = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE name = 'itemValue'").bind(valueToken, JSON.stringify(newValues), stamp, adminEmail),
      db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'tuning'").bind(stamp),
    );
  }
  if (writeOverlay) statements.push(bumpItems(db, stamp));
  statements.push(
    logStatement(db, { adminEmail, screen: ITEM_LOG_SCREEN, content: isNew ? `Thêm vật phẩm «${text.nameVi}» (${id})` : `Sửa vật phẩm «${text.nameVi}» (${id}): ${changed.join(", ")}` }, now),
  );
  try {
    await db.batch(statements);
  } catch (err) {
    return mapBatchError(err);
  }
  resetItemsCache();
  resetTuningCache();
  return { ok: true, updatedAt: stamp, changed };
}

/** Where an item is still named: quest rewards and requests, merchants' stock and the loot tables. */
async function referencesTo(db: D1Database, id: string): Promise<string[]> {
  const out: string[] = [];
  for (const q of await getQuestCatalog(db).catch(() => [])) {
    const used = (q.rewards.items ?? []).some((i) => i.item === id) || (q.objective.kind === "collect" && (q.objective.item === id || (q.objective.also ?? []).some((a) => a.item === id)));
    if (used) out.push(`Nhiệm vụ ${q.id} — ${q.titleVi}`);
  }
  out.push(...(await lootReferences(db, id)), ...(await alchemyReferences(db, id)));
  const { results } = await db.prepare("SELECT npc_id, rule_id, def FROM shop_stock WHERE def LIKE ?").bind(`%${id}%`).all<{ npc_id: string; rule_id: string; def: string }>();
  for (const r of results) {
    try {
      if ((JSON.parse(r.def) as { item?: string }).item === id) out.push(`Hàng của thương nhân ${r.npc_id} (luật ${r.rule_id})`);
    } catch {
      // not a rule of this item
    }
  }
  return out;
}

/** Deletes an item an admin made (see the top of the file). */
export async function deleteItem(db: D1Database, adminEmail: string, id: string, updatedAt: number, now = Date.now()): Promise<ItemDeleteResult> {
  if (Object.prototype.hasOwnProperty.call(ITEMS, id) || isEquipmentType(id)) return { ok: false, error: "bound", problems: ["Vật phẩm của hệ thống (gắn với cơ chế, bảng rơi hoặc nhiệm vụ gốc) không xóa được, chỉ sửa tên, mô tả, độ hiếm, phẩm cấp và giá trị."] };
  const rows = await overlayRows(db);
  const row = rows.find((r) => r.id === id && r.custom === 1);
  if (!row) return { ok: false, error: "not_found" };
  if (row.disabled === 1) return { ok: false, error: "deleted" };
  if (row.updated_at !== updatedAt) return { ok: false, error: "version_conflict" };
  const refs = await referencesTo(db, id);
  if (refs.length > 0) return { ok: false, error: "in_use", problems: refs };
  const owners = await ownersOf(db, id);
  const soft = owners.total > 0 || owners.gifts > 0;
  const value = await itemValueRow(db);
  const name = (JSON.parse(row.def) as { nameVi?: string }).nameVi ?? id;
  const stamp = Math.max(now, updatedAt + 1);
  const statements: D1PreparedStatement[] = [db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM items WHERE id = ? AND updated_at = ? AND disabled = 0)").bind(id, updatedAt)];
  if (soft) statements.push(db.prepare("UPDATE items SET disabled = 1, updated_at = ?, updated_by = ? WHERE id = ?").bind(stamp, adminEmail, id));
  else {
    statements.push(db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE EXISTS (SELECT 1 FROM item_instances WHERE item_type = ?)").bind(id));
    statements.push(
      db
        .prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE EXISTS (SELECT 1 FROM mailbox m, json_each(m.gift, '$.items') j WHERE m.claimed_at IS NULL AND m.gift IS NOT NULL AND json_extract(j.value, '$.type') = ?)")
        .bind(id),
      db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE EXISTS (SELECT 1 FROM brew_jobs WHERE item = ? AND collected_at IS NULL)").bind(id),
    );
    statements.push(db.prepare("DELETE FROM items WHERE id = ?").bind(id));
    // The sell value goes with it, so a new item that reuses the id does not inherit the price.
    if (value.items[id] !== undefined) {
      const items = { ...value.items };
      delete items[id];
      statements.push(
        db.prepare("UPDATE game_tuning SET value = CASE WHEN updated_at = ? THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE name = 'itemValue'").bind(value.updatedAt, JSON.stringify({ ...value.raw, items }), stamp, adminEmail),
        db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'tuning'").bind(stamp),
      );
    }
  }
  statements.push(
    bumpItems(db, stamp),
    logStatement(db, { adminEmail, screen: ITEM_LOG_SCREEN, content: `Xóa ${soft ? "mềm" : "cứng"} vật phẩm «${name}» (${id})${soft ? `: còn ${owners.total} món trong túi, hòm thư hoặc ${owners.gifts} thư quà chưa nhận` : ""}` }, now),
  );
  try {
    await db.batch(statements);
  } catch (err) {
    const failure = mapBatchError(err);
    if (failure.error === "busy" && !(await db.prepare("SELECT 1 AS x FROM items WHERE id = ? AND updated_at = ? AND disabled = 0").bind(id, updatedAt).first())) return { ok: false, error: "version_conflict" };
    return failure;
  }
  resetItemsCache();
  resetTuningCache();
  return { ok: true, mode: soft ? "soft" : "hard" };
}

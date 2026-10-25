import { allItemDefs, isEquipmentType, validMerchant, type MerchantDef, type SellableCategory, type StockRule } from "@game/shared";
import { logStatement } from "./admin-log";
import { getMerchants, resetMerchantsCache } from "./merchants";
import { getItemOverlays } from "./items-live";

/**
 * The admin side of the merchants (docs/PHASE3.md 3k): what a trading NPC (merchant, alchemist, a blacksmith that trades) pays for goods, which kinds of item
 * it buys and its stock as a list of rules (tables `shop_merchants` and `shop_stock`). A save replaces the whole stock in one batch, guarded by the
 * `updated_at` of the merchant row, with the `config_versions.shop` bump and the admin log row. The merchant as it would be afterwards must pass
 * `validMerchant`, so a rule naming an item that does not exist (or was taken out of play) is refused.
 */
export const MERCHANT_LOG_SCREEN = "NPC";

interface Row {
  npc_id: string;
  map_id: string;
  name_vi: string;
  sell_rate: number;
  buys: string | null;
  updated_at: number;
}

export interface MerchantAdminView {
  merchant: MerchantDef;
  updatedAt: number;
}

export interface MerchantMeta {
  items: Array<{ id: string; nameVi: string }>;
  categories: SellableCategory[];
  elements: string[];
}

export async function merchantMeta(db: D1Database): Promise<MerchantMeta> {
  await getItemOverlays(db);
  return {
    items: allItemDefs()
      .filter((d) => !d.disabled && !isEquipmentType(d.id))
      .map((d) => ({ id: d.id, nameVi: d.nameVi })),
    categories: ["pill", "gear", "artifact", "book", "material"],
    elements: ["kim", "moc", "thuy", "hoa", "tho", "loi", "bang", "phong"],
  };
}

/**
 * The record of one NPC, read from the rows themselves (null when it has none), never from the isolate's cache: the screen's version token must belong to the
 * stock it shows, or another isolate with an older cache would let a stale screen overwrite a save.
 */
export async function getMerchantAdmin(db: D1Database, npc: string): Promise<MerchantAdminView | null> {
  await getItemOverlays(db);
  await getMerchants(db); // seeds the records the first time
  const row = await db.prepare("SELECT npc_id, map_id, name_vi, sell_rate, buys, updated_at FROM shop_merchants WHERE npc_id = ?").bind(npc).first<Row>();
  if (!row) return null;
  const { results } = await db.prepare("SELECT def FROM shop_stock WHERE npc_id = ? ORDER BY sort, rule_id").bind(npc).all<{ def: string }>();
  const stock: StockRule[] = [];
  for (const r of results) {
    try {
      stock.push(JSON.parse(r.def) as StockRule);
    } catch {
      // skipped
    }
  }
  let buys: SellableCategory[] | null = null;
  try {
    buys = row.buys === null ? null : (JSON.parse(row.buys) as SellableCategory[]);
  } catch {
    buys = null;
  }
  return { merchant: { id: npc, mapId: row.map_id, nameVi: row.name_vi, sellRate: row.sell_rate, buys, stock }, updatedAt: row.updated_at };
}

export type MerchantResult = { ok: true; updatedAt: number } | { ok: false; error: "invalid" | "unchanged" | "not_found" | "version_conflict" | "busy"; problems?: string[] };

const bump = (db: D1Database, at: number) => db.prepare("UPDATE config_versions SET version = version + 1, updated_at = ? WHERE name = 'shop'").bind(at);

function describeChange(before: MerchantDef, after: MerchantDef): string[] {
  const changed: string[] = [];
  if (before.sellRate !== after.sellRate) changed.push(`tỉ lệ thu mua ${before.sellRate} → ${after.sellRate}`);
  if (JSON.stringify(before.buys) !== JSON.stringify(after.buys)) changed.push("loại đồ thu mua");
  if (JSON.stringify(before.stock) !== JSON.stringify(after.stock)) changed.push(`hàng bán (${before.stock.length} → ${after.stock.length} luật)`);
  return changed;
}

/** Replaces a merchant's buying rate, the kinds it buys and its whole stock. `updatedAt` is the token of the record the admin was looking at. */
export async function saveMerchant(db: D1Database, adminEmail: string, posted: unknown, now = Date.now()): Promise<MerchantResult> {
  if (typeof posted !== "object" || posted === null) return { ok: false, error: "invalid", problems: ["body"] };
  const o = posted as { npc?: unknown; sellRate?: unknown; buys?: unknown; stock?: unknown; updatedAt?: unknown };
  if (typeof o.npc !== "string" || typeof o.updatedAt !== "number") return { ok: false, error: "invalid", problems: ["body"] };
  const current = await getMerchantAdmin(db, o.npc);
  if (!current) return { ok: false, error: "not_found" };
  if (current.updatedAt !== o.updatedAt) return { ok: false, error: "version_conflict" };
  const after = { ...current.merchant, sellRate: o.sellRate, buys: o.buys, stock: o.stock };
  if (!validMerchant(after)) return { ok: false, error: "invalid", problems: invalidReasons(after) };
  const changed = describeChange(current.merchant, after);
  if (changed.length === 0) return { ok: false, error: "unchanged" };
  const stamp = Math.max(now, o.updatedAt + 1);
  const rules = after.stock.map((r, i) => ({ r: r.id, s: i, d: JSON.stringify(r) }));
  const statements = [
    db.prepare("INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (SELECT 1 FROM shop_merchants WHERE npc_id = ? AND updated_at = ?)").bind(o.npc, o.updatedAt),
    db.prepare("UPDATE shop_merchants SET sell_rate = ?, buys = ?, updated_at = ?, updated_by = ? WHERE npc_id = ?").bind(after.sellRate, after.buys === null ? null : JSON.stringify(after.buys), stamp, adminEmail, o.npc),
    db.prepare("DELETE FROM shop_stock WHERE npc_id = ?").bind(o.npc),
    db.prepare("INSERT INTO shop_stock (npc_id, rule_id, sort, def) SELECT ?, json_extract(value, '$.r'), json_extract(value, '$.s'), json_extract(value, '$.d') FROM json_each(?)").bind(o.npc, JSON.stringify(rules)),
    bump(db, stamp),
    logStatement(db, { adminEmail, screen: MERCHANT_LOG_SCREEN, content: `Sửa cửa hàng «${after.nameVi}» (${o.npc}): ${changed.join("; ")}` }, now),
  ];
  try {
    await db.batch(statements);
  } catch (err) {
    if (String(err).includes("inv_guard") && !(await db.prepare("SELECT 1 AS x FROM shop_merchants WHERE npc_id = ? AND updated_at = ?").bind(o.npc, o.updatedAt).first())) return { ok: false, error: "version_conflict" };
    console.error("merchant save failed", err);
    return { ok: false, error: "busy" };
  }
  resetMerchantsCache();
  return { ok: true, updatedAt: stamp };
}

/** A short list of what is wrong, for the screen (the validator only says yes or no). */
function invalidReasons(m: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof m.sellRate !== "number" || m.sellRate < 0 || m.sellRate > 1) out.push("sellRate");
  if (!(m.buys === null || Array.isArray(m.buys))) out.push("buys");
  if (!Array.isArray(m.stock)) return [...out, "stock"];
  const seen = new Set<string>();
  for (const r of m.stock as Array<Record<string, unknown>>) {
    const id = String(r?.id);
    if (seen.has(id)) out.push(`rule ${id}: duplicate id`);
    seen.add(id);
    if (!validMerchant({ id: "x", mapId: "x", nameVi: "x", sellRate: 0.1, buys: null, stock: [r] })) out.push(`rule ${id}`);
  }
  return out.length > 0 ? out : ["merchant"];
}

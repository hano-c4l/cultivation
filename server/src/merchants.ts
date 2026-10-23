import { DEFAULT_MERCHANTS, setMerchants, validMerchant, validStockRule, type MerchantDef, type SellableCategory, type StockRule } from "@game/shared";

/**
 * The merchant NPCs in D1 (tables `shop_merchants` and `shop_stock`, migration 0032): seeded from DEFAULT_MERCHANTS the first time they are read
 * (INSERT OR IGNORE, so rows an admin edited stay), cached per isolate and re-read when `config_versions.shop` changes. A D1 failure serves the
 * last copy or the defaults. Reading also installs the merchants into the shared registry, which the offer lists are built from. A merchant row
 * that does not validate is skipped (its default, if it has one, stands in); a stock row that does not validate is dropped from its merchant.
 */
const TTL_MS = 30_000;
let cache: { value: Record<string, MerchantDef>; version: number; checkedAt: number } | null = null;

/** Inserts merchants (with their stock) that have no row yet; merchants that already have one are never touched, so deletions and edits stay. */
async function seed(db: D1Database, defs: MerchantDef[]): Promise<void> {
  const now = Date.now();
  const stock = defs.flatMap((m) => m.stock.map((r, i) => ({ n: m.id, r: r.id, s: i, d: JSON.stringify(r) })));
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO shop_merchants (npc_id, map_id, name_vi, sell_rate, buys, updated_at) SELECT json_extract(value, '$.id'), json_extract(value, '$.map'), json_extract(value, '$.name'), json_extract(value, '$.rate'), json_extract(value, '$.buys'), ? FROM json_each(?)",
      )
      .bind(now, JSON.stringify(defs.map((m) => ({ id: m.id, map: m.mapId, name: m.nameVi, rate: m.sellRate, buys: m.buys === null ? null : JSON.stringify(m.buys) })))),
    db
      .prepare("INSERT OR IGNORE INTO shop_stock (npc_id, rule_id, sort, def) SELECT json_extract(value, '$.n'), json_extract(value, '$.r'), json_extract(value, '$.s'), json_extract(value, '$.d') FROM json_each(?)")
      .bind(JSON.stringify(stock)),
  ]);
}

interface MerchantRow {
  npc_id: string;
  map_id: string;
  name_vi: string;
  sell_rate: number;
  buys: string | null;
}
interface StockRow {
  npc_id: string;
  def: string;
}

async function load(db: D1Database): Promise<{ value: Record<string, MerchantDef>; version: number }> {
  const read = () =>
    db.batch([
      db.prepare("SELECT version FROM config_versions WHERE name = 'shop'"),
      db.prepare("SELECT npc_id, map_id, name_vi, sell_rate, buys FROM shop_merchants WHERE enabled = 1"),
      db.prepare("SELECT npc_id, def FROM shop_stock WHERE enabled = 1 ORDER BY npc_id, sort, rule_id"),
    ]);
  let [versionRes, merchantRes, stockRes] = await read();
  // A merchant added to the code later (a new town) is seeded on its own; an existing row, enabled or not, is left alone.
  const known = new Set((await db.prepare("SELECT npc_id FROM shop_merchants").all<{ npc_id: string }>()).results.map((r) => r.npc_id));
  const missing = Object.values(DEFAULT_MERCHANTS).filter((m) => !known.has(m.id));
  if (missing.length > 0) {
    await seed(db, missing);
    [versionRes, merchantRes, stockRes] = await read();
  }
  const stock = new Map<string, StockRule[]>();
  for (const r of stockRes!.results as unknown as StockRow[]) {
    try {
      const rule: unknown = JSON.parse(r.def);
      if (!validStockRule(rule)) throw new Error("invalid rule");
      const list = stock.get(r.npc_id) ?? [];
      list.push(rule);
      stock.set(r.npc_id, list);
    } catch {
      console.error(`merchant ${r.npc_id}: a stock rule is broken`);
    }
  }
  const out: Record<string, MerchantDef> = {};
  for (const r of merchantRes!.results as unknown as MerchantRow[]) {
    let buys: unknown = null;
    try {
      buys = r.buys === null ? null : JSON.parse(r.buys);
    } catch {
      buys = "broken";
    }
    const def = { id: r.npc_id, mapId: r.map_id, nameVi: r.name_vi, sellRate: r.sell_rate, buys, stock: stock.get(r.npc_id) ?? [] };
    if (validMerchant(def)) out[def.id] = def as MerchantDef;
    else {
      console.error(`merchant ${r.npc_id} is invalid`);
      const fallback = DEFAULT_MERCHANTS[r.npc_id];
      if (fallback) out[fallback.id] = fallback;
    }
  }
  setMerchants(out);
  return { value: out, version: ((versionRes!.results as unknown as Array<{ version: number }>)[0]?.version) ?? 0 };
}

/** The merchants in force (cached). Never throws: with no copy and D1 down it installs and returns the defaults. */
export async function getMerchants(db: D1Database, now = Date.now()): Promise<Record<string, MerchantDef>> {
  if (cache && now - cache.checkedAt < TTL_MS) return cache.value;
  try {
    if (cache) {
      const v = await db.prepare("SELECT version FROM config_versions WHERE name = 'shop'").first<{ version: number }>();
      if ((v?.version ?? 0) === cache.version) {
        cache.checkedAt = now;
        return cache.value;
      }
    }
    const fresh = await load(db);
    cache = { ...fresh, checkedAt: now };
    return fresh.value;
  } catch (err) {
    console.error("merchants unavailable", err);
    if (!cache) setMerchants(DEFAULT_MERCHANTS);
    return cache?.value ?? { ...DEFAULT_MERCHANTS };
  }
}

export function resetMerchantsCache(): void {
  cache = null;
}

export type { SellableCategory };

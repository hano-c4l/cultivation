import { ALL_ROOTS, MUTANT_ROOTS, SPIRITUAL_ROOTS } from "./character";
import { GENDERED_KINDS, WEAPON_TYPES, makeEquipmentId, type EquipKind } from "./equipment-data";
import { gearStyleOf, type Gender } from "./gender";
import { getItemDef, itemsGeneration } from "./items";
import { KEEP_LEVEL_ITEM, keepLevelPrice } from "./smith";
import { tuningGeneration } from "./tuning";
import { bookItemId } from "./skills";
import { SELL_RATE, itemValue, offer, sellPrice, shopCategoryOf, type ShopCategory, type ShopOffer } from "./shop";

/**
 * What a merchant NPC sells is DATA (D1 tables `shop_merchants` and `shop_stock`, migration 0032), so an admin screen can later pick a town,
 * add merchants to it and give each its own stock. A merchant is a list of RULES, expanded into offers on both sides (the client gets the
 * merchant with the `shop` message): an `item` rule is one product; a `gear` rule is the whole set of basic gear for some realms and bậc
 * (hundreds of ids, in the style the buyer can wear), which is why gear is not stored id by id. The offer id (the item id) stays stable:
 * purchases are counted by it, per merchant. Placeholder prices and limits ("giá trị tạm").
 */
export type SellableCategory = Exclude<ShopCategory, "all">;

export type StockRule =
  | {
      id: string;
      kind: "item";
      item: string;
      /** Linh Thạch (or Tiên Ngọc) per unit; absent means the value of the item. */
      price?: number;
      currency?: "tien_ngoc";
      dailyLimit?: number;
    }
  | {
      id: string;
      kind: "gear";
      realms: number[];
      tiers: number[];
      grade: number;
      /** The elements it covers (the five of ngũ hành when absent; the variant elements loi, bang, phong are sold by their own rule). */
      elements?: string[];
      /** Multiplies the value of each piece (1 when absent). */
      priceMult?: number;
    }
  /** The Hộ Cấp Phù, sold for Tiên Ngọc at the price in the tuning (`keepLevel`). */
  | { id: string; kind: "keep_level" };

export interface MerchantDef {
  /** The NPC id (see the NPC list of the map). */
  id: string;
  /** The town it stands in. */
  mapId: string;
  nameVi: string;
  /** What it pays for an item, as a fraction of the item's value. */
  sellRate: number;
  /** The kinds of item it buys from players (an empty list: it buys nothing); null means every kind. */
  buys: SellableCategory[] | null;
  stock: StockRule[];
}

const SELLABLE_CATEGORIES: readonly SellableCategory[] = ["pill", "gear", "artifact", "book", "material"];

const PLAIN_LOW: StockRule[] = [
  { id: "hoi_huyet_dan", kind: "item", item: "hoi_huyet_dan" },
  { id: "duong_huyet_dan", kind: "item", item: "duong_huyet_dan", dailyLimit: 30 },
  { id: "dai_hoi_huyet_dan", kind: "item", item: "dai_hoi_huyet_dan", dailyLimit: 20 },
  { id: "ngo_dao_dan", kind: "item", item: "ngo_dao_dan", dailyLimit: 2 },
];
const PLAIN_HIGH: StockRule[] = [
  { id: "dai_hoi_huyet_dan", kind: "item", item: "dai_hoi_huyet_dan", dailyLimit: 30 },
  { id: "linh_nguyen_dan", kind: "item", item: "linh_nguyen_dan", dailyLimit: 30 },
  { id: "bao_nguyen_dan", kind: "item", item: "bao_nguyen_dan", dailyLimit: 15 },
  { id: "ngo_dao_dan", kind: "item", item: "ngo_dao_dan", dailyLimit: 5 },
  { id: "thien_ngo_dan", kind: "item", item: "thien_ngo_dan", dailyLimit: 2 },
];
const book = (skill: string, price: number): StockRule => ({ id: bookItemId(skill), kind: "item", item: bookItemId(skill), price });
/** Skill books (bí tịch), unlimited because a skill can only be learned once: Luyện Khí's two basic ones and the strongest of each element for Trúc Cơ. */
const BOOKS_LOW: StockRule[] = [book("cuong_than", 2_000), book("ngu_kiem_tram", 3_000), ...SPIRITUAL_ROOTS.map((el) => book(`${el}_3`, 20_000))];
/** The second town's books: a guard, a heal and a battle cry, and the strongest skill of each element for Kim Đan and for Nguyên Anh. */
const BOOKS_HIGH: StockRule[] = [
  book("ho_the_kd", 150_000),
  book("hoi_nguyen_kd", 200_000),
  book("cuong_than_na", 1_500_000),
  ...SPIRITUAL_ROOTS.map((el) => book(`${el}_4`, 300_000)),
  ...SPIRITUAL_ROOTS.map((el) => book(`${el}_5`, 3_000_000)),
];

/** The merchants the game starts with: the seeds of the D1 rows, and the fallback when D1 cannot be read. */
export const DEFAULT_MERCHANTS: Readonly<Record<string, MerchantDef>> = {
  merchant: {
    id: "merchant",
    mapId: "town",
    nameVi: "Thương nhân",
    sellRate: SELL_RATE,
    buys: null,
    stock: [
      ...PLAIN_LOW,
      ...BOOKS_LOW,
      { id: "gear_low", kind: "gear", realms: [0, 1], tiers: [1, 2], grade: 1 },
      { id: "gear_low_mutant", kind: "gear", realms: [0, 1], tiers: [1, 2], grade: 1, elements: [...MUTANT_ROOTS], priceMult: 1.5 },
      { id: "ttp_town", kind: "item", item: "ttp_town" },
      { id: "keep_level", kind: "keep_level" },
    ],
  },
  merchant2: {
    id: "merchant2",
    mapId: "town2",
    nameVi: "Thương nhân",
    sellRate: SELL_RATE,
    buys: null,
    stock: [
      ...PLAIN_HIGH,
      ...BOOKS_HIGH,
      { id: "gear_high", kind: "gear", realms: [2, 3], tiers: [1, 2], grade: 1 },
      { id: "gear_high_mutant", kind: "gear", realms: [2, 3], tiers: [1, 2], grade: 1, elements: [...MUTANT_ROOTS], priceMult: 1.5 },
      { id: "ttp_town2", kind: "item", item: "ttp_town2" },
      { id: "keep_level", kind: "keep_level" },
    ],
  },
};

const isInt = (v: unknown, min: number, max: number): boolean => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** Whether a rule is well formed and refers to things that exist (used for rows read from D1 and for an admin save). */
export function validStockRule(r: unknown): r is StockRule {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  if (typeof o.id !== "string" || !/^[a-z0-9_.]{1,60}$/.test(o.id)) return false;
  switch (o.kind) {
    case "item":
      return (
        typeof o.item === "string" &&
        getItemDef(o.item) !== undefined &&
        getItemDef(o.item)?.disabled !== true &&
        (o.price === undefined ? itemValue(o.item) > 0 : isInt(o.price, 1, 1_000_000_000)) &&
        (o.currency === undefined || o.currency === "tien_ngoc") &&
        (o.dailyLimit === undefined || isInt(o.dailyLimit, 1, 100_000))
      );
    case "gear": {
      const list = (v: unknown, min: number, max: number) => Array.isArray(v) && v.length >= 1 && v.every((n) => isInt(n, min, max));
      return list(o.realms, 0, 20) && list(o.tiers, 1, 9) && isInt(o.grade, 1, 4) && (o.elements === undefined || (Array.isArray(o.elements) && o.elements.length >= 1 && o.elements.every((e) => (ALL_ROOTS as readonly string[]).includes(e)))) && (o.priceMult === undefined || (typeof o.priceMult === "number" && o.priceMult > 0 && o.priceMult <= 1000));
    }
    case "keep_level":
      return true;
    default:
      return false;
  }
}

export function validMerchant(m: unknown): m is MerchantDef {
  if (typeof m !== "object" || m === null) return false;
  const o = m as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    /^[a-z0-9_]{1,24}$/.test(o.id) &&
    typeof o.mapId === "string" &&
    o.mapId.length > 0 &&
    typeof o.nameVi === "string" &&
    typeof o.sellRate === "number" &&
    o.sellRate >= 0 &&
    o.sellRate <= 1 &&
    (o.buys === null || (Array.isArray(o.buys) && o.buys.every((c) => SELLABLE_CATEGORIES.includes(c as SellableCategory)))) &&
    Array.isArray(o.stock) &&
    o.stock.length <= 5000 &&
    o.stock.every(validStockRule) &&
    new Set((o.stock as StockRule[]).map((r) => r.id)).size === o.stock.length
  );
}

const GEAR_KINDS: readonly EquipKind[] = ["hat", "robe", "bracer", "ring", "jade", "necklace", "belt", "boots"];

/** The pieces of one gear rule for one style: the gendered kinds in that style's version, every weapon family and pháp bảo, in every element. */
function gearOffers(style: "m" | "f", rule: Extract<StockRule, { kind: "gear" }>): ShopOffer[] {
  const out: ShopOffer[] = [];
  const add = (id: string) => {
    if (getItemDef(id)) out.push(offer(id, Math.max(1, Math.round(itemValue(id) * (rule.priceMult ?? 1)))));
  };
  for (const realm of rule.realms) {
    for (const el of rule.elements ?? SPIRITUAL_ROOTS) {
      for (const tier of rule.tiers) {
        for (const kind of GEAR_KINDS) add(makeEquipmentId(kind, GENDERED_KINDS.has(kind) ? style : "u", realm, tier, rule.grade, el));
        for (const wt of WEAPON_TYPES) add(makeEquipmentId("weapon", "u", realm, tier, rule.grade, el, wt));
        add(makeEquipmentId("charm", "u", realm, tier, rule.grade, el));
      }
    }
  }
  return out;
}

let live: Record<string, MerchantDef> = { ...DEFAULT_MERCHANTS };
let liveVersion = 0;

/** Installs the merchants in force (the server, from D1) and forgets the expanded offers. */
export function setMerchants(defs: Readonly<Record<string, MerchantDef>>): void {
  live = { ...defs };
  liveVersion++;
}

/** Adds or replaces one merchant (the client, from the `shop` message). */
export function setMerchant(def: MerchantDef): void {
  live = { ...live, [def.id]: def };
  liveVersion++;
}

export function getMerchant(npc: string): MerchantDef | undefined {
  return live[npc];
}

const OFFER_CACHE = new Map<string, readonly ShopOffer[]>();

/** What the merchant NPC `npc` sells to a buyer of this gender: gear is offered in the version the buyer can wear. Empty for an unknown merchant. */
export function merchantOffers(gender: Gender, npc: string): readonly ShopOffer[] {
  const def = live[npc];
  if (!def) return [];
  const style = gearStyleOf(gender) === "male" ? "m" : "f";
  // The scroll's price and the value of every item are tuning numbers that can change while the game runs, so the generation of the tuning is part of the key, as is the version of the data.
  const keepPrice = keepLevelPrice();
  const key = `${style}:${npc}:${keepPrice}:${liveVersion}:${tuningGeneration()}:${itemsGeneration()}`;
  let list = OFFER_CACHE.get(key);
  if (!list) {
    if (OFFER_CACHE.size > 64) OFFER_CACHE.clear();
    const out: ShopOffer[] = [];
    const seen = new Set<string>();
    const add = (o: ShopOffer) => {
      if (seen.has(o.id)) return;
      seen.add(o.id);
      out.push(o);
    };
    for (const rule of def.stock) {
      if (rule.kind === "item") {
        const o = offer(rule.item, rule.price ?? itemValue(rule.item), rule.dailyLimit);
        add(rule.currency ? { ...o, currency: rule.currency } : o);
      } else if (rule.kind === "gear") for (const o of gearOffers(style, rule)) add(o);
      else add({ ...offer(KEEP_LEVEL_ITEM, keepPrice), currency: "tien_ngoc" });
    }
    list = out;
    OFFER_CACHE.set(key, list);
  }
  return list;
}

export function findOffer(gender: Gender, npc: string, offerId: string): ShopOffer | undefined {
  return merchantOffers(gender, npc).find((o) => o.id === offerId);
}

/** What the merchant `npc` pays for ONE of this item: 0 when it does not buy that kind of item (or at all). */
export function merchantPays(npc: string, type: string, dur?: number, max?: number): number {
  const def = live[npc];
  if (!def) return 0;
  if (def.buys !== null && !def.buys.includes(shopCategoryOf(type))) return 0;
  return sellPrice(type, dur, max, def.sellRate);
}

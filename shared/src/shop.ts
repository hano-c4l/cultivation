import { gearStyleOf, type Gender } from "./gender";
import { equipmentInfo, makeEquipmentId, GENDERED_KINDS, WEAPON_TYPES, type EquipKind } from "./equipment-data";
import { getItemDef } from "./items";
import { KEEP_LEVEL_ITEM, keepLevelPrice } from "./smith";
import { SPIRITUAL_ROOTS } from "./character";
import { levelIndex } from "./progression";
import { bookItemId, getSkill } from "./skills";

/**
 * The merchant in town (phase 2e). Every price and limit is a placeholder game-design value ("giá trị tạm" in
 * docs/PHASE2.md). Offers are shared data: the client lists them itself and the server prices from the same table, so
 * a purchase only names the offer, never a price or an item id.
 */

/** Linh Thạch the merchant pays for an item, as a fraction of its value (the rest is a sink that keeps selling from inflating the economy). */
export const SELL_RATE = 0.15;
export const MAX_SHOP_QTY = 99;
/** Cells a multi-item sale may carry (the message stays under the size limit with room to spare). */
export const SHOP_SELL_MANY_MAX = 20;

/** The tabs of the window; "all" shows everything. Talismans share the pill tab (Đan dược/phù). */
export const SHOP_CATEGORIES = ["all", "pill", "gear", "artifact", "book", "material"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** Which tab an item belongs to. Pháp bảo (charm, bonded, flight) are told apart from ordinary gear. */
export function shopCategoryOf(type: string): Exclude<ShopCategory, "all"> {
  const def = getItemDef(type);
  if (!def) return "pill";
  if (def.category === "equipment") {
    const kind = def.equip?.kind;
    return kind === "charm" || kind === "bonded" || kind === "flight" ? "artifact" : "gear";
  }
  if (def.category === "skill_book") return "book";
  if (def.category === "material") return "material";
  return "pill";
}

/** The element (ngũ hành) of an item, when it has one: gear carries it in its id, a book in the skill it teaches. */
export function shopElementOf(type: string): string | null {
  const def = getItemDef(type);
  if (def?.equip) return def.equip.element;
  if (def?.teaches) return getSkill(def.teaches)?.element ?? null;
  return null;
}
/** The daily limit resets at midnight in Vietnam (UTC+7). */
export const SHOP_RESET_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Day number the limits count in; changes at 00:00 Vietnam time. */
export function shopDay(now: number): number {
  return Math.floor((now + SHOP_RESET_OFFSET_MS) / DAY_MS);
}

export interface ShopOffer {
  /** Stable key, stored with the purchase counts. */
  id: string;
  item: string;
  /** The tab it is listed under. */
  category: Exclude<ShopCategory, "all">;
  /** Element of the item (see shopElementOf), when it has one: the window can filter by it. */
  element: string | null;
  /** The price of one, in Linh Thạch unless `currency` says otherwise. */
  price: number;
  /** Paid in Tiên Ngọc instead of Linh Thạch (the Hộ Cấp Phù). */
  currency?: "tien_ngoc";
  /** Most one character may buy per day; absent means unlimited. */
  dailyLimit?: number;
}

/** Value of plain items, in Linh Thạch. Items without an entry cannot be sold (breakthrough pills, path items, skill books). */
const ITEM_VALUE: Readonly<Record<string, number>> = {
  hoi_huyet_dan: 10,
  duong_huyet_dan: 25,
  dai_hoi_huyet_dan: 60,
  ngo_dao_dan: 1500,
  linh_thao: 3,
  thu_cot: 3,
  yeu_dan: 40,
  ttp_town: 2_000,
  ttp_town2: 20_000,
  linh_nguyen_dan: 400,
  bao_nguyen_dan: 1_500,
  thien_ngo_dan: 7_500,
};

/** Base value of one piece of each gear kind at level 0, grade 1. */
const KIND_VALUE: Readonly<Record<EquipKind, number>> = {
  weapon: 40,
  hat: 20,
  robe: 30,
  bracer: 20,
  ring: 25,
  jade: 25,
  necklace: 25,
  belt: 20,
  boots: 20,
  charm: 60,
  bonded: 150,
  flight: 150,
};
const GRADE_VALUE = [1, 2, 4, 8] as const;

/** Full value of an item (gear: at full durability), or 0 when it has no value and is not traded. */
export function itemValue(type: string): number {
  const equip = equipmentInfo(type);
  if (equip) {
    if (equip.maxDurability === null) return 0; // special pieces that never wear out are not traded
    const level = levelIndex(equip.realm, equip.tier);
    return Math.max(1, Math.round(KIND_VALUE[equip.kind] * (1 + level * 0.6) * (GRADE_VALUE[equip.grade - 1] ?? 1)));
  }
  return ITEM_VALUE[type] ?? 0;
}

/**
 * What the merchant pays for ONE of this item. Worn-down gear is worth proportionally less (`dur`/`max` of the piece).
 * 0 means the merchant does not take it.
 */
export function sellPrice(type: string, dur?: number, max?: number): number {
  if (!getItemDef(type)) return 0;
  const value = itemValue(type);
  if (value <= 0) return 0;
  const wear = dur !== undefined && max !== undefined && max > 0 ? Math.min(1, Math.max(0, dur / max)) : 1;
  return Math.max(1, Math.floor(value * SELL_RATE * wear));
}

function offer(item: string, price: number, dailyLimit?: number, id = item): ShopOffer {
  return { id, item, category: shopCategoryOf(item), element: shopElementOf(item), price, ...(dailyLimit !== undefined ? { dailyLimit } : {}) };
}

const PLAIN_OFFERS: readonly ShopOffer[] = [
  offer("hoi_huyet_dan", itemValue("hoi_huyet_dan")),
  offer("duong_huyet_dan", itemValue("duong_huyet_dan"), 30),
  offer("dai_hoi_huyet_dan", itemValue("dai_hoi_huyet_dan"), 20),
  offer("ngo_dao_dan", itemValue("ngo_dao_dan"), 2),
];

/** The second town sells the pills of the higher realms (the first town's pills stay on offer there too, they are cheap). */
const PLAIN_OFFERS_HIGH: readonly ShopOffer[] = [
  offer("dai_hoi_huyet_dan", itemValue("dai_hoi_huyet_dan"), 30),
  offer("linh_nguyen_dan", itemValue("linh_nguyen_dan"), 30),
  offer("bao_nguyen_dan", itemValue("bao_nguyen_dan"), 15),
  offer("ngo_dao_dan", itemValue("ngo_dao_dan"), 5),
  offer("thien_ngo_dan", itemValue("thien_ngo_dan"), 2),
];

/** Skill books on sale (bí tịch): the two basic ones of Luyện Khí and the strongest skill of each element (Trúc Cơ). Unlimited: a skill can only be learned once. */
const BOOK_OFFERS: readonly ShopOffer[] = [
  offer(bookItemId("cuong_than"), 2_000),
  offer(bookItemId("ngu_kiem_tram"), 3_000),
  ...SPIRITUAL_ROOTS.map((el) => offer(bookItemId(`${el}_3`), 20_000)),
];

/** The second town's books: the strongest skill of each element for Kim Đan and for Nguyên Anh, and a guard, a heal and a battle cry. */
const BOOK_OFFERS_HIGH: readonly ShopOffer[] = [
  offer(bookItemId("ho_the_kd"), 150_000),
  offer(bookItemId("hoi_nguyen_kd"), 200_000),
  offer(bookItemId("cuong_than_na"), 1_500_000),
  ...SPIRITUAL_ROOTS.map((el) => offer(bookItemId(`${el}_4`), 300_000)),
  ...SPIRITUAL_ROOTS.map((el) => offer(bookItemId(`${el}_5`), 3_000_000)),
];

/** Basic gear on sale: bậc 1 and 2, Hạ phẩm (needs nothing of the wearer), in every element. */
const GEAR_KINDS: readonly EquipKind[] = ["hat", "robe", "bracer", "ring", "jade", "necklace", "belt", "boots"];
const GEAR_TIERS = [1, 2] as const;

/** The pieces for one gear style and realm: the gendered kinds in that style's version, every weapon family and pháp bảo, per element. */
function gearOffers(style: "m" | "f", realm: number): ShopOffer[] {
  const out: ShopOffer[] = [];
  for (const el of SPIRITUAL_ROOTS) {
    for (const tier of GEAR_TIERS) {
      for (const kind of GEAR_KINDS) {
        const id = makeEquipmentId(kind, GENDERED_KINDS.has(kind) ? style : "u", realm, tier, 1, el);
        out.push(offer(id, itemValue(id)));
      }
      for (const wt of WEAPON_TYPES) {
        const id = makeEquipmentId("weapon", "u", realm, tier, 1, el, wt);
        out.push(offer(id, itemValue(id)));
      }
      const charm = makeEquipmentId("charm", "u", realm, tier, 1, el);
      out.push(offer(charm, itemValue(charm)));
    }
  }
  return out;
}

/** What each town's merchant sells besides the teleport talismans: the gear of the realms around it, its pills and its books. */
interface TownStock {
  plain: readonly ShopOffer[];
  books: readonly ShopOffer[];
  gearRealms: readonly number[];
}
const TOWN_STOCK: Readonly<Record<string, TownStock>> = {
  town: { plain: PLAIN_OFFERS, books: BOOK_OFFERS, gearRealms: [0] },
  town2: { plain: PLAIN_OFFERS_HIGH, books: BOOK_OFFERS_HIGH, gearRealms: [2, 3] },
};

const OFFERS_BASE = new Map<string, readonly ShopOffer[]>();
function baseOffers(style: "m" | "f", mapId: string): readonly ShopOffer[] {
  const key = `${style}:${mapId}`;
  let list = OFFERS_BASE.get(key);
  if (!list) {
    const stock = TOWN_STOCK[mapId] ?? TOWN_STOCK.town!;
    list = [...stock.plain, ...stock.books, ...stock.gearRealms.flatMap((r) => gearOffers(style, r))];
    OFFERS_BASE.set(key, list);
  }
  return list;
}
const WITH_TALISMAN = new Map<string, readonly ShopOffer[]>();

/**
 * What the merchant of the town `mapId` sells to a buyer of this gender: gear is offered in the version the buyer can wear,
 * and the merchant of a town sells the teleport talisman of that town (and no other).
 */
export function merchantOffers(gender: Gender, mapId: string): readonly ShopOffer[] {
  const style = gearStyleOf(gender) === "male" ? "m" : "f";
  // The scroll's price is a tuning number that can change while the game runs, so it is part of the cache key.
  const keepPrice = keepLevelPrice();
  const key = `${style}:${mapId}:${keepPrice}`;
  let list = WITH_TALISMAN.get(key);
  if (!list) {
    const talisman = `ttp_${mapId}`;
    const keep: ShopOffer = { ...offer(KEEP_LEVEL_ITEM, keepPrice), currency: "tien_ngoc" };
    list = getItemDef(talisman) ? [...baseOffers(style, mapId), keep, offer(talisman, itemValue(talisman))] : [...baseOffers(style, mapId), keep];
    WITH_TALISMAN.set(key, list);
  }
  return list;
}

export function findOffer(gender: Gender, mapId: string, offerId: string): ShopOffer | undefined {
  return merchantOffers(gender, mapId).find((o) => o.id === offerId);
}

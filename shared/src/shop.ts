import { tuning } from "./tuning";
import { equipmentInfo, type EquipKind } from "./equipment-data";
import { getItemDef } from "./items";
import { levelIndex } from "./progression";
import { getSkill } from "./skills";

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

/** Value of plain items, of gear kinds and of grades, in Linh Thạch: the tuning `itemValue`. Items without a value cannot be sold (breakthrough pills, path items); skill books take theirs from the realm they are for. */

/** Full value of an item (gear: at full durability), or 0 when it has no value and is not traded. */
export function itemValue(type: string): number {
  const equip = equipmentInfo(type);
  if (equip) {
    if (equip.maxDurability === null) return 0; // special pieces that never wear out are not traded
    const level = levelIndex(equip.realm, equip.tier);
    const v = tuning().itemValue;
    return Math.max(1, Math.round(v.kinds[equip.kind] * (1 + level * v.levelStep) * (v.grades[equip.grade - 1] ?? 1)));
  }
  const items = tuning().itemValue.items;
  const taught = getItemDef(type)?.teaches;
  if (taught) {
    // A skill book (unread: reading uses it up) is worth what its own entry says, else the entry of the realm it is for (`book_realm_N`), else the built-in one.
    const skill = getSkill(taught);
    const realm = skill?.learn?.realm ?? skill?.realm ?? 0;
    return items[type] ?? items[`book_realm_${realm}`] ?? BOOK_VALUE_BY_REALM[Math.min(realm, BOOK_VALUE_BY_REALM.length - 1)] ?? 0;
  }
  return items[type] ?? 0;
}

/** What a skill book is worth by the realm of the skill it teaches, when the tuning has no entry for it (Linh Thạch). */
export const BOOK_VALUE_BY_REALM: readonly number[] = [200, 2_000, 15_000, 80_000, 300_000, 1_000_000];

/**
 * What the merchant pays for ONE of this item. Worn-down gear is worth proportionally less (`dur`/`max` of the piece).
 * 0 means the merchant does not take it.
 */
export function sellPrice(type: string, dur?: number, max?: number, rate: number = SELL_RATE): number {
  if (!getItemDef(type)) return 0;
  const value = itemValue(type);
  if (value <= 0) return 0;
  const wear = dur !== undefined && max !== undefined && max > 0 ? Math.min(1, Math.max(0, dur / max)) : 1;
  return Math.max(1, Math.floor(value * rate * wear));
}

export function offer(item: string, price: number, dailyLimit?: number, id = item): ShopOffer {
  return { id, item, category: shopCategoryOf(item), element: shopElementOf(item), price, ...(dailyLimit !== undefined ? { dailyLimit } : {}) };
}

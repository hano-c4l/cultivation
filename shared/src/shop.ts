import { gearStyleOf, type Gender } from "./gender";
import { equipmentInfo, makeEquipmentId, GENDERED_KINDS, type EquipKind } from "./equipment-data";
import { getItemDef } from "./items";
import { levelIndex } from "./progression";

/**
 * The merchant in town (phase 2e). Every price and limit is a placeholder game-design value ("giá trị tạm" in
 * docs/PHASE2.md). Offers are shared data: the client lists them itself and the server prices from the same table, so
 * a purchase only names the offer, never a price or an item id.
 */

/** Linh Thạch the merchant pays for an item, as a fraction of its value (the rest is a sink that keeps selling from inflating the economy). */
export const SELL_RATE = 0.15;
export const MAX_SHOP_QTY = 99;
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
  /** Linh Thạch for one. */
  price: number;
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

const PLAIN_OFFERS: readonly ShopOffer[] = [
  { id: "hoi_huyet_dan", item: "hoi_huyet_dan", price: itemValue("hoi_huyet_dan") },
  { id: "duong_huyet_dan", item: "duong_huyet_dan", price: itemValue("duong_huyet_dan"), dailyLimit: 30 },
  { id: "dai_hoi_huyet_dan", item: "dai_hoi_huyet_dan", price: itemValue("dai_hoi_huyet_dan"), dailyLimit: 20 },
  { id: "ngo_dao_dan", item: "ngo_dao_dan", price: itemValue("ngo_dao_dan"), dailyLimit: 2 },
];

/** Basic gear on sale: Luyện Khí bậc 1 and 2, Hạ phẩm (needs nothing of the wearer). */
const GEAR_KINDS: readonly EquipKind[] = ["weapon", "hat", "robe", "bracer", "ring", "jade", "necklace", "belt"];
const GEAR_TIERS = [1, 2] as const;

/** The pieces for one gear style, for every gendered kind the style's version and the unisex kinds. */
function gearOffers(style: "m" | "f"): ShopOffer[] {
  const out: ShopOffer[] = [];
  for (const tier of GEAR_TIERS) {
    for (const kind of GEAR_KINDS) {
      const id = makeEquipmentId(kind, GENDERED_KINDS.has(kind) ? style : "u", 0, tier, 1);
      out.push({ id, item: id, price: itemValue(id) });
    }
  }
  return out;
}

const OFFERS_BY_STYLE = { m: [...PLAIN_OFFERS, ...gearOffers("m")], f: [...PLAIN_OFFERS, ...gearOffers("f")] } as const;

/** What the merchant sells to a buyer of this gender (gear is offered in the version the buyer can wear). */
export function merchantOffers(gender: Gender): readonly ShopOffer[] {
  return OFFERS_BY_STYLE[gearStyleOf(gender) === "male" ? "m" : "f"];
}

export function findOffer(gender: Gender, offerId: string): ShopOffer | undefined {
  return merchantOffers(gender).find((o) => o.id === offerId);
}

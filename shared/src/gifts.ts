import { MAX_LEDGER_AMOUNT, type Currency } from "./economy";
import { isEquipmentType } from "./equipment-data";
import { getItemDef, ITEMS } from "./items";

/**
 * What an admin gift carries (docs/PHASE3.md 3d). Stored as JSON in `mailbox.gift`; the currency and the items are created when the player
 * claims the mail. Equipment is not giftable yet (a piece needs durability, rolled stats and an element; see PHASE3).
 */
export interface GiftItem {
  type: string;
  qty: number;
}

export interface GiftAttachments {
  linh_thach?: number;
  cong_hien?: number;
  tien_ngoc?: number;
  items: GiftItem[];
  /** The account id of the admin who sent it: the `actor` of the currency entries when it is claimed. */
  by?: string;
}

export const GIFT_CURRENCIES: readonly Currency[] = ["linh_thach", "cong_hien", "tien_ngoc"];
export const GIFT_MAX_ITEM_KINDS = 5;
export const GIFT_SUBJECT_MAX = 80;
export const GIFT_BODY_MAX = 1000;
export const GIFT_MAX_RECIPIENTS = 1000;
export const GIFT_BATCH_ID = /^[a-z0-9]{8,24}$/;

/** Items an admin may attach: everything in the catalogue except equipment, which is not catalogued by id. */
export function giftableItems(): Array<{ id: string; nameVi: string; maxStack: number }> {
  return Object.values(ITEMS)
    .filter((d) => !isEquipmentType(d.id))
    .map((d) => ({ id: d.id, nameVi: d.nameVi, maxStack: d.maxStack }));
}

/** The problem with a gift, in a word the screen can show, or null when it can be sent (and claimed). */
export function giftProblem(gift: GiftAttachments): "empty" | "currency" | "item" | "too_many_items" | "duplicate_item" | "quantity" | null {
  let any = false;
  for (const c of GIFT_CURRENCIES) {
    const v = gift[c];
    if (v === undefined || v === 0) continue;
    if (!Number.isInteger(v) || v < 0 || v > MAX_LEDGER_AMOUNT) return "currency";
    any = true;
  }
  if (!Array.isArray(gift.items)) return "item";
  if (gift.items.length > GIFT_MAX_ITEM_KINDS) return "too_many_items";
  const seen = new Set<string>();
  for (const it of gift.items) {
    const def = it && typeof it.type === "string" ? getItemDef(it.type) : undefined;
    if (!def || isEquipmentType(def.id)) return "item";
    if (seen.has(def.id)) return "duplicate_item";
    seen.add(def.id);
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > def.maxStack) return "quantity";
    any = true;
  }
  return any ? null : "empty";
}

/** Reads the JSON of `mailbox.gift`; null when it is missing or not a gift. */
export function parseGift(raw: string | null | undefined): GiftAttachments | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as GiftAttachments;
    return v && typeof v === "object" && Array.isArray(v.items) ? v : null;
  } catch {
    return null;
  }
}

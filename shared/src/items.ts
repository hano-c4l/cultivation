import type { MonsterRank } from "./monsters";

/**
 * Item catalogue. Placeholder game-design values (listed under "giá trị tạm" in docs/STATUS.md). Display strings are
 * Vietnamese data fields, like monster names. Equipment (never stacked, PLAN section 4) arrives with phase 2b.
 */
export type ItemCategory = "consumable" | "material";

/** Độ hiếm (rarity), from common to rarest. The order here is the order used when sorting. */
export const ITEM_RARITIES = ["common", "uncommon", "rare", "epic"] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];
/** Phẩm cấp (grade) of an item, 1 (Hạ phẩm) upwards; higher is better. Names live in the client locale. */
export const MAX_ITEM_GRADE = 4;

export interface ItemDef {
  id: string;
  nameVi: string;
  descVi: string;
  category: ItemCategory;
  /** 1 means the item never stacks (equipment and rare items must use 1). */
  maxStack: number;
  rarity: ItemRarity;
  /** 1..MAX_ITEM_GRADE. */
  grade: number;
  /** Consumables that heal: fraction of max HP restored on use. */
  healFraction?: number;
}

export const ITEMS: Readonly<Record<string, ItemDef>> = {
  hoi_huyet_dan: {
    id: "hoi_huyet_dan",
    nameVi: "Hồi Huyết Đan",
    descVi: "Đan dược cơ bản, hồi 40% sinh lực khi dùng.",
    category: "consumable",
    maxStack: 99,
    rarity: "common",
    grade: 1,
    healFraction: 0.4,
  },
  linh_thao: { id: "linh_thao", nameVi: "Linh Thảo", descVi: "Thảo dược mọc nơi linh khí dồi dào, dùng làm nguyên liệu luyện đan.", category: "material", maxStack: 99, rarity: "common", grade: 1 },
  thu_cot: { id: "thu_cot", nameVi: "Thú Cốt", descVi: "Xương của yêu thú, dùng làm nguyên liệu.", category: "material", maxStack: 99, rarity: "common", grade: 1 },
  yeu_dan: { id: "yeu_dan", nameVi: "Yêu Đan", descVi: "Tinh hoa ngưng tụ trong người yêu thú mạnh.", category: "material", maxStack: 99, rarity: "rare", grade: 2 },
};

export function getItemDef(id: string): ItemDef | undefined {
  return ITEMS[id];
}

export function isItemId(v: unknown): v is string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ITEMS, v);
}

/** One line of a monster's loot table: each kill rolls `chance` (0..1) and, on success, a quantity in [min, max]. */
export interface LootEntry {
  item: string;
  chance: number;
  min: number;
  max: number;
}

export const LOOT_TABLES: Readonly<Record<MonsterRank, readonly LootEntry[]>> = {
  normal: [
    { item: "linh_thao", chance: 0.12, min: 1, max: 2 },
    { item: "thu_cot", chance: 0.12, min: 1, max: 1 },
    { item: "hoi_huyet_dan", chance: 0.04, min: 1, max: 1 },
  ],
  rare1: [
    { item: "yeu_dan", chance: 0.5, min: 1, max: 1 },
    { item: "linh_thao", chance: 0.5, min: 1, max: 3 },
    { item: "hoi_huyet_dan", chance: 0.2, min: 1, max: 2 },
  ],
  rare2: [
    { item: "yeu_dan", chance: 1, min: 1, max: 2 },
    { item: "linh_thao", chance: 0.8, min: 2, max: 4 },
    { item: "hoi_huyet_dan", chance: 0.5, min: 1, max: 3 },
  ],
};

export interface LootDrop {
  item: string;
  qty: number;
}

/** Items dropped by one kill. `rand` returns uniform [0, 1); two numbers are drawn per entry (chance, quantity). */
export function rollLoot(rank: MonsterRank, rand: () => number): LootDrop[] {
  const out: LootDrop[] = [];
  for (const e of LOOT_TABLES[rank]) {
    const chanceRoll = rand();
    const qtyRoll = rand();
    if (chanceRoll >= e.chance) continue;
    out.push({ item: e.item, qty: e.min + Math.floor(qtyRoll * (e.max - e.min + 1)) });
  }
  return out;
}

/** Minimum time between two potions, per player. Each use is a D1 write. */
export const POTION_COOLDOWN_MS = 3_000;

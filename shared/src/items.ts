import { BREAKTHROUGHS } from "./breakthrough";
import type { MapId } from "./map";
import { PATH_IDS, PATHS } from "./paths";
import { equipmentInfo, type EquipInfo } from "./equipment-data";
import type { MonsterRank } from "./monsters";
import { REALMS } from "./progression-data";
import { KEEP_LEVEL_ITEM, REFINE_ORES, SMITH_ORES } from "./smith";
import { BOOK_SKILLS, MASTERY_PILL_POINTS, bookItemId } from "./skills";

/**
 * Item catalogue. Placeholder game-design values (listed under "giá trị tạm" in docs/PHASE2.md). Display strings are
 * Vietnamese data fields, like monster names. Equipment (never stacked, PLAN section 4) arrives with phase 2b.
 */
export type ItemCategory = "consumable" | "material" | "equipment" | "skill_book";

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
  /** With `healFraction`: the heal is spread evenly over this many ms instead of landing at once (shown as an effect on the buff bar). */
  healOverMs?: number;
  /** Equipment only: the template behind the item (slot kind, stats, requirements, durability). */
  equip?: EquipInfo;
  /** Pills that raise the mastery of a skill: how many mastery points one gives (used from the skills window). */
  masteryPills?: number;
  /** Skill books (bí tịch): the skill the book teaches when used. */
  teaches?: string;
  /** Breakthrough pills: the realm the pill leads to. Used from the breakthrough panel, not from the bag. */
  breakthroughTo?: number;
  /** Teleport talismans: using one (outside that map) takes the character to the map's spawn. Bought from the merchant of that town. */
  teleportTo?: MapId;
  /** Path items: the hướng tu it takes up. Spent from the path section of the character window, not from the bag. */
  pathItem?: string;
}

/** One bí tịch per book skill, made from the skill list so a new book skill needs no item entry. */
const BOOKS: Record<string, ItemDef> = Object.fromEntries(
  BOOK_SKILLS.map((s) => [
    bookItemId(s.id),
    { id: bookItemId(s.id), nameVi: `Bí Tịch: ${s.nameVi}`, descVi: `Dùng để học kỹ năng ${s.nameVi}.`, category: "skill_book", maxStack: 1, rarity: "epic", grade: 4, teaches: s.id } satisfies ItemDef,
  ]),
);

/** One breakthrough pill per realm step, made from the breakthrough table. Higher realms are rarer and better (grade 1..4). */
const BREAKTHROUGH_PILLS: Record<string, ItemDef> = Object.fromEntries(
  BREAKTHROUGHS.map((b) => {
    const realm = REALMS[b.to]?.nameVi ?? "";
    return [
      b.pill,
      {
        id: b.pill,
        nameVi: `Đan Đột Phá ${realm}`,
        descVi: `Cần để đột phá lên cảnh giới ${realm} (tối đa ${b.maxPills} viên mỗi lần, càng nhiều càng dễ thành công). Dùng từ bảng Nhân vật.`,
        category: "consumable",
        maxStack: 99,
        rarity: "epic",
        grade: Math.min(MAX_ITEM_GRADE, b.to + 1),
        breakthroughTo: b.to,
      } satisfies ItemDef,
    ];
  }),
);

/** One item per hướng tu (a placeholder for what an NPC quest will give). */
const PATH_ITEMS: Record<string, ItemDef> = Object.fromEntries(
  PATH_IDS.map((id) => {
    const p = PATHS[id];
    return [
      p.item,
      { id: p.item, nameVi: p.itemNameVi, descVi: `Vật phẩm để bước vào hướng tu ${p.nameVi}. Dùng từ bảng Nhân vật, mục hướng tu.`, category: "material", maxStack: 99, rarity: "epic", grade: 3, pathItem: id } satisfies ItemDef,
    ];
  }),
);

/** The ore the blacksmith needs, one kind per realm; it only drops from the monsters of that realm. */
const SMITH_ITEMS: Record<string, ItemDef> = {
  ...Object.fromEntries(
    SMITH_ORES.map((id, realm) => [
      id,
      { id, nameVi: `Tinh Thiết ${REALMS[realm]?.nameVi ?? ""}`, descVi: `Nguyên liệu để Thợ Rèn nâng cấp trang bị và pháp bảo cảnh giới ${REALMS[realm]?.nameVi ?? ""}. Chỉ rơi từ quái cảnh giới này.`, category: "material", maxStack: 99, rarity: "uncommon", grade: Math.min(MAX_ITEM_GRADE, realm + 1) } satisfies ItemDef,
    ]),
  ),
  ...Object.fromEntries(
    REFINE_ORES.map((id, realm) => [
      id,
      { id, nameVi: `Tinh Hoa ${REALMS[realm]?.nameVi ?? ""}`, descVi: `Nguyên liệu để Thợ Rèn tinh luyện trang bị và pháp bảo cảnh giới ${REALMS[realm]?.nameVi ?? ""}, tăng chỉ số lên gần mức tối đa. Hiếm hơn Tinh Thiết; chỉ rơi từ quái và boss cảnh giới này.`, category: "material", maxStack: 99, rarity: "rare", grade: Math.min(MAX_ITEM_GRADE, realm + 1) } satisfies ItemDef,
    ]),
  ),
  [KEEP_LEVEL_ITEM]: {
    id: KEEP_LEVEL_ITEM,
    nameVi: "Hộ Cấp Phù",
    descVi: "Dùng khi nâng cấp ở Thợ Rèn (từ +6 trở lên): nếu thất bại thì giữ nguyên cấp cường hóa, không bị rớt. Chỉ mất phù khi thật sự cứu được một cấp. Bán bằng Tiên Ngọc.",
    category: "material",
    maxStack: 99,
    rarity: "epic",
    grade: 3,
  },
};

export const ITEMS: Readonly<Record<string, ItemDef>> = {
  ...SMITH_ITEMS,
  ...BOOKS,
  ...BREAKTHROUGH_PILLS,
  ...PATH_ITEMS,
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
  duong_huyet_dan: {
    id: "duong_huyet_dan",
    nameVi: "Dưỡng Huyết Đan",
    descVi: "Đan dược hồi 40% sinh lực, thấm dần trong 5 giây.",
    category: "consumable",
    maxStack: 99,
    rarity: "uncommon",
    grade: 1,
    healFraction: 0.4,
    healOverMs: 5000,
  },
  dai_hoi_huyet_dan: {
    id: "dai_hoi_huyet_dan",
    nameVi: "Đại Hồi Huyết Đan",
    descVi: "Đan dược hồi 80% sinh lực khi dùng.",
    category: "consumable",
    maxStack: 99,
    rarity: "uncommon",
    grade: 2,
    healFraction: 0.8,
  },
  ttp_town: {
    id: "ttp_town",
    nameVi: "Truyền Tống Phù · Thanh Vân Thành",
    descVi: "Dùng để lập tức trở về Thanh Vân Thành. Chỉ bán ở thương nhân của thành, không rơi từ quái.",
    category: "consumable",
    maxStack: 20,
    rarity: "uncommon",
    grade: 2,
    teleportTo: "town",
  },
  ngo_dao_dan: {
    id: "ngo_dao_dan",
    nameVi: "Ngộ Đạo Đan",
    descVi: "Dùng từ cửa sổ Kỹ năng để tăng độ thuần thục cho một kỹ năng (kỹ năng linh căn, tông môn hoặc học được).",
    category: "consumable",
    maxStack: 99,
    rarity: "rare",
    grade: 3,
    masteryPills: MASTERY_PILL_POINTS,
  },
  linh_thao: { id: "linh_thao", nameVi: "Linh Thảo", descVi: "Thảo dược mọc nơi linh khí dồi dào, dùng làm nguyên liệu luyện đan.", category: "material", maxStack: 99, rarity: "common", grade: 1 },
  thu_cot: { id: "thu_cot", nameVi: "Thú Cốt", descVi: "Xương của yêu thú, dùng làm nguyên liệu.", category: "material", maxStack: 99, rarity: "common", grade: 1 },
  yeu_dan: { id: "yeu_dan", nameVi: "Yêu Đan", descVi: "Tinh hoa ngưng tụ trong người yêu thú mạnh.", category: "material", maxStack: 99, rarity: "rare", grade: 2 },
};

const EQUIPMENT_RARITY: readonly ItemRarity[] = ["common", "uncommon", "rare", "epic"];
const equipmentDefs = new Map<string, ItemDef>();

/** Plain items come from ITEMS; equipment is generated from its id (shared/src/equipment-data.ts) and cached. */
export function getItemDef(id: string): ItemDef | undefined {
  if (Object.prototype.hasOwnProperty.call(ITEMS, id)) return ITEMS[id];
  const cached = equipmentDefs.get(id);
  if (cached) return cached;
  const equip = equipmentInfo(id);
  if (!equip) return undefined;
  const def: ItemDef = {
    id,
    nameVi: equip.nameVi,
    descVi: equip.descVi,
    category: "equipment",
    maxStack: 1,
    rarity: EQUIPMENT_RARITY[equip.grade - 1] ?? "common",
    grade: equip.grade,
    equip,
  };
  equipmentDefs.set(id, def);
  return def;
}

export function isItemId(v: unknown): v is string {
  return typeof v === "string" && getItemDef(v) !== undefined;
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
    { item: "duong_huyet_dan", chance: 0.03, min: 1, max: 1 },
  ],
  rare1: [
    { item: "yeu_dan", chance: 0.5, min: 1, max: 1 },
    { item: "linh_thao", chance: 0.5, min: 1, max: 3 },
    { item: "hoi_huyet_dan", chance: 0.2, min: 1, max: 2 },
    { item: "duong_huyet_dan", chance: 0.15, min: 1, max: 1 },
    { item: "ngo_dao_dan", chance: 0.05, min: 1, max: 1 },
  ],
  rare2: [
    { item: "yeu_dan", chance: 1, min: 1, max: 2 },
    { item: "linh_thao", chance: 0.8, min: 2, max: 4 },
    { item: "hoi_huyet_dan", chance: 0.5, min: 1, max: 3 },
    { item: "duong_huyet_dan", chance: 0.4, min: 1, max: 2 },
    { item: "ngo_dao_dan", chance: 0.25, min: 1, max: 1 },
  ],
};

export interface LootDrop {
  item: string;
  qty: number;
  /** Equipment: current and maximum durability of the dropped piece (absent for pieces that never wear out). */
  dur?: number;
  max?: number;
  /** Equipment: the stats rolled for this piece (filled in by the server when the drop is paid out). */
  rs?: Partial<Record<"attack" | "defense" | "maxHp" | "critRate" | "dodgeRate" | "moveSpeed", number>>;
}

/** Items dropped by one kill. `rand` returns uniform [0, 1); two numbers are drawn per entry (chance, quantity). */
export function rollLoot(rank: MonsterRank, rand: () => number, chanceMult = 1): LootDrop[] {
  const out: LootDrop[] = [];
  for (const e of LOOT_TABLES[rank]) {
    const chanceRoll = rand();
    const qtyRoll = rand();
    if (chanceRoll >= e.chance * chanceMult) continue;
    out.push({ item: e.item, qty: e.min + Math.floor(qtyRoll * (e.max - e.min + 1)) });
  }
  return out;
}

/** How long a teleport talisman must be channelled. Moving, attacking or being hit breaks it and the talisman is kept. */
export const TALISMAN_CAST_MS = 5_000;

/** Minimum time between two potions, per player. Each use is a D1 write. */
export const POTION_COOLDOWN_MS = 3_000;

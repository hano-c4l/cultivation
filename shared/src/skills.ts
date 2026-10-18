import type { SpiritualRoot } from "./character";
import { levelIndex, type Element } from "./progression";
import { SPIRITUAL_ROOTS } from "./character";
import type { MonsterRank } from "./monsters";

/**
 * Skills (phase 2c). Placeholder game-design values (listed under "giá trị tạm" in docs/STATUS.md): the list, names, costs,
 * cooldowns and powers are all meant to be tuned. A skill is one of: a single-target attack, a heal, or a short buff.
 *
 * How a character gets one: BASIC skills unlock by realm and stage (the five element skills only for the matching spiritual
 * roots (all the character's elements), the common ones for everyone) and are never stored; BOOK skills are learned from a bí tịch item and stored in
 * `character_skills`. Learning from NPCs and sects comes later.
 */
export type SkillKind = "attack" | "heal" | "buff" | "teleport";
/** Worn pieces that grant skills while they are on (and not broken): ordinary pháp bảo, the bonded one, the flight one. */
export type GearSkillSource = "charm" | "bonded" | "flight";
/** What a buff raises. attack/defense: fraction of the stat; dodge: `power` is a fraction of 100, added as percentage points of dodge chance. */
export type BuffStat = "attack" | "defense" | "dodge";

export interface SkillDef {
  id: string;
  nameVi: string;
  descVi: string;
  kind: SkillKind;
  /** Element of an attack. null: the caster's own element. */
  element: Element | null;
  mpCost: number;
  cooldownMs: number;
  /** Reach of an attack in tiles (heals and buffs need no target). */
  range: number;
  /**
   * attack: damage multiplier on the caster's attack. heal: fraction of max HP restored.
   * buff: fraction added to the buffed stat (0.3 = +30%).
   */
  power: number;
  buff?: { stat: BuffStat; durationMs: number };
  /** Weapon family the caster must wield (WEAPON_TYPES); omitted: any weapon or none. */
  weapon?: string;
  /** Basic skills: the level that unlocks it (with `root` for element skills). null: only from a book. */
  unlock: { realm: number; stage: number; root?: SpiritualRoot } | null;
  /** Book skills: the level needed to learn it from the bí tịch. */
  learn?: { realm: number; stage: number };
  /** Granted by a worn pháp bảo of this kind instead of by level or a book (with `unlock: null`; never learned). */
  gear?: GearSkillSource;
}

const ELEMENT_NAMES: Record<SpiritualRoot, string> = { kim: "Kim", moc: "Mộc", thuy: "Thủy", hoa: "Hỏa", tho: "Thổ" };

function elementSkills(root: SpiritualRoot): SkillDef[] {
  const n = ELEMENT_NAMES[root];
  return [
    { id: `${root}_1`, nameVi: `${n} Linh Chưởng`, descVi: `Đánh một chưởng hệ ${n} vào mục tiêu.`, kind: "attack", element: root, mpCost: 8, cooldownMs: 3000, range: 4, power: 1.6, unlock: { realm: 0, stage: 1, root } },
    { id: `${root}_2`, nameVi: `${n} Cương Trảm`, descVi: `Chém mạnh hệ ${n}, tốn nhiều linh lực hơn.`, kind: "attack", element: root, mpCost: 18, cooldownMs: 6000, range: 5, power: 2.4, unlock: { realm: 0, stage: 5, root } },
    { id: `${root}_3`, nameVi: `Vạn ${n} Diệt Thế`, descVi: `Tuyệt kỹ hệ ${n}, học từ bí tịch.`, kind: "attack", element: root, mpCost: 35, cooldownMs: 10_000, range: 6, power: 3.8, unlock: null, learn: { realm: 1, stage: 1 } },
  ];
}

/**
 * Skills that come with worn pháp bảo. Ordinary pháp bảo give one attack of their own element. The pháp bảo bản mệnh gives
 * stronger ones (a heavy strike of its element, a guard and a heal), and the pháp bảo phi hành gives movement skills: a short
 * teleport and a buff to dodge chance. All numbers are placeholders (docs/STATUS.md, "giá trị tạm").
 */
function gearSkills(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const root of SPIRITUAL_ROOTS) {
    const n = ELEMENT_NAMES[root];
    out.push({ id: `pb_${root}`, nameVi: `Pháp Bảo ${n} Quang`, descVi: `Pháp bảo hệ ${n} phóng ra một đạo quang chấn thương mục tiêu. Cần đeo pháp bảo hệ ${n}.`, kind: "attack", element: root, mpCost: 16, cooldownMs: 8000, range: 5, power: 2.8, unlock: null, gear: "charm" });
    out.push({ id: `bm_${root}`, nameVi: `Bản Mệnh ${n} Kích`, descVi: `Tuyệt chiêu của pháp bảo bản mệnh hệ ${n}, mạnh hơn mọi pháp bảo thường. Cần đeo pháp bảo bản mệnh hệ ${n}.`, kind: "attack", element: root, mpCost: 40, cooldownMs: 15_000, range: 7, power: 5.5, unlock: null, gear: "bonded" });
  }
  out.push(
    { id: "bm_ho_the", nameVi: "Bản Mệnh Hộ Thể", descVi: "Pháp bảo bản mệnh bao bọc chủ nhân: tăng 50% phòng thủ trong 12 giây.", kind: "buff", element: null, mpCost: 30, cooldownMs: 45_000, range: 0, power: 0.5, buff: { stat: "defense", durationMs: 12_000 }, unlock: null, gear: "bonded" },
    { id: "bm_hoi_sinh", nameVi: "Bản Mệnh Hồi Sinh", descVi: "Pháp bảo bản mệnh truyền linh khí cho chủ nhân, hồi 60% sinh lực.", kind: "heal", element: null, mpCost: 35, cooldownMs: 60_000, range: 0, power: 0.6, unlock: null, gear: "bonded" },
    { id: "pt_thuan_di", nameVi: "Thuấn Di", descVi: "Dịch chuyển tức thời tới một vị trí trong tầm 9 ô. Cần pháp bảo phi hành; chỉ dùng được ngoài thành.", kind: "teleport", element: null, mpCost: 30, cooldownMs: 25_000, range: 9, power: 0, unlock: null, gear: "flight" },
    { id: "pt_phong_than", nameVi: "Phong Thân Quyết", descVi: "Thân nhẹ như gió: tăng 25% tỉ lệ né tránh trong 12 giây. Cần pháp bảo phi hành.", kind: "buff", element: null, mpCost: 25, cooldownMs: 40_000, range: 0, power: 0.25, buff: { stat: "dodge", durationMs: 12_000 }, unlock: null, gear: "flight" },
  );
  return out;
}

export const SKILLS: readonly SkillDef[] = [
  ...SPIRITUAL_ROOTS.flatMap(elementSkills),
  ...gearSkills(),
  { id: "hoi_khi", nameVi: "Hồi Khí Quyết", descVi: "Vận khí chữa thương, hồi 30% sinh lực.", kind: "heal", element: null, mpCost: 15, cooldownMs: 8000, range: 0, power: 0.3, unlock: { realm: 0, stage: 1 } },
  { id: "linh_thuan", nameVi: "Linh Thuẫn", descVi: "Tăng 30% phòng thủ trong 15 giây.", kind: "buff", element: null, mpCost: 12, cooldownMs: 30_000, range: 0, power: 0.3, buff: { stat: "defense", durationMs: 15_000 }, unlock: { realm: 0, stage: 3 } },
  { id: "cuong_than", nameVi: "Cuồng Thần Thuật", descVi: "Tăng 25% công kích trong 15 giây, học từ bí tịch.", kind: "buff", element: null, mpCost: 20, cooldownMs: 30_000, range: 0, power: 0.25, buff: { stat: "attack", durationMs: 15_000 }, unlock: null, learn: { realm: 0, stage: 5 } },
  { id: "ngu_kiem_tram", nameVi: "Ngự Kiếm Trảm", descVi: "Ngự kiếm chém xa; phải cầm kiếm. Học từ bí tịch.", kind: "attack", element: null, mpCost: 30, cooldownMs: 8000, range: 7, power: 3.2, weapon: "kiem", unlock: null, learn: { realm: 0, stage: 7 } },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function getSkill(id: string): SkillDef | undefined {
  return BY_ID.get(id);
}

export function isSkillId(v: unknown): v is string {
  return typeof v === "string" && BY_ID.has(v);
}

/** Skills a book can teach. */
export const BOOK_SKILLS: readonly SkillDef[] = SKILLS.filter((s) => s.unlock === null && s.gear === undefined);

/** The item id of the bí tịch that teaches a skill. */
export function bookItemId(skillId: string): string {
  return `bt_${skillId}`;
}

/** Whether a basic skill is unlocked for a character of this root and level. Book skills never are. */
export function isBasicUnlocked(skill: SkillDef, roots: readonly SpiritualRoot[], realm: number, stage: number): boolean {
  const u = skill.unlock;
  if (!u) return false;
  if (u.root !== undefined && !roots.includes(u.root)) return false;
  return levelIndex(realm, stage) >= levelIndex(u.realm, u.stage);
}

/** Every skill the character can use: the unlocked basic ones, the learned (book) ones and those granted by worn pháp bảo (`gear`), in list order. */
export function availableSkills(roots: readonly SpiritualRoot[], realm: number, stage: number, learned: Iterable<string>, gear: Iterable<string> = []): string[] {
  const books = new Set(learned);
  const worn = new Set(gear);
  return SKILLS.filter((s) => (s.unlock ? isBasicUnlocked(s, roots, realm, stage) : s.gear ? worn.has(s.id) : books.has(s.id))).map((s) => s.id);
}

/** Whether a character may learn this skill from its book (level only; the server also checks it is not known yet). */
export function canLearn(skill: SkillDef, realm: number, stage: number): boolean {
  return skill.learn !== undefined && levelIndex(realm, stage) >= levelIndex(skill.learn.realm, skill.learn.stage);
}

/** MP regeneration: fraction of max MP per second, starting this long after the last time the character was hit. */
export const MP_REGEN_PER_S = 0.02;
export const MP_REGEN_DELAY_MS = 5000;

/** Hotbar: 8 slots on keys 1-8. A slot is "" (empty), "s:<skill id>" or "i:<item type>". */
export const HOTBAR_SLOTS = 8;
export const HOTBAR_SLOT_PATTERN = /^(?:|s:[a-z0-9_]{1,32}|i:[a-z0-9_.]{1,60})$/;
export function emptyHotbar(): string[] {
  return Array.from({ length: HOTBAR_SLOTS }, () => "");
}

/** Parses the stored hotbar JSON; anything malformed becomes an empty bar. */
export function parseHotbar(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    if (Array.isArray(v) && v.length === HOTBAR_SLOTS && v.every((x) => typeof x === "string" && HOTBAR_SLOT_PATTERN.test(x))) return v as string[];
  } catch {
    // Fall through to an empty bar.
  }
  return emptyHotbar();
}

/** Chance (0..1) that a kill drops a skill book, by monster class. Rolled apart from the loot table (see rollBookDrop). */
export const BOOK_DROP_CHANCE: Readonly<Record<MonsterRank, number>> = { normal: 0.003, rare1: 0.03, rare2: 0.08 };

/** A book dropped by one kill, or null. Draws exactly two numbers (chance, which book) so seeded sequences stay stable. */
export function rollBookDrop(rank: MonsterRank, rand: () => number): string | null {
  const chance = rand();
  const pick = rand();
  if (chance >= BOOK_DROP_CHANCE[rank]) return null;
  const skill = BOOK_SKILLS[Math.floor(pick * BOOK_SKILLS.length)];
  return skill ? bookItemId(skill.id) : null;
}

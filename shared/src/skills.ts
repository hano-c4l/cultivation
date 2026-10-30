import { tuning, tuningGeneration, type SkillNumbers } from "./tuning";
import type { SpiritualRoot } from "./character";
import { ALL_ROOTS, SPIRITUAL_ROOTS } from "./character";
import type { MonsterRank } from "./monsters";
import type { AreaDef } from "./area";
import { REALMS } from "./progression-data";
import { DOJO_SKILLS, RARE_SKILLS } from "./skills-extra";
import { rateCap, getRootGrade, levelIndex, type Element } from "./progression";

/**
 * Skills (phase 2c, reworked with realms, grades and mastery levels). Placeholder game-design values (listed under "giá trị
 * tạm" in docs/PHASE2.md): every number here is meant to be tuned.
 *
 * Where a skill comes from (`source`):
 *  - "root": two per realm the character has reached, one attack and one at random (attack, heal, buff or passive). They are
 *    not tied to an element: a character with several roots picks the element when putting the skill on the hotbar. The pick is
 *    rolled once and stored (character_skills), so adding templates later never reshuffles anybody.
 *  - "learned": from a bí tịch (or, later, an NPC). "sect": taught by a sect (none yet). Both have a realm and grade of their own.
 *  - "gear": granted while a pháp bảo is worn (shared/src/gear-skills.ts); realm and grade come from the piece.
 *  - "path": two per hướng tu the character has taken up (shared/src/paths.ts); they follow the character's realm and are
 *    stronger when the path is the chủ tu than when it is a phụ tu.
 *
 * Root, learned and sect skills have a mastery level (nhập môn .. viên mãn, and thần thông for high grades) that grows with use.
 */
export type SkillKind = "attack" | "heal" | "buff" | "teleport" | "passive";
export type SkillSource = "root" | "gear" | "sect" | "learned" | "path";
/** What a path skill is worth as a phụ tu compared with as the chủ tu (also used for the stats of a path, see paths.ts). */
export function pathSubFactor(): number {
  return tuning().skills.subFactor;
}
/** Worn pieces that grant skills while they are on (and not broken): ordinary pháp bảo, the bonded one, the flight one. */
export type GearSkillSource = "charm" | "bonded" | "flight";
/** What a buff raises. attack/defense: fraction of the stat; dodge and crit: `power` is a fraction of 100, added as percentage points of that chance. */
export type BuffStat = "attack" | "defense" | "dodge" | "crit";
/** What a passive skill raises all the time. attack/defense: fraction of the stat; dodge/crit: fraction of 100 as percentage points. */
export type PassiveStat = "attack" | "defense" | "dodge" | "crit";

export interface SkillDef {
  id: string;
  nameVi: string;
  descVi: string;
  kind: SkillKind;
  source: SkillSource;
  /** Element of an attack. null: the caster's own element, or (with `flex`) the one picked on the hotbar. */
  element: Element | null;
  /** The element is chosen when the skill goes on the hotbar (attacks of "root" skills). */
  flex?: boolean;
  /** Realm (REALMS index) the skill belongs to. For gear skills this is the base; the worn piece's realm is used. */
  realm: number;
  /** Fixed grade on the root-grade scale (0 Hạ .. 4 Thiên). Absent for root skills (the character's root grade) and gear skills (the piece's grade). */
  grade?: number;
  mpCost: number;
  cooldownMs: number;
  /** Reach of an attack in tiles, or how far a teleport may jump (heals and buffs need no target). */
  range: number;
  /**
   * attack: damage multiplier on the caster's attack. heal: fraction of max HP restored.
   * buff and passive: fraction added to the stat (0.3 = +30%). teleport: unused.
   */
  power: number;
  buff?: { stat: BuffStat; durationMs: number };
  passive?: { stat: PassiveStat };
  /** Weapon family the caster must wield (WEAPON_TYPES); omitted: any weapon or none. */
  weapon?: string;
  /** Learned skills: the level needed to learn it from the bí tịch. */
  learn?: { realm: number; stage: number };
  /** Granted by a worn pháp bảo of this kind. */
  gear?: GearSkillSource;
  /** Path skills: the hướng tu that gives it (a PathId), and the level of the path it belongs to (0 is the first). */
  path?: string;
  pathLevel?: number;
  /** Attacks: the effect other players see, when an admin picked one (otherwise the client decides from the template). */
  fx?: SkillFxKind;
  /** A rare skill: its book is found only (a monster, a boss), never sold or taught. */
  rare?: boolean;
  /** Attacks: the share of the damage dealt to the main target that comes back to the caster as health (0.15 = 15%). */
  drain?: number;
  /** Attacks: against a target below this share of its health (`below`, 0..1) the blow is multiplied by `mult`. */
  execute?: { below: number; mult: number };
  /** The area this skill hits, when it is not the one the tuning (`skillAreas`) gives by its id: the realm variants of the basic qi blast carry theirs. */
  area?: AreaDef;
}

/** The effects an admin can give an attack (the other kinds of skill have theirs by kind). */
export const SKILL_FX_KINDS = ["melee", "ranged"] as const;
export type SkillFxKind = (typeof SKILL_FX_KINDS)[number];

const ELEMENT_NAMES: Record<SpiritualRoot, string> = { kim: "Kim", moc: "Mộc", thuy: "Thủy", hoa: "Hỏa", tho: "Thổ", loi: "Lôi", bang: "Băng", phong: "Phong" };

/** A root skill before it is given a realm: the same template exists in every realm, stronger in the higher ones. */
export interface SkillTemplate {
  id: string;
  nameVi: string;
  descVi: string;
  kind: SkillKind;
  mpCost: number;
  cooldownMs: number;
  range: number;
  power: number;
  buff?: SkillDef["buff"];
  passive?: SkillDef["passive"];
}

export const ATTACK_TEMPLATES: readonly SkillTemplate[] = [
  { id: "chuong", nameVi: "Linh Chưởng", descVi: "Đánh một chưởng vào mục tiêu, hệ tùy chọn khi gán phím tắt.", kind: "attack", mpCost: 8, cooldownMs: 3000, range: 7, power: 1.6 },
  { id: "tram", nameVi: "Cương Trảm", descVi: "Chém mạnh vào mục tiêu, tốn nhiều linh lực hơn.", kind: "attack", mpCost: 18, cooldownMs: 6000, range: 8, power: 2.4 },
  { id: "chi", nameVi: "Phi Chỉ", descVi: "Bắn một đạo chỉ lực đánh xa.", kind: "attack", mpCost: 12, cooldownMs: 4500, range: 9, power: 2.0 },
];

/** The second (random) skill of a realm is drawn from the attacks again and from these. */
export const SUPPORT_TEMPLATES: readonly SkillTemplate[] = [
  { id: "hoi", nameVi: "Hồi Khí Quyết", descVi: "Vận khí chữa thương, hồi sinh lực.", kind: "heal", mpCost: 15, cooldownMs: 8000, range: 0, power: 0.3 },
  { id: "thuan", nameVi: "Linh Thuẫn", descVi: "Tăng phòng thủ trong 15 giây.", kind: "buff", mpCost: 12, cooldownMs: 30_000, range: 0, power: 0.3, buff: { stat: "defense", durationMs: 15_000 } },
  { id: "cuong_luc", nameVi: "Cuồng Lực Quyết", descVi: "Tăng công kích trong 15 giây.", kind: "buff", mpCost: 14, cooldownMs: 30_000, range: 0, power: 0.25, buff: { stat: "attack", durationMs: 15_000 } },
  { id: "phong_bo", nameVi: "Phong Bộ", descVi: "Bước chân nhẹ như gió: tăng tỉ lệ né tránh trong 12 giây.", kind: "buff", mpCost: 12, cooldownMs: 30_000, range: 0, power: 0.15, buff: { stat: "dodge", durationMs: 12_000 } },
  { id: "bd_cong", nameVi: "Công Pháp Nội Tu", descVi: "Bị động: luôn tăng công kích.", kind: "passive", mpCost: 0, cooldownMs: 0, range: 0, power: 0.08, passive: { stat: "attack" } },
  { id: "bd_thu", nameVi: "Hộ Thể Nội Công", descVi: "Bị động: luôn tăng phòng thủ.", kind: "passive", mpCost: 0, cooldownMs: 0, range: 0, power: 0.08, passive: { stat: "defense" } },
  { id: "bd_than", nameVi: "Khinh Thân Thuật", descVi: "Bị động: luôn tăng tỉ lệ né tránh.", kind: "passive", mpCost: 0, cooldownMs: 0, range: 0, power: 0.03, passive: { stat: "dodge" } },
  { id: "bd_mang", nameVi: "Tâm Nhãn", descVi: "Bị động: luôn tăng tỉ lệ chí mạng.", kind: "passive", mpCost: 0, cooldownMs: 0, range: 0, power: 0.03, passive: { stat: "crit" } },
];

const TEMPLATES: readonly SkillTemplate[] = [...ATTACK_TEMPLATES, ...SUPPORT_TEMPLATES];
/** Every root skill template (the admin screen lists them: an override under a template id applies to the skill in every realm). */
export const SKILL_TEMPLATES: readonly SkillTemplate[] = TEMPLATES;

function rootSkillsOfRealm(realm: number): SkillDef[] {
  return TEMPLATES.map((t) => ({
    id: `${t.id}_${realm}`,
    nameVi: t.nameVi,
    descVi: t.descVi,
    kind: t.kind,
    source: "root" as const,
    element: null,
    ...(t.kind === "attack" ? { flex: true } : {}),
    realm,
    mpCost: t.mpCost,
    cooldownMs: t.cooldownMs,
    range: t.range,
    power: t.power,
    ...(t.buff ? { buff: t.buff } : {}),
    ...(t.passive ? { passive: t.passive } : {}),
  }));
}

/** Element-bound book skills: the strongest of each element, learned from a bí tịch (their ids are stored and must not change). */
function elementBookSkill(root: SpiritualRoot): SkillDef {
  const n = ELEMENT_NAMES[root];
  return { id: `${root}_3`, nameVi: `Vạn ${n} Diệt Thế`, descVi: `Tuyệt kỹ hệ ${n}, học từ bí tịch.`, kind: "attack", source: "learned", element: root, realm: 1, grade: 3, mpCost: 24, cooldownMs: 10_000, range: 9, power: 2.6, learn: { realm: 1, stage: 1 } };
}

/**
 * The strongest skill of each element for Kim Đan (`${root}_4`), Nguyên Anh (`${root}_5`), Hóa Thần (`${root}_6`) and Luyện Hư (`${root}_7`), learned from a bí tịch sold
 * in the second town (the first two) and the third (the last two).
 */
function elementBookSkillHigh(root: SpiritualRoot, realm: 2 | 3 | 4 | 5): SkillDef {
  const n = ELEMENT_NAMES[root];
  switch (realm) {
    case 2:
      return { id: `${root}_4`, nameVi: `Cửu Thiên ${n} Chấn`, descVi: `Tuyệt kỹ hệ ${n} của Kim Đan, học từ bí tịch.`, kind: "attack", source: "learned", element: root, realm: 2, grade: 3, mpCost: 42, cooldownMs: 11_000, range: 9, power: 3.4, learn: { realm: 2, stage: 1 } };
    case 3:
      return { id: `${root}_5`, nameVi: `Thái Cổ ${n} Diệt`, descVi: `Tuyệt kỹ hệ ${n} của Nguyên Anh, học từ bí tịch.`, kind: "attack", source: "learned", element: root, realm: 3, grade: 4, mpCost: 64, cooldownMs: 12_000, range: 10, power: 4.6, learn: { realm: 3, stage: 1 } };
    case 4:
      return { id: `${root}_6`, nameVi: `Phá Thiên ${n} Ấn`, descVi: `Tuyệt kỹ hệ ${n} của Hóa Thần, học từ bí tịch.`, kind: "attack", source: "learned", element: root, realm: 4, grade: 4, mpCost: 96, cooldownMs: 13_000, range: 10, power: 6.2, learn: { realm: 4, stage: 1 } };
    default:
      return { id: `${root}_7`, nameVi: `Hư Không ${n} Tuyệt`, descVi: `Tuyệt kỹ hệ ${n} của Luyện Hư, học từ bí tịch.`, kind: "attack", source: "learned", element: root, realm: 5, grade: 4, mpCost: 140, cooldownMs: 14_000, range: 11, power: 8.4, learn: { realm: 5, stage: 1 } };
  }
}

/**
 * Skills that come with worn pháp bảo. Ordinary pháp bảo give one attack of their own element. The pháp bảo bản mệnh gives
 * stronger ones (a heavy strike of its element, a guard and a heal), and the pháp bảo phi hành gives movement skills: a short
 * teleport and a buff to dodge chance. The realm and grade of the skill are those of the worn piece.
 */
function gearSkills(): SkillDef[] {
  const out: SkillDef[] = [];
  for (const root of ALL_ROOTS) {
    const n = ELEMENT_NAMES[root];
    // One skill for each of the four pháp bảo slots (a piece in each slot gives its own, at that piece's strength), so two
    // pieces of the same element both show and cool down on their own.
    for (let n = 1; n <= 4; n++) {
      out.push({ id: `pb_${root}_${n}`, nameVi: `Pháp Bảo ${ELEMENT_NAMES[root]} Quang`, descVi: `Pháp bảo ở ô ${n} hệ ${ELEMENT_NAMES[root]} phóng ra một đạo quang chấn thương mục tiêu. Cần đeo pháp bảo hệ ${ELEMENT_NAMES[root]} ở ô ${n}.`, kind: "attack", source: "gear", element: root, realm: 0, mpCost: 16, cooldownMs: 8000, range: 8, power: 2.8, gear: "charm" });
    }
    out.push({ id: `bm_${root}`, nameVi: `Bản Mệnh ${n} Kích`, descVi: `Tuyệt chiêu của pháp bảo bản mệnh hệ ${n}, mạnh hơn mọi pháp bảo thường. Cần đeo pháp bảo bản mệnh hệ ${n}.`, kind: "attack", source: "gear", element: root, realm: 0, mpCost: 40, cooldownMs: 15_000, range: 10, power: 5.5, gear: "bonded" });
  }
  out.push(
    { id: "bm_ho_the", nameVi: "Bản Mệnh Hộ Thể", descVi: "Pháp bảo bản mệnh bao bọc chủ nhân, tăng phòng thủ trong 12 giây.", kind: "buff", source: "gear", element: null, realm: 0, mpCost: 30, cooldownMs: 45_000, range: 0, power: 0.5, buff: { stat: "defense", durationMs: 12_000 }, gear: "bonded" },
    { id: "bm_hoi_sinh", nameVi: "Bản Mệnh Hồi Sinh", descVi: "Pháp bảo bản mệnh truyền linh khí cho chủ nhân, hồi sinh lực.", kind: "heal", source: "gear", element: null, realm: 0, mpCost: 35, cooldownMs: 60_000, range: 0, power: 0.6, gear: "bonded" },
    { id: "pt_thuan_di", nameVi: "Thuấn Di", descVi: "Dịch chuyển tức thời tới một vị trí trong tầm 9 ô. Cần pháp bảo phi hành; chỉ dùng được ngoài thành.", kind: "teleport", source: "gear", element: null, realm: 0, mpCost: 30, cooldownMs: 25_000, range: 9, power: 0, gear: "flight" },
    { id: "pt_phong_than", nameVi: "Phong Thân Quyết", descVi: "Thân nhẹ như gió: tăng tỉ lệ né tránh trong 12 giây. Cần pháp bảo phi hành.", kind: "buff", source: "gear", element: null, realm: 0, mpCost: 25, cooldownMs: 40_000, range: 0, power: 0.25, buff: { stat: "dodge", durationMs: 12_000 }, gear: "flight" },
  );
  return out;
}

/**
 * The two skills of each hướng tu (docs/PHASE2.md, 2d-B). Their realm is the character's own (see skillContextFor); the realm here
 * is only the first one that can take a path. They are attacks of a free element (chosen on the hotbar), a heal or a buff.
 */
function pathSkills(): SkillDef[] {
  const path = (id: string, nameVi: string, descVi: string, p: string, over: Partial<SkillDef>): SkillDef => ({
    id,
    nameVi,
    descVi,
    kind: "attack",
    source: "path",
    element: null,
    realm: 1,
    grade: 1,
    mpCost: 20,
    cooldownMs: 6000,
    range: 9,
    power: 2.8,
    path: p,
    pathLevel: 0,
    ...over,
  });
  return [
    // Level 0 (the first level of each path)
    path("kt_kiem_khi", "Kiếm Khí Trảm", "Kiếm tu: chém ra một đạo kiếm khí vào mục tiêu.", "kiem", { flex: true, mpCost: 20, cooldownMs: 6000, range: 9, power: 2.8 }),
    path("kt_lien_hoan", "Phi Kiếm Liên Hoàn", "Kiếm tu: ngự kiếm chém liên hoàn, mạnh hơn nhưng tốn nhiều linh lực.", "kiem", { flex: true, mpCost: 36, cooldownMs: 14_000, range: 10, power: 4.2 }),
    path("tt_phap_an", "Pháp Ấn", "Thuật tu: kết ấn đánh một đạo pháp lực vào mục tiêu.", "thuat", { flex: true, mpCost: 18, cooldownMs: 5000, range: 9, power: 2.6 }),
    path("tt_linh_an", "Linh Ấn Tụ Lực", "Thuật tu: tụ linh lực, tăng công kích trong 15 giây.", "thuat", { kind: "buff", mpCost: 28, cooldownMs: 30_000, range: 0, power: 0.35, buff: { stat: "attack", durationMs: 15_000 } }),
    path("dt_hoi_xuan", "Hồi Xuân Thuật", "Đan tu: vận đan khí chữa thương, hồi sinh lực.", "dan", { kind: "heal", mpCost: 30, cooldownMs: 20_000, range: 0, power: 0.35 }),
    path("dt_duong_nguyen", "Dưỡng Nguyên Chú", "Đan tu: tăng phòng thủ trong 15 giây.", "dan", { kind: "buff", mpCost: 26, cooldownMs: 30_000, range: 0, power: 0.3, buff: { stat: "defense", durationMs: 15_000 } }),
    // Level 1: given when both skills of level 0 have reached the top mastery level
    path("kt_kiem_y", "Kiếm Ý Xuyên Tâm", "Kiếm tu (Kiếm Ý): kiếm ý xuyên thẳng vào mục tiêu.", "kiem", { flex: true, pathLevel: 1, mpCost: 30, cooldownMs: 8000, range: 10, power: 3.8 }),
    path("kt_kiem_vu", "Kiếm Vũ", "Kiếm tu (Kiếm Ý): múa kiếm thành mưa, sát thương rất lớn.", "kiem", { flex: true, pathLevel: 1, mpCost: 46, cooldownMs: 15_000, range: 10, power: 5.2 }),
    path("tt_phap_tran", "Pháp Trận Chấn", "Thuật tu (Pháp Sư): bày pháp trận chấn mục tiêu.", "thuat", { flex: true, pathLevel: 1, mpCost: 28, cooldownMs: 7000, range: 10, power: 3.6 }),
    path("tt_linh_hai", "Linh Hải Tụ Lực", "Thuật tu (Pháp Sư): linh hải cuộn trào, tăng mạnh công kích trong 20 giây.", "thuat", { kind: "buff", pathLevel: 1, mpCost: 40, cooldownMs: 40_000, range: 0, power: 0.5, buff: { stat: "attack", durationMs: 20_000 } }),
    path("dt_dan_khi", "Đan Khí Hộ Thể", "Đan tu (Đan Sư): đan khí bao quanh, tăng mạnh phòng thủ trong 20 giây.", "dan", { kind: "buff", pathLevel: 1, mpCost: 36, cooldownMs: 40_000, range: 0, power: 0.45, buff: { stat: "defense", durationMs: 20_000 } }),
    path("dt_hoi_duong", "Hồi Dương Đan Chú", "Đan tu (Đan Sư): hồi sinh lực lớn.", "dan", { kind: "heal", pathLevel: 1, mpCost: 44, cooldownMs: 30_000, range: 0, power: 0.5 }),
    // Level 2
    path("kt_hop_nhat", "Nhân Kiếm Hợp Nhất", "Kiếm tu (Nhân Kiếm Hợp Nhất): người và kiếm làm một, tăng vọt công kích trong 20 giây.", "kiem", { kind: "buff", pathLevel: 2, mpCost: 50, cooldownMs: 40_000, range: 0, power: 0.6, buff: { stat: "attack", durationMs: 20_000 } }),
    path("kt_than_kiem", "Thần Kiếm Trảm", "Kiếm tu (Nhân Kiếm Hợp Nhất): một kiếm trảm thiên.", "kiem", { flex: true, pathLevel: 2, mpCost: 70, cooldownMs: 20_000, range: 12, power: 7.5 }),
    path("tt_dai_phap", "Đại Pháp Diệt", "Thuật tu (Đại Pháp Sư): đại pháp giáng xuống mục tiêu.", "thuat", { flex: true, pathLevel: 2, mpCost: 64, cooldownMs: 18_000, range: 12, power: 6.8 }),
    path("tt_hoi_linh", "Hồi Linh Quyết", "Thuật tu (Đại Pháp Sư): thu linh khí chữa thương.", "thuat", { kind: "heal", pathLevel: 2, mpCost: 50, cooldownMs: 45_000, range: 0, power: 0.5 }),
    path("dt_dai_hoi", "Đại Hồi Xuân", "Đan tu (Đan Tông): hồi sinh lực rất lớn.", "dan", { kind: "heal", pathLevel: 2, mpCost: 70, cooldownMs: 50_000, range: 0, power: 0.7 }),
    path("dt_kim_than", "Kim Thân Đan Quyết", "Đan tu (Đan Tông): kim thân bất hoại, tăng vọt phòng thủ trong 25 giây.", "dan", { kind: "buff", pathLevel: 2, mpCost: 60, cooldownMs: 60_000, range: 0, power: 0.7, buff: { stat: "defense", durationMs: 25_000 } }),
  ];
}

/**
 * The basic qi blast: every character has it (the server gives the row at login, `ensureBasicSkill`), as a root skill of realm 0 whose element is picked on the
 * hotbar like the other root attacks. It reaches far like a spell, hits for about a plain blow, costs little and cools down in a second, so it can stand in
 * for the plain attack. The numbers are placeholders ("giá trị tạm"), adjustable per skill from the admin Skills screen.
 */
export const BASIC_SKILL_ID = "khi_co_ban";
const BASIC_SKILL: SkillDef = {
  id: BASIC_SKILL_ID,
  nameVi: "Phóng Khí",
  descVi: "Phóng một luồng khí vào mục tiêu từ xa, sát thương cỡ đòn đánh thường, tốn ít linh lực và hồi chiêu nhanh. Hệ tùy chọn khi gán phím tắt. Nhân vật nào cũng có.",
  kind: "attack",
  source: "root",
  element: null,
  flex: true,
  realm: 0,
  mpCost: 3,
  cooldownMs: 1000,
  range: 7,
  power: 1,
};

export const SKILLS: readonly SkillDef[] = [
  BASIC_SKILL,
  ...REALMS.flatMap((r) => rootSkillsOfRealm(r.id)),
  ...gearSkills(),
  ...pathSkills(),
  { id: "cuong_than", nameVi: "Cuồng Thần Thuật", descVi: "Tăng công kích trong 15 giây, học từ bí tịch.", kind: "buff", source: "learned", element: null, realm: 0, grade: 1, mpCost: 20, cooldownMs: 30_000, range: 0, power: 0.25, buff: { stat: "attack", durationMs: 15_000 }, learn: { realm: 0, stage: 5 } },
  { id: "ngu_kiem_tram", nameVi: "Ngự Kiếm Trảm", descVi: "Ngự kiếm chém xa; phải cầm kiếm. Học từ bí tịch.", kind: "attack", source: "learned", element: null, realm: 0, grade: 2, mpCost: 30, cooldownMs: 8000, range: 10, power: 3.2, weapon: "kiem", learn: { realm: 0, stage: 7 } },
  ...SPIRITUAL_ROOTS.map(elementBookSkill),
  // Kim Đan and Nguyên Anh (bí tịch of the second town): the strongest skill of each element, and a guard, a heal and a battle cry.
  ...SPIRITUAL_ROOTS.map((r) => elementBookSkillHigh(r, 2)),
  ...SPIRITUAL_ROOTS.map((r) => elementBookSkillHigh(r, 3)),
  // Hóa Thần and Luyện Hư (bí tịch of the third town): the strongest skill of each element, and a guard, a heal and a battle cry for each realm.
  ...SPIRITUAL_ROOTS.map((r) => elementBookSkillHigh(r, 4)),
  ...SPIRITUAL_ROOTS.map((r) => elementBookSkillHigh(r, 5)),
  { id: "ho_the_ht", nameVi: "Thần Thức Hộ Thể", descVi: "Hóa Thần: thần thức bao bọc thân thể, tăng mạnh phòng thủ trong 22 giây. Học từ bí tịch.", kind: "buff", source: "learned", element: null, realm: 4, grade: 4, mpCost: 110, cooldownMs: 45_000, range: 0, power: 0.6, buff: { stat: "defense", durationMs: 22_000 }, learn: { realm: 4, stage: 3 } },
  { id: "hoi_than_ht", nameVi: "Hóa Thần Hồi Xuân", descVi: "Hóa Thần: thần lực chữa thương, hồi rất nhiều sinh lực. Học từ bí tịch.", kind: "heal", source: "learned", element: null, realm: 4, grade: 4, mpCost: 120, cooldownMs: 30_000, range: 0, power: 0.6, learn: { realm: 4, stage: 5 } },
  { id: "chien_y_ht", nameVi: "Hóa Thần Chiến Ý", descVi: "Hóa Thần: chiến ý bùng nổ, tăng mạnh công kích trong 22 giây. Học từ bí tịch.", kind: "buff", source: "learned", element: null, realm: 4, grade: 4, mpCost: 130, cooldownMs: 40_000, range: 0, power: 0.6, buff: { stat: "attack", durationMs: 22_000 }, learn: { realm: 4, stage: 7 } },
  { id: "ho_the_lh", nameVi: "Hư Không Hộ Thể", descVi: "Luyện Hư: mượn sức hư không, tăng vọt phòng thủ trong 25 giây. Học từ bí tịch.", kind: "buff", source: "learned", element: null, realm: 5, grade: 4, mpCost: 160, cooldownMs: 45_000, range: 0, power: 0.7, buff: { stat: "defense", durationMs: 25_000 }, learn: { realm: 5, stage: 3 } },
  { id: "hoi_nguyen_lh", nameVi: "Luyện Hư Hồi Nguyên", descVi: "Luyện Hư: hút hư không khí chữa thương, hồi gần đầy sinh lực. Học từ bí tịch.", kind: "heal", source: "learned", element: null, realm: 5, grade: 4, mpCost: 180, cooldownMs: 30_000, range: 0, power: 0.7, learn: { realm: 5, stage: 5 } },
  { id: "chien_y_lh", nameVi: "Hư Không Chiến Hống", descVi: "Luyện Hư: tiếng gầm xé hư không, tăng vọt công kích trong 25 giây. Học từ bí tịch.", kind: "buff", source: "learned", element: null, realm: 5, grade: 4, mpCost: 190, cooldownMs: 40_000, range: 0, power: 0.7, buff: { stat: "attack", durationMs: 25_000 }, learn: { realm: 5, stage: 7 } },
  { id: "ho_the_kd", nameVi: "Kim Chung Hộ Thể", descVi: "Kim Đan: dựng chuông vàng quanh thân, tăng mạnh phòng thủ trong 20 giây. Học từ bí tịch.", kind: "buff", source: "learned", element: null, realm: 2, grade: 3, mpCost: 50, cooldownMs: 45_000, range: 0, power: 0.5, buff: { stat: "defense", durationMs: 20_000 }, learn: { realm: 2, stage: 3 } },
  { id: "hoi_nguyen_kd", nameVi: "Hồi Nguyên Quyết", descVi: "Kim Đan: vận kim đan chữa thương, hồi nhiều sinh lực. Học từ bí tịch.", kind: "heal", source: "learned", element: null, realm: 2, grade: 3, mpCost: 60, cooldownMs: 30_000, range: 0, power: 0.55, learn: { realm: 2, stage: 5 } },
  ...DOJO_SKILLS,
  ...RARE_SKILLS,
  { id: "cuong_than_na", nameVi: "Nguyên Anh Chiến Hống", descVi: "Nguyên Anh: gầm vang chiến ý, tăng mạnh công kích trong 20 giây. Học từ bí tịch.", kind: "buff", source: "learned", element: null, realm: 3, grade: 4, mpCost: 80, cooldownMs: 40_000, range: 0, power: 0.5, buff: { stat: "attack", durationMs: 20_000 }, learn: { realm: 3, stage: 3 } },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));
const TEMPLATE_IDS: ReadonlySet<string> = new Set(TEMPLATES.map((t) => t.id));
const skillCache = new Map<string, SkillDef>();
let skillCacheGeneration = -1;

/** The id of the root template a root skill comes from: `tram_2` -> `tram`. */
export function rootTemplateOf(id: string): string | undefined {
  return ROOT_TEMPLATE.get(id);
}
/** Root skill id -> the id of its template, made once. */
const ROOT_TEMPLATE: ReadonlyMap<string, string> = new Map(
  SKILLS.flatMap((s): Array<[string, string]> => {
    const t = s.id.replace(/_\d+$/, "");
    return s.source === "root" && t !== s.id && TEMPLATE_IDS.has(t) ? [[s.id, t]] : [];
  }),
);

/** Whether an id names a root skill template (an override under it applies to that skill in every realm). */
export function isSkillTemplateId(id: string): boolean {
  return TEMPLATE_IDS.has(id) && !BY_ID.has(id);
}

/** The skills written in the code, as the code has them (no admin changes): what the admin screen compares with. */
export function baseSkill(id: string): SkillDef | undefined {
  return BY_ID.get(id);
}

/** Puts one override entry (the fields an admin changed, see SkillNumbers) over a skill. */
export function applySkillOverride(base: SkillDef, live: Partial<SkillNumbers>): SkillDef {
  const { buffDurationMs, ...rest } = live;
  const def: SkillDef = { ...base, ...rest };
  if (buffDurationMs !== undefined && base.buff) def.buff = { ...base.buff, durationMs: buffDurationMs };
  return def;
}

/**
 * A skill with the changes of the tuning (`skillOverrides`) over the ones the templates give: the entry of its root template (every realm of a
 * root skill) and then its own entry, which wins. The overrides can change the name, description, power, MP cost, cooldown, range, the length of
 * a buff and the effect of an attack.
 */
export function getSkill(id: string): SkillDef | undefined {
  if (id === BASIC_SKILL_ID && basicViewRealm > 0) return basicSkillAt(basicViewRealm);
  return lookupSkill(id);
}

/** The realm the basic qi blast is shown and used at in this program (the client sets its own character's realm; the server picks the realm per player with `basicSkillAt`). */
let basicViewRealm = 0;
export function setBasicSkillRealm(realm: number): void {
  basicViewRealm = Math.max(0, Math.trunc(realm) || 0);
}

const basicCache = new Map<number, SkillDef>();
let basicCacheGeneration = -1;
/**
 * The basic qi blast at a realm: the skill with the entry of the tuning (`basicSkill`) for that realm over it (a new name, the power multiplied, a longer reach,
 * another MP cost, an area). Realm 0 is the skill itself when its entry has no more than the multiplier 1.
 */
export function basicSkillAt(realm: number): SkillDef {
  const base = lookupSkill(BASIC_SKILL_ID) ?? BASIC_SKILL;
  const list = tuning().basicSkill.realms;
  const r = Math.max(0, Math.min(Math.trunc(realm) || 0, 99));
  const t = list[Math.min(r, list.length - 1)];
  if (!t) return base;
  if (basicCacheGeneration !== tuningGeneration()) {
    basicCache.clear();
    basicCacheGeneration = tuningGeneration();
  }
  let def = basicCache.get(r);
  if (!def) {
    def = { ...base, power: Math.round(base.power * t.powerMult * 1000) / 1000, ...(t.nameVi ? { nameVi: t.nameVi } : {}), ...(t.range !== undefined ? { range: t.range } : {}), ...(t.mpCost !== undefined ? { mpCost: t.mpCost } : {}), ...(t.area ? { area: t.area } : {}) };
    basicCache.set(r, def);
  }
  return def;
}

function lookupSkill(id: string): SkillDef | undefined {
  const base = BY_ID.get(id);
  if (!base) return undefined;
  const all = tuning().skillOverrides;
  const template = rootTemplateOf(id);
  const own = all[id];
  const shared = template ? all[template] : undefined;
  if (!own && !shared) return base;
  if (skillCacheGeneration !== tuningGeneration()) {
    skillCache.clear();
    skillCacheGeneration = tuningGeneration();
  }
  let def = skillCache.get(id);
  if (!def) {
    def = applySkillOverride(base, { ...shared, ...own });
    skillCache.set(id, def);
  }
  return def;
}

export function isSkillId(v: unknown): v is string {
  return typeof v === "string" && BY_ID.has(v);
}

/** Skills a book can teach. */
/** Every skill that has a book (the rare ones too). */
export const ALL_BOOK_SKILLS: readonly SkillDef[] = SKILLS.filter((s) => s.source === "learned");
/** The skills the ordinary book drop picks from (the rare ones have their own, much rarer drop: see rollRareBook). */
export const BOOK_SKILLS: readonly SkillDef[] = ALL_BOOK_SKILLS.filter((s) => s.rare !== true);

/** The item id of the bí tịch that teaches a skill. */
export function bookItemId(skillId: string): string {
  return `bt_${skillId}`;
}

/** Every skill the character can use: what it was granted (root, learned and sect skills, by id) and what its worn pháp bảo give, in list order. */
export function availableSkills(granted: Iterable<string>, gear: Iterable<string> = []): string[] {
  const have = new Set(granted);
  const worn = new Set(gear);
  return SKILLS.filter((s) => (s.source === "gear" ? worn.has(s.id) : have.has(s.id))).map((s) => s.id);
}

/** Whether a character may learn this skill from its book (level only; the server also checks it is not known yet). */
export function canLearn(skill: SkillDef, realm: number, stage: number): boolean {
  return skill.learn !== undefined && levelIndex(realm, stage) >= levelIndex(skill.learn.realm, skill.learn.stage);
}

/**
 * The two root skills of a realm: an attack and a second one drawn from every other template. `rand` returns uniform [0, 1);
 * the picks are stored, so changing the pool later only affects characters who reach a realm after the change.
 */
export function rollRealmSkills(realm: number, rand: () => number): string[] {
  const attack = ATTACK_TEMPLATES[Math.floor(rand() * ATTACK_TEMPLATES.length)]!;
  const rest = TEMPLATES.filter((t) => t.id !== attack.id);
  const other = rest[Math.floor(rand() * rest.length)]!;
  return [`${attack.id}_${realm}`, `${other.id}_${realm}`];
}

// ---- Mastery levels, grade and realm: how strong a skill is ----

/** Mastery levels in order. The last one (thần thông) is only open to skills of a high grade. */
export const SKILL_LEVELS = ["nhap_mon", "tieu_thanh", "dai_thanh", "vien_man", "than_thong"] as const;
/** Grades from this one up (on the root-grade scale: 3 is Địa) can reach thần thông. */
export const DIVINE_GRADE = 3;
export function maxSkillLevel(grade: number): number {
  return grade >= DIVINE_GRADE ? SKILL_LEVELS.length - 1 : SKILL_LEVELS.length - 2;
}
/** Mastery points needed to leave each level (the last level needs none). One successful use is worth 1 point. Tuning `skills`. */
export function masteryNeeded(level: number): number | undefined {
  return tuning().skills.masteryNeeded[level];
}
/** Mastery points one Ngộ Đạo Đan gives. */
export const MASTERY_PILL_POINTS = 100;

export interface SkillContext {
  /** The realm the skill is used at (a piece's for gear skills, the skill's own otherwise). */
  realm: number;
  /** Bậc 1..9 within the realm (gear skills: the piece's). Each bậc adds a tenth of a realm's worth of strength; absent counts as bậc 1. */
  tier?: number;
  /** Grade on the root-grade scale 0..4. */
  grade: number;
  level: number;
  /** Path skills: whether the path is the chủ tu or a phụ tu (a phụ tu's skills are weaker). */
  role?: "main" | "sub";
}

export interface EffectiveSkill {
  power: number;
  mpCost: number;
  cooldownMs: number;
}

/**
 * What a skill really does for this realm, grade and mastery level, used by combat and by the skills window so the numbers
 * shown are the numbers fought with. Attacks scale most with realm, heals and buffs less (and stay within sane caps).
 */
export function effectiveSkill(def: SkillDef, ctx: SkillContext): EffectiveSkill {
  const level = Math.max(0, Math.min(ctx.level, maxSkillLevel(ctx.grade)));
  const grade = 1 + getRootGrade(ctx.grade).elementDamagePct / 100;
  const sk = tuning().skills;
  const lv = sk.levelPower[level] ?? 1; // strength at this mastery level
  // A realm and the bậc inside it make one scale: realm 0 bậc 4 sits between realm 0 bậc 1 and realm 1 bậc 1.
  const realm = ctx.realm + Math.max(0, (ctx.tier ?? 1) - 1) / 10;
  // A skill of a phụ tu is worth `pathSubFactor()` of the same skill as the chủ tu.
  const base = def.source === "path" && ctx.role === "sub" ? def.power * pathSubFactor() : def.power;
  let power = base;
  if (def.kind === "attack") power = base * (1 + sk.attackRealmScale * realm) * grade * lv;
  else if (def.kind === "heal") power = Math.min(0.9, base * (1 + sk.healRealmScale * realm) * grade * lv);
  else if (def.kind === "buff" || def.kind === "passive") {
    const rate = def.buff?.stat === "dodge" || def.passive?.stat === "dodge" || def.passive?.stat === "crit";
    power = Math.min(rate ? 0.5 : 1.5, base * (1 + sk.buffRealmScale * realm) * grade * lv);
  }
  return { power, mpCost: Math.round(def.mpCost * (1 + 0.5 * realm)), cooldownMs: Math.round(def.cooldownMs * (sk.levelCooldown[level] ?? 1)) };
}

/** What a character's passive skills add all the time: fractions of attack and defense, percentage points of dodge and crit. */
export interface PassiveTotals {
  attackPct: number;
  defensePct: number;
  dodgePoints: number;
  critPoints: number;
}

/**
 * The sum of the passives among the skills a character was given, each at its realm, grade and mastery level. One function for
 * the fight and for the character panel, so the panel shows the numbers the fight uses.
 */
export function passiveTotals(granted: Iterable<string>, state: Readonly<Record<string, { lv: number }>>, rootGrade: number): PassiveTotals {
  const t: PassiveTotals = { attackPct: 0, defensePct: 0, dodgePoints: 0, critPoints: 0 };
  for (const id of granted) {
    const def = getSkill(id);
    if (def?.kind !== "passive" || !def.passive) continue;
    const pct = effectiveSkill(def, { realm: def.realm, grade: skillGrade(def, rootGrade), level: state[id]?.lv ?? 0 }).power;
    if (def.passive.stat === "attack") t.attackPct += pct;
    else if (def.passive.stat === "defense") t.defensePct += pct;
    else if (def.passive.stat === "dodge") t.dodgePoints += pct * 100;
    else t.critPoints += pct * 100;
  }
  return t;
}

/** Derived stats with the passives added (the character panel); combat adds them next to the buffs instead. */
export function withPassives<T extends { attack: number; defense: number; critRate: number; dodgeRate: number }>(d: T, t: PassiveTotals): T {
  return {
    ...d,
    attack: Math.floor(d.attack + d.attack * t.attackPct),
    defense: Math.floor(d.defense + d.defense * t.defensePct),
    critRate: Math.min(rateCap(), d.critRate + t.critPoints),
    dodgeRate: Math.min(rateCap(), d.dodgeRate + t.dodgePoints),
  };
}

/** Adds mastery points; returns the new level and points and whether a level was gained. At the highest level nothing grows. */
export function addMastery(level: number, mastery: number, gain: number, grade: number): { level: number; mastery: number; up: boolean } {
  const top = maxSkillLevel(grade);
  let lv = Math.min(level, top);
  let pts = mastery + Math.max(0, gain);
  let up = false;
  while (lv < top && pts >= (masteryNeeded(lv) ?? Infinity)) {
    pts -= masteryNeeded(lv)!;
    lv++;
    up = true;
  }
  if (lv >= top) pts = 0;
  return { level: lv, mastery: pts, up };
}

/** The grade a skill is used at: the character's root grade for root skills, its own for the others; gear skills are given by the piece. */
export function skillGrade(def: SkillDef, rootGrade: number, gearGrade?: number): number {
  if (def.source === "root") return rootGrade;
  if (def.source === "gear") return gearGrade ?? 0;
  return def.grade ?? 0;
}

// ---- MP, hotbar ----

/** MP regeneration (tuning `combat`): fraction of max MP per second, starting this long after the last time the character was hit. */
export function mpRegenPerS(): number {
  return tuning().combat.mpRegenPerS;
}
export function mpRegenDelayMs(): number {
  return tuning().combat.mpRegenDelayMs;
}

/** Hotbar: 8 slots on keys 1-8. A slot is "" (empty), "s:<skill id>[:<element>]" or "i:<item type>". */
export const HOTBAR_SLOTS = 8;
export const HOTBAR_SLOT_PATTERN = /^(?:|s:[a-z0-9_]{1,32}(?::[a-z]{2,4})?|i:[a-z0-9_.]{1,60})$/;
export function emptyHotbar(): string[] {
  return Array.from({ length: HOTBAR_SLOTS }, () => "");
}

/** A skill slot split into the skill and the chosen element ("s:chuong_0:kim"); null when the slot holds something else. */
export function parseSkillSlot(v: string): { id: string; element: SpiritualRoot | null } | null {
  if (!v.startsWith("s:")) return null;
  const [id, el] = v.slice(2).split(":");
  if (!id) return null;
  return { id, element: el && (ALL_ROOTS as readonly string[]).includes(el) ? (el as SpiritualRoot) : null };
}

/** Parses the stored hotbar JSON; anything malformed becomes an empty bar, and a slot holding a skill that no longer exists becomes empty. */
export function parseHotbar(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    if (Array.isArray(v) && v.length === HOTBAR_SLOTS && v.every((x) => typeof x === "string" && HOTBAR_SLOT_PATTERN.test(x))) {
      return (v as string[]).map((x) => {
        const s = parseSkillSlot(x);
        return s && !BY_ID.has(s.id) ? "" : x;
      });
    }
  } catch {
    // Fall through to an empty bar.
  }
  return emptyHotbar();
}

/** The chance of a skill book is the tuning `drops.book` (by monster class); it is rolled apart from the loot table (see rollBookDrop). */

/**
 * A rare book dropped by one kill, or null: `rank` is the monster class or "boss", `realm` the realm of the map; the book is one of the rare skills of that realm.
 * Draws exactly two numbers (chance, which book) so seeded sequences stay stable.
 */
export function rollRareBook(rank: MonsterRank | "boss", realm: number, rand: () => number): string | null {
  const chance = rand();
  const pick = rand();
  if (chance >= tuning().rareBooks.chance[rank]) return null;
  const pool = ALL_BOOK_SKILLS.filter((s) => s.rare === true && s.learn?.realm === realm);
  const skill = pool[Math.floor(pick * pool.length)];
  return skill ? bookItemId(skill.id) : null;
}

/** A book dropped by one kill, or null. Draws exactly two numbers (chance, which book) so seeded sequences stay stable. */
export function rollBookDrop(rank: MonsterRank, rand: () => number, chanceMult = 1): string | null {
  const chance = rand();
  const pick = rand();
  if (chance >= tuning().drops.book[rank] * chanceMult) return null;
  const skill = BOOK_SKILLS[Math.floor(pick * BOOK_SKILLS.length)];
  return skill ? bookItemId(skill.id) : null;
}

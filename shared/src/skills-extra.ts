import type { SkillDef } from "./skills";

/**
 * Skills with the newer ways of fighting (PHASE4 "more kinds of skill"): a blow that gives part of its damage back as health (`drain`), one that hits much harder
 * a target already low (`execute`), a buff of the critical chance (`buff.stat: "crit"`), and attacks that fall on a whole circle at the aimed point or round the
 * caster (`area`). Two lists:
 *  - the skills the martial masters teach for a fee (`DOJO_SKILLS`; the courses are in dojo.ts),
 *  - the sect skills (`SECT_SKILLS`): bought from the sect shop with cống hiến, lost with the membership (docs/PHASE5.md, 5c-2b),
 *  - the rare ones (`RARE_SKILLS`): their books cannot be bought from a master or a merchant, they only drop, very seldom from a monster of the realm they are for
 *    and a little more often from the map's boss (the chances are the tuning `rareBooks`).
 * No imports of values: skills.ts builds its list from these.
 */

type Extra = Omit<SkillDef, "source" | "element" | "grade">;
const learned = (s: Extra, grade: number): SkillDef => ({ ...s, source: "learned", element: null, grade });

const sect = (s: Extra, grade: number): SkillDef => ({ ...s, source: "sect", element: null, grade });

/** A circle of ground: at the aimed point, or round the caster. */
const circle = (range: number, at: "aim" | "self", maxTargets: number, pct: number) => ({ shape: "circle" as const, range, at, maxTargets, pct });

export const DOJO_SKILLS: readonly SkillDef[] = [
  learned({ id: "hap_huyet", nameVi: "Hấp Huyết Thủ", descVi: "Trúc Cơ: một chưởng hút máu, hồi lại 15% sát thương gây ra. Học từ võ sư.", kind: "attack", realm: 1, mpCost: 24, cooldownMs: 9000, range: 8, power: 2.4, drain: 0.15, learn: { realm: 1, stage: 1 } }, 2),
  learned({ id: "bao_kich", nameVi: "Bạo Kích Phù", descVi: "Trúc Cơ: phù chú khiến đòn đánh dễ chí mạng hơn trong 18 giây. Học từ võ sư.", kind: "buff", realm: 1, mpCost: 25, cooldownMs: 40_000, range: 0, power: 0.2, buff: { stat: "crit", durationMs: 18_000 }, learn: { realm: 1, stage: 3 } }, 2),
  learned({ id: "diet_ky", nameVi: "Diệt Kỵ Trảm", descVi: "Kim Đan: đòn kết liễu, mạnh gấp đôi khi mục tiêu còn dưới 30% sinh lực. Học từ võ sư.", kind: "attack", realm: 2, mpCost: 36, cooldownMs: 10_000, range: 8, power: 3, execute: { below: 0.3, mult: 2.2 }, learn: { realm: 2, stage: 1 } }, 3),
  learned({ id: "loi_van", nameVi: "Lôi Vân Phủ Địa", descVi: "Nguyên Anh: kéo mây giông phủ xuống một vùng, sét giáng xuống mọi thứ trong đó. Học từ võ sư.", kind: "attack", realm: 3, mpCost: 70, cooldownMs: 13_000, range: 10, power: 4.2, area: circle(3, "aim", 6, 55), learn: { realm: 3, stage: 1 } }, 3),
  learned({ id: "thien_thach", nameVi: "Thiên Thạch Lạc", descVi: "Hóa Thần: gọi thiên thạch rơi xuống điểm chỉ định, nghiền nát cả một vùng. Học từ võ sư.", kind: "attack", realm: 4, mpCost: 130, cooldownMs: 16_000, range: 11, power: 7, area: circle(3.5, "aim", 8, 60), learn: { realm: 4, stage: 1 } }, 4),
  learned({ id: "huyet_hai", nameVi: "Huyết Hải Phệ Hồn", descVi: "Luyện Hư: biển máu tràn quanh thân, nuốt sinh lực kẻ địch và hồi lại 20% sát thương. Học từ võ sư.", kind: "attack", realm: 5, mpCost: 170, cooldownMs: 18_000, range: 6, power: 9, drain: 0.2, area: circle(4.5, "self", 8, 70), learn: { realm: 5, stage: 1 } }, 4),
];

/** Two for each realm, all of the highest grade: the book is a reward of luck, never of the purse. */
export const RARE_SKILLS: readonly SkillDef[] = [
  { ...learned({ id: "thon_linh", nameVi: "Thôn Linh Quyết", descVi: "Tuyệt học Luyện Khí: nuốt linh khí đối thủ, hồi lại 30% sát thương gây ra. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 0, mpCost: 20, cooldownMs: 8000, range: 8, power: 2.2, drain: 0.3, learn: { realm: 0, stage: 5 } }, 4), rare: true },
  { ...learned({ id: "pha_quan", nameVi: "Phá Quân Nhất Kích", descVi: "Tuyệt học Luyện Khí: một đòn chí tử, mạnh hơn ba lần khi mục tiêu còn dưới 35% sinh lực. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 0, mpCost: 26, cooldownMs: 10_000, range: 8, power: 2.4, execute: { below: 0.35, mult: 3.2 }, learn: { realm: 0, stage: 7 } }, 4), rare: true },
  { ...learned({ id: "huyet_ma", nameVi: "Huyết Ma Công", descVi: "Tuyệt học Trúc Cơ: huyết khí tỏa quanh thân, đánh mọi kẻ gần và hồi 15% sát thương. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 1, mpCost: 45, cooldownMs: 12_000, range: 6, power: 3.6, drain: 0.15, area: circle(3, "self", 6, 50), learn: { realm: 1, stage: 3 } }, 4), rare: true },
  { ...learned({ id: "cuong_loi", nameVi: "Cuồng Lôi Chú", descVi: "Tuyệt học Trúc Cơ: gọi sét giáng xuống một vùng. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 1, mpCost: 48, cooldownMs: 12_000, range: 10, power: 3.8, area: circle(2.5, "aim", 5, 60), learn: { realm: 1, stage: 5 } }, 4), rare: true },
  { ...learned({ id: "thien_co", nameVi: "Thiên Cơ Diệt", descVi: "Tuyệt học Kim Đan: nhìn thấu chỗ yếu, mạnh gấp ba khi mục tiêu còn dưới 40% sinh lực. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 2, mpCost: 60, cooldownMs: 11_000, range: 9, power: 4.2, execute: { below: 0.4, mult: 3 }, learn: { realm: 2, stage: 3 } }, 4), rare: true },
  { ...learned({ id: "hap_tinh", nameVi: "Hấp Tinh Đại Pháp", descVi: "Tuyệt học Kim Đan: hút tinh khí đối thủ, hồi 35% sát thương gây ra. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 2, mpCost: 62, cooldownMs: 12_000, range: 8, power: 4.4, drain: 0.35, learn: { realm: 2, stage: 5 } }, 4), rare: true },
  { ...learned({ id: "loi_dinh", nameVi: "Lôi Đình Vạn Quân", descVi: "Tuyệt học Nguyên Anh: sét giáng như vạn quân xuống một vùng rộng. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 3, mpCost: 100, cooldownMs: 15_000, range: 10, power: 6, area: circle(4, "aim", 8, 70), learn: { realm: 3, stage: 3 } }, 4), rare: true },
  { ...learned({ id: "cuu_u", nameVi: "Cửu U Phệ Hồn", descVi: "Tuyệt học Nguyên Anh: âm khí cửu u quét quanh thân, hồi 20% sát thương. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 3, mpCost: 105, cooldownMs: 15_000, range: 6, power: 5.8, drain: 0.2, area: circle(4, "self", 8, 60), learn: { realm: 3, stage: 5 } }, 4), rare: true },
  { ...learned({ id: "thai_co", nameVi: "Thái Cổ Thiên Thạch", descVi: "Tuyệt học Hóa Thần: thiên thạch thái cổ giáng xuống, san phẳng cả một vùng. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 4, mpCost: 170, cooldownMs: 18_000, range: 11, power: 9.5, area: circle(4.5, "aim", 10, 70), learn: { realm: 4, stage: 3 } }, 4), rare: true },
  { ...learned({ id: "doat_menh", nameVi: "Chư Thiên Đoạt Mệnh", descVi: "Tuyệt học Hóa Thần: đòn đoạt mệnh, mạnh hơn ba lần rưỡi khi mục tiêu còn dưới 45% sinh lực. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 4, mpCost: 150, cooldownMs: 14_000, range: 10, power: 8.4, execute: { below: 0.45, mult: 3.5 }, learn: { realm: 4, stage: 5 } }, 4), rare: true },
  { ...learned({ id: "hon_don", nameVi: "Hỗn Độn Diệt Thế", descVi: "Tuyệt học Luyện Hư: hỗn độn bùng nổ quanh thân, hủy diệt mọi thứ trong tầm. Chỉ có thể tìm thấy từ quái.", kind: "attack", realm: 5, mpCost: 240, cooldownMs: 22_000, range: 8, power: 13, area: circle(6, "self", 10, 80), learn: { realm: 5, stage: 3 } }, 4), rare: true },
  { ...learned({ id: "vo_thuong", nameVi: "Vô Thượng Bạo Thể", descVi: "Tuyệt học Luyện Hư: thân thể hóa vô thượng, tỉ lệ chí mạng tăng vọt trong 30 giây. Chỉ có thể tìm thấy từ quái.", kind: "buff", realm: 5, mpCost: 200, cooldownMs: 60_000, range: 0, power: 0.4, buff: { stat: "crit", durationMs: 30_000 }, learn: { realm: 5, stage: 5 } }, 4), rare: true },
];

/** Taught by a sect: bought from its shop for cống hiến (the price and the sect level and rank needed are the tuning `sect.skills`), gone when the character leaves. */
export const SECT_SKILLS: readonly SkillDef[] = [
  sect({ id: "tm_ho_than", nameVi: "Tông Môn Hộ Thân", descVi: "Luyện Khí: công pháp hộ thân của tông môn, tăng phòng thủ trong 15 giây. Học ở tông môn.", kind: "buff", realm: 0, mpCost: 18, cooldownMs: 35_000, range: 0, power: 0.25, buff: { stat: "defense", durationMs: 15_000 }, learn: { realm: 0, stage: 3 } }, 2),
  sect({ id: "tm_hoi_xuan", nameVi: "Tông Môn Hồi Xuân", descVi: "Luyện Khí: tâm pháp chữa thương của tông môn, hồi sinh lực. Học ở tông môn.", kind: "heal", realm: 0, mpCost: 22, cooldownMs: 25_000, range: 0, power: 0.4, learn: { realm: 0, stage: 5 } }, 2),
  sect({ id: "tm_tran_phap", nameVi: "Tông Môn Trấn Pháp", descVi: "Trúc Cơ: đánh xuống một vùng nhỏ bằng pháp trận của tông môn. Học ở tông môn.", kind: "attack", realm: 1, mpCost: 40, cooldownMs: 11_000, range: 9, power: 3.2, area: circle(2.5, "aim", 5, 55), learn: { realm: 1, stage: 3 } }, 3),
  sect({ id: "tm_chien_y", nameVi: "Tông Môn Chiến Ý", descVi: "Kim Đan: chiến ý của cả tông môn dồn vào một người, tăng công kích trong 20 giây. Học ở tông môn.", kind: "buff", realm: 2, mpCost: 55, cooldownMs: 40_000, range: 0, power: 0.4, buff: { stat: "attack", durationMs: 20_000 }, learn: { realm: 2, stage: 3 } }, 3),
  sect({ id: "tm_kiem_tran", nameVi: "Tông Môn Kiếm Trận", descVi: "Nguyên Anh: kiếm trận của tông môn quét quanh thân, đánh mọi kẻ gần. Học ở tông môn.", kind: "attack", realm: 3, mpCost: 85, cooldownMs: 14_000, range: 6, power: 5.2, area: circle(4, "self", 8, 60), learn: { realm: 3, stage: 3 } }, 4),
  sect({ id: "tm_tam_phap", nameVi: "Tông Môn Tâm Pháp", descVi: "Hóa Thần: tâm pháp truyền thừa của tông môn, hồi rất nhiều sinh lực. Học ở tông môn.", kind: "heal", realm: 4, mpCost: 130, cooldownMs: 30_000, range: 0, power: 0.65, learn: { realm: 4, stage: 3 } }, 4),
];

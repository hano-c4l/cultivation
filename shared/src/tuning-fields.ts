import { REALMS, ROOT_COUNTS, ROOT_GRADES } from "./progression-data";
import { MAP_IDS, MAP_NAMES as LIVE_MAP_NAMES, MAP_REALM } from "./map";
import { DEFAULT_TUNING, type Tuning, type TuningGroup } from "./tuning";

/**
 * The fields of the `game_tuning` groups an admin screen edits, with Vietnamese labels, one entry per number ("leaf") of the group. The admin
 * screen "Chỉ số khác" (PHASE3 3c) is driven by ADMIN_TUNING_SCREENS; the server only accepts these leaves when it saves a group, and a test
 * fails when a leaf of a listed group has no field here, so adding a number to a group means adding its label in the same change.
 *
 * kind: `int` a whole number, `num` any number, `frac` a share between 0 and 1 (the screen says so: 0,25 means 25%), `color` a CSS colour (#rgb, #rrggbb, rgb()/rgba()/hsl()), `species` a monster species id or null (none).
 */
export interface TuningField {
  /** Dot path inside the group's value; array indexes are numbers ("dropChance.2"). */
  path: string;
  label: string;
  kind: "int" | "num" | "frac" | "color" | "species";
  unit?: string;
}

/** The admin screen a group is shown on: "misc" (Chỉ số khác), "realms" (Cảnh giới), "potential" (Chỉ số tiềm năng) or "talents" (Thiên phú: linh căn). */
export type TuningPage = "misc" | "realms" | "potential" | "talents" | "monsters" | "boss" | "npcs";

export interface TuningScreenGroup {
  group: TuningGroup;
  page: TuningPage;
  /** Prefixes of the group's value that this screen does not edit (another screen does): the save keeps them and the coverage test skips them. */
  skip?: readonly string[];
  title: string;
  /** A sentence under the title (what the numbers do, anything to know before changing them). */
  note?: string;
  fields: TuningField[];
}

const TIERS = ["Tên trắng", "Tên vàng", "Tên cam", "Tên đỏ"];

const BASE_SCREENS: readonly TuningScreenGroup[] = [
  {
    group: "pvp",
    page: "misc",
    title: "PvP: sát khí, sát nhân, anh hùng",
    note: "Điểm sát khí và sát nhân, màu tên theo mốc sát nhân, xác suất mất đồ và độ bền hao khi chết theo màu tên, thưởng anh hùng, bảo hộ tân thủ.",
    fields: [
      { path: "satKhi.perKill", label: "Sát khí: điểm cộng mỗi lần giết người", kind: "num", unit: "điểm" },
      { path: "satKhi.lostOnDeath", label: "Sát khí: điểm mất khi bị người giết", kind: "num", unit: "điểm" },
      { path: "satKhi.bonusAbove", label: "Sát khí: từ mức này bắt đầu tăng sát thương", kind: "num", unit: "điểm" },
      { path: "satKhi.bonusFullAt", label: "Sát khí: mức đạt tăng sát thương tối đa (phải lớn hơn mức bắt đầu)", kind: "num", unit: "điểm" },
      { path: "satKhi.bonusMinPct", label: "Sát khí: sát thương tăng tại mức bắt đầu", kind: "num", unit: "%" },
      { path: "satKhi.bonusMaxPct", label: "Sát khí: sát thương tăng tối đa", kind: "num", unit: "%" },
      { path: "satNhan.perKill", label: "Sát nhân: điểm cộng khi giết người tên trắng/vàng", kind: "num", unit: "điểm" },
      { path: "satNhan.decayPerMin", label: "Sát nhân: điểm giảm mỗi phút online", kind: "num", unit: "điểm/phút" },
      { path: "satNhan.lostOnDeath", label: "Sát nhân: điểm mất khi bị người giết", kind: "num", unit: "điểm" },
      { path: "satNhan.lostKillingOrange", label: "Sát nhân: điểm mất khi giết người tên cam", kind: "num", unit: "điểm" },
      { path: "satNhan.lostKillingRed", label: "Sát nhân: điểm mất khi giết người tên đỏ", kind: "num", unit: "điểm" },
      { path: "nameTiers.yellowFrom", label: "Màu tên: vàng từ sát nhân", kind: "int", unit: "điểm" },
      { path: "nameTiers.orangeFrom", label: "Màu tên: cam từ sát nhân (cam trở lên bị cấm NPC)", kind: "int", unit: "điểm" },
      { path: "nameTiers.redFrom", label: "Màu tên: đỏ từ sát nhân", kind: "int", unit: "điểm" },
      ...TIERS.map((t, i): TuningField => ({ path: `dropChance.${i}`, label: `Xác suất mất một món đồ khi bị người giết: ${t}`, kind: "frac" })),
      ...TIERS.map((t, i): TuningField => ({ path: `deathDurability.${i}`, label: `Độ bền hao khi chết: ${t}`, kind: "frac" })),
      { path: "hero.perOrange", label: "Anh hùng: điểm cộng khi giết người tên cam", kind: "num", unit: "điểm" },
      { path: "hero.perRed", label: "Anh hùng: điểm cộng khi giết người tên đỏ", kind: "num", unit: "điểm" },
      { path: "hero.tier1", label: "Anh hùng: mốc thứ nhất", kind: "num", unit: "điểm" },
      { path: "hero.tier2", label: "Anh hùng: mốc thứ hai (không nhỏ hơn mốc thứ nhất)", kind: "num", unit: "điểm" },
      { path: "hero.bonus1.mpPct", label: "Anh hùng mốc 1: cộng linh lực", kind: "num", unit: "%" },
      { path: "hero.bonus1.dropPct", label: "Anh hùng mốc 1: cộng tỉ lệ rơi đồ", kind: "num", unit: "%" },
      { path: "hero.bonus2.mpPct", label: "Anh hùng mốc 2: cộng linh lực", kind: "num", unit: "%" },
      { path: "hero.bonus2.dropPct", label: "Anh hùng mốc 2: cộng tỉ lệ rơi đồ", kind: "num", unit: "%" },
      { path: "protectedBelow.realm", label: "Bảo hộ tân thủ: dưới cảnh giới số (0 là Luyện Khí)", kind: "int" },
      { path: "protectedBelow.stage", label: "Bảo hộ tân thủ: dưới tầng (1-9) của cảnh giới đó", kind: "int" },
    ],
  },
  {
    group: "waygate",
    page: "misc",
    title: "Truyền Tống Trận: phí",
    note: "Phí (Linh Thạch) = phí cơ bản + phí mỗi đơn vị × khoảng cách giữa hai thành trên bản đồ thế giới.",
    fields: [
      { path: "base", label: "Phí cơ bản", kind: "int", unit: "Linh Thạch" },
      { path: "perUnit", label: "Phí mỗi đơn vị khoảng cách", kind: "num", unit: "Linh Thạch" },
    ],
  },
  {
    group: "aoi",
    page: "misc",
    title: "Vùng nhìn",
    note: "Người và quái chỉ báo cho người ở trong tầm. Đơn vị là ô màn hình 32 px. Tầm rời không nhỏ hơn tầm vào.",
    fields: [
      { path: "enter.x", label: "Tầm vào: ngang", kind: "num", unit: "ô" },
      { path: "enter.y", label: "Tầm vào: dọc", kind: "num", unit: "ô" },
      { path: "leave.x", label: "Tầm rời: ngang", kind: "num", unit: "ô" },
      { path: "leave.y", label: "Tầm rời: dọc", kind: "num", unit: "ô" },
      { path: "everyTicks", label: "Cập nhật vùng nhìn mỗi", kind: "int", unit: "tick (10 tick = 1 giây)" },
    ],
  },
  {
    group: "combat",
    page: "misc",
    title: "Chiến đấu cơ bản",
    note: "Mất EXP và độ bền khi chết, hồi máu và linh lực, cửa sổ tên xám (PvP), đường cong chỉ số quái theo cấp (quyết định quái mạnh cỡ nào ở mỗi cảnh giới; mốc thời gian tính bằng mili giây, 1000 = 1 giây). Chỉ số của từng loài quái nằm ở màn Quái / BOSS sau này.",
    fields: [
      { path: "deathExpLoss", label: "Chết: phần EXP của tầng bị mất", kind: "frac" },
      { path: "deathDurabilityFraction", label: "Chết: phần độ bền trang bị bị hao (cơ bản, trước hệ số theo màu tên)", kind: "frac" },
      { path: "hpRegenDelayMs", label: "Hồi sinh lực: chờ sau khi bị đánh hoặc hết hành động", kind: "int", unit: "ms" },
      { path: "mpRegenDelayMs", label: "Hồi linh lực: chờ sau khi dùng kỹ năng", kind: "int", unit: "ms" },
      { path: "mpRegenPerS", label: "Hồi linh lực: phần linh lực tối đa hồi mỗi giây", kind: "frac" },
      { path: "grayWindowMs", label: "Tên xám: thời gian người bị đánh được đánh trả dù đang tắt PK", kind: "int", unit: "ms (180000 = 3 phút)" },
      { path: "monsterCurve.hpBase", label: "Quái: sinh lực gốc (cấp 0)", kind: "num" },
      { path: "monsterCurve.hpPerLevel", label: "Quái: sinh lực cộng thêm mỗi cấp", kind: "num" },
      { path: "monsterCurve.attackBase", label: "Quái: công gốc (cấp 0)", kind: "num" },
      { path: "monsterCurve.attackPerLevel", label: "Quái: công cộng thêm mỗi cấp", kind: "num" },
      { path: "monsterCurve.defenseBase", label: "Quái: thủ gốc (cấp 0)", kind: "num" },
      { path: "monsterCurve.defensePerLevel", label: "Quái: thủ cộng thêm mỗi cấp", kind: "num" },
    ],
  },
  {
    group: "gearLooks",
    page: "misc",
    title: "Màu trang bị trên nhân vật",
    note: "Vũ khí nhuộm theo hệ của món (cảnh giới cao thì sáng hơn một chút), áo, mũ và giày lấy màu trong bảng theo bộ (số bộ chia dư cho số màu). Chỉ đổi cách hiển thị; người chơi nhận màu mới khi vào lại game. Nhập màu dạng #rrggbb.",
    fields: [
      ...Object.keys(DEFAULT_TUNING.gearLooks.weapon).map((k): TuningField => ({ path: `weapon.${k}`, label: `Màu vũ khí: ${k === "none" ? "không hệ" : k}`, kind: "color" })),
      ...DEFAULT_TUNING.gearLooks.robe.map((_, i): TuningField => ({ path: `robe.${i}`, label: `Màu áo, bảng ${i + 1}`, kind: "color" })),
      ...DEFAULT_TUNING.gearLooks.hat.map((_, i): TuningField => ({ path: `hat.${i}`, label: `Màu mũ, bảng ${i + 1}`, kind: "color" })),
      ...DEFAULT_TUNING.gearLooks.boots.map((_, i): TuningField => ({ path: `boots.${i}`, label: `Màu bụi của giày, bảng ${i + 1}`, kind: "color" })),
    ],
  },
  {
    group: "theme",
    page: "misc",
    title: "Màu giao diện",
    note: "Chỉ đổi cách hiển thị, không đổi cách chơi. Nhập màu CSS (#rrggbb, rgb(...), rgba(...)); ô vuông bên cạnh là bản xem trước. Người chơi nhận màu mới khi vào lại game hoặc đổi bản đồ.",
    fields: [
      ...REALMS.map((r) => r.nameVi).map((n, i): TuningField => ({ path: `realmColors.${i}`, label: `Màu thẻ cảnh giới: ${n}`, kind: "color" })),
      ...["Hạ phẩm (phẩm 1)", "Trung phẩm (phẩm 2)", "Thượng phẩm (phẩm 3)", "Cực phẩm (phẩm 4)", "Phẩm 5"].map((n, i): TuningField => ({ path: `gradeColors.${i}`, label: `Màu nền phẩm cấp vật phẩm: ${n}`, kind: "color" })),
      { path: "ui.ui-text", label: "Trang: màu chữ", kind: "color" },
      { path: "ui.ui-muted", label: "Trang: màu chữ phụ", kind: "color" },
      { path: "ui.ui-border", label: "Trang: màu viền", kind: "color" },
      { path: "ui.ui-accent", label: "Trang: màu nhấn (nút chính, tiêu đề)", kind: "color" },
      { path: "ui.ui-on-accent", label: "Trang: màu chữ trên nền nhấn", kind: "color" },
      { path: "ui.ui-highlight", label: "Trang: màu nổi bật", kind: "color" },
      { path: "ui.ui-panel", label: "Trang: nền bảng, cửa sổ", kind: "color" },
      { path: "ui.ui-page", label: "Trang: nền trang", kind: "color" },
    ],
  },
  {
    group: "exp",
    page: "realms",
    title: "EXP và điểm tiềm năng theo cảnh giới",
    note: "EXP cần để qua tầng 1 của mỗi cảnh giới (các tầng sau nhân với hệ số tăng theo tầng) và điểm tiềm năng nhận được ở mỗi tầng mới. Tràn EXP: ở tầng 9 thanh EXP vẫn đầy thêm tối đa một phần của mức cần (1 = 100%, tức thanh tối đa 200%); phần tràn làm tăng tỉ lệ đột phá.",
    fields: [
      ...REALMS.flatMap((r, i): TuningField[] => [
        { path: `realms.${i}.expBase`, label: `${r.nameVi}: EXP để qua tầng 1`, kind: "int", unit: "EXP" },
        { path: `realms.${i}.pointsPerStage`, label: `${r.nameVi}: điểm tiềm năng mỗi tầng mới`, kind: "int", unit: "điểm" },
      ]),
      { path: "stageGrowth", label: "Hệ số tăng EXP cần cho mỗi tầng kế tiếp", kind: "num" },
      { path: "lowMapMult", label: "EXP săn bản đồ thấp hơn cảnh giới: nhân mỗi cảnh giới chênh (1 = không phạt thêm)", kind: "num" },
      { path: "overflowMax", label: "Trần tràn EXP ở tầng 9 (1 = 100%, thanh tối đa 200%)", kind: "num" },
    ],
  },
  {
    group: "breakthrough",
    page: "realms",
    title: "Đột phá cảnh giới",
    note: "Đan tối đa, tỉ lệ thành công cơ bản và tối đa (khi dùng đủ đan), thời gian đứng yên, chi phí Linh Thạch và điểm tiềm năng khi thành công, cho từng bước. Phần thưởng tỉ lệ từ EXP tràn: không có dưới mốc bắt đầu, cộng điểm tại mốc đó rồi tăng đều tới mức tràn tối đa.",
    fields: [
      ...DEFAULT_TUNING.breakthrough.steps.flatMap((_, i): TuningField[] => {
        const step = `${REALMS[i]?.nameVi ?? i} → ${REALMS[i + 1]?.nameVi ?? i + 1}`;
        return [
          { path: `steps.${i}.maxPills`, label: `${step}: số đan tối đa`, kind: "int" },
          { path: `steps.${i}.baseRatePct`, label: `${step}: tỉ lệ cơ bản (không đan)`, kind: "num", unit: "%" },
          { path: `steps.${i}.maxRatePct`, label: `${step}: tỉ lệ tối đa (đủ đan, không nhỏ hơn cơ bản)`, kind: "num", unit: "%" },
          { path: `steps.${i}.durationMs`, label: `${step}: thời gian đứng yên`, kind: "int", unit: "ms (60000 = 1 phút)" },
          { path: `steps.${i}.cost`, label: `${step}: chi phí`, kind: "int", unit: "Linh Thạch" },
          { path: `steps.${i}.basePoints`, label: `${step}: điểm tiềm năng khi thành công`, kind: "int", unit: "điểm" },
        ];
      }),
      { path: "failExpLoss", label: "Thất bại: phần EXP tầng 9 bị mất", kind: "frac" },
      { path: "gradePointsMult", label: "Điểm tiềm năng thêm theo phẩm cấp linh căn (nhân)", kind: "num" },
      { path: "constitutionPoints", label: "Điểm tiềm năng thêm theo thể chất", kind: "num", unit: "điểm" },
      { path: "overflowFrom", label: "EXP tràn: mốc bắt đầu cộng tỉ lệ (phần của mức cần)", kind: "frac" },
      { path: "overflowFromBonus", label: "EXP tràn: điểm tỉ lệ cộng tại mốc bắt đầu", kind: "num", unit: "%" },
      { path: "overflowMaxBonus", label: "EXP tràn: điểm tỉ lệ cộng khi tràn tối đa", kind: "num", unit: "%" },
    ],
  },
  {
    group: "kills",
    page: "realms",
    title: "Nhịp lên tầng theo số quái",
    note: "Số quái cùng bậc cần giết để hết một tầng = gốc x hệ số tăng ^ cấp (cấp tính phẳng qua các cảnh giới). EXP của một quái suy ra từ đây.",
    fields: [
      { path: "base", label: "Số quái cần giết ở Luyện Khí tầng 1", kind: "num" },
      { path: "growth", label: "Hệ số tăng mỗi cấp", kind: "num" },
    ],
  },
  {
    group: "stats",
    page: "potential",
    title: "Chỉ số chiến đấu từ chỉ số gốc và cấp",
    note: "Mỗi chỉ số chiến đấu = giá trị gốc + (điểm của chỉ số gốc x hệ số) + (cấp x hệ số), rồi cộng trang bị. Cấp = cảnh giới x 9 + tầng - 1. Căn cốt → sinh lực, công, thủ; Linh lực → linh lực, công; Thần thức → chí mạng; Thân pháp → né; Ngộ tính → EXP; Phúc duyên → rơi đồ. Boss và vệ binh dùng cùng công thức nên cũng đổi theo (boss tính lại khi xuất hiện, vệ binh khi bản đồ dựng lại), sinh lực của họ còn nhân với hệ số riêng ở màn Quái / BOSS sau này. Tốc độ chạy theo Thân pháp chưa chỉnh được (máy khách tự dự đoán chuyển động). Người đang online giữ chỉ số cũ tới khi vào lại game, lên tầng hoặc đổi trang bị.",
    fields: [
      { path: "maxHp.base", label: "Sinh lực: gốc", kind: "num" },
      { path: "maxHp.perCanCot", label: "Sinh lực: mỗi điểm Căn cốt", kind: "num" },
      { path: "maxHp.perLevel", label: "Sinh lực: mỗi cấp", kind: "num" },
      { path: "maxMp.base", label: "Linh lực: gốc", kind: "num" },
      { path: "maxMp.perLinhLuc", label: "Linh lực: mỗi điểm Linh lực", kind: "num" },
      { path: "maxMp.perLevel", label: "Linh lực: mỗi cấp", kind: "num" },
      { path: "attack.base", label: "Công: gốc", kind: "num" },
      { path: "attack.perLinhLuc", label: "Công: mỗi điểm Linh lực", kind: "num" },
      { path: "attack.perCanCot", label: "Công: mỗi điểm Căn cốt", kind: "num" },
      { path: "attack.perLevel", label: "Công: mỗi cấp", kind: "num" },
      { path: "defense.base", label: "Thủ: gốc", kind: "num" },
      { path: "defense.perCanCot", label: "Thủ: mỗi điểm Căn cốt", kind: "num" },
      { path: "defense.perLevel", label: "Thủ: mỗi cấp", kind: "num" },
      { path: "critRate.base", label: "Chí mạng: gốc", kind: "num", unit: "%" },
      { path: "critRate.perThanThuc", label: "Chí mạng: mỗi điểm Thần thức", kind: "num", unit: "%" },
      { path: "dodgeRate.perThanPhap", label: "Né: mỗi điểm Thân pháp", kind: "num", unit: "%" },
      { path: "expBonus.perNgoTinh", label: "Thưởng EXP: mỗi điểm Ngộ tính", kind: "num", unit: "%" },
      { path: "dropBonus.perPhucDuyen", label: "Thưởng rơi đồ: mỗi điểm Phúc duyên", kind: "num", unit: "%" },
      { path: "rateCap", label: "Trần chí mạng và né", kind: "num", unit: "%" },
    ],
  },
  {
    group: "roots",
    page: "talents",
    title: "Linh căn: phẩm cấp và số hệ",
    note: "Lúc tạo nhân vật, máy chủ tung một phẩm cấp và một số hệ theo trọng số (không cần cộng đủ 100: phần trăm là phần của tổng, hiện bên cạnh). Trọng số và điểm khởi đầu chỉ áp cho nhân vật tạo sau đó; thưởng EXP và thưởng sát thương theo hệ áp cho mọi người sau tối đa 30 giây (người đang online thấy sau khi vào lại game). Tên phẩm cấp và tên số hệ còn nằm trong code.",
    fields: [
      ...ROOT_GRADES.flatMap((g, i): TuningField[] => [
        { path: `grades.${i}.weight`, label: `${g.nameVi}: trọng số tung`, kind: "num" },
        { path: `grades.${i}.expBonusPct`, label: `${g.nameVi}: thưởng EXP`, kind: "num", unit: "%" },
        { path: `grades.${i}.bonusPoints`, label: `${g.nameVi}: điểm tiềm năng khởi đầu thêm`, kind: "int", unit: "điểm" },
        { path: `grades.${i}.elementDamagePct`, label: `${g.nameVi}: thưởng sát thương theo hệ của mình`, kind: "num", unit: "%" },
      ]),
      ...ROOT_COUNTS.flatMap((c, i): TuningField[] => [
        { path: `counts.${i}.weight`, label: `${c.nameVi}: trọng số tung`, kind: "num" },
        { path: `counts.${i}.expBonusPct`, label: `${c.nameVi}: thưởng EXP`, kind: "num", unit: "%" },
      ]),
    ],
  },
];

const RANKS: ReadonlyArray<readonly [string, string]> = [
  ["normal", "Quái thường"],
  ["rare1", "Tinh Anh"],
  ["rare2", "Đại Yêu"],
];
const perRank = (path: (rank: string) => string, label: (name: string) => string, kind: TuningField["kind"], unit?: string): TuningField[] =>
  RANKS.map(([rank, name]): TuningField => ({ path: path(rank), label: label(name), kind, ...(unit ? { unit } : {}) }));
const MAP_NAMES: ReadonlyArray<readonly [string, string]> = [
  ["town", "Thanh Vân Thành"],
  ["forest", "Hắc Mộc Lâm"],
  ["cave", "U Minh Động"],
  ["town2", "Thiên Hà Thành"],
  ["kimdan", "Xích Diễm Sơn"],
  ["nguyenanh", "Vạn Cổ Hàn Uyên"],
  ["town3", "Huyền Thiên Thành"],
  ["hoathan", "Lôi Âm Tuyệt Cốc"],
  ["luyenhu", "Hư Không Hải"],
];

export const MONSTER_SCREENS: readonly TuningScreenGroup[] = [
  {
    group: "monsters",
    page: "monsters",
    skip: ["species"],
    title: "Hạng quái: thường, Tinh Anh, Đại Yêu",
    note: "Xác suất mỗi lần quái sinh ra hoặc hồi sinh là hạng này (quái thường là phần còn lại), và các hệ số nhân lên chỉ số cùng EXP. Số của từng loài quái chỉnh ở danh sách loài. Số mới áp cho quái sinh ra sau đó; quái đang sống giữ số cũ.",
    fields: RANKS.flatMap(([rank, name]): TuningField[] => [
      ...(rank === "normal" ? [] : [{ path: `ranks.${rank}.chance`, label: `${name}: xác suất xuất hiện`, kind: "frac" as const }]),
      { path: `ranks.${rank}.hpMult`, label: `${name}: hệ số sinh lực`, kind: "num" },
      { path: `ranks.${rank}.attackMult`, label: `${name}: hệ số công`, kind: "num" },
      { path: `ranks.${rank}.defenseMult`, label: `${name}: hệ số thủ`, kind: "num" },
      { path: `ranks.${rank}.expMult`, label: `${name}: hệ số EXP`, kind: "num" },
    ]).concat([{ path: "ranks.normal.chance", label: "Quái thường: xác suất (không dùng, là phần còn lại)", kind: "frac" }]),
  },
  {
    group: "drops",
    page: "monsters",
    title: "Rơi đồ: Linh Thạch, bí tịch, đan đột phá, trang bị",
    note: "Mỗi lần giết: Linh Thạch rơi với xác suất theo hạng, số lượng = gốc x hệ số tăng ^ cấp x hệ số theo hạng; bí tịch và đan đột phá có xác suất theo hạng; trang bị có xác suất theo hạng, tỉ lệ các phẩm 1 đến 4 và phần trăm món vượt cấp. Tăng xác suất làm tăng số dòng ghi D1 (hạn mức Free 100.000 mỗi ngày).",
    fields: [
      ...perRank((r) => `linh.chance.${r}`, (n) => `Linh Thạch: xác suất rơi, ${n}`, "frac"),
      ...perRank((r) => `linh.amountMult.${r}`, (n) => `Linh Thạch: hệ số số lượng, ${n}`, "num"),
      { path: "linh.base", label: "Linh Thạch: số lượng gốc", kind: "num" },
      { path: "linh.growth", label: "Linh Thạch: hệ số tăng mỗi cấp", kind: "num" },
      ...perRank((r) => `book.${r}`, (n) => `Bí tịch: xác suất rơi, ${n}`, "frac"),
      ...REALMS.slice(0, -1).flatMap((realm, i) => perRank((r) => `pill.${i}.${r}`, (n) => `Đan đột phá của bản đồ ${realm.nameVi}: xác suất rơi, ${n}`, "frac")),
      ...RANKS.flatMap(([rank, name]): TuningField[] => [
        { path: `equip.${rank}.chance`, label: `Trang bị: xác suất rơi, ${name}`, kind: "frac" },
        { path: `equip.${rank}.overLevel`, label: `Trang bị: phần món vượt cấp, ${name}`, kind: "frac" },
        ...[1, 2, 3, 4].map((g): TuningField => ({ path: `equip.${rank}.grades.${g - 1}`, label: `Trang bị: trọng số phẩm ${g}, ${name}`, kind: "num" })),
      ]),
    ],
  },
  {
    group: "oreDrop",
    page: "monsters",
    title: "Rơi Tinh Thiết (nguyên liệu nâng cấp)",
    note: "Xác suất và số lượng nguyên liệu Thợ Rèn rơi theo hạng quái (chỉ từ quái cảnh giới đó).",
    fields: RANKS.flatMap(([rank, name]): TuningField[] => [
      { path: `${rank}.chance`, label: `${name}: xác suất`, kind: "frac" },
      { path: `${rank}.min`, label: `${name}: số lượng tối thiểu`, kind: "int" },
      { path: `${rank}.max`, label: `${name}: số lượng tối đa`, kind: "int" },
    ]),
  },
  {
    group: "refineDrop",
    page: "monsters",
    title: "Rơi Tinh Hoa (nguyên liệu tinh luyện)",
    note: "Như trên, nhưng hiếm hơn.",
    fields: RANKS.flatMap(([rank, name]): TuningField[] => [
      { path: `${rank}.chance`, label: `${name}: xác suất`, kind: "frac" },
      { path: `${rank}.min`, label: `${name}: số lượng tối thiểu`, kind: "int" },
      { path: `${rank}.max`, label: `${name}: số lượng tối đa`, kind: "int" },
    ]),
  },
  {
    group: "boss",
    page: "boss",
    title: "BOSS bản đồ: loài và thời hạn",
    note: "Mỗi bản đồ có tối đa một loài boss (một con cho mọi kênh). Chỉ chọn được loài không có trong bãi quái, không phải vệ binh, và bản đồ phải có cảnh giới; không đổi được loài của một bản đồ khi boss đang có mặt. Loài mới có hiệu lực từ lần boss xuất hiện sau.",
    fields: [
      { path: "claimTtlMs", label: "Giữ chỗ boss tối đa (nếu phòng không quay lại thì coi như mất)", kind: "int", unit: "ms (86400000 = 1 ngày)" },
      { path: "tier", label: "Bậc trả thưởng của boss (EXP và đồ rơi theo bậc này)", kind: "int" },
      ...MAP_NAMES.map(([id, name]): TuningField => ({ path: `species.${id}`, label: `Loài boss: ${name}`, kind: "species" })),
    ],
  },
  {
    group: "bossSpawn",
    page: "boss",
    title: "BOSS xuất hiện",
    note: "Mỗi lần quái hồi sinh có xác suất gọi boss; hoặc chắc chắn sau một số lần giết trong phòng, theo cảnh giới của bản đồ.",
    fields: [
      { path: "chance", label: "Xác suất gọi boss mỗi lần quái hồi sinh", kind: "frac" },
      ...REALMS.map((r, i): TuningField => ({ path: `pityKills.${i}`, label: `Số lần giết chắc chắn có boss: bản đồ ${r.nameVi}`, kind: "int" })),
      { path: "pityDefault", label: "Số lần giết chắc chắn có boss: cảnh giới khác", kind: "int" },
      { path: "flushEvery", label: "Ghi bộ đếm giết chung sau mỗi", kind: "int", unit: "lần giết (mỗi lần ghi là một dòng D1)" },
    ],
  },
  {
    group: "bossStats",
    page: "boss",
    title: "Sức mạnh boss",
    note: "Boss mạnh như một nhân vật cao hơn cảnh giới bản đồ vài bậc, đủ đồ phẩm cao, dùng hết điểm, sinh lực nhân thêm. Công thức dùng cùng hệ số chỉ số tiềm năng nên đổi hệ số ở màn Chỉ số tiềm năng cũng đổi boss.",
    fields: [
      { path: "statTier", label: "Bậc (1-9) của nhân vật mẫu", kind: "int" },
      { path: "gearGrade", label: "Phẩm trang bị (1-4)", kind: "int" },
      { path: "hpMult", label: "Hệ số sinh lực", kind: "num" },
      { path: "pointsPerLevel", label: "Điểm tiềm năng mỗi cấp", kind: "num" },
      { path: "realmBonus", label: "Cao hơn cảnh giới bản đồ", kind: "int", unit: "cảnh giới (0-3)" },
    ],
  },
  {
    group: "bossReward",
    page: "boss",
    title: "Thưởng boss",
    note: "Thưởng chia theo đóng góp: trọng số sát thương và đòn kết liễu cộng đủ 1; dưới ngưỡng không được chia. EXP và Linh Thạch tính theo bội số của một Đại Yêu; đồ rơi theo số vòng.",
    fields: [
      { path: "minShare", label: "Ngưỡng tối thiểu để được chia", kind: "frac" },
      { path: "damageWeight", label: "Trọng số sát thương", kind: "frac" },
      { path: "lastHitWeight", label: "Trọng số đòn kết liễu", kind: "frac" },
      { path: "expMult", label: "EXP: bội số của Đại Yêu", kind: "num" },
      { path: "linhMult", label: "Linh Thạch: bội số của Đại Yêu", kind: "num" },
      { path: "itemRounds", label: "Số vòng đồ rơi", kind: "int" },
      { path: "itemChanceMult", label: "Hệ số xác suất đồ rơi", kind: "num" },
    ],
  },
  {
    group: "bossSkills",
    page: "boss",
    title: "Kỹ năng của boss",
    note: "Boss dùng lần lượt theo thứ tự: hồi máu (khi dưới mức), đòn mạnh, đòn chém, mỗi kỹ năng một hồi chiêu.",
    fields: [
      { path: "mend.fraction", label: "Hồi máu: phần sinh lực tối đa hồi", kind: "frac" },
      { path: "mend.below", label: "Hồi máu: dùng khi sinh lực dưới", kind: "frac" },
      { path: "mend.cdMs", label: "Hồi máu: hồi chiêu", kind: "int", unit: "ms" },
      { path: "burst.power", label: "Đòn mạnh: sát thương (nhân với công)", kind: "num" },
      { path: "burst.cdMs", label: "Đòn mạnh: hồi chiêu", kind: "int", unit: "ms" },
      { path: "slash.power", label: "Đòn chém: sát thương (nhân với công)", kind: "num" },
      { path: "slash.cdMs", label: "Đòn chém: hồi chiêu", kind: "int", unit: "ms" },
    ],
  },
  {
    group: "bossCone",
    page: "boss",
    title: "Kỹ năng nón của boss",
    note: "Đòn quét hình nón về phía người đang đánh, dùng khi sinh lực dưới mức, hồi chiêu dài.",
    fields: [
      { path: "power", label: "Sát thương (nhân với công)", kind: "num" },
      { path: "cdMs", label: "Hồi chiêu", kind: "int", unit: "ms" },
      { path: "below", label: "Dùng khi sinh lực dưới", kind: "frac" },
      { path: "range", label: "Tầm đánh", kind: "num", unit: "ô" },
      { path: "halfAngleDeg", label: "Nửa độ mở của nón", kind: "num", unit: "độ" },
    ],
  },
  {
    group: "bossRegen",
    page: "boss",
    title: "Boss hồi máu khi về chỗ cũ",
    fields: [{ path: "perSecond", label: "Phần sinh lực tối đa hồi mỗi giây", kind: "frac" }],
  },
  {
    group: "guard",
    page: "boss",
    title: "Sức mạnh vệ binh",
    note: "Vệ binh đứng ở các cổng, chỉ đánh người tên cam hoặc đỏ và ai đánh nó. Dùng cùng công thức chỉ số như boss. (Danh sách vệ binh theo bản đồ vẫn nằm trong code; hạng mục 3k không cần làm lại phần số này.)",
    fields: [
      { path: "gearGrade", label: "Phẩm trang bị (1-4)", kind: "int" },
      { path: "hpMult", label: "Hệ số sinh lực", kind: "num" },
      { path: "pointsPerLevel", label: "Điểm tiềm năng mỗi cấp", kind: "num" },
      { path: "realmBonus", label: "Cao hơn cảnh giới bản đồ", kind: "int", unit: "cảnh giới (0-3)" },
      { path: "tier", label: "Bậc (1-9) của nhân vật mẫu", kind: "int" },
    ],
  },
  {
    group: "guardSkills",
    page: "boss",
    title: "Kỹ năng của vệ binh",
    fields: [
      { path: "mend.fraction", label: "Hồi máu: phần sinh lực tối đa hồi", kind: "frac" },
      { path: "mend.below", label: "Hồi máu: dùng khi sinh lực dưới", kind: "frac" },
      { path: "mend.cdMs", label: "Hồi máu: hồi chiêu", kind: "int", unit: "ms" },
      { path: "ward.attackPct", label: "Hộ thể: tăng công", kind: "num", unit: "%" },
      { path: "ward.durationMs", label: "Hộ thể: thời gian", kind: "int", unit: "ms" },
      { path: "ward.cdMs", label: "Hộ thể: hồi chiêu", kind: "int", unit: "ms" },
      { path: "burst.power", label: "Đòn mạnh: sát thương (nhân với công)", kind: "num" },
      { path: "burst.cdMs", label: "Đòn mạnh: hồi chiêu", kind: "int", unit: "ms" },
      { path: "slash.power", label: "Đòn chém: sát thương (nhân với công)", kind: "num" },
      { path: "slash.cdMs", label: "Đòn chém: hồi chiêu", kind: "int", unit: "ms" },
    ],
  },
];

const PATH_NAMES: ReadonlyArray<[string, string]> = [["kiem", "Kiếm tu"], ["thuat", "Thuật tu"], ["dan", "Đan tu"]];

/** The numbers of the NPCs that are not a stock or a position (screen "NPC · Con số"): the blacksmith's costs and the path masters' fees and bonuses. */
const NPC_SCREENS: readonly TuningScreenGroup[] = [
  {
    group: "enhanceCost",
    page: "npcs",
    title: "Thợ Rèn: chi phí nâng cấp",
    note: "Linh Thạch cơ bản của một bước nâng cấp, theo cảnh giới của món (nhân với hệ số của từng cấp trong bảng nâng cấp). Giới hạn cộng dồn là phần tỉ lệ thêm tối đa tích lũy sau các lần thất bại.",
    fields: [
      ...REALMS.map((r, i): TuningField => ({ path: `linhBase.${i}`, label: `Linh Thạch cơ bản, món ${r.nameVi}`, kind: "int", unit: "Linh Thạch" })),
      { path: "maxPityPct", label: "Giới hạn tỉ lệ cộng dồn do thất bại", kind: "num", unit: "%" },
    ],
  },
  {
    group: "refine",
    page: "npcs",
    title: "Thợ Rèn: Tinh luyện",
    fields: [
      { path: "materials", label: "Số nguyên liệu Tinh Hoa mỗi lần", kind: "int" },
      { path: "linhShare", label: "Linh Thạch mỗi lần (phần của Linh Thạch cơ bản)", kind: "num" },
      { path: "statChance", label: "Xác suất mỗi chỉ số được tăng", kind: "frac" },
    ],
  },
  {
    group: "keepLevel",
    page: "npcs",
    title: "Thợ Rèn: Hộ Cấp Phù",
    fields: [{ path: "priceTienNgoc", label: "Giá Hộ Cấp Phù", kind: "int", unit: "Tiên Ngọc" }],
  },
  {
    group: "paths",
    page: "npcs",
    title: "Đạo Sư: phí đổi và bỏ hướng tu",
    fields: [
      { path: "swapCostBase", label: "Phí đổi chủ tu (cơ bản, nhân theo cấp hướng tu)", kind: "int", unit: "Linh Thạch" },
      { path: "dropCostBase", label: "Phí bỏ một hướng (cơ bản, nhân theo cấp hướng tu)", kind: "int", unit: "Linh Thạch" },
    ],
  },
  {
    group: "pathBonuses",
    page: "npcs",
    title: "Đạo Sư: thưởng chỉ số của chủ tu",
    note: "Phần trăm cộng thêm khi hướng này là chủ tu (phụ tu nhận một nửa).",
    fields: PATH_NAMES.flatMap(([id, name]): TuningField[] => [
      { path: `${id}.attackPct`, label: `${name}: công`, kind: "num", unit: "%" },
      { path: `${id}.defensePct`, label: `${name}: thủ`, kind: "num", unit: "%" },
      { path: `${id}.maxMpPct`, label: `${name}: linh lực tối đa`, kind: "num", unit: "%" },
      { path: `${id}.weaponSkillPct`, label: `${name}: sát thương kỹ năng cầm vũ khí`, kind: "num", unit: "%" },
      { path: `${id}.elementSkillPct`, label: `${name}: sát thương kỹ năng hệ`, kind: "num", unit: "%" },
      { path: `${id}.potionHealPct`, label: `${name}: hồi máu từ đan`, kind: "num", unit: "%" },
      { path: `${id}.masteryPct`, label: `${name}: điểm thuần thục`, kind: "num", unit: "%" },
    ]),
  },
];

export const ADMIN_TUNING_SCREENS: readonly TuningScreenGroup[] = [...BASE_SCREENS, ...MONSTER_SCREENS, ...NPC_SCREENS];

/**
 * The fields of a screen as they stand now: the boss page also lists a species field for every map an admin added (3l), which the static list cannot know.
 */
export function adminScreenFields(screen: TuningScreenGroup): TuningField[] {
  if (screen.group !== "boss") return screen.fields;
  const known = new Set(screen.fields.map((f) => f.path));
  const extra = MAP_IDS.filter((id) => !known.has(`species.${id}`) && MAP_REALM[id] !== null) /* a town has no boss */.map((id): TuningField => ({ path: `species.${id}`, label: `Loài boss: ${LIVE_MAP_NAMES[id] ?? id}`, kind: "species" }));
  return [...screen.fields, ...extra];
}

export function adminTuningScreen(group: string): TuningScreenGroup | undefined {
  return ADMIN_TUNING_SCREENS.find((g) => g.group === group);
}

/** Reads `a.b.0` out of a value; undefined when the path does not lead to anything. */
export function getPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const part of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Writes `a.b.0` into a value that already has the parent objects (the default shape does). */
export function setPath(value: unknown, path: string, to: unknown): boolean {
  const parts = path.split(".");
  let cur: unknown = value;
  for (const part of parts.slice(0, -1)) {
    if (typeof cur !== "object" || cur === null) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur !== "object" || cur === null) return false;
  (cur as Record<string, unknown>)[parts[parts.length - 1]!] = to;
  return true;
}

/** Every number or string leaf path of a value ("a.b", "list.2"). */
export function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "number" || typeof value === "string" || value === null) return [prefix];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

/** The default value of a screen group (a copy). */
export function defaultOfGroup<G extends TuningGroup>(group: G): Tuning[G] {
  return JSON.parse(JSON.stringify(DEFAULT_TUNING[group])) as Tuning[G];
}

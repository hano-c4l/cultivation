import { DEFAULT_TUNING, type Tuning, type TuningGroup } from "./tuning";

/**
 * The fields of the `game_tuning` groups an admin screen edits, with Vietnamese labels, one entry per number ("leaf") of the group. The admin
 * screen "Chỉ số khác" (PHASE3 3c) is driven by ADMIN_TUNING_SCREENS; the server only accepts these leaves when it saves a group, and a test
 * fails when a leaf of a listed group has no field here, so adding a number to a group means adding its label in the same change.
 *
 * kind: `int` a whole number, `num` any number, `frac` a share between 0 and 1 (the screen says so: 0,25 means 25%).
 */
export interface TuningField {
  /** Dot path inside the group's value; array indexes are numbers ("dropChance.2"). */
  path: string;
  label: string;
  kind: "int" | "num" | "frac";
  unit?: string;
}

export interface TuningScreenGroup {
  group: TuningGroup;
  title: string;
  /** A sentence under the title (what the numbers do, anything to know before changing them). */
  note?: string;
  fields: TuningField[];
}

const TIERS = ["Tên trắng", "Tên vàng", "Tên cam", "Tên đỏ"];

export const ADMIN_TUNING_SCREENS: readonly TuningScreenGroup[] = [
  {
    group: "pvp",
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
    title: "Truyền Tống Trận: phí",
    note: "Phí (Linh Thạch) = phí cơ bản + phí mỗi đơn vị × khoảng cách giữa hai thành trên bản đồ thế giới.",
    fields: [
      { path: "base", label: "Phí cơ bản", kind: "int", unit: "Linh Thạch" },
      { path: "perUnit", label: "Phí mỗi đơn vị khoảng cách", kind: "num", unit: "Linh Thạch" },
    ],
  },
  {
    group: "aoi",
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
];

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

/** Every numeric leaf path of a value ("a.b", "list.2"). */
export function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "number") return [prefix];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

/** The default value of a screen group (a copy). */
export function defaultOfGroup<G extends TuningGroup>(group: G): Tuning[G] {
  return JSON.parse(JSON.stringify(DEFAULT_TUNING[group])) as Tuning[G];
}

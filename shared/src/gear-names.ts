/**
 * Names of the gear sets: one set for each realm and bậc, so every piece of that level shares a name (Lăng Y Đạo Bào, Lăng Y Đạo Quan...).
 * These are the defaults; the table `equipment_sets` in D1 holds the live names (an admin screen can rename a set later) and the
 * server hands them to the client, which installs them with setGearSetNames. Display data like monster names.
 */
export const DEFAULT_GEAR_SET_NAMES: readonly (readonly string[])[] = [
  // Luyện Khí 1..9
  ["Lăng Y", "Bạch Thi", "Thanh Phong", "Hắc Vân", "Tử Điện", "Xích Viêm", "Huyền Băng", "Kim Quang", "Linh Lung"],
  // Trúc Cơ 1..9
  ["Thiên Cương", "Địa Sát", "Huyết Ảnh", "Ngọc Tủy", "Thanh Liên", "Hàn Nguyệt", "Long Lân", "Phượng Vũ", "Tinh Hà"],
  // Kim Đan 1..9
  ["Cửu Thiên", "Hỗn Nguyên", "Tử Kim", "Lưu Ly", "Bát Hoang", "Thái Hư", "Vạn Cổ", "Thần Hoàng", "Chí Tôn"],
  // Nguyên Anh 1..9
  ["Đạo Tâm", "Huyền Thiên", "Vô Cực", "Thái Cực", "Hồng Mông", "Âm Dương", "Tạo Hóa", "Bất Diệt", "Thiên Đạo"],
  // Hóa Thần 1..9
  ["Thần Du", "Linh Đài", "Thái Sơ", "Tinh Thần", "Vân Hà", "Lôi Đình", "Phi Thăng", "Thiên Uy", "Chân Quân"],
  // Luyện Hư 1..9
  ["Hư Linh", "Vô Tướng", "Không Minh", "Tịch Diệt", "Hỗn Độn", "Đại La", "Vô Thượng", "Hư Không", "Chí Hư"],
];

let names: readonly (readonly string[])[] = DEFAULT_GEAR_SET_NAMES;
let version = 0;

/** Bumps whenever the names change, so caches of formatted names (equipmentInfo) know to rebuild. */
export function gearNamesVersion(): number {
  return version;
}

/** The set a piece of this realm and bậc (1..9) belongs to; empty when unknown. */
export function gearSetName(realm: number, tier: number): string {
  return names[realm]?.[tier - 1] ?? DEFAULT_GEAR_SET_NAMES[realm]?.[tier - 1] ?? "";
}

/** Installs live names (one list per realm); anything missing or not text keeps its default. */
export function setGearSetNames(next: readonly (readonly string[])[] | null | undefined): void {
  names = DEFAULT_GEAR_SET_NAMES.map((realm, r) => realm.map((def, t) => {
    const v = next?.[r]?.[t];
    return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 24) : def;
  }));
  version++;
}

export function currentGearSetNames(): readonly (readonly string[])[] {
  return names;
}

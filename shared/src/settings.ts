/**
 * Settings an admin can change while the game runs (table `game_settings`). Each key has a default and an allowed range
 * here; the database only stores overrides, so a missing row means the default.
 */
export interface SettingDef {
  key: string;
  /** The admin screen it is on: "misc" (Chỉ số khác) or "talents" (Thiên phú). */
  page: "misc" | "talents";
  labelVi: string;
  default: number;
  min: number;
  max: number;
}

export const SETTINGS = [
  { key: "bag_tab_price", page: "misc", labelVi: "Giá mở khóa một tab túi đồ (Linh Thạch)", default: 1000, min: 0, max: 1_000_000 },
  { key: "linh_thach_trace_min", page: "misc", labelVi: "Ngưỡng ghi lịch sử chi tiết Linh Thạch (chỉ ghi giao dịch từ mức này, và mọi thao tác của admin)", default: 100_000, min: 1, max: 1_000_000_000 },
  { key: "max_characters", page: "misc", labelVi: "Số nhân vật tối đa của một tài khoản (hạ thấp chỉ chặn việc tạo thêm, không xóa nhân vật có sẵn)", default: 3, min: 1, max: 10 },
  { key: "mutant_root_chance", page: "talents", labelVi: "Tỉ lệ đơn linh căn biến dị Lôi/Băng/Phong (phần nghìn)", default: 100, min: 0, max: 1000 },
  { key: "mutant_skill_bonus", page: "talents", labelVi: "Sát thương cộng thêm của kỹ năng hệ biến dị (%)", default: 10, min: 0, max: 200 },
  { key: "mutant_gear_bonus", page: "talents", labelVi: "Chỉ số cộng thêm của trang bị cùng hệ biến dị (%)", default: 25, min: 0, max: 200 },
  { key: "mutant_gear_drop", page: "talents", labelVi: "Tỉ lệ trang bị rơi ra mang hệ biến dị (phần nghìn)", default: 30, min: 0, max: 1000 },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTINGS)[number]["key"];

export function settingDef(key: string): SettingDef | undefined {
  return SETTINGS.find((s) => s.key === key);
}

/** Whether `value` is a legal value for the setting `key`. */
export function validSettingValue(key: string, value: unknown): value is number {
  const def = settingDef(key);
  return !!def && typeof value === "number" && Number.isInteger(value) && value >= def.min && value <= def.max;
}

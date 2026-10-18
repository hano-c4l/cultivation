/**
 * Settings an admin can change while the game runs (table `game_settings`). Each key has a default and an allowed range
 * here; the database only stores overrides, so a missing row means the default.
 */
export interface SettingDef {
  key: string;
  labelVi: string;
  default: number;
  min: number;
  max: number;
}

export const SETTINGS = [
  { key: "bag_tab_price", labelVi: "Giá mở khóa một tab túi đồ (Linh Thạch)", default: 1000, min: 0, max: 1_000_000 },
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

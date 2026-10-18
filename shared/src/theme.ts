/**
 * Colours the interface takes from data instead of hard-coding them in CSS, so they can be changed from the admin screen later
 * (the screen and the place to store them are not built yet: the client applies DEFAULT_THEME, and a stored theme only has to
 * be passed to applyTheme in the client). Every value is a CSS colour.
 */
export interface UiTheme {
  /** Tag colour of each realm (index = realm id): Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh. */
  realmColors: readonly string[];
  /** Slot background of each grade (phẩm cấp, index 0..4): Hạ, Trung, Thượng, Địa, Thiên. */
  gradeColors: readonly string[];
}

export const DEFAULT_THEME: UiTheme = {
  realmColors: ["#8bc34a", "#4fc3f7", "#ffb300", "#e040fb"],
  gradeColors: ["rgba(158, 158, 158, 0.28)", "rgba(76, 175, 80, 0.3)", "rgba(66, 165, 245, 0.32)", "rgba(171, 71, 188, 0.34)", "rgba(255, 179, 0, 0.36)"],
};

/** A theme read from storage or the network: anything missing or not a colour string falls back to the default. */
export function parseTheme(raw: unknown): UiTheme {
  const pick = (list: unknown, fallback: readonly string[]): string[] =>
    fallback.map((d, i) => {
      const v = Array.isArray(list) ? list[i] : undefined;
      return typeof v === "string" && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9 ,.%]+\)|hsla?\([0-9 ,.%deg]+\))$/.test(v.trim()) ? v.trim() : d;
    });
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { realmColors: pick(o.realmColors, DEFAULT_THEME.realmColors), gradeColors: pick(o.gradeColors, DEFAULT_THEME.gradeColors) };
}

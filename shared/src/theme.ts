/**
 * Colours the interface takes from data instead of hard-coding them in CSS, so they can be changed from the admin screen later
 * (the screen and the place to store them are not built yet: the client applies DEFAULT_THEME, and a stored theme only has to
 * be passed to applyTheme in the client). Every value is a CSS colour.
 */
export interface UiTheme {
  /** Tag colour of each realm (index = realm id): Luyện Khí, Trúc Cơ, Kim Đan, Nguyên Anh, Hóa Thần, Luyện Hư. */
  realmColors: readonly string[];
  /** Slot background of each grade (phẩm cấp, index 0..4): Hạ, Trung, Thượng, Địa, Thiên. */
  gradeColors: readonly string[];
  /** The palette of the page: CSS variable name (without the leading dashes) to colour. */
  ui: Readonly<Record<string, string>>;
}

export const DEFAULT_THEME: UiTheme = {
  realmColors: ["#8bc34a", "#4fc3f7", "#ffb300", "#e040fb", "#ff5252", "#e8f4ff"],
  gradeColors: ["rgba(158, 158, 158, 0.28)", "rgba(76, 175, 80, 0.3)", "rgba(66, 165, 245, 0.32)", "rgba(171, 71, 188, 0.34)", "rgba(255, 179, 0, 0.36)"],
  ui: {
    "ui-text": "#e8e4d8",
    "ui-border": "#3a4560",
    "ui-accent": "#d6a94b",
    "ui-on-accent": "#1b1405",
    "ui-highlight": "#ffd54a",
    "ui-muted": "#6b7a99",
    "ui-panel": "rgba(27, 33, 48, 0.96)",
    "ui-page": "#10141c",
  },
};

/** A theme read from storage or the network: anything missing or not a colour string falls back to the default. */
export function parseTheme(raw: unknown): UiTheme {
  const color = (v: unknown): v is string => typeof v === "string" && /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9 ,.%]+\)|hsla?\([0-9 ,.%deg]+\))$/.test(v.trim());
  const pick = (list: unknown, fallback: readonly string[]): string[] =>
    fallback.map((d, i) => {
      const v = Array.isArray(list) ? list[i] : undefined;
      return color(v) ? v.trim() : d;
    });
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const ui: Record<string, string> = { ...DEFAULT_THEME.ui };
  if (typeof o.ui === "object" && o.ui !== null) for (const [k, v] of Object.entries(o.ui)) if (/^[a-z][a-z0-9-]{0,30}$/.test(k) && color(v)) ui[k] = v.trim();
  return { realmColors: pick(o.realmColors, DEFAULT_THEME.realmColors), gradeColors: pick(o.gradeColors, DEFAULT_THEME.gradeColors), ui };
}

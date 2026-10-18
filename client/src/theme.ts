import type { UiTheme } from "@game/shared";

/** Puts the theme's colours on the page as CSS variables (--realm-N, --grade-N) that the stylesheet reads. */
export function applyTheme(theme: UiTheme): void {
  const root = document.documentElement.style;
  theme.realmColors.forEach((c, i) => root.setProperty(`--realm-${i}`, c));
  theme.gradeColors.forEach((c, i) => root.setProperty(`--grade-${i}`, c));
}

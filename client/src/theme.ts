import { parseTheme, tuning, type UiTheme } from "@game/shared";

/** Puts the theme's colours on the page as CSS variables (--realm-N, --grade-N) that the stylesheet reads. */
export function applyTheme(theme: UiTheme): void {
  const root = document.documentElement.style;
  theme.realmColors.forEach((c, i) => root.setProperty(`--realm-${i}`, c));
  theme.gradeColors.forEach((c, i) => root.setProperty(`--grade-${i}`, c));
}

/** Applies the colours of the live tuning (group `theme`, edited from D1) over the defaults; anything not a colour keeps its default. */
export function applyTuningTheme(): void {
  applyTheme(parseTheme(tuning().theme));
}

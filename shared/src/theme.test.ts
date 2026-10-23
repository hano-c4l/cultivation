import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, parseTheme } from "./theme";

describe("theme", () => {
  it("has a colour per realm and per grade", () => {
    expect(DEFAULT_THEME.realmColors).toHaveLength(4);
    expect(DEFAULT_THEME.gradeColors).toHaveLength(5);
  });

  it("keeps valid colours, and falls back to the default for anything else", () => {
    const t = parseTheme({ realmColors: ["#ff0000", "red; background: url(x)", 5], gradeColors: "nope" });
    expect(t.realmColors[0]).toBe("#ff0000");
    expect(t.realmColors[1]).toBe(DEFAULT_THEME.realmColors[1]);
    expect(t.realmColors[2]).toBe(DEFAULT_THEME.realmColors[2]);
    expect(t.gradeColors).toEqual([...DEFAULT_THEME.gradeColors]);
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
    expect(parseTheme({ gradeColors: ["rgba(1, 2, 3, 0.5)"] }).gradeColors[0]).toBe("rgba(1, 2, 3, 0.5)");
  });

  it("takes palette entries that are colours with a safe name, and keeps the rest of the default palette", () => {
    const t = parseTheme({ ui: { "ui-text": "#fff", "ui-border": "red; x", "bad name": "#000", "ui-new": "rgb(1, 2, 3)" } });
    expect(t.ui["ui-text"]).toBe("#fff");
    expect(t.ui["ui-border"]).toBe(DEFAULT_THEME.ui["ui-border"]);
    expect(t.ui["bad name"]).toBeUndefined();
    expect(t.ui["ui-new"]).toBe("rgb(1, 2, 3)");
    expect(t.ui["ui-page"]).toBe(DEFAULT_THEME.ui["ui-page"]);
  });
});

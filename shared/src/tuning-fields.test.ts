import { describe, expect, it } from "vitest";
import { DEFAULT_TUNING, validTuningGroup } from "./tuning";
import { ADMIN_TUNING_SCREENS, defaultOfGroup, getPath, leafPaths, setPath } from "./tuning-fields";

describe("admin tuning fields", () => {
  it("has a labelled field for every number of each listed group, and none for a number that does not exist", () => {
    for (const g of ADMIN_TUNING_SCREENS) {
      const leaves = leafPaths(DEFAULT_TUNING[g.group]).filter((p) => !(g.skip ?? []).some((k) => p === k || p.startsWith(`${k}.`))).sort();
      expect(g.fields.map((f) => f.path).sort(), g.group).toEqual(leaves);
      for (const f of g.fields) expect(f.label.length, `${g.group}.${f.path}`).toBeGreaterThan(3);
    }
  });

  it("every default passes validation, and an integer field holds a whole default", () => {
    for (const g of ADMIN_TUNING_SCREENS) {
      expect(validTuningGroup(g.group, defaultOfGroup(g.group)), g.group).toBe(true);
      for (const f of g.fields) {
        const v = getPath(DEFAULT_TUNING[g.group], f.path) as number;
        if (f.kind === "color") {
          expect(typeof v, `${g.group}.${f.path}`).toBe("string");
          continue;
        }
        if (f.kind === "species") continue;
        if (f.kind === "int") expect(Number.isInteger(v), `${g.group}.${f.path}`).toBe(true);
        if (f.kind === "frac") expect(v >= 0 && v <= 1, `${g.group}.${f.path}`).toBe(true);
      }
    }
  });

  it("reads and writes paths with array indexes", () => {
    const v = { a: { list: [1, 2, 3] } };
    expect(getPath(v, "a.list.1")).toBe(2);
    expect(setPath(v, "a.list.1", 9)).toBe(true);
    expect(v.a.list).toEqual([1, 9, 3]);
    expect(setPath(v, "b.c", 1)).toBe(false);
    expect(getPath(v, "x.y")).toBeUndefined();
  });
});

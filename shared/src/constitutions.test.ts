import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONSTITUTION_ROLL_RANGE,
  CONSTITUTION_STATS,
  CONSTITUTION_TIER_ROLL_RANGE,
  DEFAULT_CATALOG,
  DEFAULT_CONSTITUTION,
  clampConstitutionTier,
  constitutionEffects,
  constitutionTierName,
  getConstitution,
  isConstitutionId,
  modifierTotal,
  rollConstitution,
  validateCatalog,
  type ConstitutionCatalog,
  type ConstitutionDef,
} from "./constitutions";

const clone = (c: ConstitutionCatalog): ConstitutionCatalog => JSON.parse(JSON.stringify(c));
const withDef = (mutate: (defs: ConstitutionDef[]) => void): ConstitutionCatalog => {
  const c = clone(DEFAULT_CATALOG);
  mutate(c.constitutions);
  return c;
};
const def = (c: ConstitutionCatalog, id: string) => c.constitutions.find((d) => d.id === id)!;

describe("default catalogue", () => {
  it("is valid", () => {
    expect(validateCatalog(DEFAULT_CATALOG)).toEqual([]);
  });

  it("leaves most characters ordinary and has ladders of different lengths", () => {
    const special = DEFAULT_CATALOG.constitutions.filter((c) => !c.isDefault);
    const total = special.reduce((s, c) => s + c.rollWeight, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(CONSTITUTION_ROLL_RANGE / 5);
    expect(new Set(DEFAULT_CATALOG.constitutions.map((c) => c.tiers.length)).size).toBeGreaterThan(1);
    for (const c of DEFAULT_CATALOG.constitutions) for (let i = 1; i < c.tiers.length; i++) expect(c.tiers[i]!.rollWeight).toBeLessThanOrEqual(c.tiers[i - 1]!.rollWeight);
  });

  it("spells the 'each tier adds the first tier again' rule out as explicit values per tier", () => {
    const kiem = def(DEFAULT_CATALOG, "kiem_the");
    const dmg = (tier: number) => kiem.tiers[tier - 1]!.effects.find((e) => e.stat === "skill_damage")!.value;
    expect([dmg(1), dmg(2), dmg(3)]).toEqual([8, 16, 24]);
  });
});

describe("validateCatalog: every rule", () => {
  it("rejects a constitution with no default, or two", () => {
    expect(validateCatalog(withDef((d) => (def({ version: 1, constitutions: d }, DEFAULT_CONSTITUTION).isDefault = false)))).toEqual(
      expect.arrayContaining([expect.stringContaining("exactly one default")]),
    );
    expect(validateCatalog(withDef((d) => (d[0]!.isDefault = true)))).toEqual(expect.arrayContaining([expect.stringContaining("exactly one default")]));
  });

  it("rejects a disabled default", () => {
    expect(validateCatalog(withDef((d) => (def({ version: 1, constitutions: d }, DEFAULT_CONSTITUTION).enabled = false)))).toEqual(
      expect.arrayContaining([expect.stringContaining("cannot be disabled")]),
    );
  });

  it("rejects tier weights that do not sum to 100, and tiers that are not numbered 1, 2, 3", () => {
    expect(validateCatalog(withDef((d) => (d[0]!.tiers[0]!.rollWeight = 10)))).toEqual(expect.arrayContaining([expect.stringContaining("tier weights sum to")]));
    expect(validateCatalog(withDef((d) => (d[0]!.tiers[1]!.tier = 5)))).toEqual(expect.arrayContaining([expect.stringContaining("numbered 1, 2, 3")]));
  });

  it("rejects special constitutions that weigh more than all the rolls", () => {
    expect(validateCatalog(withDef((d) => (d[0]!.rollWeight = 20_000)))).toEqual(expect.arrayContaining([expect.stringContaining("more than")]));
  });

  it("ignores the weight of a disabled constitution when summing, but keeps it valid", () => {
    expect(validateCatalog(withDef((d) => { d[0]!.rollWeight = 20_000; d[0]!.enabled = false; }))).toEqual([]);
  });

  it("rejects a duplicate id, a bad id, an empty name and a non-integer weight", () => {
    expect(validateCatalog(withDef((d) => (d[1]!.id = d[0]!.id)))).toEqual(expect.arrayContaining([expect.stringContaining("duplicate constitution id")]));
    expect(validateCatalog(withDef((d) => (d[0]!.id = "Kiếm Thể")))).toEqual(expect.arrayContaining([expect.stringContaining("not lowercase")]));
    expect(validateCatalog(withDef((d) => (d[0]!.tiers[0]!.nameVi = "  ")))).toEqual(expect.arrayContaining([expect.stringContaining("empty name")]));
    expect(validateCatalog(withDef((d) => (d[0]!.rollWeight = 1.5)))).toEqual(expect.arrayContaining([expect.stringContaining("non-negative integer")]));
  });

  it("rejects effects the vocabulary does not allow", () => {
    const bad = (e: Partial<ConstitutionDef["tiers"][0]["effects"][0]>) =>
      validateCatalog(withDef((d) => d[0]!.tiers[0]!.effects.push({ stat: "move_speed", targetKind: "all", targetTag: "", mode: "percent", value: 5, ...e })));
    expect(bad({ stat: "luck" })).toEqual(expect.arrayContaining([expect.stringContaining('unknown stat "luck"')]));
    expect(bad({ targetKind: "element", targetTag: "moc" })).toEqual(expect.arrayContaining([expect.stringContaining("cannot target")])); // move_speed is global only
    expect(bad({ mode: "flat" })).toEqual(expect.arrayContaining([expect.stringContaining("does not allow mode")]));
    expect(bad({ value: Number.NaN })).toEqual(expect.arrayContaining([expect.stringContaining("non-numeric")]));
    expect(bad({ targetTag: "moc" })).toEqual(expect.arrayContaining([expect.stringContaining("has a tag")]));
    const el = (tag: string) => validateCatalog(withDef((d) => d[0]!.tiers[0]!.effects.push({ stat: "skill_damage", targetKind: "element", targetTag: tag, mode: "percent", value: 30 })));
    expect(el("moc")).toEqual([]);
    expect(el("rong")).toEqual(expect.arrayContaining([expect.stringContaining('unknown element "rong"')]));
    const wp = (tag: string) => validateCatalog(withDef((d) => d[0]!.tiers[0]!.effects.push({ stat: "skill_mastery", targetKind: "weapon", targetTag: tag, mode: "percent", value: 5 })));
    expect(wp("cung")).toEqual([]);
    expect(wp("bua")).toEqual(expect.arrayContaining([expect.stringContaining("unknown weapon")]));
    const sk = (tag: string) => validateCatalog(withDef((d) => d[0]!.tiers[0]!.effects.push({ stat: "skill_damage", targetKind: "skill", targetTag: tag, mode: "percent", value: 5 })));
    expect(sk("thuy_kiem_tram")).toEqual([]);
    expect(sk("Bad Skill")).toEqual(expect.arrayContaining([expect.stringContaining("bad skill id")]));
  });

  it("rejects the same effect twice in one tier", () => {
    const twice = withDef((d) => d[0]!.tiers[0]!.effects.push({ ...d[0]!.tiers[0]!.effects[0]! }));
    expect(validateCatalog(twice)).toEqual(expect.arrayContaining([expect.stringContaining("duplicate effect")]));
  });

  it("every stat in the vocabulary says what it can target and whether the game uses it yet", () => {
    for (const [key, meta] of Object.entries(CONSTITUTION_STATS)) {
      expect(meta.nameVi.length, key).toBeGreaterThan(0);
      expect(meta.targets.length, key).toBeGreaterThan(0);
      expect(meta.modes.length, key).toBeGreaterThan(0);
      expect(typeof meta.applied).toBe("boolean");
    }
    expect(CONSTITUTION_STATS.move_speed).toBeDefined();
    expect(CONSTITUTION_STATS.exp_gain).toBeDefined();
    expect(CONSTITUTION_STATS.skill_damage!.targets).toContain("element");
  });
});

describe("rollConstitution", () => {
  const counts = (catalog: ConstitutionCatalog) => {
    const m = new Map<string, number>();
    for (let r = 0; r < CONSTITUTION_ROLL_RANGE; r++) {
      const id = rollConstitution(catalog, r, 0).id;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };

  it("covers every roll exactly in proportion to the weights, the default taking the remainder", () => {
    const m = counts(DEFAULT_CATALOG);
    const special = DEFAULT_CATALOG.constitutions.filter((c) => !c.isDefault);
    for (const c of special) expect(m.get(c.id)).toBe(c.rollWeight);
    expect(m.get(DEFAULT_CONSTITUTION)).toBe(CONSTITUTION_ROLL_RANGE - special.reduce((s, c) => s + c.rollWeight, 0));
  });

  it("never rolls a disabled constitution", () => {
    const c = withDef((d) => (d[0]!.enabled = false));
    expect(counts(c).get("kiem_the")).toBeUndefined();
  });

  it("follows the sort order, so an admin can reorder without changing the odds", () => {
    const reordered = withDef((d) => {
      d[0]!.sortOrder = 999; // kiem_the now last among the specials
    });
    expect(rollConstitution(reordered, 0, 0).id).toBe("loi_the");
    const m = counts(reordered);
    expect(m.get("kiem_the")).toBe(150);
  });

  it("covers every tier roll exactly in proportion to that constitution's tier weights", () => {
    for (const c of DEFAULT_CATALOG.constitutions) {
      const before = DEFAULT_CATALOG.constitutions.filter((d) => !d.isDefault && d.sortOrder < c.sortOrder).reduce((s, d) => s + d.rollWeight, 0);
      const probe = c.isDefault ? CONSTITUTION_ROLL_RANGE - 1 : before;
      const n = c.tiers.map(() => 0);
      for (let t = 0; t < CONSTITUTION_TIER_ROLL_RANGE; t++) {
        const r = rollConstitution(DEFAULT_CATALOG, probe, t);
        expect(r.id).toBe(c.id);
        n[r.tier - 1]!++;
      }
      expect(n).toEqual(c.tiers.map((t) => t.rollWeight));
    }
  });

  it("extreme rolls land on valid results", () => {
    expect(rollConstitution(DEFAULT_CATALOG, 0, 0)).toEqual({ id: "kiem_the", tier: 1 });
    expect(rollConstitution(DEFAULT_CATALOG, CONSTITUTION_ROLL_RANGE - 1, 99)).toEqual({ id: DEFAULT_CONSTITUTION, tier: 1 });
    expect(rollConstitution(DEFAULT_CATALOG, 99_999, 5_000).id).toBe(DEFAULT_CONSTITUTION);
  });
});

describe("reading tiers", () => {
  it("clamps a stored tier into the constitution's range and names it", () => {
    expect(clampConstitutionTier(DEFAULT_CATALOG, "kiem_the", 0)).toBe(1);
    expect(clampConstitutionTier(DEFAULT_CATALOG, "kiem_the", 99)).toBe(3);
    expect(clampConstitutionTier(DEFAULT_CATALOG, "pham_the", 3)).toBe(1);
    expect(clampConstitutionTier(DEFAULT_CATALOG, "kiem_the", Number.NaN)).toBe(1);
    expect(constitutionTierName(DEFAULT_CATALOG, "thanh_the", 3)).toBe("Tiên Thể");
  });

  it("an unknown or removed constitution reads as the default, and a character above a shortened ladder reads as its top tier", () => {
    expect(getConstitution(DEFAULT_CATALOG, "khong_ton_tai").id).toBe(DEFAULT_CONSTITUTION);
    expect(constitutionEffects(DEFAULT_CATALOG, "khong_ton_tai", 1)).toEqual([]);
    expect(isConstitutionId(DEFAULT_CATALOG, "thanh_the")).toBe(true);
    expect(isConstitutionId(DEFAULT_CATALOG, "khong_co")).toBe(false);
    const shortened = withDef((d) => {
      d[0]!.tiers = d[0]!.tiers.slice(0, 2);
      d[0]!.tiers[0]!.rollWeight = 70;
      d[0]!.tiers[1]!.rollWeight = 30;
    });
    expect(validateCatalog(shortened)).toEqual([]);
    expect(clampConstitutionTier(shortened, "kiem_the", 3)).toBe(2);
    expect(constitutionTierName(shortened, "kiem_the", 3)).toBe("Tiên Thiên Kiếm Thể");
  });

  it("a disabled constitution keeps working for the characters who already have it", () => {
    const c = withDef((d) => (d[0]!.enabled = false));
    expect(constitutionEffects(c, "kiem_the", 2).length).toBeGreaterThan(0);
    expect(constitutionTierName(c, "kiem_the", 2)).toBe("Tiên Thiên Kiếm Thể");
  });
});

describe("effects: the cases an admin screen has to express", () => {
  const catalog = withDef((d) => {
    // Mộc element, +30% damage of Mộc skills.
    d[0]!.tiers[0]!.effects = [
      { stat: "skill_damage", targetKind: "element", targetTag: "moc", mode: "percent", value: 30 },
      { stat: "exp_gain", targetKind: "all", targetTag: "", mode: "percent", value: 10 },
    ];
    // A wind body that moves faster, and a tier-2 value that REPLACES (not adds to) tier 1.
    d[1]!.id = "phong_the";
    d[1]!.nameVi = "Phong Thể";
    d[1]!.tiers[0]!.effects = [{ stat: "move_speed", targetKind: "all", targetTag: "", mode: "percent", value: 5 }];
    d[1]!.tiers[1]!.effects = [{ stat: "move_speed", targetKind: "all", targetTag: "", mode: "percent", value: 8 }];
  });

  it("the example catalogue is valid", () => {
    expect(validateCatalog(catalog)).toEqual([]);
  });

  it("a Mộc body adds 30% only to Mộc skills", () => {
    const fx = constitutionEffects(catalog, "kiem_the", 1);
    expect(modifierTotal(fx, "skill_damage", { elements: ["moc"] }).percent).toBe(30);
    expect(modifierTotal(fx, "skill_damage", { elements: ["hoa"] }).percent).toBe(0);
    expect(modifierTotal(fx, "skill_damage", { elements: ["moc", "hoa"] }).percent).toBe(30);
    expect(modifierTotal(fx, "skill_damage").percent).toBe(0);
  });

  it("a global effect such as experience applies in every context", () => {
    const fx = constitutionEffects(catalog, "kiem_the", 1);
    expect(modifierTotal(fx, "exp_gain").percent).toBe(10);
    expect(modifierTotal(fx, "exp_gain", { elements: ["thuy"] }).percent).toBe(10);
  });

  it("a wind body adds to movement speed, and the higher tier's value replaces the lower tier's", () => {
    expect(modifierTotal(constitutionEffects(catalog, "phong_the", 1), "move_speed").percent).toBe(5);
    expect(modifierTotal(constitutionEffects(catalog, "phong_the", 2), "move_speed").percent).toBe(8);
  });

  it("matching effects add up, flat and percent kept apart, and other stats are left alone", () => {
    const fx = [
      { stat: "attack", targetKind: "all" as const, targetTag: "", mode: "percent" as const, value: 5 },
      { stat: "attack", targetKind: "all" as const, targetTag: "", mode: "flat" as const, value: 12 },
      { stat: "skill_damage", targetKind: "weapon" as const, targetTag: "kiem", mode: "percent" as const, value: 8 },
      { stat: "skill_damage", targetKind: "skill" as const, targetTag: "kiem_khi", mode: "percent" as const, value: 2 },
    ];
    expect(modifierTotal(fx, "attack")).toEqual({ percent: 5, flat: 12 });
    expect(modifierTotal(fx, "skill_damage", { weapons: ["kiem"], skill: "kiem_khi" }).percent).toBe(10);
    expect(modifierTotal(fx, "skill_damage", { weapons: ["kiem"], skill: "khac" }).percent).toBe(8);
    expect(modifierTotal(fx, "defense")).toEqual({ percent: 0, flat: 0 });
  });
});

describe("migration 0007 (existing characters) mirrors the default catalogue", () => {
  const sql = readFileSync(new URL("../../server/migrations/0007_constitution.sql", import.meta.url), "utf8");
  const specials = [...DEFAULT_CATALOG.constitutions].filter((c) => !c.isDefault).sort((a, b) => a.sortOrder - b.sortOrder);

  it("assigns the constitution with the same cumulative weights", () => {
    let acc = 0;
    const whens = specials.map((c) => `WHEN constitution_tier <= ${(acc += c.rollWeight)} THEN '${c.id}'`);
    expect(sql).toContain(`CASE ${whens.join(" ")} ELSE '${DEFAULT_CONSTITUTION}' END`);
  });

  it("assigns the tier with the same cumulative tier weights", () => {
    const branches: string[] = [];
    for (const c of specials) {
      if (c.tiers.length === 1) continue;
      let acc = 0;
      const whens = c.tiers.slice(0, -1).map((t, i) => `WHEN constitution_tier <= ${(acc += t.rollWeight)} THEN ${i + 1}`);
      branches.push(`WHEN '${c.id}' THEN CASE ${whens.join(" ")} ELSE ${c.tiers.length} END`);
    }
    expect(sql).toContain(`CASE constitution ${branches.join(" ")} ELSE 1 END`);
  });
});

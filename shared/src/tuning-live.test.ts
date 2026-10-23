import { afterEach, describe, expect, it } from "vitest";
import { MASTERY_PILL_POINTS, effectiveSkill, getSkill } from "./skills";
import { BREAKTHROUGHS, breakthroughFailExpLoss, getBreakthrough } from "./breakthrough";
import { MONSTERS, getMonsterDef, rankDef, rollRank } from "./monsters";
import { REALMS } from "./progression-data";
import { expToNext } from "./progression";
import { isPkProtected, nameTier, heroBonus } from "./pk";
import { pathDropCost } from "./paths";
import { bossKind, bossKinds, bossTier } from "./boss";
import { ROOT_COUNTS, ROOT_GRADES } from "./progression-data";
import { PATHS, pathBonuses, pathBonusOf } from "./paths";
import { expLostOnDeath, regenDelayMs } from "./combat";
import { getRootGrade, rootCountFromRoll, rootGradeFromRoll } from "./progression";
import { monsterStats } from "./monsters";
import { mpRegenPerS } from "./skills";
import { DEFAULT_TUNING, resetTuning, setTuning, validTuningGroup, TUNING_GROUPS } from "./tuning";

afterEach(() => resetTuning());

describe("the defaults in the tuning match the numbers written in the code", () => {
  it("species, classes, realms, breakthroughs and mastery points", () => {
    for (const [id, def] of Object.entries(MONSTERS)) {
      const t = DEFAULT_TUNING.monsters.species[id]!;
      expect(t, id).toBeDefined();
      expect({ hpMult: def.hpMult, attackMult: def.attackMult, defenseMult: def.defenseMult, speed: def.speed, aggroRadius: def.aggroRadius, leashRadius: def.leashRadius, attackRange: def.attackRange, attackCooldownMs: def.attackCooldownMs, respawnMs: def.respawnMs }, id).toEqual(t);
    }
    expect(Object.keys(DEFAULT_TUNING.monsters.species).sort()).toEqual(Object.keys(MONSTERS).sort());
    REALMS.forEach((r, i) => expect(DEFAULT_TUNING.exp.realms[i]).toEqual({ expBase: r.expBase, pointsPerStage: r.pointsPerStage }));
    BREAKTHROUGHS.forEach((b, i) => {
      const { maxPills, baseRatePct, maxRatePct, durationMs, cost, basePoints } = b;
      expect(DEFAULT_TUNING.breakthrough.steps[i]).toEqual({ maxPills, baseRatePct, maxRatePct, durationMs, cost, basePoints });
    });
    expect(DEFAULT_TUNING.skills.pillPoints).toBe(MASTERY_PILL_POINTS);
    ROOT_GRADES.forEach((g, i) => expect(DEFAULT_TUNING.roots.grades[i]).toEqual({ weight: g.weight, expBonusPct: g.expBonusPct, bonusPoints: g.bonusPoints, elementDamagePct: g.elementDamagePct }));
    ROOT_COUNTS.forEach((c, i) => expect(DEFAULT_TUNING.roots.counts[i]).toEqual({ weight: c.weight, expBonusPct: c.expBonusPct }));
    for (const id of Object.keys(PATHS) as Array<keyof typeof PATHS>) expect(DEFAULT_TUNING.pathBonuses[id], id).toEqual(PATHS[id].bonus);
  });

  it("every group's default is valid", () => {
    for (const g of TUNING_GROUPS) expect(validTuningGroup(g, DEFAULT_TUNING[g]), g).toBe(true);
  });
});

describe("an edit reaches the code that reads it", () => {
  it("species and class numbers", () => {
    setTuning({ monsters: { species: { ...DEFAULT_TUNING.monsters.species, soi_rung: { ...DEFAULT_TUNING.monsters.species.soi_rung!, hpMult: 5, aggroRadius: 9 } }, ranks: { ...DEFAULT_TUNING.monsters.ranks, rare2: { ...DEFAULT_TUNING.monsters.ranks.rare2, chance: 0.5 } } } });
    expect(getMonsterDef("soi_rung")).toMatchObject({ hpMult: 5, aggroRadius: 9, nameVi: "Sói Rừng" });
    expect(getMonsterDef("heo_rung")!.hpMult).toBe(1.6);
    expect(rankDef("rare2").chance).toBe(0.5);
    expect(rankDef("rare2").tagVi).toBe("Đại Yêu");
    expect(rollRank(0.4)).toBe("rare2");
  });

  it("a skill override changes the power, MP cost and cooldown the fight uses", () => {
    const def = getSkill("kim_3")!;
    setTuning({ skillOverrides: { kim_3: { power: def.power * 2, cooldownMs: 1000 } } });
    expect(getSkill("kim_3")!.power).toBe(def.power * 2);
    expect(getSkill("kim_3")!.nameVi).toBe(def.nameVi);
    expect(effectiveSkill(getSkill("kim_3")!, { realm: 1, grade: 0, level: 0 }).cooldownMs).toBe(1000);
    expect(getSkill("no_such_skill")).toBeUndefined();
  });

  it("EXP curve, breakthrough, paths, PvP levels and the boss table", () => {
    const before = expToNext(0, 1);
    setTuning({ exp: { ...DEFAULT_TUNING.exp, realms: [{ expBase: 3000, pointsPerStage: 5 }, ...DEFAULT_TUNING.exp.realms.slice(1)] } });
    expect(expToNext(0, 1)).toBe(3000);
    expect(before).toBe(1000);
    setTuning({ breakthrough: { ...DEFAULT_TUNING.breakthrough, failExpLoss: 0.5, steps: DEFAULT_TUNING.breakthrough.steps.map((s) => ({ ...s, cost: 1 })) } });
    expect(getBreakthrough(0)!.cost).toBe(1);
    expect(getBreakthrough(0)!.pill).toBe("bt_pill_1");
    expect(breakthroughFailExpLoss()).toBe(0.5);
    setTuning({ paths: { swapCostBase: 1, dropCostBase: 7 } });
    expect(pathDropCost({ main: null, subs: ["kiem"] }, "kiem")).toBe(7);
    setTuning({ pvp: { ...DEFAULT_TUNING.pvp, protectedBelow: { realm: 0, stage: 2 }, nameTiers: { yellowFrom: 1, orangeFrom: 50, redFrom: 100 }, hero: { ...DEFAULT_TUNING.pvp.hero, tier1: 10, bonus1: { mpPct: 9, dropPct: 1 } } } });
    expect(isPkProtected(0, 2)).toBe(false);
    expect(isPkProtected(0, 1)).toBe(true);
    expect(nameTier(60)).toBe(2);
    expect(nameTier(100)).toBe(3);
    expect(heroBonus(10)).toEqual({ mpPct: 9, dropPct: 1 });
    setTuning({ boss: { claimTtlMs: 60_000, tier: 5, species: { forest: "quy_vuong" } } });
    expect(bossKind("forest")).toBe("quy_vuong");
    expect(bossKind("cave")).toBeNull();
    expect(bossKinds()).toEqual(["quy_vuong"]);
    expect(bossTier()).toBe(5);
  });

  it("a broken group (a class chance over 1, a boss pointing nowhere valid) keeps its default", () => {
    setTuning({ monsters: { species: DEFAULT_TUNING.monsters.species, ranks: { ...DEFAULT_TUNING.monsters.ranks, rare1: { ...DEFAULT_TUNING.monsters.ranks.rare1, chance: 2 } } } });
    expect(rankDef("rare1").chance).toBe(DEFAULT_TUNING.monsters.ranks.rare1.chance);
    setTuning({ breakthrough: { ...DEFAULT_TUNING.breakthrough, steps: DEFAULT_TUNING.breakthrough.steps.slice(0, 2) } });
    expect(getBreakthrough(2)!.cost).toBe(500_000);
  });

  it("fighting basics, root rolls and path bonuses", () => {
    expect(expLostOnDeath(1000)).toBe(100);
    setTuning({ combat: { ...DEFAULT_TUNING.combat, deathExpLoss: 0.5, hpRegenDelayMs: 1000, mpRegenPerS: 0.1, monsterCurve: { ...DEFAULT_TUNING.combat.monsterCurve, hpBase: 600 } } });
    expect(expLostOnDeath(1000)).toBe(500);
    expect(regenDelayMs()).toBe(1000);
    expect(mpRegenPerS()).toBe(0.1);
    expect(monsterStats(getMonsterDef("soi_rung")!, 0, 1, "normal").maxHp).toBe(600);
    resetTuning();
    // Weights that do not add up to 100 still give every grade its share; a grade with weight 0 never rolls.
    setTuning({ roots: { ...DEFAULT_TUNING.roots, grades: DEFAULT_TUNING.roots.grades.map((g, i) => ({ ...g, weight: i === 4 ? 1 : 0 })), counts: DEFAULT_TUNING.roots.counts.map((c, i) => ({ ...c, weight: i === 2 ? 3 : 0 })) } });
    expect(rootGradeFromRoll(0)).toBe(4);
    expect(rootGradeFromRoll(99)).toBe(4);
    expect(rootCountFromRoll(50)).toBe(3);
    expect(getRootGrade(4).nameVi).toBe(ROOT_GRADES[4]!.nameVi);
    resetTuning();
    expect(rootGradeFromRoll(0)).toBe(0);
    expect(rootGradeFromRoll(99)).toBe(4);
    setTuning({ pathBonuses: { ...DEFAULT_TUNING.pathBonuses, kiem: { ...DEFAULT_TUNING.pathBonuses.kiem!, attackPct: 99 } } });
    expect(pathBonusOf("kiem").attackPct).toBe(99);
    expect(pathBonuses({ main: "kiem", subs: [] }).attackPct).toBe(99);
    expect(pathBonusOf("dan").masteryPct).toBe(25);
  });
});

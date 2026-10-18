import { describe, expect, it } from "vitest";
import { SPIRITUAL_ROOTS } from "./character";
import { computeDamage, expForKill, expLostOnDeath, isMonsterId, topContributor } from "./combat";
import { MOVE_BUDGET_CAP, MOVE_BUDGET_REFILL_PER_S, spendMoveBudget } from "./movement";
import { parseClientMessage } from "./protocol";
import {
  bestElementVs,
  parseRoots,
  rollRoots,
  rootCountFromRoll,
  applyExp,
  deriveStats,
  elementMultiplier,
  expCap,
  expToNext,
  getRootGrade,
  killsToNext,
  monsterBaseExp,
  levelIndex,
  parseAllocation,
  rootGradeFromRoll,
  startingStats,
} from "./progression";
import { REALMS, ROOT_COUNTS, ROOT_GRADES, STAGES_PER_REALM, STAT_KEYS, STARTING_POTENTIAL_POINTS } from "./progression-data";

const fresh = { realm: 0, stage: 1, exp: 0, potentialPoints: 0 };

describe("realm tables", () => {
  it("has four realms with nine stages each, in order", () => {
    expect(REALMS.map((r) => r.nameVi)).toEqual(["Luyện Khí", "Trúc Cơ", "Kim Đan", "Nguyên Anh"]);
    expect(REALMS.map((r) => r.id)).toEqual([0, 1, 2, 3]);
    expect(STAGES_PER_REALM).toBe(9);
  });

  it("EXP needed strictly increases across every stage and realm", () => {
    let prev = 0;
    for (let r = 0; r < REALMS.length; r++) {
      for (let s = 1; s <= STAGES_PER_REALM; s++) {
        const need = expToNext(r, s);
        expect(need).toBeGreaterThan(prev);
        prev = need;
      }
    }
  });

  it("level index is flat across realms", () => {
    expect(levelIndex(0, 1)).toBe(0);
    expect(levelIndex(0, 9)).toBe(8);
    expect(levelIndex(1, 1)).toBe(9);
    expect(levelIndex(3, 9)).toBe(35);
  });
});

describe("applyExp", () => {
  it("keeps partial EXP below the threshold", () => {
    const r = applyExp(fresh, expToNext(0, 1) - 1);
    expect(r).toMatchObject({ stage: 1, exp: expToNext(0, 1) - 1, potentialPoints: 0, stagesGained: 0 });
  });

  it("advances one stage, carries the remainder and grants points", () => {
    const r = applyExp(fresh, expToNext(0, 1) + 7);
    expect(r).toMatchObject({ realm: 0, stage: 2, exp: 7, potentialPoints: REALMS[0]!.pointsPerStage, stagesGained: 1 });
  });

  it("advances several stages from one large gain", () => {
    const gain = expToNext(0, 1) + expToNext(0, 2) + expToNext(0, 3);
    const r = applyExp(fresh, gain);
    expect(r).toMatchObject({ stage: 4, exp: 0, stagesGained: 3, potentialPoints: 3 * REALMS[0]!.pointsPerStage });
  });

  it("stops at stage 9 and caps EXP (need plus the overflow) instead of entering the next realm", () => {
    const r = applyExp(fresh, 1e12);
    expect(r.realm).toBe(0);
    expect(r.stage).toBe(STAGES_PER_REALM);
    expect(r.exp).toBe(expCap(0, STAGES_PER_REALM));
    expect(r.exp).toBeGreaterThan(expToNext(0, STAGES_PER_REALM));
    expect(r.stagesGained).toBe(STAGES_PER_REALM - 1);
    expect(r.potentialPoints).toBe((STAGES_PER_REALM - 1) * REALMS[0]!.pointsPerStage);
    expect(applyExp(r, 1000).stagesGained).toBe(0);
  });

  it("ignores negative and fractional gains", () => {
    expect(applyExp(fresh, -50).exp).toBe(0);
    expect(applyExp(fresh, 10.9).exp).toBe(10);
  });
});

describe("starting stats", () => {
  it("favours one stat per root and grants the starting points", () => {
    for (const root of SPIRITUAL_ROOTS) {
      const { base, potentialPoints } = startingStats(root, 0);
      const values = STAT_KEYS.map((k) => base[k]).sort();
      expect(values).toEqual([5, 5, 5, 5, 5, 7]);
      expect(potentialPoints).toBe(STARTING_POTENTIAL_POINTS);
    }
  });
});

describe("deriveStats", () => {
  const base = startingStats("kim", 0).base;

  it("grows with stats and with cultivation level", () => {
    const low = deriveStats(base, 0, 1, 0);
    expect(deriveStats({ ...base, canCot: base.canCot + 10 }, 0, 1, 0).maxHp).toBeGreaterThan(low.maxHp);
    expect(deriveStats({ ...base, linhLuc: base.linhLuc + 10 }, 0, 1, 0).attack).toBeGreaterThan(low.attack);
    expect(deriveStats(base, 1, 1, 0).maxHp).toBeGreaterThan(deriveStats(base, 0, 9, 0).maxHp);
  });

  it("caps rates", () => {
    const d = deriveStats({ ...base, thanThuc: 9999, thanPhap: 9999, phucDuyen: 9999 }, 0, 1, 0);
    expect(d.critRate).toBe(60);
    expect(d.dodgeRate).toBe(60);
    expect(d.dropBonus).toBe(60);
  });
});

describe("parseAllocation", () => {
  it("accepts known stat keys with positive integers and drops zeros", () => {
    expect(parseAllocation({ canCot: 2, linhLuc: 3, ngoTinh: 0 })).toEqual({ canCot: 2, linhLuc: 3 });
  });

  it.each([
    [{}],
    [{ canCot: 0 }],
    [{ canCot: -1 }],
    [{ canCot: 1.5 }],
    [{ canCot: "2" }],
    [{ canCot: 201 }],
    [{ hacker: 5 }],
    [[1, 2]],
    [null],
    ["canCot"],
  ])("rejects %j", (raw) => {
    expect(parseAllocation(raw)).toBeNull();
  });

  it("is wired into the client protocol", () => {
    expect(parseClientMessage(JSON.stringify({ t: "allocate", points: { canCot: 1 } }))).toEqual({
      t: "allocate",
      points: { canCot: 1 },
    });
    expect(parseClientMessage(JSON.stringify({ t: "allocate", points: { x: 1 } }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: "allocate" }))).toBeNull();
  });
});

describe("elementMultiplier", () => {
  it("overcoming is stronger and being overcome is weaker", () => {
    expect(elementMultiplier("kim", "moc")).toBe(1.3);
    expect(elementMultiplier("moc", "kim")).toBe(0.75);
    expect(elementMultiplier("hoa", "kim")).toBe(1.3);
    expect(elementMultiplier("thuy", "hoa")).toBe(1.3);
  });

  it("every element overcomes exactly one and is overcome by exactly one", () => {
    for (const a of SPIRITUAL_ROOTS) {
      expect(SPIRITUAL_ROOTS.filter((d) => elementMultiplier(a, d) === 1.3)).toHaveLength(1);
      expect(SPIRITUAL_ROOTS.filter((d) => elementMultiplier(a, d) === 0.75)).toHaveLength(1);
    }
  });

  it("same element is neutral and generating gives a small bonus", () => {
    expect(elementMultiplier("kim", "kim")).toBe(1);
    expect(elementMultiplier("kim", "thuy")).toBe(1.05);
  });
});

describe("root grades", () => {
  it("weights sum to 100 and every roll maps to a valid grade", () => {
    expect(ROOT_GRADES.reduce((a, g) => a + g.weight, 0)).toBe(100);
    const counts = new Array(ROOT_GRADES.length).fill(0) as number[];
    for (let roll = 0; roll < 100; roll++) {
      const g = rootGradeFromRoll(roll);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(ROOT_GRADES.length);
      counts[g]!++;
    }
    expect(counts).toEqual(ROOT_GRADES.map((g) => g.weight));
  });

  it("rarer grades are strictly better", () => {
    for (let i = 1; i < ROOT_GRADES.length; i++) {
      expect(ROOT_GRADES[i]!.expBonusPct).toBeGreaterThan(ROOT_GRADES[i - 1]!.expBonusPct);
      expect(ROOT_GRADES[i]!.bonusPoints).toBeGreaterThanOrEqual(ROOT_GRADES[i - 1]!.bonusPoints);
      expect(ROOT_GRADES[i]!.weight).toBeLessThan(ROOT_GRADES[i - 1]!.weight);
    }
  });

  it("adds starting points and EXP bonus by grade", () => {
    expect(startingStats("kim", 0).potentialPoints).toBe(STARTING_POTENTIAL_POINTS);
    expect(startingStats("kim", 4).potentialPoints).toBe(STARTING_POTENTIAL_POINTS + 6);
    const base = startingStats("kim", 0).base;
    // Two elements add nothing (the count table), so only the grade shows.
    expect(deriveStats(base, 0, 1, 0, undefined, 2).expBonus).toBe(base.ngoTinh - 10);
    expect(deriveStats(base, 0, 1, 1, undefined, 2).expBonus).toBe(base.ngoTinh + 5);
    expect(deriveStats(base, 0, 1, 4, undefined, 2).expBonus).toBe(base.ngoTinh + 50);
  });

  it("clamps unknown grades", () => {
    expect(getRootGrade(-3).id).toBe(0);
    expect(getRootGrade(99).id).toBe(4);
  });
});

describe("movement budget", () => {
  it("accepts small drift and charges it", () => {
    const r = spendMoveBudget(MOVE_BUDGET_CAP, 0, 1, 3);
    expect(r).toEqual({ accepted: true, budget: MOVE_BUDGET_CAP - 1 });
  });

  it("refuses a claim larger than the per-claim limit or the budget, and does not charge it", () => {
    expect(spendMoveBudget(MOVE_BUDGET_CAP, 0, 3.5, 3).accepted).toBe(false);
    const r = spendMoveBudget(0.5, 0, 1, 3);
    expect(r).toEqual({ accepted: false, budget: 0.5 });
  });

  it("refills with time up to the cap", () => {
    expect(spendMoveBudget(0, 1000, 0, 3).budget).toBeCloseTo(MOVE_BUDGET_REFILL_PER_S);
    expect(spendMoveBudget(0, 60_000, 0, 3).budget).toBe(MOVE_BUDGET_CAP);
  });

  it("chained claims cannot beat the refill rate", () => {
    // One claim of 1 tile every 100 ms for 10 s: only the cap plus refill can be accepted.
    let budget = MOVE_BUDGET_CAP;
    let granted = 0;
    for (let i = 0; i < 100; i++) {
      const r = spendMoveBudget(budget, 100, 1, 3);
      budget = r.budget;
      if (r.accepted) granted += 1;
    }
    expect(granted).toBeLessThanOrEqual(MOVE_BUDGET_CAP + 10 * MOVE_BUDGET_REFILL_PER_S + 1);
  });
});

describe("combat formulas", () => {
  const att = { attack: 20, defense: 5, critRate: 0, dodgeRate: 0, element: "kim" as const };
  const def = { attack: 5, defense: 20, critRate: 0, dodgeRate: 0, element: "tho" as const };

  it("defense reduces damage and the minimum is 1", () => {
    const hi = computeDamage(att, { ...def, defense: 0 }, () => 0.5);
    const lo = computeDamage(att, { ...def, defense: 100 }, () => 0.5);
    expect(hi.damage).toBeGreaterThan(lo.damage);
    expect(computeDamage({ ...att, attack: 0 }, def, () => 0.5).damage).toBe(1);
  });

  it("element advantage multiplies damage", () => {
    const neutral = computeDamage(att, { ...def, element: "kim" }, () => 0.5).damage;
    const strong = computeDamage(att, { ...def, element: "moc" }, () => 0.5).damage;
    const weak = computeDamage(att, { ...def, element: "hoa" }, () => 0.5).damage;
    expect(strong).toBeGreaterThan(neutral);
    expect(weak).toBeLessThan(neutral);
  });

  it("dodge and crit follow the injected rolls", () => {
    const dodger = { ...def, dodgeRate: 50 };
    expect(computeDamage(att, dodger, () => 0.1).kind).toBe("miss");
    expect(computeDamage(att, dodger, () => 0.9).kind).toBe("hit");
    const crit = { ...att, critRate: 50 };
    const seq = [0.99, 0.1, 0.5]; // no dodge, crit roll passes, spread
    let i = 0;
    const r = computeDamage(crit, def, () => seq[i++ % seq.length]!);
    expect(r.kind).toBe("crit");
    expect(r.damage).toBeGreaterThan(computeDamage(att, def, () => 0.5).damage);
  });

  it("EXP for a kill scales by the bonus and death costs a tenth of the EXP", () => {
    expect(expForKill(100, 0)).toBe(100);
    expect(expForKill(100, 50)).toBe(150);
    expect(expForKill(100, -10)).toBe(90);
    expect(expLostOnDeath(55)).toBe(5);
    expect(expLostOnDeath(-5)).toBe(0);
  });

  it("only m<digits> is a valid monster id", () => {
    expect(isMonsterId("m12")).toBe(true);
    for (const bad of ["12", "m", "m1x", "mm1", "", 5, null, "m1234567"]) expect(isMonsterId(bad)).toBe(false);
    expect(parseClientMessage(JSON.stringify({ t: "attack", id: "m3" }))).toEqual({ t: "attack", id: "m3" });
    expect(parseClientMessage(JSON.stringify({ t: "attack", id: "../x" }))).toBeNull();
  });
});

describe("kill pace", () => {
  it("matches the agreed examples and grows with level", () => {
    expect(killsToNext(0, 1)).toBe(30);
    expect(Math.abs(killsToNext(0, 5) - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(killsToNext(1, 2) - 100)).toBeLessThanOrEqual(3);
    let prev = 0;
    for (let r = 0; r < REALMS.length; r++) {
      for (let s = 1; s <= STAGES_PER_REALM; s++) {
        const k = killsToNext(r, s);
        expect(k).toBeGreaterThan(prev);
        prev = k;
      }
    }
  });

  it("monster EXP times kills lands on the stage EXP (within rounding)", () => {
    for (let r = 0; r < REALMS.length; r++) {
      for (let s = 1; s <= STAGES_PER_REALM; s++) {
        const total = monsterBaseExp(r, s) * killsToNext(r, s);
        expect(Math.abs(total - expToNext(r, s)) / expToNext(r, s)).toBeLessThan(0.02);
      }
    }
  });
});

describe("topContributor (rare monster reward)", () => {
  const maxHp = 70;
  const present = () => true;

  it("a small contributor who lands the last hit can beat a bigger damage dealer (the agreed 20/70 + kill = 50% example)", () => {
    const damage = new Map([["a", 30], ["b", 20]]); // a: 30/70 x 0.7 = 0.30, b: 20/70 x 0.7 + 0.3 = 0.50
    expect(topContributor(damage, maxHp, "b", present)).toBe("b");
  });

  it("a big enough lead beats the last-hit bonus", () => {
    const damage = new Map([["a", 50], ["b", 20]]); // a: 0.5 + 0 = 0.50 vs b: 0.2 + 0.3 = 0.50 -> tie goes to the killer
    expect(topContributor(damage, maxHp, "b", present)).toBe("b");
    const clearer = new Map([["a", 51], ["b", 19]]); // a just above b
    expect(topContributor(clearer, maxHp, "b", present)).toBe("a");
  });

  it("an absent top contributor passes the reward to the next-highest present player", () => {
    const damage = new Map([["a", 40], ["b", 20], ["c", 10]]);
    expect(topContributor(damage, maxHp, "c", (id) => id !== "a")).toBe("c"); // c: 0.1 + 0.3 = 0.4 > b 0.2
    expect(topContributor(damage, maxHp, "b", (id) => id !== "a" && id !== "b")).toBe("c");
    expect(topContributor(damage, maxHp, "b", () => false)).toBeNull();
  });

  it("the killer counts even without recorded damage, and damage is capped at the monster's HP", () => {
    expect(topContributor(new Map(), maxHp, "k", present)).toBe("k");
    expect(topContributor(new Map([["a", 500]]), maxHp, "k", present)).toBe("a"); // 0.7 vs 0.3
  });
});

describe("spiritual root count (đơn, song, tam, tứ, ngũ linh căn)", () => {
  it("rolls with the configured shares: 20, 48, 25, 5, 2 out of 100", () => {
    const counts = Array.from({ length: 100 }, (_, roll) => rootCountFromRoll(roll));
    for (const [n, expected] of [[1, 20], [2, 48], [3, 25], [4, 5], [5, 2]] as const) expect(counts.filter((c) => c === n).length).toBe(expected);
    expect(ROOT_COUNTS.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    expect(rootCountFromRoll(1000)).toBe(5);
  });

  it("changes the pace of cultivation, by the table, on top of the grade", () => {
    const base = startingStats("kim", 0).base;
    const pace = (grade: number, count: number) => deriveStats(base, 0, 1, grade, undefined, count).expBonus - base.ngoTinh;
    expect([1, 2, 3, 4, 5].map((n) => pace(1, n) - 5)).toEqual([10, 0, -15, -30, -40]);
    expect(pace(4, 5)).toBe(10); // a five-element root of the highest grade: -40% + 50%
    expect(pace(0, 1)).toBe(0); // a single element of the lowest grade: +10% - 10%
  });

  it("does not change damage: only the grade has a damage share", () => {
    expect(ROOT_GRADES.map((g) => g.elementDamagePct)).toEqual([0, 5, 10, 20, 30]);
    expect(ROOT_GRADES.map((g) => g.expBonusPct)).toEqual([-10, 5, 15, 30, 50]);
    expect(ROOT_GRADES.map((g) => g.bonusPoints)).toEqual([0, 1, 2, 4, 6]);
  });

  it("picks that many distinct elements, the first being the main one", () => {
    expect(rollRoots(1, [3])).toEqual(["hoa"]);
    expect(rollRoots(2, [0, 0])).toEqual(["kim", "moc"]);
    expect(rollRoots(3, [4, 4, 4])).toEqual(["tho", "kim", "thuy"]);
    const five = rollRoots(5, [9, 9, 9, 9, 9]);
    expect(new Set(five).size).toBe(5);
    for (let n = 1; n <= 5; n++) expect(new Set(rollRoots(n, [7, 13, 21, 5, 2])).size).toBe(n);
    expect(rollRoots(9, [0, 0, 0, 0, 0, 0])).toHaveLength(5); // never more than the five
  });

  it("reads the stored list, and an older character without one is a single root", () => {
    expect(parseRoots("hoa,thuy", "kim")).toEqual(["hoa", "thuy"]);
    expect(parseRoots("", "kim")).toEqual(["kim"]);
    expect(parseRoots(null, "tho")).toEqual(["tho"]);
    expect(parseRoots("hoa,hoa,bogus", "kim")).toEqual(["hoa"]);
  });

  it("fights with the best element against the defender", () => {
    // kim overcomes moc (x1.3), moc is overcome by kim, hoa is overcome by thuy.
    expect(bestElementVs(["thuy", "kim"], "moc")).toBe("kim");
    expect(bestElementVs(["thuy", "hoa"], "hoa")).toBe("thuy");
    expect(bestElementVs(["hoa"], "thuy")).toBe("hoa"); // the only one, even if bad
    expect(bestElementVs(["kim", "kim"], "hoa")).toBe("kim"); // equal: the first
    expect(bestElementVs(["moc", "tho"], "tho")).toBe("moc"); // moc overcomes tho
  });
});

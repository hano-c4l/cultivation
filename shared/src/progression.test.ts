import { describe, expect, it } from "vitest";
import { SPIRITUAL_ROOTS } from "./character";
import { computeDamage, expForKill, expLostOnDeath, isMonsterId } from "./combat";
import { MOVE_BUDGET_CAP, MOVE_BUDGET_REFILL_PER_S, spendMoveBudget } from "./movement";
import { parseClientMessage } from "./protocol";
import {
  applyExp,
  deriveStats,
  elementMultiplier,
  expToNext,
  getRootGrade,
  levelIndex,
  parseAllocation,
  rootGradeFromRoll,
  startingStats,
} from "./progression";
import { REALMS, ROOT_GRADES, STAGES_PER_REALM, STAT_KEYS, STARTING_POTENTIAL_POINTS } from "./progression-data";

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

  it("stops at stage 9 and caps EXP instead of entering the next realm", () => {
    const r = applyExp(fresh, 1e12);
    expect(r.realm).toBe(0);
    expect(r.stage).toBe(STAGES_PER_REALM);
    expect(r.exp).toBe(expToNext(0, STAGES_PER_REALM));
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
    expect(deriveStats(base, 0, 1, 0).expBonus).toBe(base.ngoTinh - 10);
    expect(deriveStats(base, 0, 1, 4).expBonus).toBe(base.ngoTinh + 50);
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

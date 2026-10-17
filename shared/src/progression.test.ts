import { describe, expect, it } from "vitest";
import { SPIRITUAL_ROOTS } from "./character";
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
      const { base, potentialPoints } = startingStats(root);
      const values = STAT_KEYS.map((k) => base[k]).sort();
      expect(values).toEqual([5, 5, 5, 5, 5, 7]);
      expect(potentialPoints).toBe(STARTING_POTENTIAL_POINTS);
    }
  });
});

describe("deriveStats", () => {
  const base = startingStats("kim").base;

  it("grows with stats and with cultivation level", () => {
    const low = deriveStats(base, 0, 1);
    expect(deriveStats({ ...base, canCot: base.canCot + 10 }, 0, 1).maxHp).toBeGreaterThan(low.maxHp);
    expect(deriveStats({ ...base, linhLuc: base.linhLuc + 10 }, 0, 1).attack).toBeGreaterThan(low.attack);
    expect(deriveStats(base, 1, 1).maxHp).toBeGreaterThan(deriveStats(base, 0, 9).maxHp);
  });

  it("caps rates", () => {
    const d = deriveStats({ ...base, thanThuc: 9999, thanPhap: 9999, phucDuyen: 9999 }, 0, 1);
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
    const base = startingStats("kim").base;
    expect(deriveStats(base, 0, 1, 0).expBonus).toBe(base.ngoTinh - 10);
    expect(deriveStats(base, 0, 1, 4).expBonus).toBe(base.ngoTinh + 50);
  });

  it("clamps unknown grades", () => {
    expect(getRootGrade(-3).id).toBe(0);
    expect(getRootGrade(99).id).toBe(4);
  });
});

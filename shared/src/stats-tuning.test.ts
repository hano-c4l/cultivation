import { afterEach, describe, expect, it } from "vitest";
import { BASE_STAT_START, STAGES_PER_REALM, STAT_KEYS, type BaseStats } from "./progression-data";
import { deriveStats, getRootCount, getRootGrade, levelIndex, walkSpeed } from "./progression";
import { DEFAULT_TUNING, resetTuning, setTuning, validTuningGroup } from "./tuning";

afterEach(() => resetTuning());

/** The formula as it was written in code before the coefficients became tuning numbers (docs/PHASE3.md 3f). */
function oldDerive(base: BaseStats, realm: number, stage: number, rootGrade: number, gear: { maxHp?: number; attack?: number; defense?: number; critRate?: number; dodgeRate?: number; moveSpeed?: number } | undefined, rootCount: number) {
  const lv = levelIndex(realm, stage);
  const RATE_CAP = 60;
  return {
    maxHp: 100 + base.canCot * 15 + lv * 25 + (gear?.maxHp ?? 0),
    maxMp: 50 + base.linhLuc * 10 + lv * 12,
    attack: Math.floor(5 + base.linhLuc * 2 + base.canCot * 0.5 + lv * 3 + (gear?.attack ?? 0)),
    defense: Math.floor(2 + base.canCot * 1.5 + lv * 2 + (gear?.defense ?? 0)),
    critRate: Math.min(RATE_CAP, 5 + base.thanThuc * 0.5 + (gear?.critRate ?? 0)),
    dodgeRate: Math.min(RATE_CAP, base.thanPhap * 0.5 + (gear?.dodgeRate ?? 0)),
    expBonus: Math.max(-50, base.ngoTinh + getRootGrade(rootGrade).expBonusPct + getRootCount(rootCount).expBonusPct),
    dropBonus: Math.min(RATE_CAP, base.phucDuyen * 0.5),
    moveSpeed: walkSpeed(base, gear?.moveSpeed ?? 0),
  };
}

describe("the stats tuning", () => {
  it("gives exactly the old formula with the default numbers, over many characters and gear", () => {
    const stats = [BASE_STAT_START, 12, 40, 200];
    for (const c of stats)
      for (const l of stats)
        for (const t of [5, 90]) {
          const base = Object.fromEntries(STAT_KEYS.map((k, i) => [k, [c, l, t, 7, 31, 150][i % 6]])) as unknown as BaseStats;
          for (let realm = 0; realm < 4; realm++)
            for (const stage of [1, 5, STAGES_PER_REALM])
              for (const grade of [0, 2, 4])
                for (const roots of [1, 3, 5])
                  for (const gear of [undefined, { maxHp: 300, attack: 40.7, defense: 22, critRate: 30, dodgeRate: 50, moveSpeed: 20 }]) {
                    expect(deriveStats(base, realm, stage, grade, gear, roots)).toEqual(oldDerive(base, realm, stage, grade, gear, roots));
                  }
        }
  });

  it("follows a changed coefficient and cap at once", () => {
    const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 10])) as unknown as BaseStats;
    const before = deriveStats(base, 0, 1, 0);
    setTuning({ stats: { ...DEFAULT_TUNING.stats, maxHp: { base: 200, perCanCot: 15, perLevel: 25 }, rateCap: 20 } });
    const after = deriveStats(base, 0, 1, 0);
    expect(after.maxHp).toBe(before.maxHp + 100);
    expect(deriveStats({ ...base, thanThuc: 400 }, 0, 1, 0).critRate).toBe(20);
  });

  it("is valid only with non-negative numbers, a cap up to 100 and every part present", () => {
    expect(validTuningGroup("stats", DEFAULT_TUNING.stats)).toBe(true);
    expect(validTuningGroup("stats", { ...DEFAULT_TUNING.stats, rateCap: 101 })).toBe(false);
    expect(validTuningGroup("stats", { ...DEFAULT_TUNING.stats, maxMp: { base: -1, perLinhLuc: 10, perLevel: 12 } })).toBe(false);
    const { dropBonus: _drop, ...missing } = DEFAULT_TUNING.stats;
    expect(validTuningGroup("stats", missing)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { getItemDef } from "./items";
import {
  MAX_SUB_PATHS,
  afterDrop,
  afterSwap,
  allPathSkills,
  pathDropCost,
  pathLevel,
  pathLevelName,
  pathLevelReady,
  pathSkillsUpTo,
  pathSwapCost,
  PATHS,
  PATH_EXP_K,
  PATH_IDS,
  pathSubFactor,
  checkPathChoice,
  nextPathSlot,
  parsePaths,
  pathBonuses,
  pathCost,
  pathExpFactor,
  pathRole,
  pathSkillDamagePct,
  serializePaths,
  skillContextFor,
  withPaths,
  type PathState,
} from "./paths";
import { parseClientMessage } from "./protocol";
import { effectiveSkill, getSkill, availableSkills } from "./skills";

const state = (main: PathState["main"], ...subs: PathState["subs"]): PathState => ({ main, subs });

describe("path state", () => {
  it("round-trips through its stored form and ignores anything malformed", () => {
    expect(serializePaths(state("kiem", "dan"))).toBe("kiem:dan");
    expect(parsePaths("kiem:dan:thuat")).toEqual(state("kiem", "dan", "thuat"));
    expect(parsePaths("")).toEqual(state(null));
    expect(parsePaths("bogus:dan")).toEqual(state(null));
    expect(parsePaths("kiem:kiem:dan:thuat:extra")).toEqual(state("kiem", "dan", "thuat"));
    expect(parsePaths(null)).toEqual(state(null));
  });

  it("the first path is the chủ tu, the next two are phụ tu, then it is full", () => {
    expect(nextPathSlot(state(null), "kiem")).toBe(0);
    expect(nextPathSlot(state("kiem"), "dan")).toBe(1);
    expect(nextPathSlot(state("kiem", "dan"), "thuat")).toBe(2);
    expect(nextPathSlot(state("kiem", "dan", "thuat"), "kiem")).toBeNull();
    expect(MAX_SUB_PATHS).toBe(2);
    expect(pathRole(state("kiem", "dan"), "kiem")).toBe("main");
    expect(pathRole(state("kiem", "dan"), "dan")).toBe("sub");
    expect(pathRole(state("kiem", "dan"), "thuat")).toBeNull();
  });

  it("needs Trúc Cơ, refuses a path already taken and a third phụ tu", () => {
    expect(checkPathChoice(state(null), "kiem", 0)).toBe("level");
    expect(checkPathChoice(state(null), "kiem", 1)).toBeNull();
    expect(checkPathChoice(state("kiem"), "kiem", 1)).toBe("have");
    expect(checkPathChoice(state("kiem", "dan"), "dan", 1)).toBe("have");
  });

  it("costs Linh Thạch only for a phụ tu, more for the second", () => {
    expect(pathCost(state(null))).toBe(0);
    expect(pathCost(state("kiem"))).toBeGreaterThan(0);
    expect(pathCost(state("kiem", "dan"))).toBeGreaterThan(pathCost(state("kiem")));
  });
});

describe("path bonuses", () => {
  it("a phụ tu gives pathSubFactor() of what the chủ tu gives", () => {
    const main = pathBonuses(state("kiem"));
    const sub = pathBonuses(state("thuat", "kiem"));
    expect(main.attackPct).toBe(PATHS.kiem.bonus.attackPct);
    expect(sub.attackPct).toBe(PATHS.kiem.bonus.attackPct * pathSubFactor());
    expect(sub.maxMpPct).toBe(PATHS.thuat.bonus.maxMpPct); // thuat is the chủ tu there
    expect(pathBonuses(state(null)).attackPct).toBe(0);
  });

  it("each path gives what its description says", () => {
    expect(PATHS.kiem.bonus.attackPct).toBeGreaterThan(0);
    expect(PATHS.kiem.bonus.weaponSkillPct).toBeGreaterThan(0);
    expect(PATHS.thuat.bonus.maxMpPct).toBeGreaterThan(0);
    expect(PATHS.thuat.bonus.elementSkillPct).toBeGreaterThan(0);
    expect(PATHS.dan.bonus.potionHealPct).toBeGreaterThan(0);
    expect(PATHS.dan.bonus.masteryPct).toBeGreaterThan(0);
  });

  it("the EXP factor is 1 / (1 + k · phụ tu)", () => {
    expect(pathExpFactor(state(null))).toBe(1);
    expect(pathExpFactor(state("kiem"))).toBe(1);
    expect(pathExpFactor(state("kiem", "dan"))).toBeCloseTo(1 / (1 + PATH_EXP_K), 6);
    expect(pathExpFactor(state("kiem", "dan", "thuat"))).toBeCloseTo(1 / (1 + 2 * PATH_EXP_K), 6);
  });

  it("withPaths adds the stats and changes the shown EXP bonus to match the factor", () => {
    const d = { attack: 100, defense: 50, maxMp: 200, expBonus: 10 };
    const kiem = withPaths(d, state("kiem"));
    expect(kiem.attack).toBe(110);
    expect(kiem.maxMp).toBe(200);
    expect(withPaths(d, state("thuat")).maxMp).toBe(240);
    expect(withPaths(d, state("dan")).defense).toBe(54);
    // 1.10 x 0.8 = 0.88 -> -12%
    expect(withPaths(d, state("kiem", "dan")).expBonus).toBe(Math.round((1.1 * (1 / 1.25) - 1) * 100));
    expect(withPaths(d, state(null))).toEqual(d);
  });

  it("skill damage: weapon-family skills need a kiếm in hand, element skills need no weapon", () => {
    const chuong = getSkill("chuong_0")!; // an attack with no weapon requirement
    const sword = getSkill("ngu_kiem_tram")!; // needs kiem
    expect(pathSkillDamagePct(state("kiem"), chuong, null)).toBe(0);
    expect(pathSkillDamagePct(state("kiem"), chuong, "kiem")).toBe(PATHS.kiem.bonus.weaponSkillPct);
    expect(pathSkillDamagePct(state("kiem"), sword, "kiem")).toBe(PATHS.kiem.bonus.weaponSkillPct);
    expect(pathSkillDamagePct(state("thuat"), chuong, null)).toBe(PATHS.thuat.bonus.elementSkillPct);
    expect(pathSkillDamagePct(state("thuat"), sword, "kiem")).toBe(0); // a weapon skill is not an element skill
    expect(pathSkillDamagePct(state("thuat"), getSkill("hoi_0")!, null)).toBe(0); // not an attack
  });
});

describe("path skills and items", () => {
  it("every path has two skills of source path and an item", () => {
    for (const id of PATH_IDS) {
      for (const s of PATHS[id].levels.flatMap((l) => [...l.skills])) {
        const def = getSkill(s);
        expect(def?.source).toBe("path");
        expect(def?.path).toBe(id);
      }
      expect(getItemDef(PATHS[id].item)?.pathItem).toBe(id);
    }
  });

  it("a granted path skill is available", () => {
    expect(availableSkills(["kt_kiem_khi"])).toContain("kt_kiem_khi");
  });

  it("a phụ tu skill is weaker than the chủ tu's, and both follow the character's realm", () => {
    const def = getSkill("kt_kiem_khi")!;
    const main = effectiveSkill(def, skillContextFor(def, { rootGrade: 1, realm: 1, level: 0, paths: state("kiem") }));
    const sub = effectiveSkill(def, skillContextFor(def, { rootGrade: 1, realm: 1, level: 0, paths: state("thuat", "kiem") }));
    expect(sub.power).toBeCloseTo(main.power * pathSubFactor(), 6);
    const higher = effectiveSkill(def, skillContextFor(def, { rootGrade: 1, realm: 2, level: 0, paths: state("kiem") }));
    expect(higher.power).toBeGreaterThan(main.power);
  });
});

describe("path messages", () => {
  it("are validated", () => {
    expect(parseClientMessage('{"t":"path_claim","path":"kiem"}')).toEqual({ t: "path_claim", path: "kiem" });
    expect(parseClientMessage('{"t":"path_choose","path":"dan"}')).toEqual({ t: "path_choose", path: "dan" });
    expect(parseClientMessage('{"t":"path_choose","path":"bogus"}')).toBeNull();
    expect(parseClientMessage('{"t":"path_claim"}')).toBeNull();
  });
});

describe("path levels", () => {
  it("round-trip with the levels in the stored text, and malformed levels count as 0", () => {
    const s: PathState = { main: "kiem", subs: ["dan"], levels: { kiem: 2, dan: 1 } };
    expect(serializePaths(s)).toBe("kiem.2:dan.1");
    expect(parsePaths("kiem.2:dan.1")).toEqual(s);
    expect(parsePaths("kiem:dan")).toEqual({ main: "kiem", subs: ["dan"] });
    expect(parsePaths("kiem.9:dan.x")).toEqual({ main: "kiem", subs: ["dan"], levels: { kiem: PATHS.kiem.levels.length - 1 } });
    expect(pathLevel(s, "kiem")).toBe(2);
    expect(pathLevelName(s, "kiem")).toBe("Nhân Kiếm Hợp Nhất");
    expect(pathLevelName(state("dan"), "dan")).toBe("Học Đồ");
  });

  it("every level has two skills of that path and level, and a level up needs both at the top mastery level", () => {
    for (const id of PATH_IDS) {
      PATHS[id].levels.forEach((l, i) => {
        for (const sk of l.skills) {
          expect(getSkill(sk)?.path).toBe(id);
          expect(getSkill(sk)?.pathLevel).toBe(i);
        }
      });
    }
    const [a, b] = PATHS.kiem.levels[0]!.skills;
    const top = 3; // viên mãn for a grade-1 skill
    expect(pathLevelReady("kiem", 0, (sk) => (sk === a || sk === b ? top : 0))).toBe(true);
    expect(pathLevelReady("kiem", 0, (sk) => (sk === a ? top : top - 1))).toBe(false);
    expect(pathLevelReady("kiem", 0, () => undefined)).toBe(false);
    expect(pathLevelReady("kiem", PATHS.kiem.levels.length - 1, () => top)).toBe(false); // nothing above the last level
  });

  it("a path's skills up to a level include the lower levels", () => {
    expect(pathSkillsUpTo("dan", 1)).toEqual([...PATHS.dan.levels[0]!.skills, ...PATHS.dan.levels[1]!.skills]);
    expect(allPathSkills("kiem")).toHaveLength(6);
  });

  it("swapping puts the old chủ tu into the slot the phụ tu left, and keeps the levels", () => {
    const s: PathState = { main: "kiem", subs: ["dan", "thuat"], levels: { kiem: 2, dan: 1 } };
    const swapped = afterSwap(s, "thuat")!;
    expect(swapped.main).toBe("thuat");
    expect(swapped.subs).toEqual(["dan", "kiem"]);
    expect(pathLevel(swapped, "kiem")).toBe(2);
    expect(pathLevel(swapped, "dan")).toBe(1);
    expect(afterSwap(s, "kiem")).toBeNull(); // the chủ tu is not a phụ tu
    expect(afterSwap(s, "dan")!.subs).toEqual(["kiem", "thuat"]);
  });

  it("dropping the chủ tu promotes the first phụ tu; dropping a phụ tu just removes it; the dropped level is forgotten", () => {
    const s: PathState = { main: "kiem", subs: ["dan", "thuat"], levels: { kiem: 2, dan: 1 } };
    const noMain = afterDrop(s, "kiem")!;
    expect(noMain.main).toBe("dan");
    expect(noMain.subs).toEqual(["thuat"]);
    expect(pathLevel(noMain, "dan")).toBe(1);
    expect(noMain.levels?.kiem).toBeUndefined();
    expect(afterDrop(s, "thuat")).toEqual({ main: "kiem", subs: ["dan"], levels: { kiem: 2, dan: 1 } });
    expect(afterDrop(state("kiem"), "kiem")).toEqual({ main: null, subs: [] });
    expect(afterDrop(state("kiem"), "dan")).toBeNull();
  });

  it("the costs grow with the level, and dropping the chủ tu costs double", () => {
    const low = state("kiem", "dan");
    const high: PathState = { main: "kiem", subs: ["dan"], levels: { kiem: 2 } };
    expect(pathSwapCost(high, "dan")).toBeGreaterThan(pathSwapCost(low, "dan"));
    expect(pathDropCost(high, "kiem")).toBeGreaterThan(pathDropCost(low, "kiem"));
    expect(pathDropCost(low, "kiem")).toBe(pathDropCost(low, "dan") * 2);
    expect(pathDropCost({ main: "kiem", subs: ["dan"], levels: { dan: 2 } }, "dan")).toBeGreaterThan(pathDropCost(low, "dan"));
  });
});

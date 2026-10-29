import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TUNING, SKILLS, areaTargets, firstAlongLine, flightStyleOf, inArea, makeEquipmentId, resetTuning, setTuning, skillAreaOf, skillLookOf, validTuningGroup, weaponAreaOf, getSkill, type AreaDef } from "./index";

afterEach(() => resetTuning());

const mon = (id: string, x: number, y: number) => ({ id, pos: [x, y] as const });

describe("area geometry", () => {
  const arc: AreaDef = { shape: "arc", range: 2, deg: 90, maxTargets: 3, pct: 70 };
  it("an arc covers a fan in front of the origin and nothing behind it", () => {
    expect(inArea(arc, [0, 0], [1, 0], [1.5, 0.5])).toBe(true);
    expect(inArea(arc, [0, 0], [1, 0], [1.5, 1.5])).toBe(false); // 45 degrees is the edge of a 90 degree fan: just outside at that range
    expect(inArea(arc, [0, 0], [1, 0], [-1, 0])).toBe(false);
    expect(inArea(arc, [0, 0], [1, 0], [3, 0])).toBe(false); // beyond the range
  });
  it("a line covers a strip ahead, a circle a disc round the aim or round the origin", () => {
    const line: AreaDef = { shape: "line", range: 4, width: 1, maxTargets: 3, pct: 70 };
    expect(inArea(line, [0, 0], [1, 0], [3, 0.4])).toBe(true);
    expect(inArea(line, [0, 0], [1, 0], [3, 0.8])).toBe(false);
    expect(inArea(line, [0, 0], [1, 0], [-1, 0])).toBe(false);
    const aim: AreaDef = { shape: "circle", range: 2, at: "aim", maxTargets: 4, pct: 70 };
    expect(inArea(aim, [0, 0], [10, 0], [11, 1])).toBe(true);
    expect(inArea(aim, [0, 0], [10, 0], [1, 0])).toBe(false);
    expect(inArea({ ...aim, at: "self" }, [0, 0], [10, 0], [1, 0])).toBe(true);
  });
  it("the extra targets are the nearest ones, capped, never the main one, and the same on every run", () => {
    const c = [mon("a", 1, 0), mon("b", 1.2, 0.2), mon("c", 1.4, -0.2), mon("d", 1.6, 0.1), mon("far", 9, 9)];
    const picked = areaTargets({ ...arc, maxTargets: 3 }, [0, 0], [1, 0], c, "a");
    expect(picked.map((x) => x.id)).toEqual(["b", "c"]);
    expect(areaTargets({ shape: "single", range: 0, maxTargets: 1, pct: 100 }, [0, 0], [1, 0], c)).toEqual([]);
  });
  it("the first monster along a line is the nearest one in the strip", () => {
    expect(firstAlongLine([0, 0], [1, 0], 5, 1, [mon("far", 4, 0), mon("near", 2, 0.3), mon("off", 1, 2)])?.id).toBe("near");
    expect(firstAlongLine([0, 0], [1, 0], 5, 1, [mon("off", 1, 2)])).toBeUndefined();
  });
});

describe("areas, looks and flight looks in the tuning", () => {
  it("each weapon family has an area, the sword sweeps and the bow and fist do not", () => {
    expect(weaponAreaOf("kiem").shape).toBe("arc");
    expect(weaponAreaOf("thuong").shape).toBe("line");
    expect(weaponAreaOf("riu").at).toBe("self");
    expect(weaponAreaOf("cung").shape).toBe("single");
    expect(weaponAreaOf(undefined).shape).toBe("single");
    setTuning({ weaponArea: { kiem: { shape: "single", range: 0, maxTargets: 1, pct: 100 } } });
    expect(weaponAreaOf("kiem").shape).toBe("single"); // the table is data
  });
  it("skill areas go by id, then template, then gear family", () => {
    expect(skillAreaOf(getSkill("tram_2"))).toMatchObject({ shape: "arc" });
    expect(skillAreaOf(getSkill("kim_5"))).toMatchObject({ shape: "circle", range: 3 });
    expect(skillAreaOf(getSkill("chuong_1")).shape).toBe("single");
    expect(skillAreaOf({ id: "pb_kim_1" }).shape).toBe("circle");
    expect(skillAreaOf({ id: "bm_hoa" }).range).toBe(2.5);
  });
  it("every skill that can be used has a look, and a stored table from before them falls back", () => {
    for (const s of SKILLS) if (s.kind !== "passive") expect(skillLookOf(s), s.id).toBeTruthy();
    expect(skillLookOf(getSkill("tram_0")!)).toBe("slash");
    expect(skillLookOf(getSkill("bm_hoi_sinh")!)).toBe("phoenix");
    expect(skillLookOf(getSkill("kim_4")!)).toBe("spell");
    setTuning({ skillLooks: {} });
    expect(skillLookOf(getSkill("thuan_0")!)).toBe("dome");
  });
  it("a flight pháp bảo is drawn by its element, then its realm, then the default", () => {
    expect(flightStyleOf(makeEquipmentId("flight", "u", 0, 1, 1, "moc"))).toBe("lotus");
    expect(flightStyleOf(makeEquipmentId("flight", "u", 0, 1, 1, "thuy"))).toBe("cloud");
    expect(flightStyleOf(makeEquipmentId("flight", "u", 0, 1, 1))).toBe("sword");
    setTuning({ flightLooks: { default: "cloud", byRealm: { "2": "lotus" } } });
    expect(flightStyleOf(makeEquipmentId("flight", "u", 2, 1, 1))).toBe("lotus");
    expect(flightStyleOf(makeEquipmentId("flight", "u", 0, 1, 1, "kim"))).toBe("sword"); // a stored table without byElement still has the stock element looks
  });
  it("validates the new groups", () => {
    expect(validTuningGroup("weaponArea", DEFAULT_TUNING.weaponArea)).toBe(true);
    expect(validTuningGroup("skillAreas", DEFAULT_TUNING.skillAreas)).toBe(true);
    expect(validTuningGroup("skillLooks", DEFAULT_TUNING.skillLooks)).toBe(true);
    expect(validTuningGroup("flightLooks", DEFAULT_TUNING.flightLooks)).toBe(true);
    expect(validTuningGroup("weaponArea", { kiem: { shape: "cone", range: 2, maxTargets: 3, pct: 70 } })).toBe(false);
    expect(validTuningGroup("weaponArea", { kiem: { shape: "arc", range: 2, maxTargets: 0, pct: 70 } })).toBe(false);
    expect(validTuningGroup("skillLooks", { tram: "explode" })).toBe(false);
    expect(validTuningGroup("flightLooks", { default: "sword", byElement: { kim: "jetpack" } })).toBe(false);
  });
});

import { getMap, getMonsterDef, startingStats, type Vec2 } from "@game/shared";
import { describe, expect, it } from "vitest";
import { CombatSim, type ProfileSeed, type SimEvent } from "./combat-sim";

const noCrit = () => 0.99;
const seed = (over: Partial<ProfileSeed> = {}): ProfileSeed => ({
  id: "p1",
  granted: ["chuong_0", "tram_0", "kim_3"],
  name: "p1",
  potentialPoints: 5,
  element: "kim",
  base: startingStats("kim", 0).base,
  rootGrade: 1,
  constitution: "pham_the",
  constitutionTier: 1,
  gender: "male",
  realm: 0,
  stage: 1,
  exp: 0,
  ...over,
});

interface Mon { id: string; path: Vec2[]; hp: number; maxHp: number; guard?: boolean; state: string; boss?: boolean }

/** A forest sim with every monster moved far away, so a test places the few it needs where it wants them. */
function bare() {
  const sim = new CombatSim(getMap("forest"), "forest", noCrit, 0);
  for (const s of sim.snapshots(0)) sim.setMonsterElement(s.id, getMonsterDef(s.kind)!.element);
  const mons = (sim as unknown as { monsters: Map<string, Mon> }).monsters;
  const all = [...mons.values()].filter((m) => !m.guard);
  all.forEach((m, i) => (m.path = [[1, 1 + i * 3]]));
  for (const g of [...mons.values()].filter((m) => m.guard)) g.path = [[2, 1]];
  const place = (i: number, at: Vec2): Mon => {
    const m = all[i]!;
    m.path = [at];
    return m;
  };
  return { sim, mons, place, all };
}

const hitsOf = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { t: "hit" }> => e.t === "hit" && e.from === "p1");
const player = (sim: CombatSim, over: Partial<ProfileSeed> = {}, weapon?: string) => {
  const p = sim.addPlayer(seed(over));
  if (weapon) p.weapon = weapon;
  return p;
};

describe("a plain attack sweeps the weapon's area", () => {
  it("a sword hits the monsters in its arc in front, and not the one behind the wielder", () => {
    const { sim, place } = bare();
    player(sim, {}, "kiem");
    const a = place(0, [20, 20]);
    const inArc = place(1, [20.4, 20.9]); // beside the main target, within the sweep
    const behind = place(2, [18.4, 20]); // behind the wielder (who stands at 19, 20)
    sim.setTarget("p1", a.id);
    const hits = hitsOf(sim.tick(0, new Map([["p1", [19, 20]]])));
    expect(hits.map((h) => h.to).sort()).toEqual([a.id, inArc.id].sort());
    expect(hits.find((h) => h.to === a.id)?.aoe).toBeUndefined();
    expect(hits.find((h) => h.to === inArc.id)?.aoe).toBe(true);
    expect(behind.hp).toBe(behind.maxHp);
  });

  it("an extra target takes a share of the damage, and a single-target weapon hits only the target", () => {
    const { sim, place } = bare();
    const p = player(sim, {}, "kiem");
    const a = place(0, [20, 20]);
    const b = place(1, [20, 21]);
    sim.setTarget("p1", a.id);
    const [hitA, hitB] = hitsOf(sim.tick(0, new Map([["p1", [19, 20]]])));
    expect(hitB!.damage).toBeLessThan(hitA!.damage);
    const fist = bare();
    player(fist.sim, {}, "quyen");
    const a2 = fist.place(0, [20, 20]);
    fist.place(1, [20, 21]);
    fist.sim.setTarget("p1", a2.id);
    expect(hitsOf(fist.sim.tick(0, new Map([["p1", [19, 20]]])))).toHaveLength(1);
    expect(p.nextAttackAt).toBeGreaterThan(0); // one swing, one cooldown
  });

  it("a guard in the sweep is spared while the player cannot attack guards", () => {
    const { sim, place, mons } = bare();
    player(sim, {}, "kiem");
    const a = place(0, [20, 20]);
    const guard = [...mons.values()].find((m) => m.guard)!;
    guard.path = [[20, 21]];
    sim.setTarget("p1", a.id);
    const hits = hitsOf(sim.tick(0, new Map([["p1", [19, 20]]])));
    expect(hits.map((h) => h.to)).toEqual([a.id]);
    expect(guard.hp).toBe(guard.maxHp);
  });

  it("a monster killed by the swing does not stop the others from being struck, and nothing is struck twice", () => {
    const { sim, place } = bare();
    player(sim, {}, "kiem");
    const a = place(0, [20, 20]);
    const weak = place(1, [20, 21]);
    const c = place(2, [20.2, 20.9]);
    weak.hp = 1;
    sim.setTarget("p1", a.id);
    const events = sim.tick(0, new Map([["p1", [19, 20]]]));
    const hits = hitsOf(events);
    expect(new Set(hits.map((h) => h.to)).size).toBe(hits.length);
    expect(hits.map((h) => h.to)).toEqual(expect.arrayContaining([a.id, weak.id, c.id]));
    expect(events.some((e) => e.t === "mon_gone" && e.id === weak.id)).toBe(true);
  });
});

describe("skills with an area and casts at a point", () => {
  it("an area skill hurts the monsters round the target, once, with one cooldown", () => {
    const { sim, place } = bare();
    const p = player(sim);
    const a = place(0, [20, 20]);
    const b = place(1, [21.2, 20]);
    const far = place(2, [25, 20]);
    expect(sim.queueCast("p1", "kim_3", a.id, 0)).toEqual({ ok: true });
    const events = sim.tick(0, new Map([["p1", [17, 20]]]));
    const hits = hitsOf(events);
    expect(hits.map((h) => h.to).sort()).toEqual([a.id, b.id].sort());
    expect(far.hp).toBe(far.maxHp);
    expect(events.filter((e) => e.t === "cast_ok")).toHaveLength(1);
    expect(p.cooldowns.get("kim_3")).toBeGreaterThan(0);
  });

  it("a cast at a point, with no target, hits the monsters there and sets no target", () => {
    const { sim, place } = bare();
    const p = player(sim);
    const a = place(0, [20, 20]);
    const b = place(1, [21, 20.5]);
    expect(sim.queueCast("p1", "kim_3", null, 0, [20.2, 20.2])).toEqual({ ok: true });
    const events = sim.tick(0, new Map([["p1", [17, 20]]]));
    expect(hitsOf(events).map((h) => h.to).sort()).toEqual([a.id, b.id].sort());
    expect(p.targetId).toBeNull();
    expect(events.find((e) => e.t === "fx")).toMatchObject({ skill: "kim_3", dest: [20.2, 20.2] });
  });

  it("a cast at a point where nothing stands still spends the MP and plays, and a far point is clamped to the reach", () => {
    const { sim } = bare();
    const p = player(sim);
    const mp = p.mp;
    sim.queueCast("p1", "chuong_0", null, 0, [60, 20]);
    const events = sim.tick(0, new Map([["p1", [17, 20]]]));
    expect(hitsOf(events)).toHaveLength(0);
    expect(p.mp).toBeLessThan(mp);
    const fx = events.find((e) => e.t === "fx") as Extract<SimEvent, { t: "fx" }>;
    expect(fx.dest![0]).toBeCloseTo(17 + 4, 5); // chuong_0 reaches 4 tiles
  });

  it("a skill with no area, cast along a line, hits the first monster on it", () => {
    const { sim, place } = bare();
    player(sim);
    const near = place(0, [20, 20]);
    const behind = place(1, [22, 20]);
    sim.queueCast("p1", "chuong_0", null, 0, [21, 20]);
    const hits = hitsOf(sim.tick(0, new Map([["p1", [18, 20]]])));
    expect(hits.map((h) => h.to)).toEqual([near.id]);
    expect(behind.hp).toBe(behind.maxHp);
  });
});

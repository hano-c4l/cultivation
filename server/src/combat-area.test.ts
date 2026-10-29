import { getMap, getMonsterDef, startingStats, type Vec2 } from "@game/shared";
import { describe, expect, it } from "vitest";
import { CombatSim, type ProfileSeed, type SimEvent } from "./combat-sim";

const noCrit = () => 0.99;
const seed = (over: Partial<ProfileSeed> = {}): ProfileSeed => ({
  id: "p1",
  granted: ["chuong_0", "tram_0", "kim_3", "kim_4", "moc_3", "hoa_3", "moc_4", "khi_co_ban"],
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
  p.maxMp = p.mp = 999; // the book skills are dear: these tests are about where they fall, not about the cost
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
    expect(sim.queueCast("p1", "moc_3", a.id, 0)).toEqual({ ok: true });
    const events = sim.tick(0, new Map([["p1", [17, 20]]]));
    const hits = hitsOf(events);
    expect(hits.map((h) => h.to).sort()).toEqual([a.id, b.id].sort());
    expect(far.hp).toBe(far.maxHp);
    expect(events.filter((e) => e.t === "cast_ok")).toHaveLength(1);
    expect(p.cooldowns.get("moc_3")).toBeGreaterThan(0);
  });

  it("a cast at a point, with no target, hits the monsters there and sets no target", () => {
    const { sim, place } = bare();
    const p = player(sim);
    const a = place(0, [20, 20]);
    const b = place(1, [21, 20.5]);
    expect(sim.queueCast("p1", "moc_3", null, 0, [20.2, 20.2])).toEqual({ ok: true });
    const events = sim.tick(0, new Map([["p1", [17, 20]]]));
    expect(hitsOf(events).map((h) => h.to).sort()).toEqual([a.id, b.id].sort());
    expect(p.targetId).toBeNull();
    expect(events.find((e) => e.t === "fx")).toMatchObject({ skill: "moc_3", dest: [20.2, 20.2] });
  });

  it("a cast at a point out of reach first walks to just inside the reach, then falls on the point itself", () => {
    const { sim } = bare();
    const p = player(sim);
    const mp = p.mp;
    sim.queueCast("p1", "chuong_0", null, 0, [60, 20]);
    const walk = sim.tick(0, new Map([["p1", [17, 20]]]));
    expect(walk.some((e) => e.t === "fx")).toBe(false);
    expect(p.mp).toBe(mp);
    const req = walk.find((e) => e.t === "path_request") as Extract<SimEvent, { t: "path_request" }>;
    expect(req.to[0]).toBeGreaterThan(50); // towards the point, standing just inside the skill's reach of it
    expect(Math.hypot(req.to[0] - 60, req.to[1] - 20)).toBeLessThan(7);
    const events = sim.tick(600, new Map([["p1", [req.to[0], req.to[1]]]]));
    expect(hitsOf(events)).toHaveLength(0); // nothing stands there: the cast is spent
    expect(p.mp).toBeLessThan(mp);
    const fx = events.find((e) => e.t === "fx") as Extract<SimEvent, { t: "fx" }>;
    expect(fx.dest).toEqual([60, 20]);
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

describe("a fan that starts at the caster", () => {
  it("a point cast of Cuong Tram walks into the fan's reach and then hits the monster there", () => {
    const { sim, place } = bare();
    player(sim);
    const m = place(0, [27, 20]);
    sim.queueCast("p1", "tram_0", null, 0, [27, 20]);
    const walk = sim.tick(0, new Map([["p1", [20, 20]]]));
    const req = walk.find((e) => e.t === "path_request") as Extract<SimEvent, { t: "path_request" }>;
    expect(hitsOf(walk)).toHaveLength(0);
    expect(Math.hypot(req.to[0] - 27, req.to[1] - 20)).toBeLessThan(6);
    const hits = hitsOf(sim.tick(600, new Map([["p1", [req.to[0], req.to[1]]]])));
    expect(hits.map((h) => h.to)).toEqual([m.id]);
  });
});

describe("reach of the plain attack", () => {
  it("a bow shoots from far away without walking up", () => {
    const { sim, place } = bare();
    player(sim, {}, "cung");
    const a = place(0, [20, 20]);
    sim.setTarget("p1", a.id);
    const events = sim.tick(0, new Map([["p1", [14.5, 20]]]));
    expect(hitsOf(events).map((h) => h.to)).toEqual([a.id]);
    expect(events.some((e) => e.t === "path_request")).toBe(false);
  });

  it("a bow still walks up when the target is beyond its reach, and a sword when it is further than a blade", () => {
    const { sim, place } = bare();
    player(sim, {}, "cung");
    const a = place(0, [30, 20]);
    sim.setTarget("p1", a.id);
    const req = sim.tick(0, new Map([["p1", [20, 20]]])).find((e) => e.t === "path_request") as Extract<SimEvent, { t: "path_request" }>;
    expect(Math.hypot(req.to[0] - 30, req.to[1] - 20)).toBeGreaterThan(5); // stops well short, in bow range
    const sword = bare();
    player(sword.sim, {}, "kiem");
    const b = sword.place(0, [30, 20]);
    sword.sim.setTarget("p1", b.id);
    const r2 = sword.sim.tick(0, new Map([["p1", [20, 20]]])).find((e) => e.t === "path_request") as Extract<SimEvent, { t: "path_request" }>;
    expect(Math.hypot(r2.to[0] - 30, r2.to[1] - 20)).toBeLessThan(1.5);
  });

  it("a spear reaches further than a sword", () => {
    const spear = bare();
    player(spear.sim, {}, "thuong");
    const a = spear.place(0, [22.8, 20]);
    spear.sim.setTarget("p1", a.id);
    expect(hitsOf(spear.sim.tick(0, new Map([["p1", [20, 20]]]))).map((h) => h.to)).toEqual([a.id]);
    const sword = bare();
    player(sword.sim, {}, "kiem");
    const b = sword.place(0, [22.8, 20]);
    sword.sim.setTarget("p1", b.id);
    expect(hitsOf(sword.sim.tick(0, new Map([["p1", [20, 20]]])))).toHaveLength(0);
  });
});

describe("who a skill's area falls on among players and guards", () => {
  const stage5 = { stage: 5 };
  function arena(modeA: 0 | 1 | 2, modeB: 0 | 1 | 2) {
    const b = bare();
    const a = b.sim.addPlayer(seed(stage5));
    a.weapon = "kiem";
    const q = b.sim.addPlayer(seed({ id: "p2", name: "p2", stage: 5 }));
    b.sim.setPkMode("p1", modeA);
    b.sim.setPkMode("p2", modeB);
    const target = b.place(0, [20, 20]);
    b.sim.setTarget("p1", target.id);
    const pos = new Map<string, Vec2>([["p1", [19, 20]], ["p2", [20, 21]]]);
    return { ...b, a, q, target, pos };
  }
  const hurt = (events: SimEvent[], id: string) => events.some((e) => e.t === "hit" && e.from === "p1" && e.to === id);

  it("the normal state hurts the players who are in it too, and spares those who are not", () => {
    const on = arena(1, 1);
    expect(hurt(on.sim.tick(0, on.pos), "p2")).toBe(true);
    const off = arena(1, 0);
    expect(hurt(off.sim.tick(0, off.pos), "p2")).toBe(false);
    const none = arena(0, 1);
    expect(hurt(none.sim.tick(0, none.pos), "p2")).toBe(false);
  });

  it("the slaughter state hurts everyone, a guard too", () => {
    const s = arena(2, 0);
    const guard = [...s.mons.values()].find((m) => m.guard)!;
    guard.path = [[20, 19]];
    const events = s.sim.tick(0, s.pos);
    expect(hurt(events, "p2")).toBe(true);
    expect(hurt(events, guard.id)).toBe(true);
    const n = arena(1, 1);
    const g2 = [...n.mons.values()].find((m) => m.guard)!;
    g2.path = [[20, 19]];
    expect(hurt(n.sim.tick(0, n.pos), g2.id)).toBe(false);
  });

  it("someone being answered in self-defence is hurt by the swing even with the state off", () => {
    const d = arena(0, 0);
    d.a.hitBy.set("p2", 0); // p2 hit p1 a moment ago
    expect(hurt(d.sim.tick(1000, d.pos), "p2")).toBe(true);
  });
});

describe("ways of delivering a skill", () => {
  const dotHits = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { t: "hit" }> => e.t === "hit" && e.from === "p1" && !!e.dot);

  it("a piercing skill hits everything in a row along its line, and not what stands beside it", () => {
    const { sim, place } = bare();
    player(sim);
    const a = place(0, [20, 20]);
    const b = place(1, [23, 20.3]);
    const c = place(2, [26, 19.8]);
    const aside = place(3, [23, 24]);
    sim.queueCast("p1", "kim_3", a.id, 0);
    const hits = hitsOf(sim.tick(0, new Map([["p1", [17, 20]]])));
    expect(hits.map((h) => h.to).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(aside.hp).toBe(aside.maxHp);
  });

  it("a ring round the caster hits the monsters near the caster with nobody targeted", () => {
    const { sim, place } = bare();
    player(sim);
    const near = place(0, [21.5, 20]);
    const near2 = place(1, [20, 22.5]);
    const far = place(2, [26, 20]);
    sim.queueCast("p1", "kim_4", null, 0, [30, 30]);
    const events = sim.tick(0, new Map([["p1", [20, 20]]]));
    expect(hitsOf(events).map((h) => h.to).sort()).toEqual([near.id, near2.id].sort());
    expect(far.hp).toBe(far.maxHp);
  });

  it("a lane of fire stays, hurts what stands in it every tick, ends on time, and keeps the sim awake", () => {
    const { sim, place } = bare();
    const p = player(sim);
    const m = place(0, [21, 20]);
    const aside = place(1, [21, 24]);
    expect(sim.queueCast("p1", "hoa_3", null, 0, [20, 20])).toEqual({ ok: true });
    const pos = new Map<string, Vec2>([["p1", [17, 20]]]);
    const first = sim.tick(0, pos);
    expect(first.some((e) => e.t === "zone")).toBe(true);
    const ticks: number[] = [];
    let ended = false;
    for (let t = 0; t <= 7000; t += 100) {
      const ev = t === 0 ? first : sim.tick(t, pos);
      if (dotHits(ev).some((h) => h.to === m.id)) ticks.push(t);
      if (ev.some((e) => e.t === "zone_end")) ended = true;
      if (t === 3000) expect(sim.isIdle(pos)).toBe(false);
    }
    expect(ticks.length).toBeGreaterThanOrEqual(8);
    expect(ticks[0]).toBe(0);
    expect(ended).toBe(true);
    expect(aside.hp).toBe(aside.maxHp);
    expect(p.cooldowns.get("hoa_3")).toBeGreaterThan(0);
    expect(dotHits(sim.tick(8000, pos))).toHaveLength(0);
  });

  it("a zone is laid even where nobody stands, and the fire goes out with its caster", () => {
    const { sim } = bare();
    player(sim);
    sim.queueCast("p1", "moc_4", null, 0, [20, 20]);
    const pos = new Map<string, Vec2>([["p1", [19, 20]]]);
    const ev = sim.tick(0, pos);
    expect(ev.find((e) => e.t === "zone")).toBeDefined();
    expect(hitsOf(ev)).toHaveLength(0);
    sim.removePlayer("p1");
    expect(sim.isIdle(new Map())).toBe(true);
  });

  it("zone ticks follow the PK rules", () => {
    const b = bare();
    b.sim.addPlayer(seed({ stage: 5 }));
    b.sim.addPlayer(seed({ id: "p2", name: "p2", stage: 5 }));
    b.sim.setPkMode("p1", 1);
    b.sim.setPkMode("p2", 0);
    b.sim.queueCast("p1", "moc_4", null, 0, [20, 20]);
    const pos = new Map<string, Vec2>([["p1", [17, 20]], ["p2", [20, 20]]]);
    expect(dotHits(b.sim.tick(0, pos)).some((h) => h.to === "p2")).toBe(false);
    b.sim.setPkMode("p2", 1);
    expect(dotHits(b.sim.tick(1000, pos)).some((h) => h.to === "p2")).toBe(true);
  });
});

describe("the basic qi blast and MP pills", () => {
  it("hits from afar for about a plain blow, costs little, and is ready again in a second", () => {
    const { sim, place } = bare();
    const p = player(sim);
    p.mp = 50;
    p.mpAt = 0;
    const m = place(0, [26, 20]);
    expect(sim.queueCast("p1", "khi_co_ban", m.id, 0, undefined, "kim")).toEqual({ ok: true });
    const events = sim.tick(0, new Map([["p1", [20, 20]]])); // 6 tiles: out of any weapon's reach, in the blast's
    expect(hitsOf(events).map((h) => h.to)).toEqual([m.id]);
    expect(p.mp).toBeLessThan(50);
    expect(50 - p.mp).toBeLessThanOrEqual(5);
    expect(events.find((e) => e.t === "cast_ok")).toMatchObject({ skill: "khi_co_ban", cdMs: 1000 });
    expect(sim.queueCast("p1", "khi_co_ban", m.id, 500)).toEqual({ ok: false, reason: "cooldown" });
    expect(sim.queueCast("p1", "khi_co_ban", m.id, 1100)).toEqual({ ok: true });
  });

  it("an MP pill gives MP back, never past the maximum", () => {
    const { sim } = bare();
    const p = player(sim);
    p.mp = 10;
    p.mpAt = 0;
    const ev = sim.restoreMp("p1", 0.4, 0)!;
    expect(ev.mp).toBe(Math.min(p.maxMp, 10 + Math.round(p.maxMp * 0.4)));
    expect(sim.restoreMp("p1", 1, 0)!.mp).toBe(p.maxMp);
    expect(sim.restoreMp("nobody", 1, 0)).toBeNull();
  });
});

import { getMap, rollLoot, startingStats, type Vec2 } from "@game/shared";
import { describe, expect, it } from "vitest";
import { CombatSim, type ProfileSeed, type SimEvent } from "./combat-sim";

const noCrit = () => 0.99; // never dodges, never crits
const seed = (id: string, over: Partial<ProfileSeed> = {}): ProfileSeed => ({
  id,
  granted: ["chuong_0", "tram_0"],
  name: id,
  potentialPoints: 0,
  element: "kim",
  base: startingStats("kim", 0).base,
  rootGrade: 1,
  constitution: "pham_the",
  constitutionTier: 1,
  gender: "male",
  realm: 0,
  stage: 5, // Luyện Khí tầng 5: just out of the newbie protection
  exp: 0,
  ...over,
});

const A: Vec2 = [20.5, 4.5];
const B: Vec2 = [21.5, 4.5]; // in reach of A (a monster-free spot of the forest gate)
const positions = new Map<string, Vec2>([["a", A], ["b", B]]);

function pair(over: { a?: Partial<ProfileSeed>; b?: Partial<ProfileSeed> } = {}) {
  const sim = new CombatSim(getMap("forest"), "forest", noCrit, 0);
  const a = sim.addPlayer(seed("a", over.a));
  const b = sim.addPlayer(seed("b", over.b));
  return { sim, a, b };
}

function run(sim: CombatSim, from: number, to: number, pos = positions): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = from; t <= to; t += 100) out.push(...sim.tick(t, pos));
  return out;
}

describe("who can be attacked", () => {
  it("not with the PK switch off, yes with it on", () => {
    const { sim } = pair();
    expect(sim.setTarget("a", "b")).toBe(false);
    sim.setPkMode("a", true);
    expect(sim.setTarget("a", "b")).toBe(true);
  });

  it("nobody under Luyện Khí tầng 5 can be attacked, and they cannot attack either", () => {
    const young = pair({ b: { stage: 4 } });
    young.sim.setPkMode("a", true);
    expect(young.sim.setTarget("a", "b")).toBe(false);
    young.sim.setPkMode("b", true);
    expect(young.sim.setTarget("b", "a")).toBe(false);
  });

  it("not yourself, not the dead", () => {
    const { sim, b } = pair();
    sim.setPkMode("a", true);
    expect(sim.setTarget("a", "a")).toBe(false);
    b.dead = true;
    expect(sim.setTarget("a", "b")).toBe(false);
  });

  it("turning the switch off drops a player target", () => {
    const { sim, a } = pair();
    sim.setPkMode("a", true);
    sim.setTarget("a", "b");
    sim.setPkMode("a", false);
    expect(a.targetId).toBeNull();
  });
});

describe("fighting a player", () => {
  it("blows land as hit events on the victim, who fights back standing still even with the switch off", () => {
    const { sim, a, b } = pair();
    sim.setPkMode("a", true);
    sim.setTarget("a", "b");
    const events = run(sim, 0, 3000);
    const hits = events.filter((e) => e.t === "hit" && e.from === "a" && e.to === "b");
    expect(hits.length).toBeGreaterThan(0);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.targetId).toBe("a"); // the answer to the first blow
    expect(events.some((e) => e.t === "hit" && e.from === "b" && e.to === "a")).toBe(true);
    expect(a.hp).toBeLessThan(a.maxHp);
  });

  it("the retaliation ends with the target: the answering player cannot start a fight on their own", () => {
    const { sim, a, b } = pair();
    sim.setPkMode("a", true);
    sim.setTarget("a", "b");
    run(sim, 0, 1000);
    expect(b.retaliateId).toBe("a");
    sim.clearTarget("b");
    run(sim, 1100, 1300);
    expect(b.retaliateId).toBeNull();
    expect(sim.setTarget("b", "a")).toBe(false);
    expect(a.pkOn).toBe(true);
  });

  it("a walking victim does not answer", () => {
    const { sim, b } = pair();
    sim.setPkMode("a", true);
    sim.setTarget("a", "b");
    const out: SimEvent[] = [];
    for (let t = 0; t <= 2000; t += 100) out.push(...sim.tick(t, positions, new Set(["b"])));
    expect(out.some((e) => e.t === "hit" && e.from === "a" && e.to === "b")).toBe(true);
    expect(b.targetId).toBeNull();
  });

  it("a kill is announced once, with who killed whom, and gives the killer nothing (no EXP, no drop)", () => {
    const { sim, a, b } = pair();
    b.hp = 1;
    sim.setPkMode("a", true);
    sim.setTarget("a", "b");
    const events = run(sim, 0, 2000);
    expect(events.filter((e) => e.t === "pvp_kill")).toEqual([{ t: "pvp_kill", killerId: "a", victimId: "b" }]);
    expect(events.filter((e) => e.t === "player_dead")).toEqual([{ t: "player_dead", playerId: "b", by: "a" }]);
    expect(b.dead).toBe(true);
    expect(a.targetId).toBeNull();
    expect(a.exp).toBe(0);
    expect(events.some((e) => e.t === "loot" || e.t === "drop" || e.t === "progress")).toBe(false);
  });

  it("an attack skill can hit a player (switch on) and is refused with the switch off", () => {
    const off = pair();
    expect(off.sim.queueCast("a", "chuong_0", "b", 0)).toEqual({ ok: false, reason: "no_target" });
    const { sim, b } = pair();
    sim.setPkMode("a", true);
    expect(sim.queueCast("a", "chuong_0", "b", 0)).toEqual({ ok: true });
    const events = run(sim, 0, 500);
    expect(events.some((e) => e.t === "cast_ok" && e.skill === "chuong_0")).toBe(true);
    expect(events.some((e) => e.t === "hit" && e.from === "a" && e.to === "b" && e.skill === "chuong_0")).toBe(true);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
});

describe("what the scores do in a fight", () => {
  const firstHit = (satKhi: number) => {
    const { sim } = pair({ a: { satKhi } });
    sim.setPkMode("a", true);
    sim.setTarget("a", "b");
    const hit = run(sim, 0, 1000).find((e) => e.t === "hit" && e.from === "a" && e.to === "b");
    return hit && hit.t === "hit" ? hit.damage : 0;
  };

  it("sát khí above 200 adds damage: 15% at 1000 and none at 200", () => {
    const base = firstHit(0);
    expect(base).toBeGreaterThan(0);
    expect(firstHit(200)).toBe(base);
    expect(firstHit(1000)).toBeGreaterThan(base);
    expect(firstHit(1000)).toBeLessThanOrEqual(Math.round(base * 1.15) + 1);
  });

  it("the hero points add maximum MP (+5% at 200, +10% at 500) and setPk follows the change", () => {
    const none = pair().a.maxMp;
    expect(pair({ a: { hero: 200 } }).a.maxMp).toBeGreaterThan(none);
    expect(pair({ a: { hero: 500 } }).a.maxMp).toBeGreaterThan(pair({ a: { hero: 200 } }).a.maxMp);
    const { sim, a } = pair();
    sim.setPk("a", { satKhi: 0, hero: 500 });
    expect(a.maxMp).toBeGreaterThan(none);
    sim.setPk("a", { satKhi: 0, hero: 0 });
    expect(a.maxMp).toBe(none);
  });

  it("hero points at 500 raise the chance of a drop by 5% (relative) without changing how the rolls are drawn", () => {
    const rolls = (mult: number) => {
      const seq = [0.0, 0.5, 0.125, 0.5, 0.0, 0.5, 0.0, 0.5];
      let i = 0;
      return rollLoot("normal", () => seq[i++ % seq.length]!, mult).length;
    };
    expect(rolls(1)).toBeGreaterThan(0);
    // A roll at 0.1245 misses linh_thao (chance 0.12) and thu_cot (0.12) at x1 but hits both with x1.05 (0.126).
    const at = (mult: number) => {
      const seq = [0.1245, 0.0, 0.1245, 0.0, 0.99, 0.0, 0.99, 0.0];
      let i = 0;
      return rollLoot("normal", () => seq[i++]!, mult).map((d) => d.item);
    };
    expect(at(1)).toEqual([]);
    expect(at(1.05)).toEqual(["linh_thao", "thu_cot"]);
  });
});

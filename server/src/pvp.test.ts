import { getMap, inPlayRect, isStandable, rollLoot, startingStats, type Vec2 } from "@game/shared";
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
    sim.setPkMode("a", 2);
    expect(sim.setTarget("a", "b")).toBe(true);
  });

  it("nobody under Luyện Khí tầng 5 can be attacked, and they cannot attack either", () => {
    const young = pair({ b: { stage: 4 } });
    young.sim.setPkMode("a", 2);
    expect(young.sim.setTarget("a", "b")).toBe(false);
    young.sim.setPkMode("b", 2);
    expect(young.sim.setTarget("b", "a")).toBe(false);
  });

  it("not yourself, not the dead", () => {
    const { sim, b } = pair();
    sim.setPkMode("a", 2);
    expect(sim.setTarget("a", "a")).toBe(false);
    b.dead = true;
    expect(sim.setTarget("a", "b")).toBe(false);
  });

  it("turning the switch off drops a player target", () => {
    const { sim, a } = pair();
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    sim.setPkMode("a", 0);
    expect(a.targetId).toBeNull();
  });
});

describe("fighting a player", () => {
  it("blows land as hit events on the victim, who fights back standing still even with the switch off", () => {
    const { sim, a, b } = pair();
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    const events = run(sim, 0, 3000);
    const hits = events.filter((e) => e.t === "hit" && e.from === "a" && e.to === "b");
    expect(hits.length).toBeGreaterThan(0);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(b.targetId).toBe("a"); // the answer to the first blow
    expect(events.some((e) => e.t === "hit" && e.from === "b" && e.to === "a")).toBe(true);
    expect(a.hp).toBeLessThan(a.maxHp);
  });

  it("forgetQuarrels (a portal) ends the right to answer; a plain removal of the attacker does not", () => {
    const { sim, b } = pair();
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    run(sim, 0, 1000);
    expect(b.hitBy.has("a")).toBe(true);
    sim.removePlayer("a"); // a reconnect: b keeps the right to answer a later
    expect(b.hitBy.has("a")).toBe(true);
    sim.addPlayer(seed("a"));
    sim.forgetQuarrels("a");
    expect(b.hitBy.has("a")).toBe(false);
    expect(sim.setTarget("b", "a")).toBe(false);
  });

  it("the retaliation ends with the target: the answering player cannot start a fight on their own", () => {
    const { sim, a, b } = pair();
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    run(sim, 0, 1000);
    expect(b.retaliateId).toBe("a");
    sim.clearTarget("b");
    run(sim, 1100, 1300);
    expect(b.retaliateId).toBeNull();
    // b (PK off) was hit by a, so b may still defend itself for a while; once a kill (or anything) ends the quarrel it cannot.
    expect(sim.setTarget("b", "a")).toBe(true);
    sim.clearQuarrel("a", "b");
    expect(sim.setTarget("b", "a")).toBe(false);
    expect(a.pkMode).toBe(2);
  });

  it("PK fights only PK or Đồ sát; Đồ sát fights anyone; a player with PK off can be hit by Đồ sát only", () => {
    const { sim } = pair();
    sim.setPkMode("a", 1);
    expect(sim.setTarget("a", "b")).toBe(false); // b is off
    sim.setPkMode("b", 1);
    expect(sim.setTarget("a", "b")).toBe(true);
    sim.setPkMode("b", 0);
    sim.setPkMode("a", 2);
    expect(sim.setTarget("a", "b")).toBe(true);
    expect(sim.setTarget("b", "a")).toBe(false); // b is off and was not hit yet
  });

  it("a click back by hand is a defence: its blows are marked ret and the first striker stays the first striker", () => {
    const { sim, b } = pair();
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    b.targetId = "x";
    const first = run(sim, 0, 1000);
    expect(first.filter((e) => e.t === "hit" && e.from === "a").every((e) => !(e as { ret?: boolean }).ret)).toBe(true);
    b.targetId = null;
    expect(sim.setTarget("b", "a")).toBe(true);
    const second = run(sim, 1100, 2500);
    const mine = second.filter((e) => e.t === "hit" && e.from === "b");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => (e as { ret?: boolean }).ret === true)).toBe(true);
    // a keeps hitting b and is still not answering anyone.
    expect(second.filter((e) => e.t === "hit" && e.from === "a").every((e) => !(e as { ret?: boolean }).ret)).toBe(true);
  });

  it("someone who hits you may be hit back by hand even with PK off, for 3 minutes", () => {
    const { sim, b } = pair();
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    b.targetId = "x"; // busy, so b does not answer on its own
    run(sim, 0, 1000);
    b.targetId = null;
    expect(b.pkMode).toBe(0);
    expect(sim.setTarget("b", "a")).toBe(true);
    b.targetId = null;
    run(sim, 1100, 1100 + 3 * 60_000 + 200);
    expect(sim.setTarget("b", "a")).toBe(false);
  });

  it("a walking victim does not answer", () => {
    const { sim, b } = pair();
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    const out: SimEvent[] = [];
    for (let t = 0; t <= 2000; t += 100) out.push(...sim.tick(t, positions, new Set(["b"])));
    expect(out.some((e) => e.t === "hit" && e.from === "a" && e.to === "b")).toBe(true);
    expect(b.targetId).toBeNull();
  });

  it("a kill is announced once, with who killed whom, and gives the killer nothing (no EXP, no drop)", () => {
    const { sim, a, b } = pair();
    b.hp = 1;
    sim.setPkMode("a", 2);
    sim.setTarget("a", "b");
    const events = run(sim, 0, 2000);
    expect(events.filter((e) => e.t === "pvp_kill")).toEqual([{ t: "pvp_kill", killerId: "a", victimId: "b" }]);
    expect(events.filter((e) => e.t === "player_dead")).toEqual([{ t: "player_dead", playerId: "b", by: "a" }]);
    // The room reads the victim's name tier when it handles `player_dead` and only then settles the scores on `pvp_kill` (see handleDeath), so this order matters.
    const kinds = events.map((e) => e.t);
    expect(kinds.indexOf("player_dead")).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf("player_dead")).toBeLessThan(kinds.indexOf("pvp_kill"));
    expect(b.dead).toBe(true);
    expect(a.targetId).toBeNull();
    expect(a.exp).toBe(0);
    expect(events.some((e) => e.t === "loot" || e.t === "drop" || e.t === "progress")).toBe(false);
  });

  it("an attack skill can hit a player (switch on) and is refused with the switch off", () => {
    const off = pair();
    expect(off.sim.queueCast("a", "chuong_0", "b", 0)).toEqual({ ok: false, reason: "no_target" });
    const { sim, b } = pair();
    sim.setPkMode("a", 2);
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
    sim.setPkMode("a", 2);
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

describe("the map boss", () => {
  const forest = () => {
    const sim = new CombatSim(getMap("forest"), "forest", noCrit, 0);
    // Tough enough to live through a few blows of a boss a realm above the map.
    const tough = { ...startingStats("kim", 0).base, canCot: 3000 };
    const a = sim.addPlayer(seed("a", { realm: 0, stage: 9, base: tough }));
    const b = sim.addPlayer(seed("b", { realm: 0, stage: 9, base: tough }));
    return { sim, a, b };
  };

  it("spawns once, stays out of the saved classes and is flagged in its snapshot", () => {
    const { sim } = forest();
    const snap = sim.spawnBoss("forest", 0);
    expect(snap?.boss).toBe(true);
    expect(sim.hasBoss).toBe(true);
    expect(sim.spawnBoss("forest", 0)).toBeNull();
    expect(Object.keys(sim.ranks())).not.toContain(snap!.id);
    expect(new CombatSim(getMap("town"), "town", noCrit, 0).spawnBoss("town", 0)).toBeNull();
  });

  it("stands away from every monster cluster and guard of its map", () => {
    for (const id of ["forest", "cave"] as const) {
      const sim = new CombatSim(getMap(id), id, noCrit, 0);
      const boss = sim.spawnBoss(id, 0)!;
      const at = boss.path[0]!;
      const others = sim.snapshots(0).filter((m) => !m.boss).map((m) => m.path[0]!);
      for (const o of others) expect(Math.hypot(o[0] - at[0], o[1] - at[1])).toBeGreaterThan(6);
    }
  });

  it("appears at a random spot each time (standable, away from gates and guards), and where it was left when the room woke", () => {
    const spots = new Set<string>();
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (const id of ["forest", "cave", "kimdan", "nguyenanh"] as const) {
      const map = getMap(id);
      for (let i = 0; i < 6; i++) {
        const sim = new CombatSim(map, id, rnd, 0);
        const at = sim.spawnBoss(id, 0)!.path[0]!;
        spots.add(`${id}:${at.join()}`);
        expect(isStandable(map, at[0], at[1])).toBe(true);
        expect(inPlayRect(map, at[0], at[1])).toBe(true);
        for (const p of map.portals) expect(Math.hypot(at[0] - p.x - 0.5, at[1] - p.y - 0.5)).toBeGreaterThanOrEqual(24);
        // It also stays put through a sleep: the spot is part of what the room keeps.
        const kept = sim.bossState()!;
        const again = new CombatSim(map, id, rnd, 0).spawnBoss(id, 0, kept.home)!;
        expect(again.path[0]).toEqual(kept.home);
      }
    }
    expect(spots.size).toBeGreaterThan(18); // 4 maps x 6: almost every appearance is somewhere else
    // With a random source that keeps giving the same number the map's fixed spot is used rather than looping.
    expect(new CombatSim(getMap("forest"), "forest", () => 0.5, 0).spawnBoss("forest", 0)).not.toBeNull();
  });

  it("is a realm above the map at bậc 2 (a map of Luyện Khí gets a Trúc Cơ 2 boss)", () => {
    const sim = new CombatSim(getMap("forest"), "forest", noCrit, 0);
    expect(sim.spawnBoss("forest", 0)).toMatchObject({ tier: 2, boss: true });
  });

  it("below a quarter of its HP the boss hits everyone in a cone in front of it, and not those behind or beside", () => {
    const { sim, a, b } = forest();
    const c = sim.addPlayer(seed("c", { realm: 0, stage: 9, base: { ...startingStats("kim", 0).base, canCot: 3000 } }));
    const snap = sim.spawnBoss("forest", 0)!;
    const bp = snap.path[0]!;
    // a is the target, b stands a little to the side but inside the cone, c is behind the boss.
    const pos = new Map<string, Vec2>([["a", [bp[0] + 1, bp[1]]], ["b", [bp[0] + 3, bp[1] + 1]], ["c", [bp[0] - 2, bp[1]]]]);
    sim.setMonsterHp(snap.id, 1_000);
    const before = { a: a.hp, b: b.hp, c: c.hp };
    sim.setTarget("a", snap.id);
    const events = run(sim, 0, 1_500, pos);
    const hitBy = (id: string) => events.filter((e) => e.t === "hit" && e.from === snap.id && e.to === id);
    expect(hitBy("a").length).toBeGreaterThan(0);
    expect(a.hp).toBeLessThan(before.a);
    // The cone fires on the first act (the boss is below 25%) and costs a and b one hit each of the same big size.
    expect(hitBy("b").length).toBeGreaterThan(0);
    expect(hitBy("c").length).toBe(0);
    // Everyone who sees it is told the shape: where the boss stands, the point it faced, the reach and the opening.
    const cone = events.find((e) => e.t === "cone");
    expect(cone).toMatchObject({ t: "cone", monsterId: snap.id, range: 4.5, halfAngleDeg: 45 });
  });

  it("does not use the cone while above a quarter of its HP", () => {
    const { sim } = forest();
    const snap = sim.spawnBoss("forest", 0)!;
    const bp = snap.path[0]!;
    const pos = new Map<string, Vec2>([["a", [bp[0] + 1, bp[1]]], ["b", [bp[0] + 3, bp[1] + 1]]]);
    sim.setTarget("a", snap.id);
    const events = run(sim, 0, 1_500, pos);
    expect(events.filter((e) => e.t === "hit" && e.from === snap.id && e.to === "b").length).toBe(0);
  });

  it("heals back gradually after it walked home, keeping its damage table until whole", () => {
    const { sim } = forest();
    const snap = sim.spawnBoss("forest", 0)!;
    const bp = snap.path[0]!;
    sim.setMonsterHp(snap.id, 100);
    // Nobody around: it is idle at home with 100 HP.
    const lonely = new Map<string, Vec2>();
    run(sim, 0, 2_100, lonely);
    const mid = sim.snapshots(2_100).find((m) => m.boss)!;
    expect(mid.hp).toBeGreaterThan(100);
    expect(mid.hp).toBeLessThan(mid.maxHp);
    run(sim, 2_200, 60_000, lonely);
    const end = sim.snapshots(60_000).find((m) => m.boss)!;
    expect(end.hp).toBe(end.maxHp);
    expect(bp).toBeDefined();
  });

  it("keeps its health and damage table when put back (the room slept) and forgets a player who died", () => {
    const { sim, a } = forest();
    const snap = sim.spawnBoss("forest", 0)!;
    const bp = snap.path[0]!;
    sim.setMonsterHp(snap.id, 1_000);
    const kept = sim.bossState()!;
    expect(kept.frac).toBeGreaterThan(0);
    expect(kept.frac).toBeLessThan(0.2);
    // A new sim (the room woke): the boss stands again with the saved health and the damage that was done.
    const next = new CombatSim(getMap("forest"), "forest", noCrit, 0);
    next.addPlayer(seed("a", { realm: 0, stage: 9 }));
    next.spawnBoss("forest", 0);
    next.restoreBoss(kept.frac, { a: 500, b: 700 });
    const back = next.bossState()!;
    expect(back.frac).toBeCloseTo(kept.frac, 5);
    expect(back.damage).toEqual({ a: 500, b: 700 });
    // A whole boss keeps nothing, and the fraction is clamped.
    next.restoreBoss(5, {});
    expect(next.bossState()!.frac).toBe(1);
    expect(next.bossState()!.damage).toEqual({});
    expect(bp).toBeDefined();
    expect(a.dead).toBe(false);
  });

  it("a player the boss kills no longer counts towards its damage table", () => {
    const sim = new CombatSim(getMap("forest"), "forest", noCrit, 0);
    const frail = sim.addPlayer(seed("a", { realm: 0, stage: 9 }));
    const snap = sim.spawnBoss("forest", 0)!;
    const bp = snap.path[0]!;
    sim.restoreBoss(0.5, { a: 300, b: 200 });
    frail.hp = 1;
    sim.setTarget("a", snap.id);
    run(sim, 0, 4_000, new Map<string, Vec2>([["a", [bp[0] + 1, bp[1]]]]));
    expect(frail.dead).toBe(true);
    expect(sim.bossState()!.damage.a).toBeUndefined(); // died: reset
    expect(sim.bossState()!.damage.b).toBe(200); // still counts
  });

  it("dies for good and pays its sharers: EXP, Linh Thạch and the claim release event", () => {
    const { sim, a, b } = forest();
    const snap = sim.spawnBoss("forest", 0)!;
    const at: Vec2 = [snap.path[0]![0] + 1, snap.path[0]![1]];
    const pos = new Map<string, Vec2>([["a", at], ["b", [at[0], at[1] + 0.5]]]);
    sim.setMonsterHp(snap.id, 1);
    sim.setTarget("a", snap.id);
    const events = run(sim, 0, 20_000, pos); // the boss heals once before the player finishes it
    const kill = events.find((e) => e.t === "boss_kill");
    expect(kill).toMatchObject({ t: "boss_kill", killerId: "a" });
    if (kill?.t === "boss_kill") {
      expect(kill.shares.map((s) => s.id)).toContain("a");
      expect(kill.shares.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1);
    }
    expect(events.some((e) => e.t === "progress" && e.playerId === "a")).toBe(true);
    expect(a.exp).toBeGreaterThan(0);
    expect(b.id).toBe("b");
    expect(sim.hasBoss).toBe(false);
    expect(sim.snapshots(10_000).some((m) => m.boss)).toBe(false);
  });

  it("asks for the boss once when the kill count is reached, and not when it is off", () => {
    const killOne = (enable: boolean) => {
      const sim = new CombatSim(getMap("forest"), "forest", noCrit, 0);
      sim.addPlayer(seed("a", { realm: 0, stage: 9 }));
      if (enable) sim.enableBoss(500);
      const m = sim.snapshots(0).find((s) => s.tier === 1 && !s.guard)!;
      const at: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
      sim.setMonsterHp(m.id, 1);
      sim.setTarget("a", m.id);
      return run(sim, 0, 60_000, new Map([["a", at]])).filter((e) => e.t === "boss_request");
    };
    expect(killOne(true)).toHaveLength(1);
    expect(killOne(false)).toHaveLength(0);
  });
});

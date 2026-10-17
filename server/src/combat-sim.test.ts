import { CLUSTERS, RANKS, expToNext, getMap, killExp, monsterBaseExp, nearestStandablePoint, startingStats, type Vec2 } from "@game/shared";
import { describe, expect, it } from "vitest";
import { CombatSim, type ProfileSeed, type SimEvent } from "./combat-sim";

const noCrit = () => 0.99; // never dodges, never crits, damage spread near the top
const seed = (id = "p1", over: Partial<ProfileSeed> = {}): ProfileSeed => ({
  id,
  name: id,
  potentialPoints: 5,
  element: "kim",
  base: startingStats("kim", 0).base,
  rootGrade: 1,
  realm: 0,
  stage: 1,
  exp: 0,
  ...over,
});

function forestSim(rand = noCrit) {
  return new CombatSim(getMap("forest"), "forest", rand, 0);
}

/** Runs ticks every 100 ms and collects events; the player stands still at `pos`. */
function run(sim: CombatSim, from: number, to: number, positions: Map<string, Vec2>): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = from; t <= to; t += 100) out.push(...sim.tick(t, positions));
  return out;
}

describe("CombatSim", () => {
  it("spawns every configured monster on the forest map and none in town", () => {
    expect(forestSim().monsterCount).toBe(CLUSTERS.forest.reduce((n, c) => n + c.count, 0));
    expect(new CombatSim(getMap("cave"), "cave", noCrit, 0).monsterCount).toBe(CLUSTERS.cave.reduce((n, c) => n + c.count, 0));
    expect(new CombatSim(getMap("town"), "town", noCrit, 0).monsterCount).toBe(0);
  });

  it("snapshots carry a path, hp and the kind", () => {
    const [m] = forestSim().snapshots(0);
    expect(m).toMatchObject({ id: "m1", kind: "soi_rung", tier: 1, rank: "normal" });
    expect(m!.hp).toBe(m!.maxHp);
    expect(m!.path).toHaveLength(1);
  });

  it("a targeted monster in reach takes hits and dies, rewarding EXP with the bonus", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    const p = sim.addPlayer(seed());
    expect(sim.setTarget("p1", m.id)).toBe(true);
    const events = run(sim, 0, 10_000, new Map([["p1", here]]));
    const hits = events.filter((e) => e.t === "hit" && e.to === m.id);
    expect(hits.length).toBeGreaterThan(1);
    expect(events.some((e) => e.t === "mon_gone" && e.id === m.id)).toBe(true);
    expect(p.exp).toBeGreaterThan(0);
    expect(p.expDirty).toBe(true);
    expect(p.targetId).toBeNull();
  });

  it("a kill drops Linh Thạch to the winner when the chance roll hits, and nothing when it misses", () => {
    const kill = (rand: () => number) => {
      const sim = forestSim(rand);
      const m = sim.snapshots(0)[0]!;
      sim.addPlayer(seed());
      sim.setTarget("p1", m.id);
      const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
      return run(sim, 0, 10_000, new Map([["p1", here]]));
    };
    expect(kill(noCrit).filter((e) => e.t === "drop")).toHaveLength(0); // 0.99 misses the normal-rank chance
    // A rare monster (rolled at spawn) always drops, whatever the chance roll.
    const sim = forestSim(() => 0.01);
    const m = sim.snapshots(0)[0]!;
    expect(m.rank).not.toBe("normal");
    sim.addPlayer(seed());
    sim.setTarget("p1", m.id);
    const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    const drops = run(sim, 0, 20_000, new Map([["p1", here]])).filter((e) => e.t === "drop");
    expect(drops.length).toBeGreaterThanOrEqual(1); // other rare monsters may be killed in self-defence too
    for (const d of drops) expect(d).toMatchObject({ playerId: "p1" });
  });

  it("a player far from the target gets a path request instead of attacking", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed());
    sim.setTarget("p1", m.id);
    const far: Vec2 = [m.path[0]![0] + 8, m.path[0]![1]];
    const events = sim.tick(0, new Map([["p1", far]]));
    expect(events.some((e) => e.t === "path_request")).toBe(true);
    expect(events.some((e) => e.t === "hit")).toBe(false);
  });

  it("an idle monster aggroes a nearby player and hurts them", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const p = sim.addPlayer(seed());
    const near: Vec2 = [m.path[0]![0] + 2, m.path[0]![1]];
    const events = run(sim, 0, 8000, new Map([["p1", near]]));
    expect(events.some((e) => e.t === "hit" && e.to === "p1")).toBe(true);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it("an idle player hit by a monster fights back on their own", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const p = sim.addPlayer(seed());
    const near: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    const events = run(sim, 0, 6000, new Map([["p1", near]]));
    expect(events.some((e) => e.t === "hit" && e.from === "p1" && e.to === m.id)).toBe(true);
    expect(p.targetId === m.id || events.some((e) => e.t === "mon_gone")).toBe(true);
  });

  it("a walking player does not retaliate, and keeps an existing target", () => {
    const sim = forestSim();
    const [a, b] = sim.snapshots(0);
    const p = sim.addPlayer(seed());
    // Stand on open ground next to the first monster (cluster neighbours may also aggro, which is fine here).
    const near = nearestStandablePoint(getMap("forest"), a!.path[0]![0] + 1, a!.path[0]![1], 2)!;
    const positions = new Map<string, Vec2>([["p1", near]]);
    const moving = new Set(["p1"]);
    const walking: SimEvent[] = [];
    for (let t = 0; t <= 4000; t += 100) walking.push(...sim.tick(t, positions, moving));
    expect(walking.some((e) => e.t === "hit" && e.to === "p1")).toBe(true);
    expect(walking.some((e) => e.t === "hit" && e.from === "p1")).toBe(false);
    expect(p.targetId).toBeNull();
    // With an explicit target on another monster, being hit does not change it.
    sim.setTarget("p1", b!.id);
    let hurt = false;
    for (let t = 4100; t <= 12_000 && !hurt; t += 100) {
      hurt = sim.tick(t, positions).some((e) => e.t === "hit" && e.to === "p1");
    }
    expect(hurt).toBe(true);
    expect(p.targetId).toBe(b!.id); // the explicit target was kept when another monster hit the idle player
  });

  it("a killed player is flagged dead once and not attacked further", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const p = sim.addPlayer(seed());
    p.hp = 1;
    const near: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    const events = run(sim, 0, 8000, new Map([["p1", near]]));
    expect(events.filter((e) => e.t === "player_dead")).toHaveLength(1);
    expect(p.dead).toBe(true);
    expect(p.hp).toBe(0);
  });

  it("a monster respawns after its respawn time", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed("p1", { base: { ...seed().base, linhLuc: 500 } }));
    const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    sim.setTarget("p1", m.id);
    const positions = new Map([["p1", here]]);
    const events = run(sim, 0, 3000, positions);
    expect(events.some((e) => e.t === "mon_gone" && e.id === m.id)).toBe(true);
    expect(sim.snapshots(3000).some((s) => s.id === m.id)).toBe(false);
    const later = run(sim, 3100, 3000 + 16_000, positions);
    expect(later.some((e) => e.t === "mon" && e.monster.id === m.id && e.monster.hp === e.monster.maxHp)).toBe(true);
  });

  it("enough EXP in one kill advances the stage and grants points as a pending delta", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const p = sim.addPlayer(seed("p1", { exp: expToNext(0, 1) - 1, base: { ...seed().base, linhLuc: 500 } }));
    const maxHpBefore = p.maxHp;
    const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    sim.setTarget("p1", m.id);
    const events = run(sim, 0, 3000, new Map([["p1", here]]));
    const progress = events.find((e) => e.t === "progress");
    expect(progress).toMatchObject({ stagesGained: 1 });
    expect(p.stage).toBe(2);
    expect(p.pendingPoints).toBe(5);
    expect(p.potentialPoints).toBe(10);
    expect(p.maxHp).toBeGreaterThan(maxHpBefore); // a stage-up raises max HP (neighbours may already be biting)
    const write = sim.beginFlush("p1")!;
    expect(write).toMatchObject({ stage: 2, addPoints: 5 });
    sim.endFlush("p1", write, true);
    expect(p.pendingPoints).toBe(0);
    expect(p.inflightPoints).toBe(0);
    expect(p.expDirty).toBe(false);
  });

  it("points are reserved while a write is in flight, so an overlapping save cannot send them twice", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.pendingPoints = 5;
    p.expDirty = true;
    const first = sim.beginFlush("p1")!;
    expect(first.addPoints).toBe(5);
    // A save, leave or portal starting now sees nothing left to write.
    expect(sim.beginFlush("p1")).toBeNull();
    expect(p.inflightPoints).toBe(5);
    sim.endFlush("p1", first, true);
    expect(p.inflightPoints).toBe(0);
    expect(p.pendingPoints).toBe(0);
  });

  it("a failed write puts points and the dirty flag back", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.pendingPoints = 5;
    p.expDirty = true;
    const write = sim.beginFlush("p1")!;
    sim.endFlush("p1", write, false);
    expect(p.pendingPoints).toBe(5);
    expect(p.expDirty).toBe(true);
    expect(p.inflightPoints).toBe(0);
    expect(sim.beginFlush("p1")).not.toBeNull();
  });

  it("nothing to write returns null", () => {
    const sim = forestSim();
    sim.addPlayer(seed());
    expect(sim.beginFlush("p1")).toBeNull();
  });

  it("EXP gained while a write is in flight is written by the next flush", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.exp = 50;
    p.expDirty = true;
    const write = sim.beginFlush("p1")!;
    p.exp = 60;
    p.expDirty = true;
    sim.endFlush("p1", write, true);
    expect(sim.beginFlush("p1")).toMatchObject({ exp: 60, addPoints: 0 });
  });

  it("clearing the target stops the attack, and removing the player releases monsters", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed());
    const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    sim.setTarget("p1", m.id);
    sim.clearTarget("p1");
    // Walking away (moving) so the monster's attacks do not trigger the idle retaliation.
    const out: SimEvent[] = [];
    for (let t = 0; t <= 3000; t += 100) out.push(...sim.tick(t, new Map([["p1", here]]), new Set(["p1"])));
    expect(out.some((e) => e.t === "hit" && e.to === m.id)).toBe(false);
    sim.removePlayer("p1");
    expect(sim.playerCount).toBe(0);
  });

  it("death penalty lowers EXP but never touches the stage", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed("p1", { stage: 3, exp: 100 }));
    sim.applyDeathPenalty("p1", 10);
    expect(p.exp).toBe(90);
    expect(p.stage).toBe(3);
    sim.applyDeathPenalty("p1", 1000);
    expect(p.exp).toBe(0);
  });

  it("allocating points raises max HP and keeps the HP ratio", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.hp = Math.floor(p.maxHp / 2);
    const before = p.maxHp;
    sim.updateBase("p1", { ...p.base, canCot: p.base.canCot + 10 });
    expect(p.maxHp).toBeGreaterThan(before);
    expect(p.hp / p.maxHp).toBeCloseTo(0.5, 1);
  });

  it("clusters are fixed in size and tiered 1, 4 and 7 on each combat map", () => {
    for (const id of ["forest", "cave"] as const) {
      expect(CLUSTERS[id].map((c) => c.tier)).toEqual([1, 4, 7]);
      const sim = new CombatSim(getMap(id), id, noCrit, 0);
      const tiers = sim.snapshots(0).map((m) => m.tier);
      expect(tiers.filter((t) => t === 1)).toHaveLength(3);
      expect(tiers.filter((t) => t === 7)).toHaveLength(3);
    }
  });

  it("monster stats follow the map's realm and the cluster's bậc", () => {
    const forest = new CombatSim(getMap("forest"), "forest", noCrit, 0).snapshots(0);
    const cave = new CombatSim(getMap("cave"), "cave", noCrit, 0).snapshots(0);
    const hp = (list: typeof forest, tier: number) => list.find((m) => m.tier === tier)!.maxHp;
    expect(hp(forest, 7)).toBeGreaterThan(hp(forest, 1));
    expect(hp(cave, 1)).toBeGreaterThan(hp(forest, 1));
  });

  it("rare ranks roll from the injected RNG and are stronger and worth more", () => {
    const rare = new CombatSim(getMap("forest"), "forest", () => 0.001, 0).snapshots(0)[0]!;
    const normal = forestSim().snapshots(0)[0]!;
    expect(rare.rank).toBe("rare2");
    expect(rare.maxHp).toBeGreaterThan(normal.maxHp * 2);
    const elite = new CombatSim(getMap("forest"), "forest", () => 0.05, 0).snapshots(0)[0]!;
    expect(elite.rank).toBe("rare1");
    expect(elite.maxHp).toBeGreaterThan(normal.maxHp);
    expect(elite.maxHp).toBeLessThan(rare.maxHp);
    expect(RANKS.rare1.expMult).toBeLessThan(RANKS.rare2.expMult);
  });

  it("a rare monster pays exactly one player (the rule itself is tested on topContributor)", () => {
    const sim = new CombatSim(getMap("forest"), "forest", () => 0.05, 0); // every monster is rare1
    const m = sim.snapshots(0)[0]!;
    const big = { ...seed("big").base, linhLuc: 40 };
    const heavy = sim.addPlayer(seed("big", { base: big }));
    const light = sim.addPlayer(seed("light", { base: { ...seed().base, linhLuc: 5 } }));
    const at: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    const positions = new Map<string, Vec2>([["big", at], ["light", [at[0], at[1] + 0.2]]]);
    sim.setTarget("big", m.id);
    sim.setTarget("light", m.id);
    const events: SimEvent[] = [];
    for (let t = 0; t <= 60_000 && !events.some((e) => e.t === "mon_gone"); t += 100) events.push(...sim.tick(t, positions));
    const progress = events.filter((e) => e.t === "progress");
    expect(progress).toHaveLength(1);
    expect(heavy.exp + light.exp).toBeGreaterThan(0);
    expect(heavy.exp).toBeGreaterThan(light.exp);
  });

  it("EXP: pace table, rank multiplier, cap when hunting above your realm", () => {
    expect(killExp({ realm: 0, tier: 1, rank: "normal" }, 0, 0)).toBe(monsterBaseExp(0, 1));
    expect(killExp({ realm: 0, tier: 1, rank: "rare2" }, 0, 0)).toBe(Math.floor(monsterBaseExp(0, 1) * RANKS.rare2.expMult));
    // A Luyện Khí player in the Trúc Cơ cave gets no more than the best Luyện Khí monster of the same rank.
    const capped = killExp({ realm: 1, tier: 7, rank: "normal" }, 0, 0);
    expect(capped).toBe(monsterBaseExp(0, 7));
    expect(capped).toBeLessThan(monsterBaseExp(1, 7));
    // Own realm is unaffected.
    expect(killExp({ realm: 1, tier: 7, rank: "normal" }, 1, 0)).toBe(monsterBaseExp(1, 7));
  });
});

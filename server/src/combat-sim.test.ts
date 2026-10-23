import { masteryNeeded, CLUSTERS, GUARDS, RANKS, expToNext, getMap, effectiveSkill, getMonsterDef, getSkill, killExp, monsterBaseExp, nearestStandablePoint, startingStats, type Vec2 } from "@game/shared";
import { describe, expect, it } from "vitest";
import { CombatSim, skillContextOf, type ProfileSeed, type SimEvent } from "./combat-sim";

const noCrit = () => 0.99; // never dodges, never crits, damage spread near the top
/** What every test character was given: the two skills of a realm (an attack and a stronger one) and a heal and a buff. */
const BASE_SKILLS = ["chuong_0", "tram_0", "hoi_0", "thuan_0"];
const seed = (id = "p1", over: Partial<ProfileSeed> = {}): ProfileSeed => ({
  id,
  granted: BASE_SKILLS,
  name: id,
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

/** A forest sim whose monsters keep their species' element (every spawn rolls one at random; a fixed roll would give them all the same). */
function forestSim(rand = noCrit) {
  const sim = new CombatSim(getMap("forest"), "forest", rand, 0);
  for (const s of sim.snapshots(0)) sim.setMonsterElement(s.id, getMonsterDef(s.kind)!.element);
  return sim;
}

/** Runs ticks every 100 ms and collects events; the player stands still at `pos`. */
function run(sim: CombatSim, from: number, to: number, positions: Map<string, Vec2>): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = from; t <= to; t += 100) out.push(...sim.tick(t, positions));
  return out;
}

describe("CombatSim", () => {
  it("spawns every configured monster on the forest map and none in town", () => {
    expect(forestSim().monsterCount).toBe(CLUSTERS.forest.reduce((n, c) => n + c.count, 0) + GUARDS.forest.length);
    expect(new CombatSim(getMap("cave"), "cave", noCrit, 0).monsterCount).toBe(CLUSTERS.cave.reduce((n, c) => n + c.count, 0) + GUARDS.cave.length);
    expect(new CombatSim(getMap("town"), "town", noCrit, 0).monsterCount).toBe(GUARDS.town.length); // only the guards at the town gate
  });

  it("snapshots carry a path, hp and the kind", () => {
    const [m] = forestSim().snapshots(0);
    expect(m).toMatchObject({ id: "m1", rank: "normal" });
    expect(["soi_rung", "heo_rung", "bao_dem"]).toContain(m!.kind);
    expect(m!.tier).toBeGreaterThanOrEqual(1);
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
    expect(p.targetId).not.toBe(m.id); // the group around it may have pulled the player into the next fight
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

  it("clusters are fixed in size and cover bậc 1 to 9 on each combat map", () => {
    for (const id of ["forest", "cave"] as const) {
      const clusters = CLUSTERS[id];
      expect(clusters.length).toBeGreaterThanOrEqual(8);
      expect(new Set(clusters.map((c) => c.count)).size).toBe(1); // one group size per map
      const tiers = clusters.map((c) => c.tier);
      expect(Math.min(...tiers)).toBe(1);
      expect(Math.max(...tiers)).toBe(9);
      const sim = new CombatSim(getMap(id), id, noCrit, 0);
      const spawned = sim.snapshots(0).filter((m) => !m.guard);
      expect(spawned).toHaveLength(clusters.reduce((n, c) => n + c.count, 0));
      expect(spawned.filter((m) => m.tier === 1)).toHaveLength(clusters.filter((c) => c.tier === 1).length * clusters[0]!.count);
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
    // A Luyện Khí player in the Trúc Cơ cave gets no more than the best Luyện Khí monster of the same rank (bậc 9 of the forest).
    const capped = killExp({ realm: 1, tier: 7, rank: "normal" }, 0, 0);
    expect(capped).toBe(monsterBaseExp(0, 9));
    expect(capped).toBeLessThan(monsterBaseExp(1, 7));
    // Own realm is unaffected.
    expect(killExp({ realm: 1, tier: 7, rank: "normal" }, 1, 0)).toBe(monsterBaseExp(1, 7));
  });
});

describe("CombatSim.isIdle (the room may stop ticking)", () => {
  it("is idle with a healthy, untargeted, standing player and untouched monsters", () => {
    const sim = forestSim();
    sim.addPlayer(seed());
    expect(sim.isIdle(new Map())).toBe(true);
  });

  it("is busy while a player walks", () => {
    const sim = forestSim();
    sim.addPlayer(seed());
    expect(sim.isIdle(new Map(), new Set(["p1"]))).toBe(false);
  });

  it("is busy while a player has a target", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed());
    sim.setTarget("p1", m.id);
    expect(sim.isIdle(new Map())).toBe(false);
  });

  it("is busy while a player is below max HP (regeneration is driven by ticks)", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.hp = p.maxHp - 1;
    expect(sim.isIdle(new Map())).toBe(false);
  });

  it("is busy while a monster chases, then idle again once it is back home at full health", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed());
    const near: Vec2 = [m.path[0]![0] + 2, m.path[0]![1]];
    sim.tick(0, new Map([["p1", near]]));
    expect(sim.isIdle(new Map())).toBe(false);
    // The player leaves for good; the monster gives up, walks home and heals.
    const out = new Map<string, Vec2>(); // the player is no longer in the room's reach
    let t = 100;
    for (; t < 60_000 && !sim.isIdle(new Map()); t += 100) sim.tick(t, out);
    expect(sim.isIdle(new Map())).toBe(true);
  });

  it("is busy while a monster is dead waiting to respawn, and idle after it came back", () => {
    const sim = forestSim();
    const m = sim.snapshots(0).find((x) => !x.guard && x.tier === 1)!; // a weak one: the player wins
    const p = sim.addPlayer(seed());
    sim.setTarget("p1", m.id);
    const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    run(sim, 0, 10_000, new Map([["p1", here]]));
    expect(sim.isIdle(new Map())).toBe(false);
    p.hp = p.maxHp; // isolate the monster conditions from the player's own regeneration
    p.targetId = null;
    const away = new Map<string, Vec2>();
    let t = 10_100;
    for (; t < 200_000 && !sim.isIdle(new Map()); t += 100) sim.tick(t, away);
    expect(sim.isIdle(new Map())).toBe(true);
  });

  it("is busy when a living player stands within a monster's aggro range, even if the monster is idle", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed());
    const onTop: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    expect(sim.isIdle(new Map([["p1", onTop]]))).toBe(false);
    // The next tick turns that into a chase, which is exactly why pausing now would have been wrong.
    sim.tick(0, new Map([["p1", onTop]]));
    expect(sim.isIdle(new Map([["p1", onTop]]))).toBe(false);
  });

  it("a player far from every monster does not keep the room busy", () => {
    const sim = forestSim();
    sim.addPlayer(seed());
    expect(sim.isIdle(new Map([["p1", [0.5, 0.5]]]))).toBe(true);
  });

  it("is busy when a player is dead", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.dead = true;
    expect(sim.isIdle(new Map())).toBe(false);
  });
});

describe("CombatSim ranks across a sleep", () => {
  it("a rebuilt sim restores the saved classes instead of rolling again", () => {
    const first = new CombatSim(getMap("forest"), "forest", () => 0.01, 0); // 0.01 rolls the rarest class everywhere
    const saved = first.ranks();
    expect(Object.values(saved).every((r) => r.startsWith("rare2|"))).toBe(true);
    const rebuilt = new CombatSim(getMap("forest"), "forest", () => 0.99, 0, saved); // would roll "normal" everywhere
    expect(rebuilt.ranks()).toEqual(saved);
  });

  it("an unknown saved class is ignored and rolled normally", () => {
    const sim = new CombatSim(getMap("forest"), "forest", () => 0.99, 0, { m1: "bogus" as never });
    expect(sim.ranks()["m1"]).toMatch(/^normal\|/);
  });

  it("the element is rolled with the class and restored with it, and an older saved value keeps the species' own element", () => {
    const first = new CombatSim(getMap("forest"), "forest", () => 0.01, 0); // 0.01 also rolls the first element (kim)
    expect(first.snapshots(0).every((m) => m.element === "kim")).toBe(true);
    const saved = first.ranks();
    expect(Object.values(saved).every((r) => r === "rare2|kim")).toBe(true);
    const rebuilt = new CombatSim(getMap("forest"), "forest", () => 0.99, 0, saved);
    expect(rebuilt.snapshots(0).every((m) => m.element === "kim")).toBe(true);
    const older = new CombatSim(getMap("forest"), "forest", () => 0.99, 0, { m1: "rare1" });
    expect(older.snapshots(0)[0]).toMatchObject({ rank: "rare1", element: getMonsterDef("soi_rung")!.element });
  });

  it("every respawn rolls the element again", () => {
    let roll = 0.99; // rolls the last element (tho) and a normal class
    const sim = new CombatSim(getMap("forest"), "forest", () => roll, 0);
    const m = sim.snapshots(0)[0]!;
    expect(m.element).toBe("tho");
    sim.addPlayer(seed("p1", { base: { ...seed().base, linhLuc: 500 } }));
    sim.setTarget("p1", m.id);
    const positions = new Map<string, Vec2>([["p1", [m.path[0]![0] + 1, m.path[0]![1]]]]);
    run(sim, 0, 3000, positions);
    expect(sim.snapshots(3000).some((s) => s.id === m.id)).toBe(false);
    roll = 0.01; // the respawn will roll the first element (kim)
    const later = run(sim, 3100, 3000 + 16_000, positions);
    const back = later.find((e) => e.t === "mon" && e.monster.id === m.id);
    expect(back && back.t === "mon" ? back.monster.element : null).toBe("kim");
  });
});

describe("CombatSim potions and loot", () => {
  it("heal restores a fraction of max HP, clamps at max HP, and refuses dead or missing players", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.hp = 10;
    const healed = sim.heal("p1", 0.4)!;
    expect(healed).toBe(Math.min(p.maxHp, 10 + Math.round(p.maxHp * 0.4)));
    expect(p.hp).toBe(healed);
    expect(sim.heal("p1", 5)).toBe(p.maxHp); // never above max
    p.dead = true;
    expect(sim.heal("p1", 0.4)).toBeNull();
    expect(sim.heal("nobody", 0.4)).toBeNull();
  });

  it("a heal always restores at least 1 HP, even for a tiny fraction", () => {
    const sim = forestSim();
    const p = sim.addPlayer(seed());
    p.hp = 1;
    expect(sim.heal("p1", 0.0001)).toBe(2);
  });

  it("a kill emits loot to the winner when the loot roll hits, and none when every roll misses", () => {
    const killWith = (rand: () => number) => {
      const sim = new CombatSim(getMap("forest"), "forest", rand, 0);
      const m = sim.snapshots(0)[0]!;
      sim.addPlayer(seed());
      sim.setTarget("p1", m.id);
      const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
      return { m, events: run(sim, 0, 20_000, new Map([["p1", here]])) };
    };
    expect(killWith(noCrit).events.filter((e) => e.t === "loot")).toHaveLength(0); // 0.99 misses every chance
    // 0.01 rolls the rarest class everywhere and makes every chance hit.
    const { events } = killWith(() => 0.01);
    const loot = events.filter((e) => e.t === "loot");
    expect(loot.length).toBeGreaterThanOrEqual(1);
    for (const l of loot) {
      expect(l).toMatchObject({ playerId: "p1" });
      if (l.t === "loot") {
        expect(l.drops.length).toBeGreaterThan(0);
        expect(l.drops.every((d) => d.qty >= 1 && Number.isInteger(d.qty))).toBe(true);
      }
    }
  });
});

describe("skills", () => {
  const townSim = () => new CombatSim(getMap("town"), "town", noCrit, 0);
  const near = (sim: CombatSim): { id: string; at: Vec2; stand: Vec2 } => {
    const m = sim.snapshots(0)[0]!;
    return { id: m.id, at: m.path[0]!, stand: [m.path[0]![0] + 3, m.path[0]![1]] };
  };
  const at = (v: Vec2) => new Map<string, Vec2>([["p1", v]]);

  it("an attack skill spends MP, starts its cooldown and hits harder than a basic attack", () => {
    const sim = forestSim();
    const m = near(sim);
    const p = sim.addPlayer(seed("p1"));
    const startMp = p.mp;
    expect(sim.queueCast("p1", "chuong_0", m.id, 0)).toEqual({ ok: true });
    const events = sim.tick(0, at(m.stand));
    const hit = events.find((e) => e.t === "hit" && e.skill === "chuong_0");
    expect(hit).toBeDefined();
    expect(events).toContainEqual(expect.objectContaining({ t: "cast_ok", skill: "chuong_0", cdMs: 3000 }));
    expect(p.mp).toBe(startMp - 8);
    expect(events.find((e) => e.t === "mp")).toMatchObject({ mp: startMp - 8 });
    // The same player's basic hit on an identical monster does less than the power-1.6 skill.
    const basic = forestSim();
    basic.addPlayer(seed("p1"));
    basic.setTarget("p1", near(basic).id);
    const basicHit = basic.tick(0, at([near(basic).at[0] + 1, near(basic).at[1]])).find((e) => e.t === "hit" && e.from === "p1");
    expect(hit && basicHit && hit.t === "hit" && basicHit.t === "hit" && hit.damage > basicHit.damage).toBe(true);
    // Cooldown: refused until it is over.
    expect(sim.queueCast("p1", "chuong_0", m.id, 1000)).toEqual({ ok: false, reason: "cooldown" });
    expect(sim.queueCast("p1", "chuong_0", m.id, 3000)).toEqual({ ok: true });
  });

  it("refuses a skill the character does not have, without MP, without a target or without the right weapon", () => {
    const sim = forestSim();
    const m = near(sim);
    const p = sim.addPlayer(seed("p1", { granted: [...BASE_SKILLS, "ngu_kiem_tram"] }));
    expect(sim.queueCast("p1", "cuong_luc_0", null, 0)).toEqual({ ok: false, reason: "unknown" }); // a root skill of the character that it was not given
    expect(sim.queueCast("p1", "cuong_than", null, 0)).toEqual({ ok: false, reason: "unknown" }); // a book not learned
    expect(sim.queueCast("p1", "chuong_0", null, 0)).toEqual({ ok: false, reason: "no_target" });
    expect(sim.queueCast("p1", "chuong_0", "m999", 0)).toEqual({ ok: false, reason: "no_target" });
    expect(sim.queueCast("p1", "ngu_kiem_tram", m.id, 0)).toEqual({ ok: false, reason: "weapon" }); // learned, but no sword
    p.weapon = "dao";
    expect(sim.queueCast("p1", "ngu_kiem_tram", m.id, 0)).toEqual({ ok: false, reason: "weapon" });
    p.weapon = "kiem";
    expect(sim.queueCast("p1", "ngu_kiem_tram", m.id, 0)).toEqual({ ok: true });
    p.mp = 3;
    sim.cancelCast("p1");
    expect(sim.queueCast("p1", "chuong_0", m.id, 0)).toEqual({ ok: false, reason: "mp" });
  });

  it("walks into range first, and a move or a new target cancels a waiting skill", () => {
    const sim = forestSim();
    const m = near(sim);
    sim.addPlayer(seed("p1", { stage: 5 }));
    expect(sim.queueCast("p1", "tram_0", m.id, 0)).toEqual({ ok: true });
    const far: Vec2 = [m.at[0] + 12, m.at[1]];
    const first = sim.tick(0, at(far));
    expect(first.some((e) => e.t === "path_request")).toBe(true);
    expect(first.some((e) => e.t === "hit" || e.t === "cast_ok")).toBe(false);
    const arrived = sim.tick(100, at([m.at[0] + 3, m.at[1]]));
    expect(arrived.some((e) => e.t === "cast_ok" && e.skill === "tram_0")).toBe(true);

    const other = forestSim();
    const o = near(other);
    other.addPlayer(seed("p1", { stage: 5 }));
    other.queueCast("p1", "tram_0", o.id, 0);
    other.clearTarget("p1"); // a click on the ground
    expect(other.tick(0, at(o.stand)).some((e) => e.t === "cast_ok")).toBe(false);
    other.queueCast("p1", "tram_0", o.id, 0);
    other.setTarget("p1", o.id); // a new target
    expect(other.tick(0, at(o.stand)).some((e) => e.t === "cast_ok")).toBe(false);
  });

  it("a heal restores a share of max HP; a buff raises defense and ends on time", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1", { stage: 3 }));
    p.hp = 10;
    expect(sim.queueCast("p1", "hoi_0", null, 0)).toEqual({ ok: true });
    const healed = sim.tick(0, at([1, 1]));
    // The test character has a Trung phẩm root (grade 1): its skills are worth 5% more.
    expect(p.hp).toBe(10 + Math.round(p.maxHp * 0.3 * 1.05));
    expect(healed.some((e) => e.t === "hp")).toBe(true);

    const before = p.stats.defense;
    expect(sim.queueCast("p1", "thuan_0", null, 100)).toEqual({ ok: true });
    const buffed = sim.tick(100, at([1, 1]));
    expect(buffed).toContainEqual(expect.objectContaining({ t: "buff", skill: "thuan_0", ms: 15_000 }));
    expect(p.stats.defense).toBe(Math.floor(before + before * 0.3 * 1.05));
    sim.tick(10_000, at([1, 1]));
    expect(p.stats.defense).toBeGreaterThan(before); // still running
    sim.tick(15_200, at([1, 1]));
    expect(p.stats.defense).toBe(before);
    expect(p.buffs).toHaveLength(0);
  });

  it("MP regenerates with time but not for a while after a hit, and is worked out on demand", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1"));
    p.mp = 10;
    p.mpAt = 0;
    p.lastHurtAt = -1_000_000; // never hit recently
    expect(sim.currentMp(p, 0)).toBe(10);
    expect(sim.currentMp(p, 5000)).toBe(10 + Math.floor(5 * Math.max(1, p.maxMp * 0.02)));
    expect(sim.currentMp(p, 1_000_000)).toBe(p.maxMp);
    p.lastHurtAt = 4000; // hit at 4 s: regeneration waits until 9 s
    expect(sim.currentMp(p, 8000)).toBe(10);
    expect(sim.currentMp(p, 11_000)).toBe(10 + Math.floor(2 * Math.max(1, p.maxMp * 0.02)));
  });

  it("being hit stores the MP regenerated so far and tells the client", () => {
    const sim = forestSim();
    const m = near(sim);
    const p = sim.addPlayer(seed("p1"));
    p.mp = 20;
    const events = run(sim, 0, 8000, at([m.at[0] + 2, m.at[1]]));
    expect(events.some((e) => e.t === "hit" && e.to === "p1")).toBe(true);
    expect(events.some((e) => e.t === "mp")).toBe(true);
  });

  it("learning updates what a profile can use", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1"));
    expect(sim.skillsOf(p)).not.toContain("cuong_than");
    sim.addGranted("p1", "cuong_than");
    expect(sim.skillsOf(p)).toContain("cuong_than");
  });
});

describe("vitals kept across a reload", () => {
  const townSim = () => new CombatSim(getMap("town"), "town", noCrit, 0);

  it("a profile created from stored vitals starts where the character left (with the regeneration of the time away)", () => {
    const sim = townSim();
    const base = sim.addPlayer(seed("p0"));
    const now = Date.now();
    const p = sim.addPlayer(seed("p1", { vitals: { hp: 40, mp: 5, at: now - 1000, cd: { chuong_0: now + 20_000 }, buffs: [{ skill: "thuan_0", until: now + 20_000 }] } }));
    expect(p.hp).toBe(40);
    expect(p.mp).toBe(5);
    expect(p.cooldowns.get("chuong_0")).toBe(now + 20_000);
    expect(p.buffs).toHaveLength(1);
    expect(p.stats.defense).toBeGreaterThan(base.stats.defense); // the buff still counts
    // Away a long time: back to full.
    const q = sim.addPlayer(seed("p2", { vitals: { hp: 40, mp: 5, at: now - 3_600_000, cd: {}, buffs: [] } }));
    expect(q.hp).toBe(q.maxHp);
    expect(q.mp).toBe(q.maxMp);
  });

  it("a fresh character (or one whose stored copy was cleared) starts full", () => {
    const p = townSim().addPlayer(seed("p1", { vitals: null }));
    expect(p.hp).toBe(p.maxHp);
    expect(p.mp).toBe(p.maxMp);
  });

  it("what is written on leaving is null when nothing is worth keeping and when dead, and the live values otherwise", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1"));
    expect(sim.snapshotVitals("p1", 1000)).toBeNull(); // full, nothing running
    expect(sim.snapshotVitals("nobody", 1000)).toBeUndefined();
    p.hp = 30;
    p.mp = 10;
    p.mpAt = 1000;
    p.lastHurtAt = 1000;
    p.cooldowns.set("chuong_0", 9000);
    p.cooldowns.set("old", 500);
    p.buffs.push({ skill: "thuan_0", stat: "defense", pct: 0.3, until: 9000 });
    expect(sim.snapshotVitals("p1", 2000)).toEqual({ hp: 30, mp: 10, at: 2000, cd: { chuong_0: 9000 }, buffs: [{ skill: "thuan_0", until: 9000 }] });
    expect(sim.cooldownsLeft(p, 2000)).toEqual({ chuong_0: 7000 });
    p.dead = true;
    expect(sim.snapshotVitals("p1", 2000)).toBeNull();
  });
});

describe("constitution skill damage", () => {
  const effect = (targetKind: "all" | "element" | "weapon" | "skill", targetTag: string, value: number) => ({ stat: "skill_damage", targetKind, targetTag, mode: "percent" as const, value });
  const damageOf = (over: Partial<ProfileSeed>, skill = "chuong_0"): number => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed("p1", over));
    sim.queueCast("p1", skill, m.id, 0);
    const hit = sim.tick(0, new Map([["p1", [m.path[0]![0] + 3, m.path[0]![1]] as Vec2]])).find((e) => e.t === "hit" && e.skill === skill);
    return hit && hit.t === "hit" ? hit.damage : 0;
  };

  it("adds its percent to matching skills only", () => {
    const none = damageOf({});
    expect(none).toBeGreaterThan(0);
    expect(damageOf({ effects: [effect("all", "", 50)] })).toBeGreaterThan(none);
    expect(damageOf({ effects: [effect("element", "kim", 50)] })).toBeGreaterThan(none);
    expect(damageOf({ effects: [effect("skill", "chuong_0", 50)] })).toBeGreaterThan(none);
    expect(damageOf({ effects: [effect("element", "thuy", 50)] })).toBe(none);
    expect(damageOf({ effects: [effect("weapon", "kiem", 50)] })).toBe(none); // no sword in hand
    expect(damageOf({ effects: [effect("weapon", "kiem", 50)], weapon: "kiem" })).toBeGreaterThan(none);
    expect(damageOf({ effects: [effect("skill", "tram_0", 50)] })).toBe(none);
  });
});

describe("several elements (đơn ... ngũ linh căn) and the grade of the root", () => {
  const damageWith = (over: Partial<ProfileSeed>, skill: string): number => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    sim.addPlayer(seed("p1", over));
    sim.queueCast("p1", skill, m.id, 0);
    const hit = sim.tick(0, new Map([["p1", [m.path[0]![0] + 3, m.path[0]![1]] as Vec2]])).find((e) => e.t === "hit" && e.skill === skill);
    return hit && hit.t === "hit" ? hit.damage : 0;
  };
  const all = ["kim", "moc", "thuy", "hoa", "tho"] as const;

  it("a character gets the same skills however many elements it has, and an attack takes the element it was asked for", () => {
    const sim = new CombatSim(getMap("town"), "town", noCrit, 0);
    const p = sim.addPlayer(seed("p1", { roots: ["kim", "thuy"] }));
    expect(sim.skillsOf(p)).toEqual(sim.skillsOf(sim.addPlayer(seed("p2"))));
    const five = sim.addPlayer(seed("p3", { roots: [...all] }));
    expect(sim.skillsOf(five)).toHaveLength(BASE_SKILLS.length);
  });

  it("the element of a flexible attack is one of the character's own, the main one otherwise", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const p = sim.addPlayer(seed("p1", { roots: ["kim", "thuy"] }));
    sim.queueCast("p1", "chuong_0", m.id, 0, undefined, "thuy");
    expect(p.pendingCast?.element).toBe("thuy");
    sim.cancelCast("p1");
    sim.queueCast("p1", "chuong_0", m.id, 0, undefined, "hoa"); // not one of the character's elements
    expect(p.pendingCast?.element).toBe("kim");
    sim.cancelCast("p1");
    sim.queueCast("p1", "chuong_0", m.id, 0);
    expect(p.pendingCast?.element).toBe("kim");
  });

  it("the number of elements does not change damage", () => {
    const one = damageWith({ roots: ["kim"] }, "chuong_0");
    expect(one).toBeGreaterThan(0);
    for (const roots of [["kim", "moc"], ["kim", "moc", "thuy"], [...all]] as const) expect(damageWith({ roots }, "chuong_0")).toBe(one);
  });

  it("... a skill without an element uses the main element however many there are; the plain attack goes by every element (elementOutcome)", () => {
    const basic = (roots: ProfileSeed["roots"]) => {
      const sim = forestSim();
      const m = sim.snapshots(0)[0]!;
      sim.addPlayer(seed("p1", { roots }));
      sim.setTarget("p1", m.id);
      const hit = sim.tick(0, new Map([["p1", [m.path[0]![0] + 1, m.path[0]![1]] as Vec2]])).find((e) => e.t === "hit" && e.from === "p1");
      return hit && hit.t === "hit" ? hit.damage : 0;
    };
    // The first monster is a moc one (a Sói Rừng). The plain attack sums every root against it (elementOutcome): kim overcomes moc
    // (+1); moc and thuy score 0 against moc, so kim + moc and kim + moc + thuy stay at +1 (x1.2).
    const one = basic(["kim"]);
    expect(one).toBeGreaterThan(0);
    expect(basic(["kim", "moc"])).toBe(one);
    expect(basic(["kim", "moc", "thuy"])).toBe(one);
    // tho is overcome by moc (-1): it hits for 20% less than thuy (0).
    expect(basic(["tho"])).toBeLessThan(basic(["thuy"]));
    const sword = (roots: ProfileSeed["roots"]) => damageWith({ roots, granted: [...BASE_SKILLS, "ngu_kiem_tram"], weapon: "kiem" }, "ngu_kiem_tram");
    expect(sword([...all])).toBe(sword(["kim"]));
  });

  it("the grade of the root makes its skills hit harder", () => {
    const [ha, trung, thuong, dia, thien] = [0, 1, 2, 3, 4].map((rootGrade) => damageWith({ rootGrade }, "chuong_0"));
    expect(ha!).toBeLessThan(trung!);
    expect(trung!).toBeLessThan(thuong!);
    expect(thuong!).toBeLessThan(dia!);
    expect(dia!).toBeLessThan(thien!);
    expect(thien!).toBeGreaterThan(ha! * 1.2); // about +30% over +0%
  });

  it("a learned skill is used at its own grade, whatever the root grade is", () => {
    const low = damageWith({ rootGrade: 0, granted: [...BASE_SKILLS, "hoa_3"] }, "hoa_3");
    const high = damageWith({ rootGrade: 4, granted: [...BASE_SKILLS, "hoa_3"] }, "hoa_3");
    expect(low).toBeGreaterThan(0);
    expect(high).toBe(low);
  });

  it("the number of elements changes EXP only (the pace of cultivation)", () => {
    const expAfterKill = (roots: ProfileSeed["roots"]) => {
      const sim = forestSim();
      const m = sim.snapshots(0)[0]!;
      const p = sim.addPlayer(seed("p1", { roots, stage: 1 }));
      sim.setTarget("p1", m.id);
      run(sim, 0, 20_000, new Map([["p1", [m.path[0]![0] + 1, m.path[0]![1]] as Vec2]]));
      return p.expBonus;
    };
    expect(expAfterKill(["kim"])).toBeGreaterThan(expAfterKill(["kim", "moc"]));
    expect(expAfterKill(["kim", "moc"])).toBeGreaterThan(expAfterKill(["kim", "moc", "thuy"]));
    expect(expAfterKill(["kim", "moc"]) - expAfterKill([...all])).toBe(40);
  });
});

describe("effects on the buff bar and potions that work over time", () => {
  const townSim = () => new CombatSim(getMap("town"), "town", noCrit, 0);
  const at = (v: Vec2) => new Map<string, Vec2>([["p1", v]]);
  it("a buff skill lists itself with its time left, and the list shrinks when it ends", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1", { stage: 3 }));
    expect(sim.effectsOf(p, 0)).toEqual([]);
    sim.queueCast("p1", "thuan_0", null, 0);
    const events = sim.tick(0, at([1, 1]));
    expect(events).toContainEqual({ t: "effects", playerId: "p1", list: [{ id: "s:thuan_0", ms: 15_000 }] });
    expect(sim.effectsOf(p, 5000)).toEqual([{ id: "s:thuan_0", ms: 10_000 }]);
    const ended = sim.tick(15_100, at([1, 1]));
    expect(ended).toContainEqual({ t: "effects", playerId: "p1", list: [] });
  });

  it("a timed potion heals in equal steps over its duration and then leaves the list", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1"));
    p.hp = 1;
    p.lastHurtAt = 1e9; // no natural regeneration muddies the count
    const total = Math.round(p.maxHp * 0.4);
    const started = sim.startHot("p1", "duong_huyet_dan", 0.4, 5000, 0)!;
    expect(started).toEqual([{ t: "effects", playerId: "p1", list: [{ id: "i:duong_huyet_dan", ms: 5000 }] }]);
    expect(sim.isIdle(at([1, 1]))).toBe(false); // a working potion keeps the room ticking
    sim.tick(1000, at([1, 1]));
    expect(p.hp).toBe(1 + Math.floor(total / 5));
    const events = sim.tick(5000, at([1, 1]));
    expect(p.hp).toBe(Math.min(p.maxHp, 1 + total));
    expect(events).toContainEqual({ t: "effects", playerId: "p1", list: [] });
    expect(p.hots).toHaveLength(0);
  });

  it("drinking again while one still works keeps what was left, and the stored copy counts the rest", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1"));
    p.hp = 1;
    p.lastHurtAt = 1e9; // no natural regeneration muddies the count
    const total = Math.round(p.maxHp * 0.4);
    sim.startHot("p1", "duong_huyet_dan", 0.4, 5000, 0);
    sim.tick(2000, at([1, 1])); // two of five steps have landed
    sim.startHot("p1", "duong_huyet_dan", 0.4, 5000, 2000);
    expect(p.hots).toHaveLength(1);
    expect(p.hots[0]!.amounts.reduce((a, b) => a + b, 0)).toBe(total * 2 - 2 * Math.floor(total / 5));
    const hpBefore = p.hp;
    const stored = sim.snapshotVitals("p1", 2100);
    expect(stored && stored.hp).toBe(Math.min(p.maxHp, hpBefore + p.hots[0]!.amounts.reduce((a, b) => a + b, 0)));
    // The snapshot is also taken by the periodic save while the player stays: it must leave the live profile alone.
    expect(p.hp).toBe(hpBefore);
    expect(p.hots).toHaveLength(1);
  });

  it("a dodge buff adds percentage points of dodge chance, capped like the base rate", () => {
    const sim = townSim();
    const p = sim.addPlayer(seed("p1"));
    const before = p.stats.dodgeRate;
    p.buffs.push({ skill: "pt_phong_than", stat: "dodge", pct: 0.2, until: 9000 });
    sim.updateBase("p1", p.base); // recompute
    expect(p.stats.dodgeRate).toBeCloseTo(before + 20);
    p.buffs[0]!.pct = 5;
    sim.updateBase("p1", p.base);
    expect(p.stats.dodgeRate).toBe(60);
  });
});

describe("skills from worn pháp bảo and teleport", () => {
  const sim = () => new CombatSim(getMap("forest"), "forest", noCrit, 0);
  const at = (v: Vec2) => new Map<string, Vec2>([["p1", v]]);
  const spawn = (): Vec2 => [getMap("forest").spawn[0] + 0.5, getMap("forest").spawn[1] + 0.5];

  it("a gear skill is usable only while the piece is worn", () => {
    const s = sim();
    const p = s.addPlayer(seed("p1", { gearSkills: [{ id: "pt_phong_than", realm: 0, tier: 1, grade: 0 }] }));
    expect(s.skillsOf(p)).toContain("pt_phong_than");
    expect(s.queueCast("p1", "pt_phong_than", null, 0)).toEqual({ ok: true });
    s.updateGear("p1", p.gear ?? { attack: 0, defense: 0, maxHp: 0, critRate: 0, dodgeRate: 0, moveSpeed: 0 }, undefined, []);
    expect(s.skillsOf(p)).not.toContain("pt_phong_than");
    expect(s.queueCast("p1", "pt_phong_than", null, 100)).toEqual({ ok: false, reason: "unknown" });
  });

  it("the dodge buff raises the dodge chance and shows on the buff bar", () => {
    const s = sim();
    const p = s.addPlayer(seed("p1", { gearSkills: [{ id: "pt_phong_than", realm: 0, tier: 1, grade: 0 }] }));
    const before = p.stats.dodgeRate;
    s.queueCast("p1", "pt_phong_than", null, 0);
    const events = s.tick(0, at(spawn()));
    expect(p.stats.dodgeRate).toBeCloseTo(before + 25);
    expect(events).toContainEqual({ t: "effects", playerId: "p1", list: [{ id: "s:pt_phong_than", ms: 12_000 }] });
  });

  it("a teleport emits where to move, pays and starts the cooldown", () => {
    const s = sim();
    const p = s.addPlayer(seed("p1", { gearSkills: [{ id: "pt_thuan_di", realm: 0, tier: 1, grade: 0 }] }));
    const from = spawn();
    const near = nearestStandablePoint(getMap("forest"), from[0] + 4, from[1]) ?? from;
    p.targetId = "m1";
    const mpBefore = s.currentMp(p, 0);
    expect(s.queueCast("p1", "pt_thuan_di", null, 0, near)).toEqual({ ok: true });
    const events = s.tick(0, at(from));
    expect(events).toContainEqual({ t: "teleport", playerId: "p1", to: near });
    expect(events.some((e) => e.t === "cast_ok")).toBe(true);
    expect(s.currentMp(p, 0)).toBe(mpBefore - 30);
    expect(p.targetId).toBeNull();
    expect(s.queueCast("p1", "pt_thuan_di", null, 1000, near)).toEqual({ ok: false, reason: "cooldown" });
  });

  it("a teleport needs a point, and a point too far or not standable is refused without paying", () => {
    const s = sim();
    const p = s.addPlayer(seed("p1", { gearSkills: [{ id: "pt_thuan_di", realm: 0, tier: 1, grade: 0 }] }));
    const from = spawn();
    expect(s.queueCast("p1", "pt_thuan_di", null, 0)).toEqual({ ok: false, reason: "no_target" });
    s.queueCast("p1", "pt_thuan_di", null, 0, [from[0] + 30, from[1]]);
    const far = s.tick(0, at(from));
    expect(far).toContainEqual({ t: "cast_fail", playerId: "p1", skill: "pt_thuan_di", reason: "range" });
    s.queueCast("p1", "pt_thuan_di", null, 100, [-5, -5]);
    const wall = s.tick(100, at(from));
    expect(wall.some((e) => e.t === "cast_fail" && (e.reason === "range" || e.reason === "blocked"))).toBe(true);
    expect(wall.some((e) => e.t === "teleport")).toBe(false);
    expect(s.currentMp(p, 100)).toBe(p.maxMp); // nothing was paid
    expect(p.cooldowns.has("pt_thuan_di")).toBe(false);
  });
});

describe("mastery, realm and passives in the simulation", () => {
  const at = (v: Vec2) => new Map<string, Vec2>([["p1", v]]);
  /** A forest sim with a character one tile from a monster, ready to cast. */
  const setup = (over: Partial<ProfileSeed> = {}) => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const p = sim.addPlayer(seed("p1", over));
    return { sim, m, p, stand: [m.path[0]![0] + 2, m.path[0]![1]] as Vec2 };
  };

  it("a skill that lands gains one mastery point, and the event carries the new values", () => {
    const { sim, m, p, stand } = setup();
    sim.queueCast("p1", "chuong_0", m.id, 0);
    const events = sim.tick(0, at(stand));
    expect(events).toContainEqual({ t: "mastery", playerId: "p1", skill: "chuong_0", lv: 0, xp: 1, up: false });
    expect(p.masteries.chuong_0).toEqual({ lv: 0, xp: 1 });
  });

  it("enough points raise the level, which makes the same skill hit harder and cool down faster later on", () => {
    const damage = (state?: Record<string, { lv: number; xp: number }>) => {
      const { sim, m, stand } = setup({ skillState: state, rootGrade: 4 });
      sim.queueCast("p1", "chuong_0", m.id, 0);
      const hit = sim.tick(0, at(stand)).find((e) => e.t === "hit" && e.skill === "chuong_0");
      return hit && hit.t === "hit" ? hit.damage : 0;
    };
    expect(damage({ chuong_0: { lv: 2, xp: 0 } })).toBeGreaterThan(damage());
    const { sim, m, p, stand } = setup({ skillState: { chuong_0: { lv: 0, xp: masteryNeeded(0)! - 1 } } });
    sim.queueCast("p1", "chuong_0", m.id, 0);
    const events = sim.tick(0, at(stand));
    expect(events).toContainEqual({ t: "mastery", playerId: "p1", skill: "chuong_0", lv: 1, xp: 0, up: true });
    expect(p.masteries.chuong_0).toEqual({ lv: 1, xp: 0 });
  });

  it("a miss teaches nothing, and neither does healing at full HP", () => {
    const { sim, p } = setup();
    expect(p.hp).toBe(p.maxHp);
    sim.queueCast("p1", "hoi_0", null, 0);
    const events = sim.tick(0, at([1, 1]));
    expect(events.some((e) => e.t === "mastery")).toBe(false);
    p.hp = 5;
    sim.queueCast("p1", "hoi_0", null, 10_000);
    expect(sim.tick(10_000, at([1, 1])).some((e) => e.t === "mastery")).toBe(true);
  });

  it("gear skills have no mastery", () => {
    const sim = forestSim();
    const m = sim.snapshots(0)[0]!;
    const p = sim.addPlayer(seed("p1", { gearSkills: [{ id: "pb_kim_1", realm: 0, tier: 1, grade: 0 }] }));
    sim.queueCast("p1", "pb_kim_1", m.id, 0);
    const events = sim.tick(0, at([m.path[0]![0] + 2, m.path[0]![1]]));
    expect(events.some((e) => e.t === "hit" && e.skill === "pb_kim_1")).toBe(true);
    expect(events.some((e) => e.t === "mastery")).toBe(false);
    expect(p.masteries.pb_kim).toBeUndefined();
  });

  it("a piece of a higher bậc in the same realm gives a stronger gear skill (LK4 beats LK1)", () => {
    const hit = (tier: number) => {
      const sim = forestSim();
      const m = sim.snapshots(0)[0]!;
      sim.addPlayer(seed("p1", { gearSkills: [{ id: "pb_kim_1", realm: 0, tier, grade: 0 }] }));
      sim.queueCast("p1", "pb_kim_1", m.id, 0);
      const e = sim.tick(0, at([m.path[0]![0] + 2, m.path[0]![1]])).find((x) => x.t === "hit" && x.skill === "pb_kim_1");
      return e && e.t === "hit" ? e.damage : 0;
    };
    expect(hit(4)).toBeGreaterThan(hit(1));
    expect(hit(9)).toBeGreaterThan(hit(4));
  });

  it("a piece of a higher realm gives a stronger gear skill than a piece of the first realm", () => {
    const hit = (realm: number) => {
      const sim = forestSim();
      const m = sim.snapshots(0)[0]!;
      sim.addPlayer(seed("p1", { gearSkills: [{ id: "pb_kim_1", realm, tier: 1, grade: 0 }] }));
      sim.queueCast("p1", "pb_kim_1", m.id, 0);
      const e = sim.tick(0, at([m.path[0]![0] + 2, m.path[0]![1]])).find((x) => x.t === "hit" && x.skill === "pb_kim_1");
      return e && e.t === "hit" ? e.damage : 0;
    };
    expect(hit(1)).toBeGreaterThan(hit(0));
  });

  it("a passive skill is never cast, but it raises the stats all the time, more at a higher level", () => {
    const plain = setup().p.stats.attack;
    const { sim, p } = setup({ granted: [...BASE_SKILLS, "bd_cong_0"] });
    expect(p.stats.attack).toBeGreaterThan(plain);
    expect(sim.queueCast("p1", "bd_cong_0", null, 0)).toEqual({ ok: false, reason: "unknown" });
    const trained = setup({ granted: [...BASE_SKILLS, "bd_cong_0"], skillState: { bd_cong_0: { lv: 3, xp: 0 } } }).p.stats.attack;
    expect(trained).toBeGreaterThan(p.stats.attack);
    const crit = setup({ granted: [...BASE_SKILLS, "bd_mang_0"] }).p;
    expect(crit.stats.critRate).toBeGreaterThan(setup().p.stats.critRate);
  });

  it("a level gained from a pill (setMastery) re-derives the passives at once", () => {
    const { sim, p } = setup({ granted: [...BASE_SKILLS, "bd_thu_0"] });
    const before = p.stats.defense;
    sim.setMastery("p1", "bd_thu_0", 2, 0);
    expect(p.stats.defense).toBeGreaterThan(before);
  });

  it("a buff cast with a higher mastery level is stronger", () => {
    const pct = (lv: number) => {
      const { sim, p } = setup({ skillState: { thuan_0: { lv, xp: 0 } } });
      sim.queueCast("p1", "thuan_0", null, 0);
      sim.tick(0, at([1, 1]));
      return p.buffs[0]!.pct;
    };
    expect(pct(3)).toBeGreaterThan(pct(0));
  });
});

describe("hướng tu in the simulation", () => {
  const withPaths = (paths: ProfileSeed["paths"], over: Partial<ProfileSeed> = {}) => {
    const sim = forestSim();
    return { sim, p: sim.addPlayer(seed("p1", { paths, ...over })) };
  };

  it("the chủ tu adds its stats; a phụ tu adds half", () => {
    // A strong character, so the percentages are not lost in rounding.
    const big = { base: { ...seed().base, linhLuc: 300, canCot: 100 } };
    const none = withPaths(undefined, big).p;
    const kiemMain = withPaths({ main: "kiem", subs: [] }, big).p;
    const kiemSub = withPaths({ main: "dan", subs: ["kiem"] }, big).p;
    expect(kiemMain.stats.attack).toBeGreaterThan(none.stats.attack);
    expect(kiemSub.stats.attack).toBeGreaterThan(none.stats.attack);
    expect(kiemMain.stats.attack - none.stats.attack).toBeGreaterThan(kiemSub.stats.attack - none.stats.attack);
    expect(withPaths({ main: "thuat", subs: [] }, big).p.maxMp).toBeGreaterThan(none.maxMp);
    expect(withPaths({ main: "dan", subs: [] }, big).p.stats.defense).toBeGreaterThan(none.stats.defense);
  });

  it("each phụ tu slows the EXP gained: x 1 / (1 + k n), the chủ tu alone does not", () => {
    const base = withPaths(undefined).p.expBonus;
    expect(withPaths({ main: "kiem", subs: [] }).p.expBonus).toBe(base);
    const one = withPaths({ main: "kiem", subs: ["dan"] }).p.expBonus;
    const two = withPaths({ main: "kiem", subs: ["dan", "thuat"] }).p.expBonus;
    expect(one).toBeLessThan(base);
    expect(two).toBeLessThan(one);
    expect((1 + one / 100) / (1 + base / 100)).toBeCloseTo(1 / 1.25, 6);
    expect((1 + two / 100) / (1 + base / 100)).toBeCloseTo(1 / 1.5, 6);
  });

  it("setPaths applies at once", () => {
    const { sim, p } = withPaths(undefined);
    const before = p.stats.attack;
    sim.setPaths("p1", { main: "kiem", subs: [] });
    expect(p.stats.attack).toBeGreaterThan(before);
  });

  it("a Thuật tu hits harder with an element skill, a Kiếm tu with a kiếm in hand", () => {
    const dmg = (paths: ProfileSeed["paths"], over: Partial<ProfileSeed> = {}) => {
      const sim = forestSim();
      const m = sim.snapshots(0)[0]!;
      sim.addPlayer(seed("p1", { paths, granted: [...BASE_SKILLS], ...over }));
      const r = sim.queueCast("p1", "chuong_0", m.id, 0);
      expect(r.ok).toBe(true);
      const events = sim.tick(0, new Map([["p1", [m.path[0]![0] + 1, m.path[0]![1]] as Vec2]]));
      const hit = events.find((e) => e.t === "hit" && e.from === "p1");
      return hit && hit.t === "hit" ? hit.damage : 0;
    };
    const none = dmg(undefined);
    expect(dmg({ main: "thuat", subs: [] })).toBeGreaterThan(none);
    expect(dmg({ main: "kiem", subs: [] }, { weapon: "kiem" })).toBeGreaterThan(none);
  });

  it("a path skill is weaker as a phụ tu", () => {
    const def = getSkill("kt_kiem_khi")!;
    const main = effectiveSkill(def, skillContextOf({ rootGrade: 1, realm: 1, paths: { main: "kiem", subs: [] } }, def));
    const sub = effectiveSkill(def, skillContextOf({ rootGrade: 1, realm: 1, paths: { main: "dan", subs: ["kiem"] } }, def));
    expect(sub.power).toBeCloseTo(main.power * 0.5, 6);
  });
});

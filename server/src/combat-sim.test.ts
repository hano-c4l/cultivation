import { SPAWNS, getMap, startingStats, type Vec2 } from "@game/shared";
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
    expect(forestSim().monsterCount).toBe(SPAWNS.forest.length);
    expect(new CombatSim(getMap("town"), "town", noCrit, 0).monsterCount).toBe(0);
  });

  it("snapshots carry a path, hp and the kind", () => {
    const [m] = forestSim().snapshots(0);
    expect(m).toMatchObject({ id: "m1", kind: "soi_rung" });
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
    const p = sim.addPlayer(seed("p1", { exp: 99, base: { ...seed().base, linhLuc: 500 } }));
    const here: Vec2 = [m.path[0]![0] + 1, m.path[0]![1]];
    sim.setTarget("p1", m.id);
    const events = run(sim, 0, 3000, new Map([["p1", here]]));
    const progress = events.find((e) => e.t === "progress");
    expect(progress).toMatchObject({ stagesGained: 1 });
    expect(p.stage).toBe(2);
    expect(p.pendingPoints).toBe(5);
    expect(p.potentialPoints).toBe(10);
    expect(p.hp).toBe(p.maxHp);
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
    expect(run(sim, 0, 3000, new Map([["p1", here]])).some((e) => e.t === "hit" && e.to === m.id)).toBe(false);
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
});

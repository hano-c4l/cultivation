import { GUARDS, getMap, startingStats, type Vec2 } from "@game/shared";
import { describe, expect, it } from "vitest";
import { CombatSim, type ProfileSeed, type SimEvent } from "./combat-sim";

const noCrit = () => 0.99;
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
  stage: 9, // the top of the forest's own realm
  exp: 0,
  ...over,
});

function forest() {
  const sim = new CombatSim(getMap("forest"), "forest", noCrit, 0);
  const guards = sim.snapshots(0).filter((m) => m.guard);
  return { sim, guards };
}

const run = (sim: CombatSim, from: number, to: number, positions: Map<string, Vec2>): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let t = from; t <= to; t += 100) out.push(...sim.tick(t, positions));
  return out;
};

/** A player standing right beside the first guard. */
function beside(guard: { path: Vec2[] }): Vec2 {
  const g = guard.path[0]!;
  return [g[0] + 1, g[1]];
}

describe("guards", () => {
  it("stand at the gate of the forest, after every cluster monster, and are flagged in their snapshot", () => {
    const { sim, guards } = forest();
    expect(guards).toHaveLength(GUARDS.forest.length);
    expect(guards.every((g) => g.kind === "ve_binh" && g.rank === "normal")).toBe(true);
    const ids = sim.snapshots(0).map((m) => Number(m.id.slice(1)));
    expect(Math.min(...guards.map((g) => Number(g.id.slice(1))))).toBeGreaterThan(Math.max(...sim.snapshots(0).filter((m) => !m.guard).map((m) => Number(m.id.slice(1)))));
    expect(ids.length).toBe(new Set(ids).size);
    // Their class never rerolls and is not kept across a sleep.
    expect(Object.keys(sim.ranks()).some((id) => guards.some((g) => g.id === id))).toBe(false);
  });

  it("ignore white, yellow and orange names beside them, and the room can sleep with them there", () => {
    for (const satNhan of [0, 50, 300]) {
      const { sim, guards } = forest();
      const p = sim.addPlayer(seed("p", { satNhan, satNhanAt: 0 }));
      const pos = new Map<string, Vec2>([["p", beside(guards[0]!)]]);
      const events = run(sim, 0, 5000, pos);
      expect(events.some((e) => e.t === "hit" && e.to === "p"), `satNhan ${satNhan}`).toBe(false);
      expect(p.hp).toBe(p.maxHp);
      expect(sim.isIdle(pos)).toBe(true);
    }
  });

  it("go for a red name in range, and win against one of the map's own level", () => {
    const { sim, guards } = forest();
    const p = sim.addPlayer(seed("p", { satNhan: 600, satNhanAt: 0 }));
    const pos = new Map<string, Vec2>([["p", beside(guards[0]!)]]);
    expect(sim.isIdle(pos)).toBe(false); // a red name in range keeps the room awake
    const events = run(sim, 0, 60_000, pos);
    expect(events.some((e) => e.t === "hit" && e.to === "p")).toBe(true);
    expect(p.dead).toBe(true);
    expect(events.some((e) => e.t === "player_dead" && e.playerId === "p" && !("by" in e && e.by))).toBe(true); // a guard is not a player: nobody collects a drop
  });

  it("a name that was red but has fallen below 501 by now is left alone (sát nhân falls with the sim clock)", () => {
    const { sim, guards } = forest();
    sim.addPlayer(seed("p", { satNhan: 505, satNhanAt: 0 }));
    const pos = new Map<string, Vec2>([["p", beside(guards[0]!)]]);
    const events = run(sim, 120_000, 125_000, pos); // two minutes later: 505 - 10
    expect(events.some((e) => e.t === "hit" && e.to === "p")).toBe(false);
  });

  it("can be attacked only with the PK state on and not by a protected player; whoever hits one is chased", () => {
    const { sim, guards } = forest();
    const gid = guards[0]!.id;
    const p = sim.addPlayer(seed("p"));
    expect(sim.setTarget("p", gid)).toBe(false); // PK off
    sim.setPkMode("p", 1);
    const young = sim.addPlayer(seed("y", { stage: 4 }));
    sim.setPkMode("y", 1);
    expect(sim.setTarget("y", gid)).toBe(false); // newbie protection
    expect(young.targetId).toBeNull();
    expect(sim.setTarget("p", gid)).toBe(true);
    const pos = new Map<string, Vec2>([["p", beside(guards[0]!)]]);
    const events = run(sim, 0, 8000, pos);
    expect(events.some((e) => e.t === "hit" && e.from === "p" && e.to === gid)).toBe(true);
    expect(events.some((e) => e.t === "hit" && e.from === gid && e.to === "p")).toBe(true);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it("killing one pays nothing and reports the kill; it respawns", () => {
    const { sim, guards } = forest();
    const gid = guards[0]!.id;
    const p = sim.addPlayer(seed("p"));
    p.stats.attack = 1_000_000; // one blow
    sim.setPkMode("p", 1);
    sim.setTarget("p", gid);
    const pos = new Map<string, Vec2>([["p", beside(guards[0]!)]]);
    const events = run(sim, 0, 3000, pos);
    expect(events.filter((e) => e.t === "guard_kill")).toEqual([{ t: "guard_kill", killerId: "p" }]);
    for (const t of ["kill", "progress", "loot", "drop", "refine"]) expect(events.some((e) => e.t === t), t).toBe(false);
    expect(p.exp).toBe(0);
    const later = run(sim, 3100, 70_000, pos);
    expect(later.some((e) => e.t === "mon" && e.monster.id === gid)).toBe(true); // respawned
  });
});

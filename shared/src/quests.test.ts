import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./protocol";
import { DEFAULT_QUESTS, countsProgress, killCounts, objectiveTarget, questGrantKey, questStatus, validateQuests, type QuestDef } from "./quests";
import { MAPS_NPC_IDS } from "./map";

const NPCS = new Set(["elder", "merchant"]);
const base = DEFAULT_QUESTS[0] as QuestDef;
const withObjective = (objective: QuestDef["objective"]): QuestDef => ({ ...base, id: "q_test", requires: null, objective });

describe("the default quests", () => {
  it("are a valid catalogue, in order, given by an NPC that exists", () => {
    expect(validateQuests(DEFAULT_QUESTS, MAPS_NPC_IDS)).toEqual([]);
    expect(DEFAULT_QUESTS.map((q) => q.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(DEFAULT_QUESTS.every((q) => q.giver === "elder" && q.enabled)).toBe(true);
    expect(MAPS_NPC_IDS.has("elder") && MAPS_NPC_IDS.has("merchant")).toBe(true);
  });

  it("form one chain where each quest needs the one before", () => {
    DEFAULT_QUESTS.forEach((q, i) => expect(q.requires).toBe(i === 0 ? null : (DEFAULT_QUESTS[i - 1] as QuestDef).id));
  });
});

describe("validateQuests", () => {
  it("accepts every objective kind", () => {
    for (const o of [
      { kind: "talk", npc: "merchant" },
      { kind: "kill", count: 3 },
      { kind: "kill", count: 1, map: "forest", rare: true },
      { kind: "collect", item: "linh_thao", qty: 2 },
      { kind: "reach", realm: 0, stage: 9 },
    ] as const)
      expect(validateQuests([withObjective(o)], NPCS)).toEqual([]);
  });

  it("allows a prerequisite listed later (a chain that sorts before the one it needs)", () => {
    const early: QuestDef = { ...base, id: "a_first", chain: "a_chain", seq: 1, requires: "newbie_6" };
    expect(validateQuests([early, ...DEFAULT_QUESTS], MAPS_NPC_IDS)).toEqual([]);
  });

  it("rejects bad data (the same check an admin edit must pass)", () => {
    expect(validateQuests([{ ...base, giver: "nobody" }], NPCS).join()).toMatch(/unknown giver/);
    expect(validateQuests([withObjective({ kind: "talk", npc: "ghost" })], NPCS).join()).toMatch(/not an NPC/);
    expect(validateQuests([withObjective({ kind: "kill", count: 0 })], NPCS).join()).toMatch(/kill count/);
    expect(validateQuests([withObjective({ kind: "collect", item: "no_such_item", qty: 1 })], NPCS).join()).toMatch(/collect item/);
    expect(validateQuests([withObjective({ kind: "reach", realm: 0, stage: 10 })], NPCS).join()).toMatch(/realm or stage/);
    expect(validateQuests([{ ...base, rewards: { linhThach: -5 } }], NPCS).join()).toMatch(/Linh Thạch/);
    expect(validateQuests([{ ...base, rewards: { items: [{ item: "nope", qty: 1 }] } }], NPCS).join()).toMatch(/reward item/);
    expect(validateQuests([{ ...base, requires: "missing" }], NPCS).join()).toMatch(/does not exist/);
    expect(validateQuests([{ ...base, requires: base.id }], NPCS).join()).toMatch(/requires itself/);
    expect(validateQuests([{ ...base, id: "a", requires: "b" }, { ...base, id: "b", requires: "a" }], NPCS).join()).toMatch(/requires itself/);
    expect(validateQuests([base, base], NPCS).join()).toMatch(/duplicate/);
    expect(validateQuests([{ ...base, id: "Bad Id" }], NPCS).join()).toMatch(/bad id/);
  });
});

describe("objectives and status", () => {
  it("target, what is counted while active, and which kills count", () => {
    expect(objectiveTarget({ kind: "kill", count: 7 })).toBe(7);
    expect(objectiveTarget({ kind: "collect", item: "linh_thao", qty: 5 })).toBe(5);
    expect(objectiveTarget({ kind: "talk", npc: "merchant" })).toBe(1);
    expect(objectiveTarget({ kind: "reach", realm: 0, stage: 5 })).toBe(1);
    expect(countsProgress({ kind: "kill", count: 1 })).toBe(true);
    expect(countsProgress({ kind: "collect", item: "linh_thao", qty: 1 })).toBe(false);
    const o = { kind: "kill", count: 1, map: "forest", rare: true } as const;
    expect(killCounts(o, "forest", true)).toBe(true);
    expect(killCounts(o, "forest", false)).toBe(false);
    expect(killCounts(o, "cave", true)).toBe(false);
    expect(killCounts({ kind: "kill", count: 1 }, "cave", false)).toBe(true);
    expect(killCounts({ kind: "talk", npc: "merchant" }, "forest", true)).toBe(false);
  });

  it("locked until the previous quest is done, then available, active, done", () => {
    const [q1, q2] = DEFAULT_QUESTS as [QuestDef, QuestDef];
    expect(questStatus(q1, {})).toBe("available");
    expect(questStatus(q2, {})).toBe("locked");
    expect(questStatus(q2, { [q1.id]: { state: "active", progress: 0 } })).toBe("locked");
    expect(questStatus(q2, { [q1.id]: { state: "done", progress: 1 } })).toBe("available");
    expect(questStatus(q1, { [q1.id]: { state: "active", progress: 0 } })).toBe("active");
    expect(questStatus(q1, { [q1.id]: { state: "done", progress: 1 } })).toBe("done");
  });

  it("the grant key is per character and quest", () => {
    expect(questGrantKey("c1", "newbie_1")).toBe("quest:c1:newbie_1");
  });
});

describe("quest messages", () => {
  it("parse with a valid NPC and quest id only", () => {
    expect(parseClientMessage('{"t":"quest_accept","npc":"elder","quest":"newbie_1"}')).toEqual({ t: "quest_accept", npc: "elder", quest: "newbie_1" });
    expect(parseClientMessage('{"t":"quest_turn_in","npc":"elder","quest":"newbie_1"}')).toEqual({ t: "quest_turn_in", npc: "elder", quest: "newbie_1" });
    expect(parseClientMessage('{"t":"quest_accept","npc":"elder","quest":"Bad Id"}')).toBeNull();
    expect(parseClientMessage('{"t":"quest_accept","npc":"E!","quest":"x"}')).toBeNull();
    expect(parseClientMessage('{"t":"quest_turn_in","npc":"elder"}')).toBeNull();
  });
});

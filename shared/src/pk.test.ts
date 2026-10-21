import { describe, expect, it } from "vitest";
import { deathDurabilityLoss } from "./equipment-data";
import { parseClientMessage } from "./protocol";
import { DEATH_DURABILITY_BY_TIER, satNhanAfterDeath, GRAY_WINDOW_MS, applyGuardKill, applyPvpKill, canStartPvp, decayedSatNhan, displayColor, heroBonus, isPkProtected, nameTier, satKhiDamagePct, type PkScores } from "./pk";

const scores = (satKhi = 0, satNhan = 0, hero = 0): PkScores => ({ satKhi, satNhan, hero });

describe("newbie protection", () => {
  it("covers everyone below Luyện Khí tầng 5", () => {
    expect(isPkProtected(0, 1)).toBe(true);
    expect(isPkProtected(0, 4)).toBe(true);
    expect(isPkProtected(0, 5)).toBe(false);
    expect(isPkProtected(0, 9)).toBe(false);
    expect(isPkProtected(1, 1)).toBe(false);
  });
});

describe("sát khí damage", () => {
  it("is 0 up to 200, 5% just above, rising evenly to 15% at 1000 and no higher", () => {
    expect(satKhiDamagePct(0)).toBe(0);
    expect(satKhiDamagePct(200)).toBe(0);
    expect(satKhiDamagePct(201)).toBeCloseTo(5.0125, 3);
    expect(satKhiDamagePct(600)).toBeCloseTo(10, 5);
    expect(satKhiDamagePct(1000)).toBeCloseTo(15, 5);
    expect(satKhiDamagePct(5000)).toBe(15);
  });
});

describe("name colours", () => {
  it("white is 0, yellow 1-200, orange 201-500, red 501 and up", () => {
    expect([0, 1, 200, 201, 500, 501, 9999].map(nameTier)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it("a white or yellow player who attacked the viewer in the last 3 minutes shows grey to that viewer only", () => {
    const now = 1_000_000;
    expect(displayColor(0, now - 1000, now)).toBe("gray");
    expect(displayColor(1, now - GRAY_WINDOW_MS + 1, now)).toBe("gray");
    expect(displayColor(1, now - GRAY_WINDOW_MS, now)).toBe(1); // 3 minutes without attacking: back to normal
    expect(displayColor(0, undefined, now)).toBe(0); // everyone else sees the real colour
    expect(displayColor(2, now - 1000, now)).toBe(2); // orange and red stay orange and red
    expect(displayColor(3, now - 1000, now)).toBe(3);
  });
});

describe("sát nhân decay", () => {
  it("falls 5 a minute while online and never below 0", () => {
    expect(decayedSatNhan(100, 60_000)).toBe(95);
    expect(decayedSatNhan(100, 10 * 60_000)).toBe(50);
    expect(decayedSatNhan(10, 10 * 60_000)).toBe(0);
    expect(decayedSatNhan(100, -5)).toBe(100);
  });
});

describe("hero bonuses", () => {
  it("200 gives +5% MP, 500 gives +10% MP and +5% drops, not added together", () => {
    expect(heroBonus(199)).toEqual({ mpPct: 0, dropPct: 0 });
    expect(heroBonus(200)).toEqual({ mpPct: 5, dropPct: 0 });
    expect(heroBonus(499)).toEqual({ mpPct: 5, dropPct: 0 });
    expect(heroBonus(500)).toEqual({ mpPct: 10, dropPct: 5 });
    expect(heroBonus(5000)).toEqual({ mpPct: 10, dropPct: 5 });
  });
});

describe("killing a player", () => {
  it("a white name: +10 sát khí, +100 sát nhân, hero reset; the victim loses 50 sát khí", () => {
    const r = applyPvpKill(scores(5, 0, 300), scores(80, 0, 0), 0, false);
    expect(r.killer).toEqual(scores(15, 100, 0));
    expect(r.victim).toEqual(scores(30, 0, 0));
  });

  it("a yellow name counts like a white one, and the victim's own sát nhân drops by 50", () => {
    const r = applyPvpKill(scores(0, 30, 0), scores(0, 120, 0), 120, false);
    expect(r.killer).toEqual(scores(10, 130, 0));
    expect(r.victim.satNhan).toBe(70);
  });

  it("self defence (the victim attacked first and showed white or yellow): sát khí only, hero kept", () => {
    const r = applyPvpKill(scores(0, 0, 250), scores(0, 0, 0), 0, true);
    expect(r.killer).toEqual(scores(10, 0, 250));
  });

  it("with sát nhân at 0, an orange victim gives +20 hero and a red one +50; sát nhân stays 0", () => {
    expect(applyPvpKill(scores(0, 0, 0), scores(), 300, false).killer).toEqual(scores(10, 0, 20));
    expect(applyPvpKill(scores(0, 0, 40), scores(), 700, false).killer).toEqual(scores(10, 0, 90));
  });

  it("with sát nhân above 0, an orange victim takes 50 off it and a red one 100; no hero points, nothing carries over", () => {
    expect(applyPvpKill(scores(0, 120, 7), scores(), 300, false).killer).toEqual(scores(10, 70, 7));
    expect(applyPvpKill(scores(0, 120, 7), scores(), 700, false).killer).toEqual(scores(10, 20, 7));
    expect(applyPvpKill(scores(0, 30, 7), scores(), 700, false).killer).toEqual(scores(10, 0, 7)); // floor at 0, the rest is lost
  });

  it("uses the killer's CURRENT sát nhân (after decay) when it is given", () => {
    expect(applyPvpKill(scores(0, 3, 0), scores(), 300, false, 0).killer).toEqual(scores(10, 0, 20));
  });

  it("the victim's sát khí never goes below 0", () => {
    expect(applyPvpKill(scores(), scores(20, 0, 0), 0, false).victim.satKhi).toBe(0);
  });
});

describe("killing a guard", () => {
  it("adds sát khí and sát nhân like a white name and resets the hero points", () => {
    expect(applyGuardKill(scores(0, 0, 500))).toEqual(scores(10, 100, 0));
    expect(applyGuardKill(scores(10, 40, 0), 25)).toEqual(scores(20, 125, 0));
  });
});

describe("PvP messages", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  it("attack and cast may name a player (a uuid) as well as a monster", () => {
    expect(parseClientMessage(`{"t":"attack","id":"m12"}`)).toEqual({ t: "attack", id: "m12" });
    expect(parseClientMessage(`{"t":"attack","id":"${uuid}"}`)).toEqual({ t: "attack", id: uuid });
    expect(parseClientMessage(`{"t":"attack","id":"bad id"}`)).toBeNull();
    expect(parseClientMessage(`{"t":"cast","skill":"chuong_0","target":"${uuid}","el":"kim"}`)).toMatchObject({ t: "cast", target: uuid });
  });
  it("the PK state is 0, 1 or 2", () => {
    expect(parseClientMessage(`{"t":"pk_mode","mode":0}`)).toEqual({ t: "pk_mode", mode: 0 });
    expect(parseClientMessage(`{"t":"pk_mode","mode":2}`)).toEqual({ t: "pk_mode", mode: 2 });
    expect(parseClientMessage(`{"t":"pk_mode","mode":3}`)).toBeNull();
    expect(parseClientMessage(`{"t":"pk_mode","mode":"yes"}`)).toBeNull();
    expect(parseClientMessage(`{"t":"pk_mode","on":true}`)).toBeNull();
  });
  it("who may start a fight: off never, PK only against PK or Đồ sát, Đồ sát against anyone", () => {
    expect([0, 1, 2].map((t) => canStartPvp(0, t as 0 | 1 | 2))).toEqual([false, false, false]);
    expect([0, 1, 2].map((t) => canStartPvp(1, t as 0 | 1 | 2))).toEqual([false, true, true]);
    expect([0, 1, 2].map((t) => canStartPvp(2, t as 0 | 1 | 2))).toEqual([true, true, true]);
  });
  it("a connection report carries the close code, reason and downtime", () => {
    expect(parseClientMessage(`{"t":"conn_report","code":1006,"reason":"","clean":false,"downMs":1500}`)).toEqual({ t: "conn_report", code: 1006, reason: "", clean: false, downMs: 1500 });
    expect(parseClientMessage(`{"t":"conn_report","code":"x","reason":"","clean":false,"downMs":1}`)).toBeNull();
  });
  it("giving up a quest names a quest id", () => {
    expect(parseClientMessage(`{"t":"quest_abandon","quest":"newbie_2"}`)).toEqual({ t: "quest_abandon", quest: "newbie_2" });
    expect(parseClientMessage(`{"t":"quest_abandon","quest":"Bad Id"}`)).toBeNull();
  });
});

describe("death wear by name colour", () => {
  it("orange and red names wear their gear down harder than white and yellow", () => {
    expect(DEATH_DURABILITY_BY_TIER[0]).toBe(DEATH_DURABILITY_BY_TIER[1]);
    expect(DEATH_DURABILITY_BY_TIER[2]).toBeGreaterThan(DEATH_DURABILITY_BY_TIER[1]);
    expect(DEATH_DURABILITY_BY_TIER[3]).toBeGreaterThan(DEATH_DURABILITY_BY_TIER[2]);
    expect(deathDurabilityLoss(100)).toBe(5);
    expect(deathDurabilityLoss(100, DEATH_DURABILITY_BY_TIER[3])).toBe(20);
  });
});

describe("a guard's kill", () => {
  it("lowers the victim's sát nhân like any death, never below 0", () => {
    expect(satNhanAfterDeath(600)).toBe(550);
    expect(satNhanAfterDeath(30)).toBe(0);
  });
});

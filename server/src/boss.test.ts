import type { DatabaseSync } from "node:sqlite";
import { bossClaimTtlMs, equipScore, makeEquipmentId } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { bossHolder, claimBoss, refreshBoss, releaseBoss } from "./boss";
import { getLeaderboard, resetLeaderboardCache } from "./leaderboard";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
});

describe("the boss claim", () => {
  it("one room of a map holds it at a time; the other channel is refused", async () => {
    expect(await claimBoss(db, "forest", "forest:ch1", 1000)).toBe(true);
    expect(await claimBoss(db, "forest", "forest:ch2", 1001)).toBe(false);
    expect(await claimBoss(db, "cave", "cave:ch2", 1001)).toBe(true); // another map has its own
    expect(await bossHolder(db, "forest", 1002)).toBe("forest:ch1");
  });

  it("only the holder releases it, and releasing twice is harmless", async () => {
    await claimBoss(db, "forest", "forest:ch1", 1000);
    await releaseBoss(db, "forest", "forest:ch2");
    expect(await bossHolder(db, "forest", 1001)).toBe("forest:ch1");
    await releaseBoss(db, "forest", "forest:ch1");
    await releaseBoss(db, "forest", "forest:ch1");
    expect(await bossHolder(db, "forest", 1002)).toBeNull();
    expect(await claimBoss(db, "forest", "forest:ch2", 1003)).toBe(true);
  });

  it("a claim older than the limit is lost, so a room that never came back cannot block the map forever", async () => {
    await claimBoss(db, "forest", "forest:ch1", 1000);
    expect(await bossHolder(db, "forest", 1000 + bossClaimTtlMs() + 1)).toBeNull();
    expect(await claimBoss(db, "forest", "forest:ch2", 1000 + bossClaimTtlMs() + 1)).toBe(true);
  });
});

describe("keeping the claim", () => {
  it("a refresh moves the 24-hour limit; once another room has the map the old holder's refresh fails", async () => {
    await claimBoss(db, "forest", "forest:1", 1000);
    expect(await refreshBoss(db, "forest", "forest:1", 1000 + bossClaimTtlMs() - 5)).toBe(true);
    // Without the refresh the claim would have lapsed by now; with it, another channel is still refused.
    expect(await claimBoss(db, "forest", "forest:2", 1000 + bossClaimTtlMs() + 10)).toBe(false);
    // A claim that did lapse is taken by another room, and then the first room's refresh finds nothing of its own.
    await releaseBoss(db, "forest", "forest:1");
    expect(await claimBoss(db, "forest", "forest:2", 5000)).toBe(true);
    expect(await refreshBoss(db, "forest", "forest:1", 6000)).toBe(false);
  });
});

describe("the leaderboards", () => {
  const ins = (id: string, acc: string, realm: number, stage: number, exp: number) =>
    raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, realm, stage, exp, created_at, updated_at) VALUES ('${id}', '${acc}', '${id}', 'kim', 0, 0, ${realm}, ${stage}, ${exp}, 0, 0)`);
  const wear = (n: number, owner: string, type: string, slot: string, refine = "NULL") =>
    raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, created_at, equip_slot, refine_level) VALUES ('it${n}', '${owner}', '${type}', 0, '${slot}', ${refine})`);
  beforeEach(() => {
    resetLeaderboardCache();
    raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, role, created_at) VALUES ('p1', 'p1@x.test', 'h', 's', 1, 'player', 0), ('p2', 'p2@x.test', 'h', 's', 1, 'player', 0), ('ad', 'ad@x.test', 'h', 's', 1, 'admin', 0)");
    ins("low", "p1", 0, 9, 500);
    ins("high", "p2", 1, 1, 0);
    ins("gm", "ad", 3, 9, 9999);
  });

  it("realm: orders by realm, stage and exp, leaves admins out and caches for a minute", async () => {
    const rows = await getLeaderboard(db, "realm", 10_000_000);
    expect(rows.map((r) => r.name)).toEqual(["high", "low"]);
    expect(rows[1]!.value).toBe(500);
    raw.exec("UPDATE characters SET realm = 2 WHERE id = 'low'");
    expect((await getLeaderboard(db, "realm", 10_000_000 + 30_000)).map((r) => r.name)).toEqual(["high", "low"]); // cached
    expect((await getLeaderboard(db, "realm", 10_000_000 + 61_000)).map((r) => r.name)).toEqual(["low", "high"]);
  });

  it("wealth: counts Linh Thạch only", async () => {
    raw.exec("INSERT INTO currency_balances (character_id, currency, balance) VALUES ('low', 'linh_thach', 50), ('high', 'linh_thach', 20), ('high', 'cong_hien', 9999), ('gm', 'linh_thach', 99999)");
    expect((await getLeaderboard(db, "wealth")).map((r) => [r.name, r.value])).toEqual([["low", 50], ["high", 20]]);
  });

  it("gear and pháp bảo: worn pieces only, each board counts its own slots", async () => {
    wear(1, "low", makeEquipmentId("weapon", "u", 0, 1, 1), "weapon");
    wear(2, "high", makeEquipmentId("hat", "m", 1, 1, 4), "hat");
    wear(3, "high", makeEquipmentId("bonded", "u", 0, 1, 1), "bonded", "3");
    raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, created_at, bag_tab, cell) VALUES ('bag1', 'low', '${makeEquipmentId("hat", "m", 3, 9, 4)}', 0, 0, 0)`); // in the bag: not counted
    const gear = await getLeaderboard(db, "gear");
    expect(gear.map((r) => r.name)).toEqual(["high", "low"]);
    expect(gear[0]!.value).toBe(equipScore(makeEquipmentId("hat", "m", 1, 1, 4)));
    const art = await getLeaderboard(db, "artifact");
    expect(art.map((r) => r.name)).toEqual(["high"]);
    expect(art[0]!.value).toBe(equipScore(makeEquipmentId("bonded", "u", 0, 1, 1), 3));
  });

  it("power: follows the realm, the stage and the gear worn", async () => {
    const plain = await getLeaderboard(db, "power");
    expect(plain.map((r) => r.name)).toEqual(["high", "low"]);
    resetLeaderboardCache();
    wear(1, "low", makeEquipmentId("weapon", "u", 3, 9, 4), "weapon");
    const geared = await getLeaderboard(db, "power");
    expect(geared[0]!.name).toBe("low");
  });
});

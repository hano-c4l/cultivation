import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { addBossKills, getBossKills, resetBossKills } from "./boss";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
beforeEach(() => {
  ({ db, raw } = makeDb());
});

describe("the map's shared boss kill counter", () => {
  it("adds the kills of every room, reads them back and starts again", async () => {
    expect(await getBossKills(db, "forest")).toBe(0);
    expect(await addBossKills(db, "forest", 10)).toBe(10);
    expect(await addBossKills(db, "forest", 7)).toBe(17); // another channel
    expect(await addBossKills(db, "cave", 3)).toBe(3); // another map
    expect(await getBossKills(db, "forest")).toBe(17);
    await resetBossKills(db, "forest");
    expect(await getBossKills(db, "forest")).toBe(0);
    expect(await getBossKills(db, "cave")).toBe(3);
    expect((raw.prepare("SELECT COUNT(*) AS n FROM boss_kills").get() as { n: number }).n).toBe(2);
  });
});

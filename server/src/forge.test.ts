import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_FORGE, DEFAULT_ALCHEMY, equipmentInfo, getItemDef, validAlchemy } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { alchemyReferences, getAlchemyAdmin, saveAlchemy } from "./alchemy-admin";
import { collectBrewStatements, getBrewJob, listBrewJobs, startBrewStatements } from "./brew";
import { rollGear } from "./gear-master";
import { resetTuningCache } from "./tuning";
import { makeDb } from "./test-db";

const NOW = 1_800_000_000_000;
const A = "a";

let db: D1Database;
let raw: DatabaseSync;

beforeEach(() => {
  resetTuningCache();
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${A}', 'acc', 'Nv', 'kim', 0, 0, 0, 0)`);
});

describe("the default recipes of the forge", () => {
  it("are well formed, make a wearable piece of gear that does not depend on gender, and use materials that exist", () => {
    expect(validAlchemy(DEFAULT_FORGE)).toBe(true);
    for (const r of DEFAULT_FORGE.recipes) {
      const info = equipmentInfo(r.output);
      expect(info, r.output).toBeDefined();
      expect(info!.maxDurability, r.output).not.toBeNull();
      expect(info!.style, r.output).toBe("u");
      expect(r.qty).toBe(1);
      for (const i of r.inputs) expect(getItemDef(i.item), i.item).toBeDefined();
    }
  });

  it("every piece rolls its stats from the master table when collected (except the bonded artifact, which has none)", async () => {
    for (const r of DEFAULT_FORGE.recipes) {
      const rs = await rollGear(db, r.output);
      if (equipmentInfo(r.output)!.kind === "bonded") expect(rs, r.output).toBeUndefined(); // the bonded artifact grows with use and has no rolled stats
      else expect(rs, r.output).toBeDefined();
    }
  });
});

describe("the jobs of the two trades", () => {
  const start = async (craft: "alchemy" | "forge", id: string, max: number) => {
    const recipe = (craft === "forge" ? DEFAULT_FORGE : DEFAULT_ALCHEMY).recipes[0]!;
    await db.batch(startBrewStatements(db, A, craft === "forge" ? "smith" : "alchemist", recipe, id, max, NOW, craft));
  };

  it("each trade has its own list and its own limit", async () => {
    await start("alchemy", "j1", 1);
    await start("forge", "j2", 1); // the alchemist's full slot does not block the forge
    expect((await listBrewJobs(db, A, "alchemy")).map((j) => j.id)).toEqual(["j1"]);
    expect((await listBrewJobs(db, A, "forge")).map((j) => j.id)).toEqual(["j2"]);
    await expect(start("forge", "j3", 1)).rejects.toThrow(); // the forge's own limit
    await expect(start("alchemy", "j4", 1)).rejects.toThrow();
  });

  it("a job is collected at the trade that made it, once", async () => {
    await start("forge", "j1", 2);
    expect(await getBrewJob(db, A, "j1", "alchemy")).toBeNull(); // a blacksmith's forging is not handed over by the alchemist
    expect((await getBrewJob(db, A, "j1", "forge"))?.output).toBe(DEFAULT_FORGE.recipes[0]!.output);
    await db.batch(collectBrewStatements(db, A, "j1", NOW + 10 * 3_600_000));
    expect(await getBrewJob(db, A, "j1", "forge")).toBeNull();
    await expect(db.batch(collectBrewStatements(db, A, "j1", NOW + 10 * 3_600_000))).rejects.toThrow(); // not twice
  });
});

describe("the admin screen of the forge", () => {
  it("saves on a fresh database (the group's row is seeded) and reads it back", async () => {
    const view = await getAlchemyAdmin(db, "forge");
    expect(view.alchemy.recipes).toHaveLength(DEFAULT_FORGE.recipes.length);
    expect(view.items.some((i) => i.id === "eq.ring.u.0.3.2")).toBe(true); // the forge's list has gear
    expect((await getAlchemyAdmin(db, "alchemy")).items.some((i) => i.id === "eq.ring.u.0.3.2")).toBe(false);
    const edited = { ...view.alchemy, maxJobs: 5 };
    const r = await saveAlchemy(db, "boss@x.test", edited, view.updatedAt, NOW, "forge");
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    const row = raw.prepare("SELECT value, updated_by FROM game_tuning WHERE name = 'forge'").get() as { value: string; updated_by: string };
    expect(JSON.parse(row.value).maxJobs).toBe(5);
    expect(row.updated_by).toBe("boss@x.test");
    // the alchemist's group is untouched
    expect(JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = 'alchemy'").get() as { value: string }).value).maxJobs).toBe(DEFAULT_ALCHEMY.maxJobs);
  });

  it("saving works even when another row is there to make the count of groups tie (a stale group, the forge row gone)", async () => {
    await getAlchemyAdmin(db, "forge"); // seeds everything
    raw.exec("DELETE FROM game_tuning WHERE name = 'forge'");
    raw.exec("INSERT INTO game_tuning (name, value, updated_at) VALUES ('old_group', '{}', 0)");
    resetTuningCache();
    const view = await getAlchemyAdmin(db, "forge");
    const r = await saveAlchemy(db, "boss@x.test", { ...view.alchemy, maxJobs: 7 }, view.updatedAt, NOW, "forge");
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(JSON.parse((raw.prepare("SELECT value FROM game_tuning WHERE name = 'forge'").get() as { value: string }).value).maxJobs).toBe(7);
  });

  it("the forge makes gear one at a time, only gear; the alchemist makes no gear", async () => {
    const view = await getAlchemyAdmin(db, "forge");
    const first = view.alchemy.recipes[0]!;
    const many = { ...view.alchemy, recipes: [{ ...first, qty: 2 }, ...view.alchemy.recipes.slice(1)] };
    expect(await saveAlchemy(db, "boss@x.test", many, view.updatedAt, NOW, "forge")).toMatchObject({ ok: false, error: "invalid" });
    const notGear = { ...view.alchemy, recipes: [{ ...first, output: "linh_thao" }, ...view.alchemy.recipes.slice(1)] };
    expect(await saveAlchemy(db, "boss@x.test", notGear, view.updatedAt, NOW, "forge")).toMatchObject({ ok: false, error: "invalid" });
    const alch = await getAlchemyAdmin(db, "alchemy");
    const gearInAlchemy = { ...alch.alchemy, recipes: [{ ...alch.alchemy.recipes[0]!, output: "eq.ring.u.0.3.2" }, ...alch.alchemy.recipes.slice(1)] };
    expect(await saveAlchemy(db, "boss@x.test", gearInAlchemy, alch.updatedAt, NOW, "alchemy")).toMatchObject({ ok: false, error: "invalid" });
  });

  it("an item used only by a forge recipe is reported as used", async () => {
    await getAlchemyAdmin(db, "forge");
    expect((await alchemyReferences(db, "ren_tc")).some((t) => t.includes("luyện khí"))).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_ALCHEMY, DEFAULT_MERCHANTS, resetTuning, setAllNpcs, setItemOverlays, setMerchants } from "@game/shared";
import { getAlchemyAdmin, saveAlchemy } from "./alchemy-admin";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { collectBrewStatements, getBrewJob, listBrewJobs, startBrewStatements } from "./brew";
import { resetItemsCache } from "./items-live";
import { getMerchants, resetMerchantsCache } from "./merchants";
import { getMerchantAdmin, saveMerchant } from "./merchants-admin";
import { getNpcs, resetNpcsCache } from "./npcs";
import { deleteNpc, listNpcs, saveNpc, spotProblem } from "./npcs-admin";
import { getTuning, resetTuningCache } from "./tuning";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db, raw } = makeDb());
  resetTuning();
  resetTuningCache();
  resetItemsCache();
  resetNpcsCache();
  resetMerchantsCache();
  setItemOverlays([]);
  setAllNpcs([]);
  setMerchants(DEFAULT_MERCHANTS);
});

const find = async (map: string, id: string) => (await listNpcs(db)).find((n) => n.mapId === map && n.id === id)!;
const input = (n: Awaited<ReturnType<typeof find>>, patch: Record<string, unknown> = {}) => ({ id: n.id, mapId: n.mapId, kind: n.kind, name: n.name, x: n.x, y: n.y, sort: n.sort, enabled: n.enabled, ...patch });
const logs = async () => (await listAdminLog(db, parseLogQuery(new URLSearchParams("")))).rows.map((r) => r.content);

describe("the NPC screen", () => {
  it("lists the NPCs the game starts with, including the alchemists, with their quests and stock", async () => {
    const all = await listNpcs(db);
    expect(all.find((n) => n.id === "alchemist")).toMatchObject({ mapId: "town", kind: "alchemist", name: "Đan Sư", seed: true, hasStock: true });
    expect(all.find((n) => n.id === "elder")!.quests.length).toBeGreaterThanOrEqual(3);
    expect(all.find((n) => n.id === "waygate")).toMatchObject({ kind: "waygate", hasStock: false });
    expect(all.find((n) => n.id === "path_kiem" && n.mapId === "town2")).toBeDefined();
  });

  it("renames and moves an NPC, the game then uses it, and the merchant record follows the name", async () => {
    const m = await find("town", "merchant");
    const res = await saveNpc(db, ADMIN, input(m, { name: "Lão Thương", x: m.x + 2, y: m.y }), false, m.updatedAt);
    expect(res.ok).toBe(true);
    const after = await find("town", "merchant");
    expect(after).toMatchObject({ name: "Lão Thương", x: m.x + 2 });
    expect((await getNpcs(db, Date.now() + 120_000)).find((n) => n.id === "merchant")).toMatchObject({ name: "Lão Thương" });
    expect((await getMerchantAdmin(db, "merchant"))!.merchant.nameVi).toBe("Lão Thương");
    expect((await logs())[0]).toContain("Sửa NPC «Lão Thương» (merchant)");
  });

  it("refuses an unchanged save, a stale token, a changed kind and a spot nobody can reach", async () => {
    const m = await find("town", "merchant");
    expect(await saveNpc(db, ADMIN, input(m), false, m.updatedAt)).toMatchObject({ ok: false, error: "unchanged" });
    expect(await saveNpc(db, ADMIN, input(m, { name: "X" }), false, m.updatedAt + 5)).toMatchObject({ ok: false, error: "version_conflict" });
    expect(await saveNpc(db, ADMIN, input(m, { kind: "smith" }), false, m.updatedAt)).toMatchObject({ ok: false, error: "locked" });
    expect(await saveNpc(db, ADMIN, input(m, { x: 0.5, y: 0.5 }), false, m.updatedAt)).toMatchObject({ ok: false, error: "invalid" });
    expect(spotProblem("town", "merchant", 1000, 1000)).toBe("outside");
  });

  it("will not take a quest giver out of play, but allows it where the same id also stands elsewhere", async () => {
    const elder = await find("town", "elder");
    const res = await saveNpc(db, ADMIN, input(elder, { enabled: false }), false, elder.updatedAt);
    expect(res).toMatchObject({ ok: false, error: "in_use" });
    expect((res as { problems: string[] }).problems.length).toBeGreaterThan(0);
    const kiem = await find("town", "path_kiem"); // the same master stands in the second town too
    expect((await saveNpc(db, ADMIN, input(kiem, { enabled: false }), false, kiem.updatedAt)).ok).toBe(true);
    const other = await find("town2", "path_kiem");
    expect((await saveNpc(db, ADMIN, input(other, { enabled: false }), false, other.updatedAt)).ok).toBe(true);
    const last = await find("town3", "path_kiem"); // the last one left: the quest giver cannot go
    expect(await saveNpc(db, ADMIN, input(last, { enabled: false }), false, last.updatedAt)).toMatchObject({ ok: false, error: "in_use" });
  });

  it("adds an NPC of an addable kind (a merchant gets a stock record), deletes it, and never deletes one the game starts with", async () => {
    const m = await find("town", "merchant");
    const created = await saveNpc(db, ADMIN, { id: "herbalist", mapId: "town", kind: "merchant", name: "Dược sư", x: m.x + 4, y: m.y, sort: 9, enabled: true }, true, 0);
    expect(created.ok).toBe(true);
    expect((await getMerchantAdmin(db, "herbalist"))!.merchant).toMatchObject({ mapId: "town", stock: [], buys: null });
    expect(await saveNpc(db, ADMIN, { id: "herbalist", mapId: "town", kind: "merchant", name: "Dược sư", x: m.x + 4, y: m.y, sort: 9, enabled: true }, true, 0)).toMatchObject({ ok: false, error: "exists" });
    expect(await saveNpc(db, ADMIN, { id: "gate3", mapId: "town", kind: "dragon", name: "Trận", x: m.x + 4, y: m.y, sort: 9, enabled: true }, true, 0)).toMatchObject({ ok: false, error: "invalid" });
    const row = await find("town", "herbalist");
    expect((await deleteNpc(db, ADMIN, "town", "herbalist", row.updatedAt)).ok).toBe(true);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM shop_merchants WHERE npc_id = 'herbalist'").get()).toEqual({ n: 0 });
    expect(await deleteNpc(db, ADMIN, "town", "merchant", m.updatedAt)).toMatchObject({ ok: false, error: "locked" });
  });
});

describe("the merchant stock", () => {
  it("replaces the stock, the buying rate and the kinds bought, and the game then serves them", async () => {
    const before = (await getMerchantAdmin(db, "merchant"))!;
    const stock = [{ id: "hoi_huyet_dan", kind: "item" as const, item: "hoi_huyet_dan", price: 77 }];
    const res = await saveMerchant(db, ADMIN, { npc: "merchant", sellRate: 0.3, buys: ["pill"], stock, updatedAt: before.updatedAt });
    expect(res.ok).toBe(true);
    resetMerchantsCache();
    const got = (await getMerchants(db))["merchant"]!;
    expect(got).toMatchObject({ sellRate: 0.3, buys: ["pill"], stock });
    expect((await logs())[0]).toContain("Sửa cửa hàng");
  });

  it("refuses an unchanged save, a stale token, a rule naming no item and a repeated rule id", async () => {
    const v = (await getMerchantAdmin(db, "merchant"))!;
    const base = { npc: "merchant", sellRate: v.merchant.sellRate, buys: v.merchant.buys, stock: v.merchant.stock, updatedAt: v.updatedAt };
    expect(await saveMerchant(db, ADMIN, base)).toMatchObject({ ok: false, error: "unchanged" });
    expect(await saveMerchant(db, ADMIN, { ...base, sellRate: 0.5, updatedAt: v.updatedAt + 9 })).toMatchObject({ ok: false, error: "version_conflict" });
    expect(await saveMerchant(db, ADMIN, { ...base, stock: [{ id: "x", kind: "item", item: "no_such_item" }] })).toMatchObject({ ok: false, error: "invalid" });
    const dup = { id: "a", kind: "item", item: "hoi_huyet_dan" };
    expect(await saveMerchant(db, ADMIN, { ...base, stock: [dup, dup] })).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveMerchant(db, ADMIN, { ...base, sellRate: 5 })).toMatchObject({ ok: false, error: "invalid" });
  });

  it("gives the alchemists and blacksmiths a stock of their own and takes the special pills off the merchants", async () => {
    const all = await getMerchants(db);
    expect(all.alchemist!.buys).toEqual(["pill", "material"]);
    expect(all.smith!.stock.some((r) => r.kind === "gear")).toBe(true);
    for (const id of ["merchant", "merchant2"]) expect(all[id]!.stock.some((r) => ["linh_nguyen_dan", "bao_nguyen_dan", "thien_ngo_dan"].includes(r.id))).toBe(false);
  });
});

describe("migration 0042", () => {
  it("trims the rows of a merchant seeded before it, leaving the other NPCs' rows", async () => {
    await getMerchants(db);
    const add = raw.prepare("INSERT OR REPLACE INTO shop_stock (npc_id, rule_id, sort, def) VALUES (?, ?, 99, ?)");
    for (const [npc, rule] of [["merchant", "duong_huyet_dan"], ["merchant", "gear_low_mutant"], ["merchant2", "ngo_dao_dan"], ["alchemist", "duong_huyet_dan"]] as const) add.run(npc, rule, JSON.stringify({ id: rule, kind: "item", item: "hoi_huyet_dan" }));
    raw.prepare("UPDATE shop_stock SET def = ? WHERE npc_id = 'merchant' AND rule_id = 'gear_low'").run(JSON.stringify({ id: "gear_low", kind: "gear", realms: [0, 1], tiers: [1, 2], grade: 1 }));
    raw.exec(readFileSync(new URL("../migrations/0042_merchant_split.sql", import.meta.url), "utf8"));
    const rules = (npc: string) => (raw.prepare("SELECT rule_id FROM shop_stock WHERE npc_id = ?").all(npc) as Array<{ rule_id: string }>).map((r) => r.rule_id);
    expect(rules("merchant")).not.toContain("duong_huyet_dan");
    expect(rules("merchant")).not.toContain("gear_low_mutant");
    expect(rules("merchant2")).not.toContain("ngo_dao_dan");
    expect(rules("alchemist")).toContain("duong_huyet_dan"); // the alchemist's own row stays
    expect(JSON.parse((raw.prepare("SELECT def FROM shop_stock WHERE npc_id = 'merchant' AND rule_id = 'gear_low'").get() as { def: string }).def).tiers).toEqual([1]);
  });
});

describe("the alchemist's recipes and brewings", () => {
  it("serves the default recipes, saves a change (and refuses a stale, unchanged or unknown-item save)", async () => {
    const v = await getAlchemyAdmin(db);
    expect(v.alchemy).toEqual(DEFAULT_ALCHEMY);
    const next = { ...v.alchemy, maxJobs: 5, recipes: [...v.alchemy.recipes, { id: "dai_hoi", nameVi: "Đại Hồi", output: "dai_hoi_huyet_dan", qty: 2, inputs: [{ item: "linh_thao", qty: 3 }], linhThach: 100, seconds: 30, enabled: true }] };
    expect(await saveAlchemy(db, ADMIN, next, v.updatedAt + 3)).toMatchObject({ ok: false, error: "version_conflict" });
    expect(await saveAlchemy(db, ADMIN, v.alchemy, v.updatedAt)).toMatchObject({ ok: false, error: "unchanged" });
    expect(await saveAlchemy(db, ADMIN, { ...next, recipes: [{ ...next.recipes[0]!, output: "no_such" }] }, v.updatedAt)).toMatchObject({ ok: false, error: "invalid" });
    expect((await saveAlchemy(db, ADMIN, next, v.updatedAt)).ok).toBe(true);
    resetTuningCache();
    expect((await getTuning(db, Date.now() + 120_000)).alchemy.maxJobs).toBe(5);
    expect((await logs())[0]).toContain("Sửa công thức luyện đan");
  });

  it("starts at most maxJobs brewings, collects a ready one once, and keeps a brewing's result when the recipe later changes", async () => {
    const recipe = DEFAULT_ALCHEMY.recipes[0]!;
    const now = 1_000_000;
    const run = (statements: D1PreparedStatement[]) => db.batch(statements);
    await run(startBrewStatements(db, "c1", "alchemist", recipe, "j1", 2, now));
    await run(startBrewStatements(db, "c1", "alchemist", recipe, "j2", 2, now));
    await expect(run(startBrewStatements(db, "c1", "alchemist", recipe, "j3", 2, now))).rejects.toThrow();
    expect((await listBrewJobs(db, "c1")).map((j) => j.id).sort()).toEqual(["j1", "j2"]);
    expect(await getBrewJob(db, "c1", "j1")).toMatchObject({ output: recipe.output, qty: recipe.qty, readyAt: now + recipe.seconds * 1000 });
    await expect(run(collectBrewStatements(db, "c1", "j1", now + 1))).rejects.toThrow(); // not ready yet
    await run(collectBrewStatements(db, "c1", "j1", now + recipe.seconds * 1000));
    await expect(run(collectBrewStatements(db, "c1", "j1", now + recipe.seconds * 1000 + 1))).rejects.toThrow(); // once only
    await expect(run(collectBrewStatements(db, "c2", "j2", now + 10_000_000))).rejects.toThrow(); // someone else's
    expect((await listBrewJobs(db, "c1")).map((j) => j.id)).toEqual(["j2"]);
  });
});

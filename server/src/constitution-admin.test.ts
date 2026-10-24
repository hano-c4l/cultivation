import type { DatabaseSync } from "node:sqlite";
import type { ConstitutionCatalog, ConstitutionDef } from "@game/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { listAdminLog, parseLogQuery } from "./admin-log";
import { MAX_SAVE_STATEMENTS, loadConstitutionCatalog, resetConstitutionCatalogCache } from "./constitution-catalog";
import { constitutionHolders, describeConstitutionChange, saveConstitutionAdmin } from "./constitution-admin";
import { makeDb } from "./test-db";

let db: D1Database;
let raw: DatabaseSync;
const ADMIN = "admin@x.test";

beforeEach(() => {
  ({ db, raw } = makeDb());
  resetConstitutionCatalogCache();
});

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const load = () => loadConstitutionCatalog(db);
const withChange = async (fn: (c: ConstitutionDef[]) => void): Promise<ConstitutionCatalog> => {
  const c = clone(await load());
  fn(c.constitutions);
  return c;
};

describe("saving a constitution as an admin", () => {
  it("refuses a save that changes nothing, and does not bump the version or write a log line", async () => {
    const c = await load();
    expect(await saveConstitutionAdmin(db, ADMIN, c.version, clone(c))).toEqual({ ok: false, error: "unchanged" });
    expect((await load()).version).toBe(c.version);
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).total).toBe(0);
  });

  it("logs which constitution changed and how", async () => {
    const c = await load();
    const next = await withChange((all) => {
      const k = all.find((x) => x.id === "kiem_the")!;
      k.nameVi = "Kiếm Thể Mới";
      k.rollWeight += 10;
    });
    expect(await saveConstitutionAdmin(db, ADMIN, c.version, next)).toMatchObject({ ok: true, version: c.version + 1 });
    const log = (await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!;
    expect(log).toMatchObject({ screen: "Thiên phú", adminEmail: ADMIN });
    expect(log.content).toContain("Kiếm Thể Mới");
    expect(log.content).toContain("kiem_the");
    expect(log.content).toContain("tên, tỉ lệ tung");
  });

  it("adds a constitution, and warns about an effect on a stat the game does not use yet", async () => {
    const c = await load();
    const next = await withChange((all) => {
      all.push({
        id: "moi_the",
        nameVi: "Mới Thể",
        descVi: "Thử.",
        rollWeight: 5,
        isDefault: false,
        enabled: true,
        sortOrder: 99,
        tiers: [{ tier: 1, nameVi: "Cấp 1", rollWeight: 100, effects: [{ stat: "max_hp", targetKind: "all", targetTag: "", mode: "percent", value: 10 }] }],
      });
    });
    const res = await saveConstitutionAdmin(db, ADMIN, c.version, next);
    expect(res).toMatchObject({ ok: true });
    expect((res as { warnings: string[] }).warnings).toEqual(["Mới Thể, cấp 1: Sinh lực tối đa"]);
    expect((await load()).constitutions.some((x) => x.id === "moi_the")).toBe(true);
    expect((await listAdminLog(db, parseLogQuery(new URLSearchParams()))).rows[0]!.content).toContain("mới");
  });

  it("checks that a targeted skill exists here, and not in the shared validation", async () => {
    const c = await load();
    const next = await withChange((all) => {
      all.find((x) => x.id === "kiem_the")!.tiers[0]!.effects.push({ stat: "skill_damage", targetKind: "skill", targetTag: "no_such_skill", mode: "percent", value: 5 });
    });
    expect(await saveConstitutionAdmin(db, ADMIN, c.version, next)).toMatchObject({ ok: false, error: "unknown_skill" });
    expect((await load()).version).toBe(c.version);
  });

  it("does not let a stale skill target in one constitution block a save of another", async () => {
    raw.exec("INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 1, 'skill_damage', 'skill', 'removed_skill', 'percent', 5)");
    resetConstitutionCatalogCache();
    const c = await load();
    const next = await withChange((all) => (all.find((x) => x.id === "pham_the")!.descVi += " (sửa)"));
    expect(await saveConstitutionAdmin(db, ADMIN, c.version, next)).toMatchObject({ ok: true });
    const again = await load();
    const bad = clone(again);
    bad.constitutions.find((x) => x.id === "kiem_the")!.nameVi += " x";
    expect(await saveConstitutionAdmin(db, ADMIN, again.version, bad)).toMatchObject({ ok: false, error: "unknown_skill" }); // the constitution being saved is checked
  });

  it("warns only about effects that are new or changed on a stat the game does not use", async () => {
    const c = await load();
    const next = await withChange((all) => {
      const k = all.find((x) => x.id === "kiem_the")!;
      k.tiers[0]!.effects.push({ stat: "crit_rate", targetKind: "all", targetTag: "", mode: "flat", value: 3 });
    });
    const res = await saveConstitutionAdmin(db, ADMIN, c.version, next);
    expect((res as { warnings: string[] }).warnings).toEqual(["Kiếm Thể, cấp 1: Tỉ lệ chí mạng"]);
  });

  it("refuses a stale version and a catalogue too big for one batch", async () => {
    const c = await load();
    const next = await withChange((all) => (all[0]!.nameVi += " x"));
    expect(await saveConstitutionAdmin(db, ADMIN, c.version + 7, next)).toEqual({ ok: false, error: "version_conflict" });
    const big = await withChange((all) => {
      const spare = all.find((x) => !x.isDefault)!;
      for (let i = 0; i < 150; i++) {
        const copy = clone(spare);
        copy.id = `copy_${i}`;
        copy.rollWeight = 1;
        copy.sortOrder = 100 + i;
        all.push(copy);
      }
    });
    const res = await saveConstitutionAdmin(db, ADMIN, c.version, big);
    expect(res).toMatchObject({ ok: false, error: "too_large" });
    expect(MAX_SAVE_STATEMENTS).toBeLessThan(50);
    expect((await load()).constitutions.some((x) => x.id === "copy_0")).toBe(false);
  });

  it("counts the holders of each constitution and tier, and describes changes in words", async () => {
    raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a', 'a@x.test', 'h', 's', 1, 0)");
    raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at, constitution, constitution_tier) VALUES ('c1', 'a', 'A', 'kim', 0, 0, 0, 0, 'kiem_the', 2)");
    expect((await constitutionHolders(db)).find((h) => h.id === "kiem_the" && h.tier === 2)?.count).toBe(1);
    const k = (await load()).constitutions.find((x) => x.id === "kiem_the")!;
    expect(describeConstitutionChange(k, k)).toEqual([]);
    expect(describeConstitutionChange(k, { ...k, enabled: !k.enabled, tiers: k.tiers.slice(0, -1) })).toEqual([k.enabled ? "tắt" : "bật", `số cấp ${k.tiers.length} → ${k.tiers.length - 1}`, "tên và tỉ lệ các cấp", "hiệu ứng"]);
  });
});

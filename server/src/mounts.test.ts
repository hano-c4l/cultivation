import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_MOUNTS, DEFAULT_MERCHANTS, getItemDef, itemValue, mountBlock, mountItemId, mountOf, mountSpeedPct, setTuning, validMounts, startingStats, walkSpeed } from "@game/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitBagOps } from "./inventory";
import { learnMountStatement, ownedMounts, ownsMount } from "./mounts";
import { makeDb } from "./test-db";

const A = "a";
let db: D1Database;
let raw: DatabaseSync;
let n = 0;

beforeEach(() => {
  ({ db, raw } = makeDb());
  raw.exec(`INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('acc', 'a@x.test', 'h', 's', 1, 0)`);
  raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('${A}', 'acc', 'Nv', 'kim', 0, 0, 0, 0)`);
});
afterEach(() => setTuning(null));

const token = (mountId: string, cell: number): string => {
  const id = `tok-${n++}`;
  raw.exec(`INSERT INTO item_instances (id, owner_character_id, item_type, qty, bag_tab, cell, created_at) VALUES ('${id}', '${A}', '${mountItemId(mountId)}', 1, 0, ${cell}, 0)`);
  return id;
};
const tokens = () => (raw.prepare("SELECT COUNT(*) AS c FROM item_instances WHERE owner_character_id = ? AND item_type LIKE 'mt_%'").get(A) as { c: number }).c;

describe("the mounts of the tuning", () => {
  it("the defaults are valid, every mount has a token item worth its price, and a merchant sells each token", () => {
    expect(validMounts(DEFAULT_MOUNTS)).toBe(true);
    for (const m of DEFAULT_MOUNTS.list) {
      const def = getItemDef(mountItemId(m.id));
      expect(def?.mount, m.id).toBe(m.id);
      expect(def?.maxStack).toBe(1);
      expect(itemValue(mountItemId(m.id)), m.id).toBe(m.price);
      const sellers = Object.values(DEFAULT_MERCHANTS).filter((x) => x.stock.some((r) => r.kind === "item" && r.item === mountItemId(m.id)));
      expect(sellers.length, `a merchant sells ${m.id}`).toBeGreaterThan(0);
    }
    // faster as the realm rises, and slower than the flight pháp bảo of the realm (40% to 150%) at the same realm
    const speeds = DEFAULT_MOUNTS.list.map((m) => m.speedPct);
    expect([...speeds].sort((a, b) => a - b)).toEqual(speeds);
  });

  it("a list with a bad entry, a repeated id or a bad colour is not valid", () => {
    const m = DEFAULT_MOUNTS.list[0]!;
    expect(validMounts({ list: [m, m] })).toBe(false);
    expect(validMounts({ list: [{ ...m, color: "red" }] })).toBe(false);
    expect(validMounts({ list: [{ ...m, speedPct: -1 }] })).toBe(false);
    expect(validMounts({ list: [{ ...m, id: "Bad Id" }] })).toBe(false);
    expect(validMounts({})).toBe(false);
  });

  it("the speed of a mount comes from the tuning, is 0 for an unknown or switched-off one, and makes a character faster", () => {
    expect(mountSpeedPct("linh_loc")).toBe(30);
    expect(mountSpeedPct("nope")).toBe(0);
    expect(mountSpeedPct(undefined)).toBe(0);
    setTuning({ mounts: { list: DEFAULT_MOUNTS.list.map((m) => (m.id === "linh_loc" ? { ...m, enabled: false } : m)) } });
    expect(mountSpeedPct("linh_loc")).toBe(0);
    setTuning({ mounts: { list: DEFAULT_MOUNTS.list.map((m) => (m.id === "linh_loc" ? { ...m, speedPct: 100 } : m)) } });
    expect(mountSpeedPct("linh_loc")).toBe(100);
    const base = startingStats("kim", 1).base;
    expect(walkSpeed(base, mountSpeedPct("linh_loc"))).toBeGreaterThan(walkSpeed(base, 0));
  });

  it("the realm gate", () => {
    expect(mountBlock(mountOf("linh_loc"), 0)).toBeNull();
    expect(mountBlock(mountOf("hac_phong_lang"), 0)).toBe("realm");
    expect(mountBlock(mountOf("hac_phong_lang"), 1)).toBeNull();
    expect(mountBlock(mountOf("nope"), 5)).toBe("unknown");
  });
});

describe("learning a mount", () => {
  it("uses the token up and keeps the mount", async () => {
    const t = token("linh_loc", 0);
    const r = await commitBagOps(db, A, [{ op: "remove", id: t, qty: 1 }], { extra: [learnMountStatement(db, A, "linh_loc", 1)] });
    expect(r).toBe("ok");
    expect(await ownedMounts(db, A)).toEqual(["linh_loc"]);
    expect(await ownsMount(db, A, "linh_loc")).toBe(true);
    expect(tokens()).toBe(0);
  });

  it("a mount already known rolls the whole batch back: the token stays", async () => {
    await commitBagOps(db, A, [{ op: "remove", id: token("linh_loc", 0), qty: 1 }], { extra: [learnMountStatement(db, A, "linh_loc", 1)] });
    const again = token("linh_loc", 1);
    // the clash on the primary key is "duplicate" (the room says the mount is known) and nothing of the batch is kept
    expect(await commitBagOps(db, A, [{ op: "remove", id: again, qty: 1 }], { extra: [learnMountStatement(db, A, "linh_loc", 2)] })).toBe("duplicate");
    expect(tokens()).toBe(1); // the second token is still there
    expect(await ownedMounts(db, A)).toEqual(["linh_loc"]);
  });

  it("each character has its own mounts", async () => {
    raw.exec(`INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('b', 'acc', 'Nb', 'kim', 0, 0, 0, 0)`);
    await db.batch([learnMountStatement(db, A, "linh_loc", 1)]);
    expect(await ownsMount(db, "b", "linh_loc")).toBe(false);
  });
});

describe("migration 0072", () => {
  it("seeds the token stock of the three merchants, once", () => {
    const rows = raw.prepare("SELECT npc_id, rule_id FROM shop_stock WHERE rule_id LIKE 'mt_%' ORDER BY npc_id, rule_id").all() as Array<{ npc_id: string; rule_id: string }>;
    expect(rows.map((r) => `${r.npc_id}:${r.rule_id}`)).toEqual(["merchant:mt_hac_phong_lang", "merchant:mt_linh_loc", "merchant2:mt_xich_van_ma", "merchant3:mt_bach_ho"]);
  });
});

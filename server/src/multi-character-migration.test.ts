import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

/** Migration 0047 (characters rebuilt without UNIQUE(account_id)) applied to a database that already holds characters and everything that points at them. */
function before(): DatabaseSync {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql") && !n.startsWith("0047")).sort()) raw.exec(readFileSync(new URL(f, dir), "utf8"));
  raw.exec("INSERT INTO accounts (id, email, pw_hash, pw_salt, pw_iterations, created_at) VALUES ('a1', 'a@x.test', 'h', 's', 1, 0), ('a2', 'b@x.test', 'h', 's', 1, 0)");
  raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at, realm, stage, exp, gender, hotbar, vitals, review_until, deleted_at, mounted) VALUES ('c1', 'a1', 'Một', 'kim', 3, 4, 1, 2, 1, 5, 99, 'female', '[\"s:x\"]', '{\"hp\":1}', 77, NULL, 1), ('c2', 'a2', 'Hai', 'moc', 0, 0, 0, 0, 0, 1, 0, 'male', '[]', NULL, NULL, 55, 0)");
  raw.exec("INSERT INTO item_instances (id, owner_character_id, item_type, created_at) VALUES ('i1', 'c1', 'linh_thao', 0), ('i2', 'c2', 'linh_thao', 0)");
  raw.exec("INSERT INTO mailbox (id, character_id, subject, created_at) VALUES ('m1', 'c1', 'hi', 0)");
  raw.exec("INSERT INTO character_skills (character_id, skill_id, learned_at) VALUES ('c1', 'k1', 0), ('c2', 'k1', 0)");
  raw.exec("INSERT INTO character_paths (character_id, path_id, slot, chosen_at) VALUES ('c1', 'kiem', 0, 0)");
  raw.exec("INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES ('t', 'a1', 9, 1)");
  return raw;
}

const counts = (raw: DatabaseSync) =>
  Object.fromEntries(["characters", "item_instances", "mailbox", "character_skills", "character_paths", "sessions"].map((t) => [t, (raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]));

describe("migration 0047", () => {
  const raw = before();
  const was = counts(raw);
  const rowsBefore = raw.prepare("SELECT * FROM characters ORDER BY id").all();
  // D1 runs a migration file in one transaction, and defer_foreign_keys only means something inside one.
  raw.exec("BEGIN");
  raw.exec(readFileSync(new URL("../migrations/0047_multi_character.sql", import.meta.url), "utf8"));
  raw.exec("COMMIT");

  it("keeps every row of the characters and of everything that points at them", () => {
    expect(counts(raw)).toEqual(was);
    expect(raw.prepare("SELECT * FROM characters ORDER BY id").all()).toEqual(rowsBefore);
    expect(raw.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("leaves the children pointing at characters(id) and the indexes in place", () => {
    for (const t of ["item_instances", "mailbox", "character_skills", "character_paths"]) {
      expect((raw.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(t) as { sql: string }).sql).toContain("REFERENCES characters(id)");
    }
    const names = (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'characters'").all() as Array<{ name: string }>).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["idx_characters_rank", "idx_characters_account"]));
    expect(raw.prepare("SELECT character_id FROM sessions").get()).toEqual({ character_id: null });
  });

  it("allows a second character for one account, still refuses a duplicate name, and still checks foreign keys", () => {
    raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c3', 'a1', 'Ba', 'kim', 0, 0, 0, 0)");
    expect(() => raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c4', 'a1', 'ba', 'kim', 0, 0, 0, 0)")).toThrow(/UNIQUE/);
    expect(() => raw.exec("INSERT INTO item_instances (id, owner_character_id, item_type, created_at) VALUES ('i9', 'nobody', 'x', 0)")).toThrow(/FOREIGN KEY/);
    expect(() => raw.exec("INSERT INTO characters (id, account_id, name, spiritual_root, x, y, created_at, updated_at) VALUES ('c5', 'a9', 'Năm', 'kim', 0, 0, 0, 0)")).toThrow(/FOREIGN KEY/);
  });
});

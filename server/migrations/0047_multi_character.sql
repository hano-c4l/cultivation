-- Several characters per account (docs/PHASE3.md 3m-d). `characters.account_id` was UNIQUE, which SQLite cannot drop, so the table is rebuilt without it:
-- copy the rows aside (a plain table, no references), drop the old table, create it again without the UNIQUE and put the rows back. The children
-- (item_instances, mailbox, character_skills, character_paths) reference `characters(id)` by name and have no ON DELETE CASCADE, so dropping the old table
-- deletes nothing of theirs; their references are only checked at the end of the transaction (defer_foreign_keys), and by then the same ids are back.
-- (Creating the new table first and renaming it does NOT work: SQLite counts the drop as violations and only a later insert of the parent rows clears them.)
-- `sessions.character_id` is the character a login chose.
PRAGMA defer_foreign_keys = on;

CREATE TABLE characters_copy AS SELECT * FROM characters;
DROP TABLE characters;

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  spiritual_root TEXT NOT NULL CHECK (spiritual_root IN ('kim', 'moc', 'thuy', 'hoa', 'tho')),
  map_id TEXT NOT NULL DEFAULT 'town',
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  realm INTEGER NOT NULL DEFAULT 0,
  stage INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  potential_points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  stat_can_cot INTEGER NOT NULL DEFAULT 5,
  stat_than_phap INTEGER NOT NULL DEFAULT 5,
  stat_ngo_tinh INTEGER NOT NULL DEFAULT 5,
  stat_linh_luc INTEGER NOT NULL DEFAULT 5,
  stat_than_thuc INTEGER NOT NULL DEFAULT 5,
  stat_phuc_duyen INTEGER NOT NULL DEFAULT 5,
  root_grade INTEGER NOT NULL DEFAULT 0,
  bag_tabs INTEGER NOT NULL DEFAULT 1 CHECK (bag_tabs >= 1),
  constitution TEXT NOT NULL DEFAULT 'pham_the',
  constitution_tier INTEGER NOT NULL DEFAULT 1 CHECK (constitution_tier >= 1),
  gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female', 'male_wears_female', 'female_wears_male')),
  hotbar TEXT NOT NULL DEFAULT '[]',
  vitals TEXT,
  roots TEXT NOT NULL DEFAULT '',
  bt_started_at INTEGER,
  paths TEXT NOT NULL DEFAULT '',
  sat_khi INTEGER NOT NULL DEFAULT 0 CHECK (sat_khi >= 0),
  sat_nhan INTEGER NOT NULL DEFAULT 0 CHECK (sat_nhan >= 0),
  anh_hung INTEGER NOT NULL DEFAULT 0 CHECK (anh_hung >= 0),
  mounted INTEGER NOT NULL DEFAULT 0 CHECK (mounted IN (0, 1)),
  review_until INTEGER,
  review_by TEXT,
  deleted_at INTEGER
);

INSERT INTO characters (id, account_id, name, spiritual_root, map_id, x, y, realm, stage, exp, potential_points, created_at, updated_at, stat_can_cot, stat_than_phap, stat_ngo_tinh, stat_linh_luc, stat_than_thuc, stat_phuc_duyen, root_grade, bag_tabs, constitution, constitution_tier, gender, hotbar, vitals, roots, bt_started_at, paths, sat_khi, sat_nhan, anh_hung, mounted, review_until, review_by, deleted_at)
SELECT id, account_id, name, spiritual_root, map_id, x, y, realm, stage, exp, potential_points, created_at, updated_at, stat_can_cot, stat_than_phap, stat_ngo_tinh, stat_linh_luc, stat_than_thuc, stat_phuc_duyen, root_grade, bag_tabs, constitution, constitution_tier, gender, hotbar, vitals, roots, bt_started_at, paths, sat_khi, sat_nhan, anh_hung, mounted, review_until, review_by, deleted_at
FROM characters_copy;
DROP TABLE characters_copy;

CREATE INDEX idx_characters_rank ON characters (realm DESC, stage DESC, exp DESC);
CREATE INDEX idx_characters_account ON characters (account_id);

ALTER TABLE sessions ADD COLUMN character_id TEXT;

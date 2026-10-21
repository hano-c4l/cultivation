-- The gear master table. Each piece of gear gets its stats rolled when it is made (a drop, a purchase); the roll is kept with the item,
-- and the ranges it is rolled from live in `equipment_master`. Items that already exist keep their fixed stats (rolled_stats stays NULL).
ALTER TABLE item_instances ADD COLUMN rolled_stats TEXT;

-- One row for each kind, style, realm and bậc: `stats` is JSON {"attack":[min,max],...} at the lowest grade (the grade scales the roll).
-- The rows are seeded from the code defaults the first time the server reads them (INSERT OR IGNORE), so an admin can edit them later.
CREATE TABLE IF NOT EXISTS equipment_master (
  item_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  style TEXT NOT NULL,
  realm INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  stats TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- The name of the gear set of each realm and bậc (Lăng Y, Bạch Thi...): every piece of that level is named "<set> <kind>".
CREATE TABLE IF NOT EXISTS equipment_sets (
  realm INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  name_vi TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (realm, tier)
);

INSERT OR IGNORE INTO config_versions (name, version, updated_at) VALUES ('gear_master', 1, 0);

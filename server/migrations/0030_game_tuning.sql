-- 2j balance numbers that were code constants (smith costs and ore drops, refining, Hộ Cấp Phù price, boss cone and healing): one JSON row
-- per group, seeded from the code defaults the first time the server reads it, editable later from an admin screen.
CREATE TABLE IF NOT EXISTS game_tuning (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT
);

INSERT OR IGNORE INTO config_versions (name, version, updated_at) VALUES ('tuning', 1, 0);

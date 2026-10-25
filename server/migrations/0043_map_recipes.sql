-- Maps as data (3l-a): one row per map holding its recipe (layout, colours, spawn, gates; see MapRecipe in shared/src/map.ts). Seeded from the code's maps the
-- first time they are read; a map without a row (or with a row that does not validate) is the code's map.
CREATE TABLE IF NOT EXISTS map_recipes (
  map_id TEXT PRIMARY KEY,
  def TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT
);
INSERT OR IGNORE INTO config_versions (name, version, updated_at) VALUES ('maps', 1, 0);

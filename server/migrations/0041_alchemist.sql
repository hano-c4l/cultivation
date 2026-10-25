-- The alchemist (Đan Sư): brewings in progress (see server/src/brew.ts). The recipes are the `alchemy` group of game_tuning, seeded when first read.
CREATE TABLE IF NOT EXISTS brew_jobs (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ready_at INTEGER NOT NULL,
  collected_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_brew_jobs_char ON brew_jobs (character_id, collected_at);

-- Special pills are brewed now (alchemist recipes) and no longer sold by the merchants; the merchants keep the plain healing pills.
DELETE FROM shop_stock WHERE rule_id IN ('linh_nguyen_dan', 'bao_nguyen_dan', 'thien_ngo_dan');
UPDATE config_versions SET version = version + 1, updated_at = 0 WHERE name = 'shop';

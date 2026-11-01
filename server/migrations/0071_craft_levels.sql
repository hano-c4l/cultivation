-- Phase 5e: trade levels for the forge. The exp a character has in a trade, and the exp a run gives (copied from the recipe when the run starts, like its result).
CREATE TABLE craft_exp (
  character_id TEXT NOT NULL REFERENCES characters(id),
  craft TEXT NOT NULL CHECK (craft IN ('alchemy', 'forge')),
  exp INTEGER NOT NULL DEFAULT 0 CHECK (exp >= 0),
  PRIMARY KEY (character_id, craft)
) WITHOUT ROWID;
ALTER TABLE brew_jobs ADD COLUMN exp INTEGER NOT NULL DEFAULT 0;
-- The forge group of the code now has levels. A row nobody has edited is replaced by the new default (an optional field never makes a stored row invalid, so the game would not do it by itself); an edited row stays as it is.
DELETE FROM game_tuning WHERE name = 'forge' AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

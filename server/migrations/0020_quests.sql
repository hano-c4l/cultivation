-- Quests (phase 2e-B). `quests` holds the catalogue as data (one JSON definition per quest, columns for ordering and the
-- enabled flag) so an admin screen can edit it later; the server seeds the default newbie chain on first read
-- (INSERT OR IGNORE, so later edits are never overwritten). `character_quests` is each character's progress.
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  seq INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  def TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE character_quests (
  character_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'done')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  accepted_at INTEGER NOT NULL,
  done_at INTEGER,
  PRIMARY KEY (character_id, quest_id)
);

INSERT INTO config_versions (name, version, updated_at) VALUES ('quests', 1, 0);

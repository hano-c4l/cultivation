-- Phase 2c: skills. Basic skills are worked out from root, realm and stage and never stored; only skills learned from a
-- bí tịch are (the primary key makes learning one twice fail, so the batch that consumes the book rolls back).
CREATE TABLE character_skills (
  character_id TEXT NOT NULL REFERENCES characters(id),
  skill_id TEXT NOT NULL,
  learned_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, skill_id)
) WITHOUT ROWID;

-- The hotbar: JSON array of 8 strings ("" empty, "s:<skill>", "i:<item type>"). Read with every character row.
ALTER TABLE characters ADD COLUMN hotbar TEXT NOT NULL DEFAULT '[]';

-- Phase 2d-B: hướng tu (cultivation paths). One row per path a character has taken up: slot 0 is the chủ tu, slots 1 and 2 the
-- phụ tu. The unique keys make a path taken twice, or a third phụ tu, an error that rolls the whole batch back. `level` is for
-- later (changing or dropping a path will cost by it). The path ids are not in a CHECK so a new path needs no migration.
CREATE TABLE character_paths (
  character_id TEXT NOT NULL REFERENCES characters(id),
  path_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 2),
  level INTEGER NOT NULL DEFAULT 0,
  chosen_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, slot),
  UNIQUE (character_id, path_id)
);

-- What the table says, kept on the character row as "main:sub1:sub2" so every read of a character (and every RETURNING of it) has it.
-- The two are always written in the same batch.
ALTER TABLE characters ADD COLUMN paths TEXT NOT NULL DEFAULT '';

-- Phase 5c-1: the players' sects. State that crosses every map and channel lives in D1 and is changed by guarded batches (a statement that throws rolls the batch back).
CREATE TABLE sects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  leader_id TEXT NOT NULL REFERENCES characters(id),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  exp INTEGER NOT NULL DEFAULT 0 CHECK (exp >= 0),
  -- Linh Thạch the sect holds (5c-2).
  fund INTEGER NOT NULL DEFAULT 0 CHECK (fund >= 0),
  notice TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- One row per member; one sect per character (the primary key). `rank` is the index in SECT_ROLES (0 disciple .. 5 leader).
-- `contribution` is what the member can spend, `contribution_total` what they earned: both are lost with the row when the member goes (5c-2 fills them).
CREATE TABLE sect_members (
  character_id TEXT PRIMARY KEY REFERENCES characters(id),
  sect_id TEXT NOT NULL REFERENCES sects(id),
  rank INTEGER NOT NULL DEFAULT 0 CHECK (rank BETWEEN 0 AND 5),
  contribution INTEGER NOT NULL DEFAULT 0 CHECK (contribution >= 0),
  contribution_total INTEGER NOT NULL DEFAULT 0 CHECK (contribution_total >= 0),
  joined_at INTEGER NOT NULL
);
CREATE INDEX idx_sect_members_sect ON sect_members(sect_id, rank);
-- At most one leader per sect.
CREATE UNIQUE INDEX idx_sect_one_leader ON sect_members(sect_id) WHERE rank = 5;

-- A character's open applications to join a sect.
CREATE TABLE sect_requests (
  character_id TEXT NOT NULL REFERENCES characters(id),
  sect_id TEXT NOT NULL REFERENCES sects(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, sect_id)
);
CREATE INDEX idx_sect_requests_sect ON sect_requests(sect_id, created_at);

-- When a character that left (or was sent away, or lost the sect to a disbanding) may join a sect again.
CREATE TABLE sect_cooldown (
  character_id TEXT PRIMARY KEY REFERENCES characters(id),
  until INTEGER NOT NULL
);

-- Everything that changes a sect, for looking into a dispute.
CREATE TABLE sect_log (
  id TEXT PRIMARY KEY,
  sect_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sect_log_sect ON sect_log(sect_id, created_at);

-- The sect NPC looks like an old man in a robe: add it to the stored NPC looks (a missing kind would be drawn as the plain male body).
UPDATE game_tuning SET value = json_set(value, '$.byKind.sect', json('{"body":"male","outfit":"sage","tint":"#9ad8c0","aura":"#6fe0b0"}')) WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.sect') IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

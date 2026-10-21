-- The map boss (2h): at most one row per map, whatever the channel. A room claims the map's boss with INSERT OR IGNORE, so two channels can never both have one.
CREATE TABLE IF NOT EXISTS world_boss (
  map_id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  claimed_at INTEGER NOT NULL
);

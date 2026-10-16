-- Phase 0 placeholder schema; accounts and characters are fleshed out in Phase 1.
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  map_id TEXT NOT NULL DEFAULT 'town',
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

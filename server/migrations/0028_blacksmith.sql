-- The blacksmith (Thợ Rèn): upgrade levels of gear and pháp bảo. `enhance_level` is the +N of a piece (0..10); `enhance_bonus` is the
-- extra success chance (percent) it has built up from failed attempts, kept with the piece.
ALTER TABLE item_instances ADD COLUMN enhance_level INTEGER NOT NULL DEFAULT 0 CHECK (enhance_level >= 0 AND enhance_level <= 10);
ALTER TABLE item_instances ADD COLUMN enhance_bonus INTEGER NOT NULL DEFAULT 0 CHECK (enhance_bonus >= 0 AND enhance_bonus <= 100);

-- The rules of each upgrade step (chance, stat gain, failure bonus, whether a failure costs a level, ore and Linh Thạch). Seeded from the code
-- defaults the first time the server reads it; editable later from an admin screen.
CREATE TABLE IF NOT EXISTS enhance_levels (
  level INTEGER PRIMARY KEY CHECK (level >= 1 AND level <= 10),
  success_pct REAL NOT NULL,
  stat_pct REAL NOT NULL,
  fail_bonus_pct REAL NOT NULL,
  drop_on_fail INTEGER NOT NULL,
  materials INTEGER NOT NULL,
  linh_mult REAL NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO config_versions (name, version, updated_at) VALUES ('enhance', 1, 0);

-- Phase 1c: base stats for potential point allocation.
-- Starting values mirror shared/src/progression-data.ts (BASE_STAT_START = 5, ROOT_STAT_BONUS = 2).
ALTER TABLE characters ADD COLUMN stat_can_cot INTEGER NOT NULL DEFAULT 5;
ALTER TABLE characters ADD COLUMN stat_than_phap INTEGER NOT NULL DEFAULT 5;
ALTER TABLE characters ADD COLUMN stat_ngo_tinh INTEGER NOT NULL DEFAULT 5;
ALTER TABLE characters ADD COLUMN stat_linh_luc INTEGER NOT NULL DEFAULT 5;
ALTER TABLE characters ADD COLUMN stat_than_thuc INTEGER NOT NULL DEFAULT 5;
ALTER TABLE characters ADD COLUMN stat_phuc_duyen INTEGER NOT NULL DEFAULT 5;

-- Existing characters get the root bonus and the starting potential points, as if created now.
UPDATE characters SET stat_than_phap = stat_than_phap + 2 WHERE spiritual_root = 'kim';
UPDATE characters SET stat_phuc_duyen = stat_phuc_duyen + 2 WHERE spiritual_root = 'moc';
UPDATE characters SET stat_than_thuc = stat_than_thuc + 2 WHERE spiritual_root = 'thuy';
UPDATE characters SET stat_linh_luc = stat_linh_luc + 2 WHERE spiritual_root = 'hoa';
UPDATE characters SET stat_can_cot = stat_can_cot + 2 WHERE spiritual_root = 'tho';
UPDATE characters SET potential_points = 5 WHERE potential_points = 0 AND realm = 0 AND stage = 1 AND exp = 0;

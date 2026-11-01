-- Phase 5c-2: cống hiến belongs to the sect member now (sect_members.contribution), so the old wallet currency goes away: every balance is set to 0
-- (it was test data: nothing was live), and the daily quests stop paying it. The Cống Hiến slot of the wallet shows the member's contribution instead.
UPDATE currency_balances SET balance = 0 WHERE currency = 'cong_hien';
UPDATE quests SET def = json_remove(def, '$.rewards.congHien') WHERE json_extract(def, '$.rewards.congHien') IS NOT NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'quests';

-- What the leader pays each rank a week (JSON array of 6 amounts; empty: nothing), and who took this week's pay.
ALTER TABLE sects ADD COLUMN weekly TEXT NOT NULL DEFAULT '';
CREATE TABLE sect_weekly (
  character_id TEXT NOT NULL REFERENCES characters(id),
  week INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, week)
);

-- The sect tuning group grew (levels cost exp and Linh Thạch, donations, the weekly cap, the shop): an unedited stored row is dropped so it is seeded again.
DELETE FROM game_tuning WHERE name = 'sect' AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

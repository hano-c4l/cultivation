-- Phase 5c-6: a sect task can come up as a kill count (a day by the draw of the member, task and day) instead of the hand-in. The kills of a member for a task and a day are counted
-- in the same row as the hand-ins of that day.
ALTER TABLE sect_task_log ADD COLUMN kills INTEGER NOT NULL DEFAULT 0;
-- The two hunting tasks of the stored sect group get their kill objective (when the row has them, in their place, and lacks it): edits of an Admin stay.
UPDATE game_tuning SET value = json_set(value, '$.tasks[1].kill', json('{"count":15,"pct":50}')) WHERE name = 'sect' AND json_extract(value, '$.tasks[1].id') = 'hunt_bone' AND json_extract(value, '$.tasks[1].kill') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.tasks[2].kill', json('{"count":2,"pct":50,"rare":true}')) WHERE name = 'sect' AND json_extract(value, '$.tasks[2].id') = 'hunt_dan' AND json_extract(value, '$.tasks[2].kill') IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

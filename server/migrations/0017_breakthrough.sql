-- Phase 2d: a breakthrough in progress. The start time marks a breakthrough whose pills and Linh Thạch are already paid; it is
-- cleared when the outcome is written. A marker found when the character next joins means the room was lost mid-way, which
-- counts as a failure (the character cannot dodge the EXP loss by dropping the connection).
ALTER TABLE characters ADD COLUMN bt_started_at INTEGER;

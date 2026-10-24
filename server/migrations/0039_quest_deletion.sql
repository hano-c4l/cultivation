-- Phase 3e: deleting quests from the admin screen. `deleted_at` marks a quest taken out by an admin: while characters hold progress on it
-- it stays in the catalogue (disabled, read-only) so they can finish it; `tomb` = 1 marks a hard-deleted quest of the seed catalogue, a row kept
-- so the one-time seeding (INSERT OR IGNORE) does not put it back; the catalogue skips tombstones. A hard delete of an admin-made quest removes the row.
ALTER TABLE quests ADD COLUMN deleted_at INTEGER;
ALTER TABLE quests ADD COLUMN tomb INTEGER NOT NULL DEFAULT 0 CHECK (tomb IN (0, 1));

-- A character an admin is editing (3m-b): while `review_until` is in the future the account cannot log in (the admin's edits are the only writer), and it ends by
-- itself after 30 minutes so an abandoned edit never locks a player out for good.
ALTER TABLE characters ADD COLUMN review_until INTEGER;
ALTER TABLE characters ADD COLUMN review_by TEXT;

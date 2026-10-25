-- Account bans (3m): until a time, or for good, with the reason the player is shown when they try to log in.
ALTER TABLE accounts ADD COLUMN ban_until INTEGER;
ALTER TABLE accounts ADD COLUMN ban_forever INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN ban_reason TEXT;
ALTER TABLE accounts ADD COLUMN banned_by TEXT;

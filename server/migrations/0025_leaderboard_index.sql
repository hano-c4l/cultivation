-- Leaderboard (2h): the ranking reads the top rows by realm, stage and exp, so it needs this index or every query would read every character.
CREATE INDEX IF NOT EXISTS idx_characters_rank ON characters (realm DESC, stage DESC, exp DESC);

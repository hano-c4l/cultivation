-- 3l/3m leftovers. `map_recipes.name_vi`: the display name of a map, kept apart from `def` so naming a map of the code does not pin its grid (saving `def` does).
-- `accounts.last_login_at`: set at each login. `characters.deleted_at`: a character an admin deleted is kept (its ledger rows cannot be removed), hidden from the
-- game and the rankings, its name freed and its row moved to a tombstone account so the real account can make a new character.
ALTER TABLE map_recipes ADD COLUMN name_vi TEXT;
ALTER TABLE accounts ADD COLUMN last_login_at INTEGER;
ALTER TABLE characters ADD COLUMN deleted_at INTEGER;

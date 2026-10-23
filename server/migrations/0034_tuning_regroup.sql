-- Three tuning groups changed shape (pvp gained hero/nameTiers/protectedBelow, skills gained pillPoints, theme gained the page palette). The rows only
-- ever held the code defaults (no admin screen has edited them), so they are dropped and seeded again from the defaults the next time they are read.
DELETE FROM game_tuning WHERE name IN ('pvp', 'skills', 'theme') AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

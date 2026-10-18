-- Skills with realms, grades and mastery levels. character_skills now holds every skill a character was given, not just
-- the ones learned from a bí tịch:
--   source   'root' (the two skills each realm gives, rolled once and stored), 'learned' (a bí tịch or an NPC), 'sect' (later)
--   realm    the realm the skill belongs to (root skills: the realm that gave them)
--   level    mastery level index (0 nhập môn, 1 tiểu thành, 2 đại thành, 3 viên mãn, 4 thần thông)
--   mastery  points towards the next level
-- Rows that already exist are learned skills, which is what the defaults say.
ALTER TABLE character_skills ADD COLUMN source TEXT NOT NULL DEFAULT 'learned';
ALTER TABLE character_skills ADD COLUMN realm INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_skills ADD COLUMN level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_skills ADD COLUMN mastery INTEGER NOT NULL DEFAULT 0;

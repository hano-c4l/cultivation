-- The martial master (võ sư) teaches the skill books for a fee: the merchants no longer sell them (a book still drops from monsters). The stored stock rows of the
-- books go (the code defaults no longer have them, and INSERT OR IGNORE would never remove them); the masters and their courses come from the code and the `dojo`
-- tuning group, which the server seeds the first time it reads them.
DELETE FROM shop_stock WHERE rule_id LIKE 'bt\_%' ESCAPE '\';
UPDATE config_versions SET version = version + 1, updated_at = 0 WHERE name = 'shop';
UPDATE config_versions SET version = version + 1, updated_at = 0 WHERE name = 'npcs';
UPDATE config_versions SET version = version + 1, updated_at = 0 WHERE name = 'tuning';

-- The martial master stands as a swordsman in the red of a martial hall (a stored table from before has no look for the kind).
UPDATE game_tuning SET value = json_set(value, '$.byKind.master', json('{"body":"male","outfit":"ranger","weapon":"kiem","tint":"#e6b8a0","aura":"#e0563a"}')) WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.master') IS NULL;

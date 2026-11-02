-- The paper dolls (PHASE4 4j): three silhouettes (tunic, robe, grand) replace the eight single-sprite outfits, and the gear colours are one for each realm (with belt and bracers).
-- A stored row is changed only where it still holds what the game started with; an Admin's own choice stays.
UPDATE game_tuning SET value = '{"rules":[{"minRealm":0,"outfit":"tunic"},{"minRealm":1,"outfit":"tunic"},{"minRealm":2,"outfit":"robe"},{"minRealm":3,"outfit":"robe"},{"minRealm":4,"outfit":"grand"},{"minRealm":5,"outfit":"grand"}]}'
  WHERE name = 'outfits' AND json_extract(value, '$.rules[0].outfit') = 'ranger' AND json_array_length(value, '$.rules') = 6;
-- the colour lists change shape (a colour for each realm), so a row that still has the old defaults is dropped and seeded again
DELETE FROM game_tuning WHERE name = 'gearLooks' AND json_array_length(value, '$.robe') = 16 AND json_extract(value, '$.robe[0]') = '#ffffff';
-- the NPCs: the outfit keys are the doll silhouettes now
UPDATE game_tuning SET value = replace(replace(replace(value, '"outfit":"sage"', '"outfit":"robe"'), '"outfit":"ranger"', '"outfit":"tunic"'), '"outfit":"warden"', '"outfit":"tunic"') WHERE name = 'npcLooks';
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

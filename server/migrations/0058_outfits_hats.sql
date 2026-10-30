-- More outfits and hats (PHASE4): the outfit by the realm of the robe (Luyện Khí ranger, Trúc Cơ scout, Kim Đan tien, Nguyên Anh violet, Hóa Thần crimson, Luyện Hư shadow), a
-- plain robe for the NPCs (sage) and a steel one for the guards (warden), and the hat shapes by realm. A stored row is changed only where it still holds what the game
-- started with; an Admin's own choice stays.
UPDATE game_tuning SET value = '{"rules":[{"minRealm":0,"outfit":"ranger"},{"minRealm":1,"outfit":"scout"},{"minRealm":2,"outfit":"tien"},{"minRealm":3,"outfit":"violet"},{"minRealm":4,"outfit":"crimson"},{"minRealm":5,"outfit":"shadow"}]}'
  WHERE name = 'outfits' AND json_array_length(value, '$.rules') <= 2;
UPDATE game_tuning SET value = json_set(value, '$.byKind.merchant.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.merchant.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byKind.quest.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.quest.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byKind.smith.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.smith.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byKind.alchemist.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.alchemist.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byKind.guard.outfit', 'warden') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.guard.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byId.elder.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byId.elder.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byId.path_kiem.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byId.path_kiem.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byId.path_thuat.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byId.path_thuat.outfit') = 'tien';
UPDATE game_tuning SET value = json_set(value, '$.byId.path_dan.outfit', 'sage') WHERE name = 'npcLooks' AND json_extract(value, '$.byId.path_dan.outfit') = 'tien';
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

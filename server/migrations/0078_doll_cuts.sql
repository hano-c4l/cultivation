-- The six cuts of the paper doll (PHASE4 4k): every robe set of a realm no longer wears the same silhouette, and the NPCs dress by their trade.
-- A stored row is changed only where it still holds what the game started with; an Admin's own choice stays.
UPDATE game_tuning SET value = json_set(value, '$.byTier', json('{"0.7":"wave","0.8":"wave","0.9":"wave","1.4":"wave","1.5":"wave","1.6":"wave","1.7":"armor","1.8":"armor","1.9":"armor","2.5":"armor","2.6":"armor","2.7":"armor","2.8":"wave","2.9":"wave","3.5":"armor","3.6":"armor","3.7":"armor","3.8":"grand","3.9":"grand","4.6":"armor","4.7":"armor","4.8":"dragon","4.9":"dragon","5.5":"dragon","5.6":"dragon","5.7":"dragon","5.8":"dragon","5.9":"dragon"}'))
  WHERE name = 'outfits' AND json_extract(value, '$.byTier') IS NULL AND json_array_length(value, '$.rules') = 6 AND json_extract(value, '$.rules[0].outfit') = 'tunic' AND json_extract(value, '$.rules[2].outfit') = 'robe' AND json_extract(value, '$.rules[4].outfit') = 'grand';
UPDATE game_tuning SET value = json_set(value, '$.byKind.merchant.outfit', 'wave') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.merchant.outfit') = 'robe';
UPDATE game_tuning SET value = json_set(value, '$.byKind.smith.outfit', 'tunic') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.smith.outfit') = 'robe';
UPDATE game_tuning SET value = json_set(value, '$.byKind.market.outfit', 'grand') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.market.outfit') = 'robe';
UPDATE game_tuning SET value = json_set(value, '$.byKind.sect.outfit', 'dragon') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.sect.outfit') = 'robe';
UPDATE game_tuning SET value = json_set(value, '$.byKind.guard.outfit', 'armor') WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.guard.outfit') = 'tunic';
UPDATE game_tuning SET value = json_set(value, '$.byId.elder.outfit', 'grand') WHERE name = 'npcLooks' AND json_extract(value, '$.byId.elder.outfit') = 'robe';
UPDATE game_tuning SET value = json_set(value, '$.byId.path_kiem.outfit', 'armor') WHERE name = 'npcLooks' AND json_extract(value, '$.byId.path_kiem.outfit') = 'robe';
UPDATE game_tuning SET value = json_set(value, '$.byId.path_dan.outfit', 'wave') WHERE name = 'npcLooks' AND json_extract(value, '$.byId.path_dan.outfit') = 'robe';
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

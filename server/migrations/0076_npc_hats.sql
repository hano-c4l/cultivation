-- Phase 4 leftovers: hats for NPCs and guards. The default looks now name a hat; a stored `npcLooks` row (edited or not) gets the hats it does not have yet.
-- json_insert writes only a path that is missing, so a hat an admin already chose is kept; each update runs only for an entry the stored table has (an entry the row lacks stays
-- the code's default, and a half entry with no body would be invalid).
UPDATE game_tuning SET value = json_insert(value, '$.byKind.merchant.hat', 5) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.merchant') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byKind.quest.hat', 1) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.quest') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byKind.smith.hat', 5) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.smith') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byKind.alchemist.hat', 3) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.alchemist') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byKind.master.hat', 6) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.master') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byKind.market.hat', 3) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.market') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byKind.sect.hat', 7) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.sect') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byKind.guard.hat', 6) WHERE name = 'npcLooks' AND json_type(value, '$.byKind.guard') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byId.elder.hat', 1) WHERE name = 'npcLooks' AND json_type(value, '$.byId.elder') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byId.path_kiem.hat', 0) WHERE name = 'npcLooks' AND json_type(value, '$.byId.path_kiem') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byId.path_thuat.hat', 7) WHERE name = 'npcLooks' AND json_type(value, '$.byId.path_thuat') = 'object';
UPDATE game_tuning SET value = json_insert(value, '$.byId.path_dan.hat', 3) WHERE name = 'npcLooks' AND json_type(value, '$.byId.path_dan') = 'object';
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

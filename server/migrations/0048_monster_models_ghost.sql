-- Hàn Thi Ma gets the ghost model (the stored monsterModels row from before still maps it to the skeleton; INSERT OR IGNORE never refreshes it).
UPDATE game_tuning SET value = json_set(value, '$.han_thi_ma', 'ghost') WHERE name = 'monsterModels' AND json_extract(value, '$.han_thi_ma') = 'skeleton';
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

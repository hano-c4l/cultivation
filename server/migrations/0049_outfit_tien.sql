-- Kim Đan robes and above are drawn in the white xianxia robe ("tien"): add the rule to the stored outfits row (INSERT OR IGNORE never refreshes it), unless one already names it.
UPDATE game_tuning SET value = json_set(value, '$.rules[#]', json('{"minRealm":2,"outfit":"tien"}'))
WHERE name = 'outfits' AND NOT EXISTS (SELECT 1 FROM json_each(game_tuning.value, '$.rules') AS r WHERE json_extract(r.value, '$.outfit') = 'tien');
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

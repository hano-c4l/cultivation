-- Bamboo, stone lanterns and jade join the obstacle mixes of the maps (the stored mapArt row is never refreshed by INSERT OR IGNORE). Only a map still drawn with its stock obstacle is touched.
UPDATE game_tuning SET value = json_set(value, '$.maps.town.mix', json('["tree","tree","tree","bamboo","bamboo","bush","lantern","rock"]')) WHERE name = 'mapArt' AND json_extract(value, '$.maps.town.obstacle') = 'tree';
UPDATE game_tuning SET value = json_set(value, '$.maps.forest.mix', json('["tree","tree","tree","bamboo","bamboo","bush","stump","boulder"]')) WHERE name = 'mapArt' AND json_extract(value, '$.maps.forest.obstacle') = 'tree';
UPDATE game_tuning SET value = json_set(value, '$.maps.cave.mix', json('["pillar","pillar","boulder","jade","jade","rock"]')) WHERE name = 'mapArt' AND json_extract(value, '$.maps.cave.obstacle') = 'pillar';
UPDATE game_tuning SET value = json_set(value, '$.maps.town2.mix', json('["rock","lantern","boulder","pillar","jade","bamboo"]')) WHERE name = 'mapArt' AND json_extract(value, '$.maps.town2.obstacle') = 'rock';
UPDATE game_tuning SET value = json_set(value, '$.maps.nguyenanh.mix', json('["crystal","crystal","jade","boulder","pillar"]')) WHERE name = 'mapArt' AND json_extract(value, '$.maps.nguyenanh.obstacle') = 'crystal';
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

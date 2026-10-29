-- Two realms above Nguyên Anh (Hóa Thần, Luyện Hư), a third town (Huyền Thiên Thành) and two maps for them (Lôi Âm Tuyệt Cốc, Hư Không Hải).
-- The code reads missing list entries from its defaults for the realm lists, but the admin screens and the keyed tables read the stored rows, so the stored
-- `game_tuning` groups get the new entries here. Every statement only adds what is missing (a list that is still short, a key that is absent); a value an admin
-- has set is never touched. New merchants, NPCs, maps and quests are seeded by the server itself ("only the rows that are missing").

-- EXP and potential points of the two realms.
UPDATE game_tuning SET value = json_insert(json_insert(value, '$.realms[#]', json('{"expBase":160000000,"pointsPerStage":12}')), '$.realms[#]', json('{"expBase":3200000000,"pointsPerStage":14}'))
  WHERE name = 'exp' AND json_array_length(value, '$.realms') = 4;

-- Breakthrough steps Nguyên Anh -> Hóa Thần -> Luyện Hư.
UPDATE game_tuning SET value = json_insert(json_insert(value, '$.steps[#]', json('{"maxPills":3,"baseRatePct":45,"maxRatePct":65,"durationMs":600000,"cost":5000000,"basePoints":32}')), '$.steps[#]', json('{"maxPills":3,"baseRatePct":40,"maxRatePct":60,"durationMs":600000,"cost":50000000,"basePoints":40}'))
  WHERE name = 'breakthrough' AND json_array_length(value, '$.steps') = 3;

-- Colours of the realm tags.
UPDATE game_tuning SET value = json_insert(json_insert(value, '$.realmColors[#]', '#ff5252'), '$.realmColors[#]', '#e8f4ff')
  WHERE name = 'theme' AND json_array_length(value, '$.realmColors') = 4;

-- Upgrade cost base and the kills that make the boss certain, per realm.
UPDATE game_tuning SET value = json_insert(json_insert(value, '$.linhBase[#]', 1000000), '$.linhBase[#]', 10000000)
  WHERE name = 'enhanceCost' AND json_array_length(value, '$.linhBase') = 4;
UPDATE game_tuning SET value = json_insert(json_insert(value, '$.pityKills[#]', 5500), '$.pityKills[#]', 7000)
  WHERE name = 'bossSpawn' AND json_array_length(value, '$.pityKills') = 4;

-- The bosses of the two new maps (the third town has none).
UPDATE game_tuning SET value = json_insert(value, '$.species.town3', json('null'), '$.species.hoathan', 'loi_de_long', '$.species.luyenhu', 'hon_don_ma_ton')
  WHERE name = 'boss';

-- The breakthrough pills that fall in the maps of Nguyên Anh and Hóa Thần.
UPDATE game_tuning SET value = json_insert(value,
    '$.pill."3"', json('{"normal":0.0002,"rare1":0.004,"rare2":0.015}'),
    '$.pill."4"', json('{"normal":0.0001,"rare1":0.002,"rare2":0.008}'))
  WHERE name = 'drops';

-- The extra pills of the maps of the two realms.
UPDATE game_tuning SET value = json_insert(value,
    '$.realm."4"', json('{"normal":[{"item":"than_huyet_dan","chance":0.03,"min":1,"max":1},{"item":"than_linh_dan","chance":0.015,"min":1,"max":1}],"rare1":[{"item":"than_huyet_dan","chance":0.2,"min":1,"max":2},{"item":"than_linh_dan","chance":0.1,"min":1,"max":1},{"item":"thien_ngo_dan","chance":0.08,"min":1,"max":1}],"rare2":[{"item":"than_huyet_dan","chance":0.5,"min":1,"max":3},{"item":"than_linh_dan","chance":0.3,"min":1,"max":2},{"item":"thien_ngo_dan","chance":0.3,"min":1,"max":1}]}'),
    '$.realm."5"', json('{"normal":[{"item":"hu_huyet_dan","chance":0.02,"min":1,"max":1},{"item":"hu_linh_dan","chance":0.01,"min":1,"max":1}],"rare1":[{"item":"hu_huyet_dan","chance":0.15,"min":1,"max":2},{"item":"hu_linh_dan","chance":0.08,"min":1,"max":1},{"item":"thien_ngo_dan","chance":0.1,"min":1,"max":1}],"rare2":[{"item":"hu_huyet_dan","chance":0.4,"min":1,"max":3},{"item":"hu_linh_dan","chance":0.25,"min":1,"max":2},{"item":"thien_ngo_dan","chance":0.35,"min":1,"max":1}]}'))
  WHERE name = 'loot';

-- What the new items are worth (what a merchant pays for one).
UPDATE game_tuning SET value = json_insert(value,
    '$.items.ttp_town3', 200000, '$.items.than_huyet_dan', 4000, '$.items.than_linh_dan', 4000, '$.items.hu_huyet_dan', 25000, '$.items.hu_linh_dan', 25000)
  WHERE name = 'itemValue';

-- The two brewed pills of Luyện Hư join the alchemist's recipes (appended once).
UPDATE game_tuning SET value = json_insert(json_insert(value,
    '$.recipes[#]', json('{"id":"hu_huyet_dan","nameVi":"Luyện Hư Huyết Đan","output":"hu_huyet_dan","qty":1,"inputs":[{"item":"linh_thao","qty":40},{"item":"yeu_dan","qty":10},{"item":"tl_ht","qty":3}],"linhThach":200000,"seconds":600,"enabled":true}')),
    '$.recipes[#]', json('{"id":"hu_linh_dan","nameVi":"Luyện Hư Linh Đan","output":"hu_linh_dan","qty":1,"inputs":[{"item":"linh_thao","qty":40},{"item":"yeu_dan","qty":10},{"item":"tl_ht","qty":3}],"linhThach":200000,"seconds":600,"enabled":true}'))
  WHERE name = 'alchemy' AND NOT EXISTS (SELECT 1 FROM json_each(game_tuning.value, '$.recipes') AS r WHERE json_extract(r.value, '$.id') = 'hu_huyet_dan');

UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

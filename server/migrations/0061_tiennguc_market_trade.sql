-- Phase 5: Vạn Bảo Lâu and direct trade also take Tiên Ngọc. A listing is priced in one currency and the buyer or bidder pays in it; a trade carries both currencies.
ALTER TABLE market_listings ADD COLUMN currency TEXT NOT NULL DEFAULT 'linh_thach' CHECK (currency IN ('linh_thach', 'tien_ngoc'));
ALTER TABLE market_sales ADD COLUMN currency TEXT NOT NULL DEFAULT 'linh_thach';
ALTER TABLE trade_log ADD COLUMN tn_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trade_log ADD COLUMN tn_b INTEGER NOT NULL DEFAULT 0;

-- The town NPCs stand round the teleport array about 8 tiles away, spread out, and the hướng tu masters are scattered over the plaza (docs/PHASE5.md): move the stored rows nobody edited.
UPDATE npc_spots SET x = 52.4, y = 41.5 WHERE map_id = 'town' AND npc_id = 'merchant' AND updated_by IS NULL;
UPDATE npc_spots SET x = 42.2, y = 38.2 WHERE map_id = 'town' AND npc_id = 'elder' AND updated_by IS NULL;
UPDATE npc_spots SET x = 37.6, y = 44.1 WHERE map_id = 'town' AND npc_id = 'smith' AND updated_by IS NULL;
UPDATE npc_spots SET x = 43.8, y = 53.3 WHERE map_id = 'town' AND npc_id = 'alchemist' AND updated_by IS NULL;
UPDATE npc_spots SET x = 52.4, y = 49.5 WHERE map_id = 'town' AND npc_id = 'market' AND updated_by IS NULL;
UPDATE npc_spots SET x = 58.5, y = 33.0 WHERE map_id = 'town' AND npc_id = 'master' AND updated_by IS NULL;
UPDATE npc_spots SET x = 31.5, y = 39.0 WHERE map_id = 'town' AND npc_id = 'path_kiem' AND updated_by IS NULL;
UPDATE npc_spots SET x = 61.0, y = 55.5 WHERE map_id = 'town' AND npc_id = 'path_thuat' AND updated_by IS NULL;
UPDATE npc_spots SET x = 39.0, y = 61.0 WHERE map_id = 'town' AND npc_id = 'path_dan' AND updated_by IS NULL;
UPDATE npc_spots SET x = 52.4, y = 41.5 WHERE map_id = 'town2' AND npc_id = 'merchant2' AND updated_by IS NULL;
UPDATE npc_spots SET x = 42.2, y = 38.2 WHERE map_id = 'town2' AND npc_id = 'elder2' AND updated_by IS NULL;
UPDATE npc_spots SET x = 37.6, y = 44.1 WHERE map_id = 'town2' AND npc_id = 'smith2' AND updated_by IS NULL;
UPDATE npc_spots SET x = 43.8, y = 53.3 WHERE map_id = 'town2' AND npc_id = 'alchemist2' AND updated_by IS NULL;
UPDATE npc_spots SET x = 52.4, y = 49.5 WHERE map_id = 'town2' AND npc_id = 'market2' AND updated_by IS NULL;
UPDATE npc_spots SET x = 58.5, y = 33.0 WHERE map_id = 'town2' AND npc_id = 'master2' AND updated_by IS NULL;
UPDATE npc_spots SET x = 31.5, y = 39.0 WHERE map_id = 'town2' AND npc_id = 'path_kiem' AND updated_by IS NULL;
UPDATE npc_spots SET x = 61.0, y = 55.5 WHERE map_id = 'town2' AND npc_id = 'path_thuat' AND updated_by IS NULL;
UPDATE npc_spots SET x = 39.0, y = 61.0 WHERE map_id = 'town2' AND npc_id = 'path_dan' AND updated_by IS NULL;
UPDATE npc_spots SET x = 52.4, y = 41.5 WHERE map_id = 'town3' AND npc_id = 'merchant3' AND updated_by IS NULL;
UPDATE npc_spots SET x = 42.2, y = 38.2 WHERE map_id = 'town3' AND npc_id = 'elder3' AND updated_by IS NULL;
UPDATE npc_spots SET x = 37.6, y = 44.1 WHERE map_id = 'town3' AND npc_id = 'smith3' AND updated_by IS NULL;
UPDATE npc_spots SET x = 43.8, y = 53.3 WHERE map_id = 'town3' AND npc_id = 'alchemist3' AND updated_by IS NULL;
UPDATE npc_spots SET x = 52.4, y = 49.5 WHERE map_id = 'town3' AND npc_id = 'market3' AND updated_by IS NULL;
UPDATE npc_spots SET x = 58.5, y = 33.0 WHERE map_id = 'town3' AND npc_id = 'master3' AND updated_by IS NULL;
UPDATE npc_spots SET x = 31.5, y = 39.0 WHERE map_id = 'town3' AND npc_id = 'path_kiem' AND updated_by IS NULL;
UPDATE npc_spots SET x = 61.0, y = 55.5 WHERE map_id = 'town3' AND npc_id = 'path_thuat' AND updated_by IS NULL;
UPDATE npc_spots SET x = 39.0, y = 61.0 WHERE map_id = 'town3' AND npc_id = 'path_dan' AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'npcs';

-- The blacksmiths also sell the bản mệnh and the flight pháp bảo of the realms of their town (the stored stock of a merchant is never refreshed from the code).
INSERT OR IGNORE INTO shop_stock (npc_id, rule_id, sort, def) VALUES
  ('smith', 'artifact_low', 10, json('{"id":"artifact_low","kind":"gear","realms":[0,1],"tiers":[1,2],"grade":1,"kinds":["bonded","flight"]}')),
  ('smith2', 'artifact_high', 10, json('{"id":"artifact_high","kind":"gear","realms":[2,3],"tiers":[1,2],"grade":1,"kinds":["bonded","flight"]}')),
  ('smith3', 'artifact_top', 10, json('{"id":"artifact_top","kind":"gear","realms":[4,5],"tiers":[1,2],"grade":1,"kinds":["bonded","flight"]}'));
UPDATE config_versions SET version = version + 1 WHERE name = 'shop';

-- The first town gets a prettier mix of small obstacles (the stored row is never refreshed): only while the mix is still the one migration 0051 wrote.
UPDATE game_tuning SET value = json_set(value, '$.maps.town.mix', json('["tree","tree","bamboo","bamboo","bush","lantern","jade","rock"]')) WHERE name = 'mapArt' AND json_extract(value, '$.maps.town.mix') = json('["tree","tree","tree","bamboo","bamboo","bush","lantern","rock"]');
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

-- Thành 3 and the two maps after it were missing from the stored mapArt row (drawn flat); an Admin save of the picture screen meanwhile may even have written them as plain.
-- Write the code looks where the entry is missing or plain.
UPDATE game_tuning SET value = json_set(value, '$.maps.town3', json('{"ground":"stone","obstacle":"rock","big":"house","mix":["rock","lantern","jade","pillar","crystal","bamboo"]}')) WHERE name = 'mapArt' AND (json_extract(value, '$.maps.town3') IS NULL OR json_extract(value, '$.maps.town3.obstacle') = 'plain');
UPDATE game_tuning SET value = json_set(value, '$.maps.hoathan', json('{"ground":"stone","obstacle":"crystal","mix":["crystal","pillar","boulder","jade","rock"]}')) WHERE name = 'mapArt' AND (json_extract(value, '$.maps.hoathan') IS NULL OR json_extract(value, '$.maps.hoathan.obstacle') = 'plain');
UPDATE game_tuning SET value = json_set(value, '$.maps.luyenhu', json('{"ground":"stone","obstacle":"crystal","mix":["crystal","crystal","pillar","jade","boulder"]}')) WHERE name = 'mapArt' AND (json_extract(value, '$.maps.luyenhu') IS NULL OR json_extract(value, '$.maps.luyenhu.obstacle') = 'plain');
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

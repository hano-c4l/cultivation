-- Pills that restore linh lực (MP), sold next to the healing pills and brewed like the higher healing ones, and a wider Auto range. The stored rows
-- (INSERT OR IGNORE never refreshes them) are changed only where they still hold the old values; a missing row is left to the code defaults.

-- The plain MP pills at the merchants and the alchemists (the town's merchant and alchemist sell the small one and the large one, the second town's too with bigger limits).
INSERT OR IGNORE INTO shop_stock (npc_id, rule_id, sort, def) VALUES
  ('merchant', 'hoi_linh_dan', 20, '{"id":"hoi_linh_dan","kind":"item","item":"hoi_linh_dan"}'),
  ('merchant2', 'dai_hoi_linh_dan', 20, '{"id":"dai_hoi_linh_dan","kind":"item","item":"dai_hoi_linh_dan","dailyLimit":30}'),
  ('alchemist', 'hoi_linh_dan', 20, '{"id":"hoi_linh_dan","kind":"item","item":"hoi_linh_dan"}'),
  ('alchemist', 'dai_hoi_linh_dan', 21, '{"id":"dai_hoi_linh_dan","kind":"item","item":"dai_hoi_linh_dan","dailyLimit":20}'),
  ('alchemist2', 'hoi_linh_dan', 20, '{"id":"hoi_linh_dan","kind":"item","item":"hoi_linh_dan"}'),
  ('alchemist2', 'dai_hoi_linh_dan', 21, '{"id":"dai_hoi_linh_dan","kind":"item","item":"dai_hoi_linh_dan","dailyLimit":30}');
UPDATE config_versions SET version = version + 1, updated_at = 0 WHERE name = 'shop';

-- What the new pills are worth (what a merchant pays for one), only where the stored table has no value for them yet.
UPDATE game_tuning SET value = json_set(value, '$.items.hoi_linh_dan', 10, '$.items.dai_hoi_linh_dan', 60, '$.items.linh_tuyen_dan', 400, '$.items.bao_linh_dan', 1500) WHERE name = 'itemValue' AND json_extract(value, '$.items.hoi_linh_dan') IS NULL;

-- The two brewed MP pills join the alchemist's recipes (appended once).
UPDATE game_tuning SET value = json_insert(json_insert(value, '$.recipes[#]', json('{"id":"linh_tuyen_dan","nameVi":"Luyện Linh Tuyền Đan","output":"linh_tuyen_dan","qty":1,"inputs":[{"item":"linh_thao","qty":10},{"item":"yeu_dan","qty":2}],"linhThach":5000,"seconds":60,"enabled":true}')), '$.recipes[#]', json('{"id":"bao_linh_dan","nameVi":"Luyện Bảo Linh Đan","output":"bao_linh_dan","qty":1,"inputs":[{"item":"linh_thao","qty":20},{"item":"yeu_dan","qty":5}],"linhThach":20000,"seconds":300,"enabled":true}')) WHERE name = 'alchemy' AND value NOT LIKE '%linh_tuyen_dan%';

-- Auto: the range goes up to 40 tiles, 20 by default.
UPDATE game_tuning SET value = json_set(value, '$.radiusMax', 40, '$.radiusDefault', 20) WHERE name = 'auto' AND json_extract(value, '$.radiusMax') = 15;

UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

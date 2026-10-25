-- The merchants stop being the specialists: the alchemist (pills) and the blacksmith (gear) took those over, so each merchant keeps a little of everything:
-- the basic pill (the second town's one: the large healing pill), the first tier of gear and no variant-element gear. Only the merchants' own rows are touched.
DELETE FROM shop_stock WHERE npc_id = 'merchant' AND rule_id IN ('duong_huyet_dan', 'dai_hoi_huyet_dan', 'ngo_dao_dan', 'gear_low_mutant');
DELETE FROM shop_stock WHERE npc_id = 'merchant2' AND rule_id IN ('hoi_huyet_dan', 'duong_huyet_dan', 'ngo_dao_dan', 'gear_high_mutant');
UPDATE shop_stock SET def = json_set(def, '$.tiers', json('[1]')) WHERE npc_id = 'merchant' AND rule_id = 'gear_low';
UPDATE shop_stock SET def = json_set(def, '$.tiers', json('[1]')) WHERE npc_id = 'merchant2' AND rule_id = 'gear_high';
UPDATE config_versions SET version = version + 1, updated_at = 0 WHERE name = 'shop';

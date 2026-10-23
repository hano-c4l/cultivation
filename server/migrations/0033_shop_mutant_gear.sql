-- The merchants of both towns now also sell basic gear of the variant elements (Lôi, Băng, Phong) at 1.5 times the value (a rule each, like the gear
-- of the five elements). Added to the rows that already exist; a deployment where the merchants are not yet in D1 gets the same rules from the code
-- defaults when they are first read.
INSERT OR IGNORE INTO shop_stock (npc_id, rule_id, sort, def)
SELECT 'merchant', 'gear_low_mutant', 1000, '{"id":"gear_low_mutant","kind":"gear","realms":[0,1],"tiers":[1,2],"grade":1,"elements":["loi","bang","phong"],"priceMult":1.5}'
WHERE EXISTS (SELECT 1 FROM shop_merchants WHERE npc_id = 'merchant');
INSERT OR IGNORE INTO shop_stock (npc_id, rule_id, sort, def)
SELECT 'merchant2', 'gear_high_mutant', 1000, '{"id":"gear_high_mutant","kind":"gear","realms":[2,3],"tiers":[1,2],"grade":1,"elements":["loi","bang","phong"],"priceMult":1.5}'
WHERE EXISTS (SELECT 1 FROM shop_merchants WHERE npc_id = 'merchant2');
UPDATE config_versions SET version = version + 1 WHERE name = 'shop';

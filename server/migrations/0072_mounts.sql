-- Phase 5d: beast mounts (thú cưỡi). A character learns a mount from a token item (the token is used up, the row stays for good); riding one is remembered in
-- `characters.riding_beast` (null: on foot or on the flight pháp bảo). The numbers of the mounts are the tuning group `mounts` (seeded when first read).
CREATE TABLE character_mounts (
  character_id TEXT NOT NULL REFERENCES characters(id),
  mount_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, mount_id)
) WITHOUT ROWID;
ALTER TABLE characters ADD COLUMN riding_beast TEXT;

-- The merchants of the three towns sell the tokens (INSERT OR IGNORE: rows an admin has edited stay).
INSERT OR IGNORE INTO shop_stock (npc_id, rule_id, sort, def) VALUES
  ('merchant', 'mt_linh_loc', 30, json('{"id":"mt_linh_loc","kind":"item","item":"mt_linh_loc","dailyLimit":2}')),
  ('merchant', 'mt_hac_phong_lang', 31, json('{"id":"mt_hac_phong_lang","kind":"item","item":"mt_hac_phong_lang","dailyLimit":2}')),
  ('merchant2', 'mt_xich_van_ma', 30, json('{"id":"mt_xich_van_ma","kind":"item","item":"mt_xich_van_ma","dailyLimit":2}')),
  ('merchant3', 'mt_bach_ho', 30, json('{"id":"mt_bach_ho","kind":"item","item":"mt_bach_ho","dailyLimit":2}'));
UPDATE config_versions SET version = version + 1 WHERE name = 'shop';

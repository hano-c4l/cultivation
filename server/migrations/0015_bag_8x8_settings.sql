-- Bag tabs shrink from 8x16 (128 cells) to 8x8 (64 cells). Anything in cells 64..127 would be out of bounds, so those items
-- go to the owner's mailbox (no expiry) and leave the bag; the tab count is unchanged. Items on mail have no bag position.
INSERT INTO mailbox (id, character_id, subject, body, item_id, expires_at, created_at)
  SELECT lower(hex(randomblob(16))), owner_character_id, 'bag_resized', '', id, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM item_instances
  WHERE bag_tab IS NOT NULL AND cell >= 64;
UPDATE item_instances SET bag_tab = NULL, cell = NULL WHERE bag_tab IS NOT NULL AND cell >= 64;

-- Game settings an admin can change at run time (key/value, integer values stored as text). The code holds the defaults and
-- the allowed range of each key (shared/src/settings.ts); a missing row means "use the default".
CREATE TABLE game_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
) WITHOUT ROWID;

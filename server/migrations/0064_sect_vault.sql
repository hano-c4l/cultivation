-- Phase 5c-3: the sect warehouse. A stack in it is kept in escrow like a market listing: the item row stays with the member who put it in but sits in no cell and
-- no slot, and a row here points at it (no foreign key on the item: it is handed on or deleted later). What leaves (taken out by the leader, bought off the
-- shelf, a closing sect) is delivered by mail.
CREATE TABLE sect_vault (
  item_id TEXT PRIMARY KEY,
  sect_id TEXT NOT NULL,
  depositor_id TEXT NOT NULL REFERENCES characters(id),
  item_type TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  -- The cống hiến it earned: also its value when a closing sect hands the stacks round.
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at INTEGER NOT NULL,
  -- On the shop shelf: for what.
  shelf_currency TEXT CHECK (shelf_currency IN ('linh_thach', 'cong_hien')),
  shelf_price INTEGER CHECK (shelf_price > 0),
  CHECK ((shelf_currency IS NULL) = (shelf_price IS NULL))
);
CREATE INDEX idx_sect_vault_sect ON sect_vault(sect_id, created_at);

-- What the leader lets the warehouse take (JSON; empty: nothing), and how much cống hiến a member earned from deposits on a Việt Nam day.
ALTER TABLE sects ADD COLUMN accept TEXT NOT NULL DEFAULT '';
ALTER TABLE sect_members ADD COLUMN vault_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sect_members ADD COLUMN vault_points INTEGER NOT NULL DEFAULT 0;

-- The sect tuning group grew (warehouse and closing numbers): an unedited stored row is dropped so it is seeded again.
DELETE FROM game_tuning WHERE name = 'sect' AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

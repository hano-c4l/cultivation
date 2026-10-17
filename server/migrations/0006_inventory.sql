-- Phase 2a: bag layout, stacks, loot grants and mail expiry.
-- An item sits at (bag_tab, cell), not at one linear index, so the tab size can change later. Both columns are NULL
-- while the item is not in the bag (attached to mail, or equipped once equipment exists).
ALTER TABLE item_instances ADD COLUMN qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0);
ALTER TABLE item_instances ADD COLUMN bag_tab INTEGER CHECK (bag_tab IS NULL OR bag_tab >= 0);
ALTER TABLE item_instances ADD COLUMN cell INTEGER CHECK (cell IS NULL OR cell >= 0);
-- Two items can never share a cell. NULLs are distinct in a unique index, so unplaced items do not collide.
-- (The upper bound of a cell is the tab size, enforced in code from shared config.)
CREATE UNIQUE INDEX idx_items_cell ON item_instances(owner_character_id, bag_tab, cell);

ALTER TABLE characters ADD COLUMN bag_tabs INTEGER NOT NULL DEFAULT 1 CHECK (bag_tabs >= 1);

-- One row per applied loot or claim. The write inserts its key first, so a retried write fails on the PRIMARY KEY and
-- rolls the whole batch back instead of creating the items twice. Old rows are pruned opportunistically.
CREATE TABLE item_grants (
  key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

-- Never holds rows. A guard statement `INSERT INTO inv_guard (ok) SELECT NULL WHERE NOT EXISTS (...)` throws on the
-- NOT NULL column when a precondition no longer holds, which rolls the batch back (a statement that merely changes
-- zero rows would not).
CREATE TABLE inv_guard (ok INTEGER NOT NULL);

-- Mail may expire (items sent because the bag was full must be claimed in time). NULL means it never expires.
ALTER TABLE mailbox ADD COLUMN expires_at INTEGER;
CREATE INDEX idx_mailbox_expiry ON mailbox(expires_at) WHERE expires_at IS NOT NULL;

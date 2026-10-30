-- Phase 5a: Vạn Bảo Lâu, the market. One listing is one item (or one split-off stack) taken out of the seller's bag and kept in escrow:
-- the item row stays with the seller but sits in no cell and no slot, and the listing points at it. Everything that leaves the listing
-- (a sale, a cancel, an expiry, a refund of an outbid bid) is delivered by mail, so the bags never have to be touched from outside a room.
CREATE TABLE market_listings (
  id TEXT PRIMARY KEY,
  town TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fixed', 'auction')),
  seller_id TEXT NOT NULL REFERENCES characters(id),
  -- No foreign key: a closed listing keeps the id of an item row that is deleted later (merged into a stack, used up, sold), and a key would forbid that.
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  -- Fixed: the price. Auction: the start price.
  price INTEGER NOT NULL CHECK (price > 0),
  top_bid INTEGER NOT NULL DEFAULT 0 CHECK (top_bid >= 0),
  top_bidder_id TEXT REFERENCES characters(id),
  fee_paid INTEGER NOT NULL DEFAULT 0,
  -- unsold: an auction that closed without a bid. expired: a fixed listing that ran out of time.
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'expired', 'unsold')),
  created_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  closed_at INTEGER,
  promoted_at INTEGER,
  CHECK ((top_bid = 0) = (top_bidder_id IS NULL))
);
-- An item can be in one open listing at a time.
CREATE UNIQUE INDEX idx_market_item_open ON market_listings(item_id) WHERE status = 'active';
CREATE INDEX idx_market_town ON market_listings(town, status, ends_at);
CREATE INDEX idx_market_seller ON market_listings(seller_id, status);
-- The settlement sweep looks for open listings that are due, in every town.
CREATE INDEX idx_market_due ON market_listings(status, ends_at);

-- Every closed sale, for looking into a dispute (small Linh Thạch amounts have no row of their own in the ledger).
CREATE TABLE market_sales (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  town TEXT NOT NULL,
  kind TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_market_sales_seller ON market_sales(seller_id, created_at);
CREATE INDEX idx_market_sales_buyer ON market_sales(buyer_id, created_at);

-- Vạn Bảo Lâu looks like a robed woman: add her to the stored NPC looks (a missing kind would be drawn as the plain male body). The `market` tuning group
-- itself is seeded when the first player enters after the deploy.
UPDATE game_tuning SET value = json_set(value, '$.byKind.market', json('{"body":"female","outfit":"sage","tint":"#e8c8ff","aura":"#c89cff"}')) WHERE name = 'npcLooks' AND json_extract(value, '$.byKind.market') IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

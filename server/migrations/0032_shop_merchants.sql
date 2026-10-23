-- Merchant NPCs as data: who they are and what they sell (rules, see shared/src/merchants.ts). Seeded from the code defaults the first time the
-- server reads them; an admin screen can later add merchants and stock. Daily purchase counts are now kept per merchant (offer_id holds
-- "<npc>:<offer>"); old counters are ignored and expire with the day.
CREATE TABLE IF NOT EXISTS shop_merchants (
  npc_id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  sell_rate REAL NOT NULL,
  buys TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS shop_stock (
  npc_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  def TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (npc_id, rule_id)
);

INSERT OR IGNORE INTO config_versions (name, version, updated_at) VALUES ('shop', 1, 0);

-- Every NPC: where it stands and its name (the game starts with the NPCs the map builders place; an admin screen can later move, rename, add
-- and disable them, merchants included: a merchant NPC has a matching row in shop_merchants).
CREATE TABLE IF NOT EXISTS npc_spots (
  npc_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  -- Some NPCs (the three Đạo Sư) stand in more than one town under the same id.
  PRIMARY KEY (map_id, npc_id)
);
INSERT OR IGNORE INTO config_versions (name, version, updated_at) VALUES ('npcs', 1, 0);

-- Kills counted toward a map's boss across every channel (a room adds its kills in batches; a boss request starts it again).
CREATE TABLE IF NOT EXISTS boss_kills (
  map_id TEXT PRIMARY KEY,
  kills INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

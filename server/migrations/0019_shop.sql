-- Merchant purchases counted per character, offer and day (phase 2e): the daily limit of an offer is checked against
-- this table inside the purchase batch. Old days are deleted by the next purchase of the same character.
CREATE TABLE shop_purchases (
  character_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (character_id, offer_id, day)
);

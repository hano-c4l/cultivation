-- Phase 5b: direct trade between two players. The trade itself is decided in the room and written as one batch; this is its record, for looking into a
-- dispute (small Linh Thạch amounts have no row of their own in the ledger). `items_a` and `items_b` list what each side gave: [{id, type, qty}].
CREATE TABLE trade_log (
  id TEXT PRIMARY KEY,
  a_id TEXT NOT NULL,
  b_id TEXT NOT NULL,
  items_a TEXT NOT NULL,
  items_b TEXT NOT NULL,
  linh_a INTEGER NOT NULL,
  linh_b INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_trade_log_a ON trade_log(a_id, created_at);
CREATE INDEX idx_trade_log_b ON trade_log(b_id, created_at);

-- Phase 1e: economy skeleton. Currency ledger (append-only) + balances, item instances, mailbox.
-- Invariant: for every (character, currency), SUM(currency_ledger.delta) = currency_balances.balance.
-- Every change goes through one D1 batch (ledger INSERT + balance upsert). D1 rolls the batch back when a statement
-- throws, so a duplicate idempotency key (UNIQUE) or a negative balance (CHECK) leaves both tables untouched.

-- id is the rowid (INTEGER PRIMARY KEY, no AUTOINCREMENT): one index fewer per write than a TEXT key, which matters
-- for D1 rows-written quotas. Safe because rows are never deleted, so ids only grow.
CREATE TABLE currency_ledger (
  id INTEGER PRIMARY KEY,
  character_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('linh_thach', 'cong_hien', 'tien_ngoc')),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_ledger_character ON currency_ledger(character_id, created_at);

-- Append-only: rows can never be changed or removed.
CREATE TRIGGER currency_ledger_no_update BEFORE UPDATE ON currency_ledger
BEGIN SELECT RAISE(ABORT, 'currency_ledger is append-only'); END;
CREATE TRIGGER currency_ledger_no_delete BEFORE DELETE ON currency_ledger
BEGIN SELECT RAISE(ABORT, 'currency_ledger is append-only'); END;

CREATE TABLE currency_balances (
  character_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('linh_thach', 'cong_hien', 'tien_ngoc')),
  balance INTEGER NOT NULL CHECK (balance >= 0),
  PRIMARY KEY (character_id, currency)
) WITHOUT ROWID;

-- Every item is its own row with a unique id (no stacked quantities for equipment or rare items).
CREATE TABLE item_instances (
  id TEXT PRIMARY KEY,
  owner_character_id TEXT NOT NULL REFERENCES characters(id),
  item_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_items_owner ON item_instances(owner_character_id);

-- Offline delivery of currency and items. Claiming a currency attachment uses ledger key 'mail:<id>', so a double
-- claim fails on the ledger's UNIQUE key instead of relying on a read-then-write.
CREATE TABLE mailbox (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  currency TEXT CHECK (currency IN ('linh_thach', 'cong_hien', 'tien_ngoc')),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  item_id TEXT REFERENCES item_instances(id),
  claimed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK ((currency IS NULL) = (amount = 0))
);
CREATE INDEX idx_mailbox_character ON mailbox(character_id, created_at);

-- Economy restructure (phase 3, between 3a and 3b): the one ledger that held every change of every currency becomes
--   * per-currency TOTALS per character and reason group (one row each, updated in place: nothing grows with the number of changes),
--   * a full history for Tiên Ngọc only (rare, and the paid currency),
--   * a history for Linh Thạch of the BIG changes only (|delta| >= the setting linh_thach_trace_min, default 100000, and anything an admin did),
--   * a small key table that stops a change being applied twice where the same key can come back (admin form, mail claim, drop retry, teleport).
-- Cống Hiến has totals only. The old `currency_ledger` is dropped at the end (its triggers go with it); the data was test data only.
-- Reason group = the reason up to its first ":" ("shop_buy:ren_giu_cap:1" -> "shop_buy"); the code (shared/src/economy.ts reasonGroup) does the same.
-- Check: per character, SUM(total_in) - SUM(total_out) of a currency must equal currency_balances.balance (GET /api/admin/economy-check).

CREATE TABLE tien_ngoc_ledger (
  id INTEGER PRIMARY KEY,
  character_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_tien_ngoc_ledger_at ON tien_ngoc_ledger (created_at);
CREATE INDEX idx_tien_ngoc_ledger_char ON tien_ngoc_ledger (character_id, created_at);
CREATE TRIGGER tien_ngoc_ledger_no_update BEFORE UPDATE ON tien_ngoc_ledger BEGIN SELECT RAISE(ABORT, 'tien_ngoc_ledger is append-only'); END;
CREATE TRIGGER tien_ngoc_ledger_no_delete BEFORE DELETE ON tien_ngoc_ledger BEGIN SELECT RAISE(ABORT, 'tien_ngoc_ledger is append-only'); END;

CREATE TABLE linh_thach_ledger (
  id INTEGER PRIMARY KEY,
  character_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_linh_thach_ledger_at ON linh_thach_ledger (created_at);
CREATE INDEX idx_linh_thach_ledger_char ON linh_thach_ledger (character_id, created_at);
CREATE TRIGGER linh_thach_ledger_no_update BEFORE UPDATE ON linh_thach_ledger BEGIN SELECT RAISE(ABORT, 'linh_thach_ledger is append-only'); END;
CREATE TRIGGER linh_thach_ledger_no_delete BEFORE DELETE ON linh_thach_ledger BEGIN SELECT RAISE(ABORT, 'linh_thach_ledger is append-only'); END;

CREATE TABLE tien_ngoc_totals (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  entries INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;
CREATE TABLE linh_thach_totals (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  entries INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;
CREATE TABLE cong_hien_totals (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  entries INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;

-- A key seen twice makes the batch fail on the PRIMARY KEY (and roll back). expires_at NULL = kept for good (a mail's currency is claimed once ever).
CREATE TABLE currency_dedupe (
  key TEXT PRIMARY KEY,
  expires_at INTEGER
) WITHOUT ROWID;

-- Carry the old data over. The totals are computed from the old ledger, so they match the balances (the old invariant SUM(delta) = balance).
INSERT INTO tien_ngoc_ledger (id, character_id, delta, reason, actor, created_at)
  SELECT id, character_id, delta, reason, actor, created_at FROM currency_ledger WHERE currency = 'tien_ngoc';
INSERT INTO linh_thach_ledger (id, character_id, delta, reason, actor, created_at)
  SELECT id, character_id, delta, reason, actor, created_at FROM currency_ledger WHERE currency = 'linh_thach' AND (ABS(delta) >= 100000 OR actor <> 'system');

INSERT INTO tien_ngoc_totals (character_id, grp, total_in, total_out, entries, updated_at)
  SELECT character_id, grp, SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), COUNT(*), MAX(created_at)
  FROM (SELECT character_id, CASE WHEN instr(reason, ':') > 0 THEN substr(reason, 1, instr(reason, ':') - 1) ELSE reason END AS grp, delta, created_at
        FROM currency_ledger WHERE currency = 'tien_ngoc')
  GROUP BY character_id, grp;
INSERT INTO linh_thach_totals (character_id, grp, total_in, total_out, entries, updated_at)
  SELECT character_id, grp, SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), COUNT(*), MAX(created_at)
  FROM (SELECT character_id, CASE WHEN instr(reason, ':') > 0 THEN substr(reason, 1, instr(reason, ':') - 1) ELSE reason END AS grp, delta, created_at
        FROM currency_ledger WHERE currency = 'linh_thach')
  GROUP BY character_id, grp;
INSERT INTO cong_hien_totals (character_id, grp, total_in, total_out, entries, updated_at)
  SELECT character_id, grp, SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END), COUNT(*), MAX(created_at)
  FROM (SELECT character_id, CASE WHEN instr(reason, ':') > 0 THEN substr(reason, 1, instr(reason, ':') - 1) ELSE reason END AS grp, delta, created_at
        FROM currency_ledger WHERE currency = 'cong_hien')
  GROUP BY character_id, grp;

-- The keys that still guard something: a mail's currency (claimed once ever) and the admin forms' keys. Other keys were fresh UUIDs or are guarded elsewhere.
INSERT OR IGNORE INTO currency_dedupe (key, expires_at)
  SELECT idempotency_key, NULL FROM currency_ledger WHERE idempotency_key LIKE 'mail:%' OR idempotency_key LIKE 'admin:%';

-- The old ledger is not needed any more (the totals and histories above carry what matters).
DROP TABLE currency_ledger;

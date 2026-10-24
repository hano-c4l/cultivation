-- Currency management (phase 3b, second version):
--  * the totals tables now hold the FIXED groups of shared/src/economy.ts (CURRENCY_GROUPS: farm, shop, quest, trade, enhance, travel, admin, other)
--    instead of the reason prefixes of 0036, and drop the `entries` column: one row per character and group with money in, money out and the
--    time of the last change. The old groups are mapped by the CASE below and re-aggregated, so SUM(in) - SUM(out) per character is unchanged.
--  * currency_audit: the result of the balance audit (one row per currency and character that did not add up).
--  * admin_log replaces admin_audit: time, admin, screen and a description of what the admin changed (no before/after values).

CREATE TABLE tien_ngoc_totals_new (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;
CREATE TABLE linh_thach_totals_new (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;
CREATE TABLE cong_hien_totals_new (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;

INSERT INTO tien_ngoc_totals_new (character_id, grp, total_in, total_out, updated_at)
  SELECT character_id,
         CASE WHEN grp = 'monster_drop' THEN 'farm'
              WHEN grp IN ('shop_buy', 'shop_sell') THEN 'shop'
              WHEN grp = 'quest' THEN 'quest'
              WHEN grp IN ('smith_upgrade', 'smith_refine', 'repair', 'breakthrough') OR grp LIKE 'path%' THEN 'enhance'
              WHEN grp = 'waygate' THEN 'travel'
              WHEN grp LIKE 'admin%' THEN 'admin'
              ELSE 'other' END AS g,
         SUM(total_in), SUM(total_out), MAX(updated_at)
  FROM tien_ngoc_totals GROUP BY character_id, g;
INSERT INTO linh_thach_totals_new (character_id, grp, total_in, total_out, updated_at)
  SELECT character_id,
         CASE WHEN grp = 'monster_drop' THEN 'farm'
              WHEN grp IN ('shop_buy', 'shop_sell') THEN 'shop'
              WHEN grp = 'quest' THEN 'quest'
              WHEN grp IN ('smith_upgrade', 'smith_refine', 'repair', 'breakthrough') OR grp LIKE 'path%' THEN 'enhance'
              WHEN grp = 'waygate' THEN 'travel'
              WHEN grp LIKE 'admin%' THEN 'admin'
              ELSE 'other' END AS g,
         SUM(total_in), SUM(total_out), MAX(updated_at)
  FROM linh_thach_totals GROUP BY character_id, g;
INSERT INTO cong_hien_totals_new (character_id, grp, total_in, total_out, updated_at)
  SELECT character_id,
         CASE WHEN grp = 'monster_drop' THEN 'farm'
              WHEN grp IN ('shop_buy', 'shop_sell') THEN 'shop'
              WHEN grp = 'quest' THEN 'quest'
              WHEN grp IN ('smith_upgrade', 'smith_refine', 'repair', 'breakthrough') OR grp LIKE 'path%' THEN 'enhance'
              WHEN grp = 'waygate' THEN 'travel'
              WHEN grp LIKE 'admin%' THEN 'admin'
              ELSE 'other' END AS g,
         SUM(total_in), SUM(total_out), MAX(updated_at)
  FROM cong_hien_totals GROUP BY character_id, g;

DROP TABLE tien_ngoc_totals;
DROP TABLE linh_thach_totals;
DROP TABLE cong_hien_totals;
ALTER TABLE tien_ngoc_totals_new RENAME TO tien_ngoc_totals;
ALTER TABLE linh_thach_totals_new RENAME TO linh_thach_totals;
ALTER TABLE cong_hien_totals_new RENAME TO cong_hien_totals;

-- The audit of balances against the totals. status: invalid (does not add up, to be looked at), valid (confirmed by an admin, the difference was put
-- in the admin group), handled (an admin dealt with it by other means, or the account is banned for good).
CREATE TABLE currency_audit (
  currency TEXT NOT NULL CHECK (currency IN ('linh_thach', 'cong_hien', 'tien_ngoc')),
  character_id TEXT NOT NULL,
  history_amount INTEGER NOT NULL,
  balance_amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('invalid', 'valid', 'handled')),
  checked_at INTEGER NOT NULL,
  resolved_by TEXT,
  resolved_at INTEGER,
  PRIMARY KEY (currency, character_id)
) WITHOUT ROWID;

-- The admin log: what an admin changed, where, and when.
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  admin_email TEXT NOT NULL,
  screen TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX idx_admin_log_at ON admin_log (at);
INSERT INTO admin_log (at, admin_email, screen, content)
  SELECT at, admin_email, target_type, CASE WHEN summary <> '' THEN action || ': ' || summary ELSE action END FROM admin_audit ORDER BY id;
DROP TABLE admin_audit;

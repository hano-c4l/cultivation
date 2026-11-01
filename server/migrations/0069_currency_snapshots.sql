-- Phase 5f: the supply of each currency day by day for the Admin money overview. The first look at the dashboard on a Việt Nam day writes that day's row (nothing runs on a schedule).
CREATE TABLE currency_snapshots (
  day INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('tien_ngoc', 'linh_thach', 'cong_hien')),
  supply INTEGER NOT NULL,
  holders INTEGER NOT NULL,
  total_in INTEGER NOT NULL,
  total_out INTEGER NOT NULL,
  PRIMARY KEY (day, currency)
) WITHOUT ROWID;

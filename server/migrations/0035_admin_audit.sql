-- Admin change log (phase 3a): who changed what and when, with the values before and after (JSON text, may be NULL).
-- Written by every admin action from now on; admin screens read it. Rows are never updated.
CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  admin_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  before TEXT,
  after TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit (at);

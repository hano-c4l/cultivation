-- Phase 3g: the item catalogue as data. Only the items an admin changed or made have a row (an overlay on the items written in the code, so the generated
-- ones - books, pills, ores - keep following the code): `custom` = 1 is an item an admin made (`def` is its whole definition), 0 holds the edited
-- fields of an item of the code. `disabled` = 1 is the soft delete of a custom item that characters still own.
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  custom INTEGER NOT NULL CHECK (custom IN (0, 1)),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  def TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

INSERT OR IGNORE INTO config_versions (name, version, updated_at) VALUES ('items', 1, 0);

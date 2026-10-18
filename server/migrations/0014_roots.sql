-- Phase 2c: a spiritual root can have 1 to 5 elements (đơn ... ngũ linh căn). `spiritual_root` stays the main element;
-- `roots` lists all of them, main one first, as comma-separated ids (e.g. 'hoa,thuy'). Empty means just `spiritual_root`,
-- which is what every character created before this had, so nothing is rewritten: they stay single-element roots.
ALTER TABLE characters ADD COLUMN roots TEXT NOT NULL DEFAULT '';

-- Phase 5c: a rank can be paid an item a week from the warehouse as well as Linh Thạch. JSON array, one entry per rank ({item, qty} or null); empty: none.
ALTER TABLE sects ADD COLUMN weekly_items TEXT NOT NULL DEFAULT '';

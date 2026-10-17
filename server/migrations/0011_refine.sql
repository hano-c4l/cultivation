-- Phase 2b: the pháp bảo bản mệnh (bonded artifact) levels up with its owner. Its trained level and its own EXP stream are
-- stored on the item (NULL: not trained yet, still at the level it was made at). Other items leave them NULL.
ALTER TABLE item_instances ADD COLUMN refine_level INTEGER CHECK (refine_level IS NULL OR refine_level >= 0);
ALTER TABLE item_instances ADD COLUMN refine_exp INTEGER CHECK (refine_exp IS NULL OR refine_exp >= 0);

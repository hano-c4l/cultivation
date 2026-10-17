-- Phase 2b: gender (which gear a character may wear) and equipment (slot, durability).
-- Characters: gender picks the gear style. 'male_wears_female' is a male character who may only wear female gear (and the
-- other way round); it is fixed at creation. Existing characters get a random plain Nam or Nữ (never the special two).
ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT 'male'
  CHECK (gender IN ('male', 'female', 'male_wears_female', 'female_wears_male'));
UPDATE characters SET gender = CASE WHEN abs(random()) % 2 = 0 THEN 'male' ELSE 'female' END;

-- Fix for phase 2a data: a claimed mail kept pointing at the item it delivered, so discarding or merging that item later
-- would break the mailbox foreign key on D1. New claims clear the pointer themselves; this clears the old ones.
UPDATE mailbox SET item_id = NULL WHERE claimed_at IS NOT NULL AND item_id IS NOT NULL;

-- An equipped item has bag_tab = cell = NULL and equip_slot set; an item in the bag has a cell and no slot; an item
-- attached to mail has neither. durability and max_durability are both NULL for gear that never wears out.
ALTER TABLE item_instances ADD COLUMN equip_slot TEXT;
ALTER TABLE item_instances ADD COLUMN durability INTEGER CHECK (durability IS NULL OR durability >= 0);
ALTER TABLE item_instances ADD COLUMN max_durability INTEGER CHECK (max_durability IS NULL OR max_durability >= 1);
-- One item per slot. Partial, so bag items (the vast majority of rows) pay nothing for this index.
CREATE UNIQUE INDEX idx_items_equip ON item_instances(owner_character_id, equip_slot) WHERE equip_slot IS NOT NULL;

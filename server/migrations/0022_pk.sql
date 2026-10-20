-- PvP scores (phase 2f): sát khí (killing aura), sát nhân (murder: sets the name colour, falls with time online) and anh hùng (hero).
-- Absolute values, written when they change and when the character leaves a room.
ALTER TABLE characters ADD COLUMN sat_khi INTEGER NOT NULL DEFAULT 0 CHECK (sat_khi >= 0);
ALTER TABLE characters ADD COLUMN sat_nhan INTEGER NOT NULL DEFAULT 0 CHECK (sat_nhan >= 0);
ALTER TABLE characters ADD COLUMN anh_hung INTEGER NOT NULL DEFAULT 0 CHECK (anh_hung >= 0);

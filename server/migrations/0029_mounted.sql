-- Riding the flight pháp bảo is kept across maps, teleport talismans and reconnects (it ends at a breakthrough or a death).
ALTER TABLE characters ADD COLUMN mounted INTEGER NOT NULL DEFAULT 0 CHECK (mounted IN (0, 1));

-- The flight pháp bảo now give 40% to 150% speed by realm (boots were added too): the old rows of the master table are dropped so the server
-- seeds the new defaults again (nobody has edited them: there is no admin screen yet). Gear that was already rolled keeps its stats.
DELETE FROM equipment_master WHERE kind = 'flight';
UPDATE config_versions SET version = version + 1, updated_at = 0 WHERE name = 'gear_master';

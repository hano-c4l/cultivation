-- Phase 2c: what a character keeps when leaving a combat room or reloading the page (HP, MP, cooldowns, buffs), as JSON
-- (see shared/src/vitals.ts). Written together with the position, so it costs no extra row write. NULL: fresh (full HP and MP).
ALTER TABLE characters ADD COLUMN vitals TEXT;

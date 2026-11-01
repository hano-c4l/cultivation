-- Phase 5d: the mounts of the code now name the sprite (a monster model) they are drawn with. A mounts row nobody edited is replaced by the new default (the new field is optional, so the game would not notice it by itself); an edited row stays.
DELETE FROM game_tuning WHERE name = 'mounts' AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

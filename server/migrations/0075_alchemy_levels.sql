-- Phase 5 leftovers: trade levels for the alchemist, like the forge got in 0071. A row nobody has edited is replaced by the new default (an optional field never makes a stored row invalid, so the game would not do it by itself); an edited row stays as it is.
DELETE FROM game_tuning WHERE name = 'alchemy' AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

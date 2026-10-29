-- Longer spear sweep, Phi Chi line and Cuong Tram fan to match the longer skill ranges. The stored rows (INSERT OR IGNORE never refreshes them) are changed only where they still hold the old values; a missing row (production, before anyone joined) is left to the code defaults.
UPDATE game_tuning SET value = json_set(value, '$.thuong', json('{"shape":"line","range":3.6,"width":1,"maxTargets":3,"pct":65}')) WHERE name = 'weaponArea' AND json_extract(value, '$.thuong.range') = 3;
UPDATE game_tuning SET value = json_set(value, '$.chi.range', 9) WHERE name = 'skillAreas' AND json_extract(value, '$.chi.range') = 6;
UPDATE game_tuning SET value = json_set(value, '$.tram', json('{"shape":"arc","range":6,"deg":90,"maxTargets":4,"pct":70}')) WHERE name = 'skillAreas' AND json_extract(value, '$.tram.range') = 3.2;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

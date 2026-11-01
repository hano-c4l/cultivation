-- Phase 5d: Xích Vân Mã is now drawn as a horse and Bạch Hổ as a striped zebra (the Farm Animals pack). A mounts row nobody edited is replaced by the new default; an edited row stays.
DELETE FROM game_tuning WHERE name = 'mounts' AND updated_by IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

-- Gear made before elements existed (ids with six parts) gets a random ngũ hành, and weapons a random family too.
-- The element and family are the last parts of the item id (eq.<kind>.<style>.<realm>.<tier>.<grade>.<element>[.<family>]).
-- One-off: later ids always carry them. Never touches the special pieces (ids starting with "eqs.").
UPDATE item_instances
SET item_type = item_type || '.' || (CASE abs(random()) % 5 WHEN 0 THEN 'kim' WHEN 1 THEN 'moc' WHEN 2 THEN 'thuy' WHEN 3 THEN 'hoa' ELSE 'tho' END)
  || (CASE WHEN item_type LIKE 'eq.weapon.%'
        THEN '.' || (CASE abs(random()) % 6 WHEN 0 THEN 'kiem' WHEN 1 THEN 'dao' WHEN 2 THEN 'thuong' WHEN 3 THEN 'riu' WHEN 4 THEN 'cung' ELSE 'quyen' END)
        ELSE '' END)
WHERE item_type LIKE 'eq.%' AND length(item_type) - length(replace(item_type, '.', '')) = 5;

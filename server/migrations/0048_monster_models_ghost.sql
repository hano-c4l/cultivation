-- Hàn Thi Ma and Thi Quỷ get their own ghost models (the stored monsterModels row from before still maps them to the skeleton; INSERT OR IGNORE never refreshes it).
UPDATE game_tuning
SET value = json_set(value,
  '$.thi_quy', CASE WHEN json_extract(value, '$.thi_quy') = 'skeleton' THEN 'ghostskull' ELSE json_extract(value, '$.thi_quy') END,
  '$.han_thi_ma', CASE WHEN json_extract(value, '$.han_thi_ma') = 'skeleton' THEN 'ghost' ELSE json_extract(value, '$.han_thi_ma') END)
WHERE name = 'monsterModels';
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';

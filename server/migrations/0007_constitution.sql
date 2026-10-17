-- Phase 2: thể chất (constitution) and its tier. Rolled once at creation; existing characters are rolled here.
-- The weights mirror shared/src/constitutions.ts (CONSTITUTIONS); a test in shared checks that the CASE expressions
-- below are exactly the ones the data produces. Most characters end up with the ordinary 'pham_the'.
ALTER TABLE characters ADD COLUMN constitution TEXT NOT NULL DEFAULT 'pham_the';
ALTER TABLE characters ADD COLUMN constitution_tier INTEGER NOT NULL DEFAULT 1 CHECK (constitution_tier >= 1);

-- Step 1: one roll per row (1..10000), held in constitution_tier for a moment, picks the constitution.
UPDATE characters SET constitution_tier = 1 + abs(random()) % 10000;
UPDATE characters SET constitution = CASE WHEN constitution_tier <= 150 THEN 'kiem_the' WHEN constitution_tier <= 300 THEN 'loi_the' WHEN constitution_tier <= 500 THEN 'thuy_linh_the' WHEN constitution_tier <= 600 THEN 'trong_dong' WHEN constitution_tier <= 680 THEN 'tien_cot' WHEN constitution_tier <= 700 THEN 'thanh_the' ELSE 'pham_the' END;

-- Step 2: a second roll (1..100) picks the tier within that constitution.
UPDATE characters SET constitution_tier = 1 + abs(random()) % 100;
UPDATE characters SET constitution_tier = CASE constitution WHEN 'kiem_the' THEN CASE WHEN constitution_tier <= 70 THEN 1 WHEN constitution_tier <= 95 THEN 2 ELSE 3 END WHEN 'loi_the' THEN CASE WHEN constitution_tier <= 80 THEN 1 ELSE 2 END WHEN 'thuy_linh_the' THEN CASE WHEN constitution_tier <= 80 THEN 1 ELSE 2 END WHEN 'trong_dong' THEN CASE WHEN constitution_tier <= 85 THEN 1 ELSE 2 END WHEN 'thanh_the' THEN CASE WHEN constitution_tier <= 80 THEN 1 WHEN constitution_tier <= 97 THEN 2 ELSE 3 END ELSE 1 END;

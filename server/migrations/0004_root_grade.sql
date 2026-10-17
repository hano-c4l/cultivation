-- Phase 1c+: spiritual root grade (phẩm cấp linh căn), rolled once. Weights, EXP bonuses and bonus points
-- mirror shared/src/progression-data.ts (ROOT_GRADES). Existing characters are re-rolled here.
ALTER TABLE characters ADD COLUMN root_grade INTEGER NOT NULL DEFAULT 0;

-- (No CHECK constraint: step 1 temporarily holds 0..99. The app only writes 0..4.)
-- Step 1: one random() per row (0..99), kept in root_grade; step 2 maps it to a grade by weight 50/30/13/5/2.
UPDATE characters SET root_grade = abs(random()) % 100;
UPDATE characters SET root_grade = CASE
  WHEN root_grade < 50 THEN 0
  WHEN root_grade < 80 THEN 1
  WHEN root_grade < 93 THEN 2
  WHEN root_grade < 98 THEN 3
  ELSE 4
END;

-- Better grades start with extra potential points (0/1/2/4/6), added on top of what the character already has.
UPDATE characters SET potential_points = potential_points + CASE root_grade WHEN 1 THEN 1 WHEN 2 THEN 2 WHEN 3 THEN 4 WHEN 4 THEN 6 ELSE 0 END;

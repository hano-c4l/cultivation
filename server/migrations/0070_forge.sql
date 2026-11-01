-- Phase 5e: the blacksmith's forge (Luyện khí) uses the brewing table too; `craft` says which trade a job belongs to, so the two have their own limits and lists.
ALTER TABLE brew_jobs ADD COLUMN craft TEXT NOT NULL DEFAULT 'alchemy' CHECK (craft IN ('alchemy', 'forge'));

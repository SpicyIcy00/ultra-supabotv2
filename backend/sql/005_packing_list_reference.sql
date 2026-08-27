-- ===========================================================================
-- Warehouse Packing — Step 3: human-readable list reference (PL0001, PL0002…)
--
-- Run these statements IN ORDER in the Supabase SQL editor.
-- Idempotent — safe to re-run.
--
-- Mirrored in backend/app/main.py's startup block so a fresh deploy self-heals.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A sequence, so two lists created at the same moment cannot collide.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS packing_lists_seq;


-- ---------------------------------------------------------------------------
-- 2. The counter column, defaulted from that sequence.
-- ---------------------------------------------------------------------------
ALTER TABLE packing_lists ADD COLUMN IF NOT EXISTS seq BIGINT;

ALTER TABLE packing_lists ALTER COLUMN seq SET DEFAULT nextval('packing_lists_seq');


-- ---------------------------------------------------------------------------
-- 3. Backfill lists that already exist, oldest first, so the numbering follows
--    the order they were actually created in.
-- ---------------------------------------------------------------------------
WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY created_at) AS rn
    FROM packing_lists
    WHERE seq IS NULL
)
UPDATE packing_lists p
SET seq = o.rn
FROM ordered o
WHERE p.id = o.id;


-- ---------------------------------------------------------------------------
-- 4. Move the sequence past the backfilled values.
--    is_called = false means the next nextval() returns exactly this number,
--    so numbering continues without a gap.
-- ---------------------------------------------------------------------------
SELECT setval(
    'packing_lists_seq',
    (SELECT COALESCE(MAX(seq), 0) + 1 FROM packing_lists),
    false
);


-- ---------------------------------------------------------------------------
-- 5. The reference itself, derived from the counter so it can never drift.
--    lpad to 4 digits: PL0001 … PL9999, then PL10000 without breaking.
-- ---------------------------------------------------------------------------
ALTER TABLE packing_lists ADD COLUMN IF NOT EXISTS reference TEXT
    GENERATED ALWAYS AS ('PL' || lpad(seq::text, 4, '0')) STORED;

CREATE INDEX IF NOT EXISTS ix_packing_lists_reference ON packing_lists (reference);


-- ---------------------------------------------------------------------------
-- 6. Check — every list should now have a reference.
-- ---------------------------------------------------------------------------
SELECT reference, status, created_at
FROM packing_lists
ORDER BY seq DESC
LIMIT 20;

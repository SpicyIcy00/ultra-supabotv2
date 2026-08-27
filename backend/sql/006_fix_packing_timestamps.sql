-- ===========================================================================
-- Warehouse Packing — correct existing created_at values
--
-- >>> RUN THIS ONCE. <<<
--
-- It is NOT idempotent: it shifts rows by -8 hours, so running it twice moves
-- them 16 hours into the past. This is why it is not in the startup DDL, which
-- executes on every deploy.
--
-- WHY
-- ---
-- The tables were created with
--     created_at TIMESTAMPTZ DEFAULT timezone('Asia/Manila', now())
--
-- timezone(zone, timestamptz) returns a timestamp WITHOUT a time zone — the
-- wall-clock reading in that zone. Assigning it to a TIMESTAMPTZ column makes
-- Postgres interpret the naive value in the session zone (UTC on Railway), so
-- a list created at 08:00 Manila is stored as 08:00 UTC — the wrong instant by
-- exactly the Manila offset. Clients then add the offset again when rendering
-- local time, showing 16:00 for an 08:00 list.
--
-- The column default is fixed separately (to now()) by the app's startup
-- migration; this statement repairs rows written before that.
--
-- The Philippines has had no DST since 1978, so the offset is a constant +8.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Look before you leap. Anything created_at > now() is affected — a list
--    cannot have been created in the future.
-- ---------------------------------------------------------------------------
SELECT reference, created_at, created_at - INTERVAL '8 hours' AS corrected
FROM packing_lists
ORDER BY seq;


-- ---------------------------------------------------------------------------
-- 2. Apply the correction. Run each UPDATE exactly once.
-- ---------------------------------------------------------------------------
UPDATE packing_lists SET created_at = created_at - INTERVAL '8 hours';

UPDATE packing_items SET created_at = created_at - INTERVAL '8 hours';


-- ---------------------------------------------------------------------------
-- 3. Verify. No row should sit in the future any more.
-- ---------------------------------------------------------------------------
SELECT count(*) AS lists_still_in_the_future
FROM packing_lists
WHERE created_at > now();

SELECT reference, created_at FROM packing_lists ORDER BY seq;

-- ===========================================================================
-- Warehouse Packing — Step 1b: passcode-only login
--
-- Staff enter a single passcode instead of a username + password. The passcode
-- resolves to an app_users row, which supplies the role and the created_by for
-- packing lists.
--
-- Run these statements one at a time in the Supabase SQL editor.
-- Idempotent — safe to re-run.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Passcode column. Nullable: a user without one simply cannot sign in.
-- ---------------------------------------------------------------------------
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS passcode_hash VARCHAR(255);


-- ---------------------------------------------------------------------------
-- 2. Give the existing admin its passcode.
--
--    passcode: admin1123213
--
--    >>> CHANGE THIS from Admin -> Users. The hash is committed to the repo. <<<
-- ---------------------------------------------------------------------------
UPDATE app_users
SET passcode_hash = '$2b$12$9oTe/PBeAYgkXHNEWCsEyecFBrBk1qKTFf9CYJmubwBms2rgXW3Pu'
WHERE username = 'admin';


-- ---------------------------------------------------------------------------
-- 3. The shared warehouse account.
--
--    passcode: Warehouse
--
--    >>> ALSO CHANGE THIS. A short dictionary word is guessable, and with no
--    >>> username there is nothing else standing between the internet and a
--    >>> working session. Use something long and random. <<<
--
--    password_hash is required by the schema but unused for passcode login, so
--    it is set to a locked marker no bcrypt verify can ever match.
-- ---------------------------------------------------------------------------
INSERT INTO app_users (username, password_hash, passcode_hash, role, display_name, active)
VALUES (
    'warehouse',
    'x',
    '$2b$12$bBY9rl0E0q7M94GxIFdjQ.Sl4anWcfmrlviSJgnCpyD9Z6ReBOn6i',
    'warehouse_staff',
    'Warehouse',
    TRUE
)
ON CONFLICT (username) DO UPDATE
SET passcode_hash = EXCLUDED.passcode_hash,
    role          = EXCLUDED.role,
    active        = TRUE;


-- ---------------------------------------------------------------------------
-- 4. Check: both rows should show a 60-character $2b$ hash.
-- ---------------------------------------------------------------------------
SELECT username, role, active, length(passcode_hash) AS len, left(passcode_hash, 7) AS prefix
FROM app_users
ORDER BY role;

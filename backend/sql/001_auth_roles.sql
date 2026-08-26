-- ===========================================================================
-- Warehouse Packing — Step 1: authentication + role-based page access
--
-- Run these statements one at a time in the Supabase SQL editor.
-- Every statement is idempotent, so re-running the file is safe.
--
-- The same DDL is mirrored in backend/app/main.py's startup block, so a fresh
-- Railway deploy self-heals without anyone opening the SQL editor.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. app_users — one row per person who can log in.
--    Roles are plain text: 'admin' | 'warehouse_staff'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(32)  NOT NULL DEFAULT 'warehouse_staff',
    display_name  VARCHAR(120),
    active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now())
);


-- ---------------------------------------------------------------------------
-- 2. role_page_access — which roles may see which pages.
--    Toggled from /admin/page-access at runtime; no redeploy needed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_page_access (
    role     VARCHAR(32)  NOT NULL,
    page_key VARCHAR(64)  NOT NULL,
    enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (role, page_key)
);


-- ---------------------------------------------------------------------------
-- 3. Seed the page matrix.
--    admin           -> everything
--    warehouse_staff -> 'packing' only; every other page seeded as FALSE so the
--                       admin screen has a row to toggle instead of a blank.
--    ON CONFLICT DO NOTHING: never clobbers a toggle you have already changed.
-- ---------------------------------------------------------------------------
INSERT INTO role_page_access (role, page_key, enabled) VALUES
    ('admin',           'dashboard', TRUE),
    ('admin',           'analytics', TRUE),
    ('admin',           'ai_chat',   TRUE),
    ('admin',           'warehouse', TRUE),
    ('admin',           'settings',  TRUE),
    ('admin',           'packing',   TRUE),
    ('admin',           'admin',     TRUE),
    ('warehouse_staff', 'packing',   TRUE),
    ('warehouse_staff', 'dashboard', FALSE),
    ('warehouse_staff', 'analytics', FALSE),
    ('warehouse_staff', 'ai_chat',   FALSE),
    ('warehouse_staff', 'warehouse', FALSE),
    ('warehouse_staff', 'settings',  FALSE),
    ('warehouse_staff', 'admin',     FALSE)
ON CONFLICT (role, page_key) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. Seed the bootstrap admin.
--
--    username: admin
--    password: ChangeMe!2026
--
--    >>> CHANGE THIS PASSWORD IMMEDIATELY after your first login. <<<
--    The hash below is public (it is committed to the repo), so it is only
--    safe as a one-time bootstrap credential.
-- ---------------------------------------------------------------------------
INSERT INTO app_users (username, password_hash, role, display_name, active)
VALUES (
    'admin',
    '$2b$12$pUaBn6sOnpQ4yTkBjCYpQOfdyvCRXgPEWjHb8SC0vWx2hqUEItxN2',
    'admin',
    'Administrator',
    TRUE
)
ON CONFLICT (username) DO NOTHING;

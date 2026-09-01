-- =============================================================================
-- george_log — the INSERT-only role the agent loop logs through.
--
-- NOT RUN BY CLAUDE. Review and run this yourself; it creates a role, a schema
-- and tables on production.
--
-- WHY A SECOND ROLE AT ALL
-- george_ro is read-only by construction (default_transaction_read_only = on,
-- plus SELECT-only grants), so it cannot write its own audit trail — and it
-- should not be able to. Giving one identity both read of the business data and
-- write of anything is exactly the boundary worth keeping.
--
-- The split is total:
--   george_ro   SELECT on public business tables   no privilege in george.*
--   george_log  INSERT on george.* only            no privilege on any public table
-- Neither can do the other's job, and neither can read what the other writes.
-- (Both inherit USAGE on schema public from the PUBLIC grant — that is
-- unavoidable here and harmless. See the note above the GRANT block.)
--
-- Before running: replace the password placeholder, and use a DIFFERENT
-- password from george_ro and from postgres. Do not commit the result.
-- =============================================================================

CREATE ROLE george_log WITH LOGIN NOINHERIT PASSWORD 'REPLACE_ME_WITH_A_DIFFERENT_STRONG_PASSWORD';

-- Bound a runaway logging statement; logging must never hold up a request.
ALTER ROLE george_log SET statement_timeout = '10s';

-- Store timestamps unambiguously. The loop always sends timezone-aware values.
ALTER ROLE george_log SET timezone = 'UTC';

-- =============================================================================
-- 1. A dedicated schema, so the log tables are separate objects from the
--    business data and can carry their own grants and policies.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS george;

CREATE TABLE george.conversations (
    id                 uuid PRIMARY KEY,
    user_id            text,
    asked_at           timestamptz NOT NULL,
    question           text        NOT NULL,
    final_answer       text,
    model              text,
    iterations         integer,
    input_tokens       integer,
    output_tokens      integer,
    cache_read_tokens  integer,
    notices            jsonb,
    notice_forced      boolean     NOT NULL DEFAULT false,
    status             text        NOT NULL,
    logged_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE george.tool_calls (
    id               uuid PRIMARY KEY,
    conversation_id  uuid        NOT NULL,
    seq              integer     NOT NULL,
    tool             text        NOT NULL,
    arguments        jsonb,
    row_count        integer,
    truncated        boolean,
    source_table     text,
    notice_kind      text,
    duration_ms      integer,
    error            text,
    logged_at        timestamptz NOT NULL DEFAULT now()
);

-- The gap log: questions that returned nothing, were refused, hit the iteration
-- cap, or needed a caveat forced into the answer. This is the record of what
-- George could NOT do, which is the half that usually goes unmeasured.
CREATE TABLE george.gaps (
    id               uuid PRIMARY KEY,
    conversation_id  uuid        NOT NULL,
    kind             text        NOT NULL,   -- empty_result | tool_refused |
                                             -- notice_forced | iteration_cap |
                                             -- no_tool_call | api_error | unhandled
    tool             text,
    detail           text,
    at               timestamptz NOT NULL,
    logged_at        timestamptz NOT NULL DEFAULT now()
);

-- NOTE: no FOREIGN KEY from tool_calls/gaps to conversations. The conversation
-- row is written LAST (it carries the final answer and token totals), so an FK
-- would reject every tool-call insert that precedes it. Join on
-- conversation_id; accept that a crashed run can leave tool calls without a
-- parent row — that orphan is itself a useful signal.

CREATE INDEX ON george.tool_calls (conversation_id, seq);
CREATE INDEX ON george.gaps (kind, at DESC);
CREATE INDEX ON george.conversations (asked_at DESC);

-- =============================================================================
-- 2. Grants: INSERT and nothing else.
--
-- No SELECT is deliberate and has a concrete consequence: `INSERT ... RETURNING
-- id` FAILS for this role, because RETURNING needs SELECT on the returned
-- column. agent/loop.py therefore generates every uuid client-side. If you add
-- SELECT here to make RETURNING work, you have given the web process the
-- ability to read every question every user has ever asked.
-- =============================================================================
GRANT CONNECT ON DATABASE postgres TO george_log;
GRANT USAGE ON SCHEMA george TO george_log;
GRANT INSERT ON george.conversations, george.tool_calls, george.gaps TO george_log;

-- Explicitly NOT granted: SELECT, UPDATE, DELETE, TRUNCATE, and no table
-- privilege of any kind in schema public.
ALTER DEFAULT PRIVILEGES IN SCHEMA george REVOKE ALL ON TABLES FROM george_log;

-- WHAT ACTUALLY KEEPS george_log OUT OF THE BUSINESS DATA
--
-- Not a REVOKE on the schema. This database's public schema carries
-- `=U/pg_database_owner` in its ACL, i.e. USAGE is granted to PUBLIC, so EVERY
-- role — including one created a minute ago — has USAGE on public and no
-- REVOKE aimed at a single role takes it away. `REVOKE ALL ON SCHEMA public
-- FROM george_log` would look like protection and do nothing; it is
-- deliberately not in this script.
--
-- The real boundary is two layers, both verifiable:
--   1. No SELECT (or any other) privilege on any table in public. Schema USAGE
--      without a table privilege lets the role resolve names and read nothing.
--   2. RLS is enabled on every public table with no policy naming george_log,
--      which denies row access independently of grants.
-- Verify both with the has_table_privilege checks at the bottom of this file.

-- =============================================================================
-- 3. ROW LEVEL SECURITY — a GRANT alone is not enough on this database.
--
-- Every table in public already has RLS enabled with no policies, which is
-- deny-all to any role without BYPASSRLS. When george_ro was provisioned, the
-- grants looked correct and every query returned ZERO ROWS with no error. The
-- write-side failure mode is the same shape and just as quiet: INSERTs are
-- rejected rather than silently dropped, but the loop swallows logging errors
-- by design, so logging would appear to work while writing nothing.
--
-- These policies are what make the grants above actually function.
-- =============================================================================
ALTER TABLE george.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE george.tool_calls    ENABLE ROW LEVEL SECURITY;
ALTER TABLE george.gaps          ENABLE ROW LEVEL SECURITY;

CREATE POLICY george_log_write ON george.conversations
    FOR INSERT TO george_log WITH CHECK (true);
CREATE POLICY george_log_write ON george.tool_calls
    FOR INSERT TO george_log WITH CHECK (true);
CREATE POLICY george_log_write ON george.gaps
    FOR INSERT TO george_log WITH CHECK (true);

-- =============================================================================
-- 4. Keep george_ro out of the log schema. It has no reason to read what people
--    asked, and this makes that explicit rather than incidental.
-- =============================================================================
REVOKE ALL ON SCHEMA george FROM george_ro;

-- =============================================================================
-- Verify — connected as an admin:
--
--   SELECT table_name, privilege_type FROM information_schema.table_privileges
--    WHERE grantee = 'george_log' ORDER BY table_name;
--   -- expect exactly three rows, all INSERT
--
--   -- The privilege that actually matters: no table access in public.
--   SELECT has_table_privilege('george_log','public.new_transactions','SELECT');  -- false
--   SELECT has_table_privilege('george_log','public.products','SELECT');          -- false
--   SELECT has_table_privilege('george_log','george.conversations','SELECT');     -- false
--   SELECT has_table_privilege('george_log','george.conversations','INSERT');     -- TRUE
--   SELECT has_schema_privilege('george_ro','george','USAGE');                    -- false
--
--   -- NOTE: has_schema_privilege('george_log','public','USAGE') returns TRUE and
--   -- that is expected — USAGE on public is granted to PUBLIC in this database.
--   -- It confers nothing without a table privilege.
--
-- Then, connected AS george_log, these must FAIL:
--   SELECT * FROM george.conversations;      -- permission denied for table conversations
--   SELECT * FROM public.new_transactions;   -- permission denied for table new_transactions
--   INSERT INTO george.gaps (id, conversation_id, kind, detail, at)
--     VALUES (gen_random_uuid(), gen_random_uuid(), 'test', 'x', now())
--     RETURNING id;                          -- permission denied (RETURNING needs SELECT)
--
-- ...and this must SUCCEED (no RETURNING):
--   INSERT INTO george.gaps (id, conversation_id, kind, detail, at)
--     VALUES (gen_random_uuid(), gen_random_uuid(), 'test', 'x', now());
--
-- Then set, outside version control:
--   GEORGE_LOG_DATABASE_URL=postgresql://george_log.<project_ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
--
-- Note the pooler host and the `<role>.<project_ref>` username form — the direct
-- db.<ref>.supabase.co host does not accept IPv4 connections (see backend/.env).
-- =============================================================================

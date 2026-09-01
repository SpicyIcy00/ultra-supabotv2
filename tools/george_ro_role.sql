-- =============================================================================
-- george_ro — the read-only role George connects as.
--
-- NOT RUN BY CLAUDE. Review and run this yourself against the Supabase
-- database; it creates a role and alters grants on production.
--
-- Background: as of 2026-09-01 no such role existed. pg_roles held only the
-- Supabase built-ins plus `postgres`, and every query run during this work used
-- `postgres` (login, full write). tools/inventory.py refuses to start against
-- `postgres`, a superuser, or an unset GEORGE_DATABASE_URL, so it will not run
-- until this script has been applied.
--
-- Before running: replace the password placeholder. Do not commit the result.
-- =============================================================================

-- 1. The role. LOGIN, no inheritance of member-role privileges, nothing else.
CREATE ROLE george_ro WITH LOGIN NOINHERIT PASSWORD 'REPLACE_ME_WITH_A_STRONG_PASSWORD';

-- Belt and braces: every transaction this role opens defaults to read-only,
-- independent of what the client asks for. tools/inventory.py also sets this
-- per session and verifies it, so a change here cannot silently loosen it.
ALTER ROLE george_ro SET default_transaction_read_only = on;

-- Keep George honest about the Manila boundary: no reliance on the server's
-- timezone. The definitions never use CURRENT_DATE, but if a future query does,
-- this makes the failure obvious in testing rather than only between
-- 00:00-08:00 Manila in production.
ALTER ROLE george_ro SET timezone = 'UTC';

-- Bound runaway reads. 4.88M rows in inventory_snapshots is one bad predicate
-- away from a very long query.
ALTER ROLE george_ro SET statement_timeout = '30s';

-- 2. Connect and read the public schema.
GRANT CONNECT ON DATABASE postgres TO george_ro;
GRANT USAGE ON SCHEMA public TO george_ro;

-- 3. SELECT only, and only on the tables George's tools actually read.
--    Grant explicitly rather than ON ALL TABLES: a future table with sensitive
--    columns should require a deliberate decision to expose, not arrive
--    readable by default.
GRANT SELECT ON
    stores,
    products,
    inventory,
    inventory_snapshots,
    new_transactions,
    new_transaction_items
TO george_ro;

-- 4. No default privileges on anything created later. Stated explicitly so the
--    intent survives someone running a blanket GRANT elsewhere.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM george_ro;

-- =============================================================================
-- 5. ROW LEVEL SECURITY. A GRANT IS NOT ENOUGH ON ITS OWN.
--
-- 36 public tables have RLS enabled with ZERO policies, which is deny-all to
-- any role lacking BYPASSRLS. The application never noticed because it connects
-- as `postgres`, which has rolbypassrls = true. george_ro does not.
--
-- Symptom if this section is skipped: every query SUCCEEDS and returns ZERO
-- ROWS. No permission error, no warning — tools report empty results that look
-- like real answers. Measured 2026-09-01: the golden suite went 29 failed /
-- 18 passed, and the 18 that passed were the ones reading `products`, `stores`
-- (which already carry a permissive public policy) or the _php views (owned by
-- postgres without security_invoker, so they run with the owner's bypass).
--
-- Explicit per-table policies are used rather than `ALTER ROLE george_ro
-- BYPASSRLS`. BYPASSRLS is a role-level attribute that would make George ignore
-- every future policy silently, including any real tenancy rule added later.
-- These policies are auditable one table at a time and match the pattern
-- already used on products and stores.
--
-- Only tables the tools read DIRECTLY need a policy. vending_orders is omitted
-- deliberately: it is reached solely through v_vending_orders_php.
-- =============================================================================
CREATE POLICY george_ro_read ON inventory             FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON inventory_snapshots   FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON new_transactions      FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON new_transaction_items FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON product_barcodes      FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON vending_goods         FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON vending_devices       FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON vending_aisles        FOR SELECT TO george_ro USING (true);
CREATE POLICY george_ro_read ON vending_order_lines   FOR SELECT TO george_ro USING (true);
-- products and stores already have "Enable read access for all users"
-- (PERMISSIVE, roles=public, SELECT, USING true), so they need nothing here.

-- Verify RLS is no longer filtering George to nothing — expect non-zero counts:
--   SET ROLE george_ro;
--   SELECT count(*) FROM new_transactions;
--   SELECT count(*) FROM vending_aisles;
--   RESET ROLE;

-- =============================================================================
-- Verify — expect: rolsuper=f, rolcreatedb=f, rolcreaterole=f, and a table list
-- containing only SELECT privileges.
-- =============================================================================
-- SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin
--   FROM pg_roles WHERE rolname = 'george_ro';
--
-- SELECT table_name, privilege_type
--   FROM information_schema.table_privileges
--  WHERE grantee = 'george_ro' ORDER BY table_name;
--
-- Then, connected AS george_ro, this must FAIL:
--   CREATE TABLE _george_write_test (x int);
--   -- ERROR: permission denied for schema public
--
-- =============================================================================
-- Then set, outside version control:
--   GEORGE_DATABASE_URL=postgresql://george_ro:<password>@db.<ref>.supabase.co:5432/postgres
--
-- SEPARATELY, AND URGENTLY: backend/query_stores.py:16 contains a hardcoded
-- production connection string for the `postgres` role, committed to this repo.
-- Rotate that password and remove the literal — george_ro does not mitigate it.
-- =============================================================================

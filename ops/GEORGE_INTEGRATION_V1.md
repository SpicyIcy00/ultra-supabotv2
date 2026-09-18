# Bob Integration + Staging V1

Starting commit: `dbc7311256e60f38c3d8bbdf83ce708983fd6a6d`.
Branch: `integration/bob-v1`; history preserved, no rebase or cherry-pick.
Local worktree: `C:/ultra-supabotv2-main/.worktrees/bob-v1`.
Production main and Shell PR #2 remain unchanged. No push, deployment, provider
mutation, database connection or live-model evaluation is authorized in this phase.

## Readiness

Repository safeguards are implemented. Deployment isolation is NOT verified.
**BLOCKED — REQUIRES STAGING DATABASE** for migration rehearsal and every live
DB suite. **BLOCKED — REQUIRES PROVIDER CONFIGURATION** for actual Vercel routing,
backend targets, DB identity, grants, and deployed flags. Do not publish or deploy
as a substitute for proving those facts. See `GEORGE_INTEGRATION_RESULTS.md`.

## Routing contract

Browser clients continue using `/api/v1`. `frontend/middleware.ts` returns an
external Vercel rewrite; it never reads or buffers the request/response body.
The static production rewrite has been removed. API paths are excluded from the
SPA fallback, so missing middleware cannot fall through to a production proxy.

Production routing requires BOTH `VERCEL_ENV=production` and
`VERCEL_GIT_COMMIT_REF=main`, and `API_DEPLOYMENT_ENV` must not be `staging`.
It retains the existing production origin, optionally overridden using
`API_BACKEND_ORIGIN`. Every other deployment, including an integration branch
deployed as a separate project's Production environment, requires
`STAGING_API_BACKEND_ORIGIN`. Missing/invalid configuration returns HTTP 503.
Preview rejects the known production host and any configured production alias.
Origins must be HTTPS, with no credentials, path, query or fragment.

Set `API_DEPLOYMENT_ENV=staging` on a dedicated staging project too. Provider
configuration must confirm the staging origin does not alias or redirect to
production; source code cannot prove DNS/hosting ownership. Production system
variables must be exposed to middleware. No VITE-prefixed backend/model key.

SSE method, path, query and unread body are verified locally at the rewrite
boundary. End-to-end streaming through Vercel remains a provider smoke test.
Reference: https://vercel.com/docs/routing-middleware/api

## Backend gates

All five gates default to true to preserve current production compatibility.
Staging MUST explicitly set all five false before first boot:

- `SCHEDULERS_ENABLED`: checked before constructing the scheduler or registering
  its auto-report, chat-report and Bob workflow jobs. Disabled state is logged.
- `GEORGE_ENABLE_WORKFLOW_WRITES`: omits the workflow writer from the web route.
  The loop's existing capability registry consequently omits `save_workflow`.
  The workflow router also rejects create, promote and schedule mutation requests.
  Read/list operations and manual deterministic `/run` remain available, including
  their staging run receipts. Promotion/backtest rules are unchanged.
- `BUSINESS_WRITES_ENABLED`: closes non-read application HTTP methods outside
  Bob's personal work and login/passcode change. Blocks operational imports,
  purchasing/packing writes, Sheets calls and brief sending even for admins.
  This is an HTTP gate, not a replacement for DB grants or delivery-credential
  omission. Legacy read endpoints are not a guarantee of zero local lazy writes.
- `STARTUP_BOOTSTRAP_ENABLED`: controls legacy DDL/backfills/seeds.
- `AUTO_MIGRATE_ON_START`: controls launcher Alembic execution.

Bob's complete write registry is `pin_answer`, `save_workflow`, `create_page`,
`edit_page`. There is no purchasing/StoreHub/Telegram writer in that registry.
Pin and Page writers stay enabled and owner-bound; workflow writer is omitted.

## Explicit startup behavior and remaining debt

Railway, Procfile and Nixpacks now share `cd backend && python -m app.start`.
Production defaults retain Alembic-before-boot. With automatic migration disabled,
the launcher starts the server directly and logs that migrations are disabled.
The server still checks the Alembic head before accepting traffic.

Legacy mutation blocks moved intact to `app/services/startup_bootstrap.py`, except
that exception logs name the error type rather than printing exception payloads.
The old DB URL log was removed, not partially redacted. Normal staging boot
skips all three mutation transactions. SchemaContext initialization reflects
schema and loads legacy definitions; it is not a business-data bootstrap.

| Startup statements | Classification |
|---|---|
| store_tiers.max_cover_days; product_barcodes table/indexes | A/B: schema migration and idempotent bootstrap |
| shipment_plans percentile/output columns; service_overrides; percentile_store_config | A/B |
| percentile_store_config store defaults | D: seed/default data |
| auto_report_settings/store tables; scheduled_reports; dashboard_defaults; schedule columns | A/B |
| auto-report singleton and enabled store defaults | D |
| app_users, role_page_access, passcode_hash | A/B |
| role permissions, admin/warehouse accounts and default credential hashes | D; do not use these accounts in staging |
| fill missing admin passcode | C/D: conditional backfill/default |
| product packing weight/nickname; packing tables/indexes | A/B |
| drop nickname expression index | E: destructive legacy compatibility DDL |
| packing sequence/default/generated reference/index | A/B |
| historical packing sequence numbering and setval | C: data/sequence backfill |
| restate packing timestamp defaults | E: legacy compatibility write |

Debt: Alembic-at-head alone does not prove these legacy tables/columns exist.
Provision from a representative schema export, or apply reviewed bootstrap SQL
explicitly on a verified clone. Do not turn bootstrap on merely to make a broken
staging deployment start. Migrating all this legacy DDL into Alembic is deferred.

## Staging environment matrix

No values below are credentials. Configure secrets in provider secret storage.

| Variable | State for initial staging | Contract |
|---|---|---|
| DATABASE_URL | required | staging application role and DB; NEVER production |
| GEORGE_DATABASE_URL | required | staging business copy using george_ro |
| GEORGE_LOG_DATABASE_URL | required | same staging DB's restricted george_log |
| SECRET_KEY | required | unique staging signing key, at least 32 characters |
| ANTHROPIC_API_KEY | must be absent initially | required only after model-testing approval |
| ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL | must be absent initially | no implicit model credential or endpoint overrides |
| STAGING_API_BACKEND_ORIGIN | required | server-side Vercel HTTPS origin of staging backend |
| API_DEPLOYMENT_ENV | required: staging | explicit staging designation |
| API_BACKEND_ORIGIN | optional | production override/alias deny target, never staging fallback |
| VERCEL_ENV / VERCEL_GIT_COMMIT_REF | required from Vercel | platform routing context |
| SCHEDULERS_ENABLED | must be false | no registered background jobs |
| GEORGE_ENABLE_WORKFLOW_WRITES | must be false | no workflow writer, promotion or schedule mutations |
| BUSINESS_WRITES_ENABLED | must be false | no consequential operational HTTP writes |
| STARTUP_BOOTSTRAP_ENABLED | must be false | no legacy boot writes |
| AUTO_MIGRATE_ON_START | must be false | explicit migration step only |
| SCHEMA_CHECK | required: fail | refuse wrong schema |
| ENVIRONMENT | required: staging | SQL echo disabled |
| REDIS_ENABLED | must be false | Redis unnecessary for this phase |
| REDIS_URL | optional/omit | unused when Redis disabled |
| CORS_ORIGINS | optional for same-origin proxy | set exact staging frontend origin for direct API use |
| CORS_ORIGIN_REGEX | optional | empty or narrowly staging-scoped, not broad production previews |
| GEORGE_MAX_CONNECTIONS | optional, set 4 initially | proposed single-worker staging cap; confirm provider capacity |
| GEORGE_CONNECTION_WAIT_S | optional, 20 | connection wait budget |
| DATABASE_POOL_SIZE / DATABASE_MAX_OVERFLOW | optional, 5 / 0 initially | proposed staging pool limits |
| ALGORITHM / ACCESS_TOKEN_EXPIRE_MINUTES | optional | existing HS256 / expiry configuration |
| PORT / API_V1_PREFIX | platform/default | /api/v1 must agree with frontend |
| STOREHUB_USERNAME / STOREHUB_API_TOKEN | must be absent | no StoreHub API capability |
| TELEGRAM_BOT_TOKEN / BRIEF_TOKEN | must be absent | no delivery; empty brief token closes access |
| GOOGLE_SHEETS_URL / GOOGLE_SHEETS_BARCODE_DB_URL / GOOGLE_SHEETS_BACKUP_URL | must be absent | no Sheets publishing |
| VITE_GOOGLE_SHEETS_URL / VITE_ANTHROPIC_API_KEY | must be absent | no browser delivery/model credentials |
| GEORGE_API_BASE / BRIEF_CHAT_IDS / BRIEF_ALERT_CHAT_ID and n8n credentials | must be absent from staging automation | no attached n8n workflows or webhooks |
| GEORGE_EVALS / GEORGE_EVAL_JUDGE | must be false/unset | no automatic model evals |
| STAGING_DATABASE_VERIFIED | absent until verified | set 1 only for approved live verification jobs |

## Database to provision (no provider work performed)

The approved zero-cost first step is the native local PostgreSQL environment in
[LOCAL_POSTGRES.md](LOCAL_POSTGRES.md): three localhost-only databases, fresh local roles and
synthetic fixtures for Page/Pin integration plus disposable upgrade/downgrade
rehearsals. It does not require or modify provider infrastructure.

If ongoing shared staging is later required, use an included Supabase branch or
a separate hosted PostgreSQL instance whose identity and isolation are verified.
This repository has Alembic plus legacy SQL/boot DDL, not a complete
`supabase/migrations` history. Do not enable automatic branch schema deployment
and assume it reproduces the app. Supabase branches have separate
instances/credentials and can start without production data; exact data-copy
options depend on how the branch is created.
References: https://supabase.com/docs/guides/deployment/branching and
https://supabase.com/docs/guides/deployment/branching/dashboard

Another PostgreSQL instance works if its major version, extensions, view owners,
roles and RLS match the required schema. Supabase Auth is not the app's login:
the app uses public.app_users, role_page_access and its own JWT signing key.

Required database contents:

- `public` with actual retail, inventory, purchasing/transfer and vending schema,
  auth/permission and legacy Operations tables, and `alembic_version`.
- `bob` with conversations, tool_calls, gaps, pins/pin_runs, workflows,
  versions, schedules, runs and posts at the SOURCE revision. Pages/page_events
  are added by q1r2s3t4u5v6 if the source predates it.
- Vending views `v_vending_order_lines_php`, `v_vending_orders_php`,
  `v_vending_goods_php`, and their source objects/ownership. Their full DDL is
  not recreated by the new Page migration; a real schema export is necessary.
- `gen_random_uuid()` must work. The Page migration needs no uuid-ossp-specific
  functions. Determine the source's installed extensions from a provider export;
  do not invent a complete extension list from the repository alone.

Roles, with fresh staging passwords and no reused production credentials:

1. A provisioning/migration owner (not held by Bob) for restores and Alembic.
2. An application login for DATABASE_URL: CONNECT, schema USAGE; SELECT on
   required public tables; required CRUD on personal Bob Pages/Pins, run
   records, posts and conversation visibility; appropriate auth/passcode access.
   Give RLS policies for the actual role. Historical migrations create policies
   for the migration role, so using a DIFFERENT application role requires explicit
   matching policies/grants. Do not assume a non-owner works because a restore did.
3. `george_ro`: LOGIN NOINHERIT, no admin/BYPASSRLS/write privileges, default
   transaction read-only, statement timeout, explicit SELECT and RLS policies.
   `tools/george_ro_role.sql` lists retail/inventory/StoreHub grants. Also verify
   SELECT on the three vending views and direct vending sources used by tools;
   the script's vending RLS policies are not a complete vending GRANT manifest.
   No access to `bob`.
4. `george_log`: LOGIN NOINHERIT, USAGE on bob, INSERT-only on conversations,
   tool_calls, gaps and posts, with INSERT RLS policies. No SELECT, UPDATE,
   DELETE or business-table access. See `agent/sql/george_log_role.sql` and the
   posts migration. Do not blindly replay CREATE ROLE/TABLE scripts on a clone.

Restore/review grants and policies explicitly; a schema/data dump alone is not
proof of roles or view-owner semantics. Original role scripts name database
`postgres`; adjust only in the reviewed provisioning process if using another
database name. Use direct/session-mode connections for migration rehearsal.

### Data loading

Schema-only is useful for bootstrap checks but cannot verify real backfill or
support useful dogfooding. Use an approved, access-controlled representative copy
of Aji data. No production export or connection was made in this phase.

Have an authorized operator create a consistent logical export/backup of required
schemas and their dependencies using provider tooling. Transfer encrypted, outside
Git and transcripts. Export role structure separately without reusing passwords.
Review view/function dependencies, external connections, triggers, cron jobs and
webhooks before restore. Disable all DB-level delivery/cron mechanisms as well as
application schedules before any backend or worker connects.

For meaningful migration preservation, use a restricted disposable copy containing
the existing pins, calls, conversation references and exact owner grouping. Keep
business values/IDs/order intact for that rehearsal. Access to private historical
questions must remain restricted. For shared dogfooding, use approved business
data with fresh staging users; omit or anonymize private conversations and staff
identifiers consistently across references. Do not copy usable production login
hashes, API secrets, recipients or automation configuration. Prefer complete closed
windows and complete dependencies over arbitrary row samples that distort metrics.

A read-only extraction does not authorize the assistant to connect to production:
the operator-provided export is a later prerequisite. Supabase restore guidance:
https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

### Rehearsal versus ongoing staging

Keep a source snapshot before q1 migration, with its actual alembic_version.
Use disposable copy A for upgrade/preservation; copy B for downgrade rehearsal.
Do not run destructive downgrade tests on the ongoing human staging database.
If the supplied snapshot is already q1, obtain a pre-q1 snapshot for a true
upgrade rehearsal; do not falsely call an already-migrated clone an upgrade test.

On each verified disposable target: record revision; compare pin IDs, tool_calls,
conversation IDs, grouping/owner/count/order and Ungrouped before/after; verify
nullable purpose, no duplicate Pages, audit events, and UUID survival on rename.
Use the real online Alembic upgrade so its backfill assertions execute. Offline
SQL output is not equivalent. Measure locks/duration on a representative copy.

Downgrade loses Page UUID identity, empty Pages, purpose, manual ordering and
page_events. It reconstructs titles on pins, not the complete Page workspace.
Production and the old backend must never share a q1 database with this build.

## Verification and next approval

`python ops/verify_integration.py pure` selects all non-live root tests and rejects
every skip. It removes model/DB credentials from its child environment. CI runs
this and full frontend tests/typecheck/build on main/integration pushes and PRs.
Manual live jobs use protected environment-scoped STAGING secrets, not repository
production secrets; missing configuration fails. Configure required reviewers on
`bob-staging` and `bob-model-evals`. Model evaluations are manual-only and
remain unapproved. CI execution itself was not triggered locally.

Once a database is provisioned and identity/grants are independently verified:
`python ops/verify_integration.py read-db` and `... app-db`. The latter may apply
transactional DDL and write before rollback; it is not a read-only test.

Provider prerequisites: verified separate DB/project IDs and backend service;
staging-only secrets; flags above; no inherited automation; Vercel middleware
support/system variables; no production redirects/aliases; protected GitHub
environments; separate URL; no branch push that auto-deploys onto production.

Proposed later publish command (NOT RUN):
`git push --set-upstream origin integration/bob-v1` from this worktree.
No main update, no force push, no PR. Deployment is a separate approval: connect
only the dedicated staging services to this branch, run explicit migration on
the verified staging target, launch with gates disabled, then check health/auth,
UUID Pages, persistence/replay and SSE without a live model first. Do not use an
unqualified production deploy command. Exact provider IDs/URLs remain unknown.

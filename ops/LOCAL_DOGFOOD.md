# Local Bob dogfood

The rehearsal databases in [LOCAL_POSTGRES.md](LOCAL_POSTGRES.md) exist to prove
a migration against synthetic rows. This environment exists so a person can open
Bob in a browser and actually use it, against **real Aji figures**, on one
machine, with nothing writable outside it.

The split is the whole design:

```
  browser  http://127.0.0.1:5173
     |
     v
  vite dev proxy  (/api -> 127.0.0.1:8000, no Vercel, no Railway)
     |
     v
  uvicorn  127.0.0.1:8000
     |
     +--> LOCAL PostgreSQL   127.0.0.1:55432/bob_dogfood     READ/WRITE
     |      app_users, role_page_access, george.pages, george.pins,
     |      george.posts, george.conversations, george.page_events
     |
     +--> GUARDED Aji source (the george_ro pooler connection)  SELECT ONLY
            business figures only; never written, never migrated, never seeded
```

Everything Bob *remembers* is local. Everything Bob *reads* is the real
business data through the role that cannot change it. Nothing is copied between
the two: no export, no restore, no snapshot.

## The three targets, and why each is what it is

| Variable | Host | Database | Role | Access |
|---|---|---|---|---|
| `DATABASE_URL` | 127.0.0.1:55432 | `bob_dogfood` | `george_app` | read/write — application persistence |
| `GEORGE_DATABASE_URL` | the Aji pooler | `postgres` | `george_ro` | SELECT only — business reads |
| `GEORGE_LOG_DATABASE_URL` | 127.0.0.1:55432 | `bob_dogfood` | `george_log` | INSERT only — the append-only log |

`george_ro` was audited against the live server on 2026-09-08 and holds: no
superuser, createdb, createrole, bypassrls or replication attribute; membership
in no other role; **zero INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES grants on any
table in any schema**; no CREATE on any schema; and no USAGE on `bob`, so the
nine relations of Bob's own persistence are invisible to it. Its whole
surface is SELECT on 19 business tables and views.

Three further guards apply at runtime, and they are independent of those grants:
`tools/_common.connect()` reads `GEORGE_DATABASE_URL` and **refuses any
fallback** to an application or committed connection string, opens the session
`default_transaction_read_only = on` so the server rejects a write even from an
over-granted role, and re-checks at connect time that the role is neither a
superuser nor a named admin login.

Two residual capabilities are Postgres/Supabase defaults granted to `PUBLIC`,
not to this role, and are recorded rather than glossed: `TEMP` on the database,
and EXECUTE on pgsodium's SECURITY DEFINER key functions. Neither is reachable
from a vetted tool — architecture rule 1 means no tool issues freehand SQL —
and neither touches a business table. They are not a path Bob has.

## Why a launcher and not a dotenv

`backend/.env` is read by pydantic Settings, so it reaches `settings.*`. It is
**not** loaded into `os.environ` — and `os.environ` is where
`tools/_common.connect()` and `agent/loop.py` look for `GEORGE_DATABASE_URL` and
`GEORGE_LOG_DATABASE_URL`. A dotenv would configure half the process and leave
Bob's own connections unset, failing at the first question rather than at
boot. [local_dogfood_serve.py](local_dogfood_serve.py) therefore builds the
child environment in one place, asserts both local targets are loopback and that
the read role is not administrative, and drops every inherited variable whose
name mentions a database, provider or delivery integration so an exported shell
variable cannot leak into the server.

It also means the dogfood run writes **no new credential file**: local passwords
come from the ignored `credentials.json` the cluster helper already generated,
and the guarded read URL is read out of the operator's existing dotenv at launch
and passed straight to the child. Nothing is printed.

## The model key is omitted by default

Without `ANTHROPIC_API_KEY` in the environment, `agent/loop.py`'s
`anthropic.AsyncAnthropic()` cannot be constructed — and it is constructed
*before* the question, the history or any tool result is assembled. So a
question fails locally with `tool_calls: 0`, having read nothing and sent
nothing. That is a structural gate, not a policy: pass `--allow-model` only when
sending business-derived evidence to the provider has actually been approved.

Telegram, `BRIEF_TOKEN`, StoreHub, Google Sheets and n8n are omitted
unconditionally and have no flag.

## Running it

```powershell
$Python = Resolve-Path ..\..\.venv\Scripts\python.exe

& $Python ops/local_postgres.py start          # the shared local cluster
& $Python ops/local_dogfood.py provision       # once: database, schema, account
& $Python ops/local_dogfood_serve.py --check   # resolve and report, serve nothing
& $Python ops/local_dogfood_serve.py           # backend on 127.0.0.1:8000

cd frontend; npm run dev -- --host 127.0.0.1   # frontend on 127.0.0.1:5173
```

`provision` is idempotent: it leaves an existing application schema and an
existing account alone, so the pins and pages accumulated by using the product
survive a re-run.

Bind the frontend to `127.0.0.1` explicitly. `vite.config.ts` sets `host: true`,
which serves the LAN — and since the proxy forwards to a backend holding the
guarded read connection, a LAN-reachable dev server makes real business figures
reachable from other devices on the network.

## Sign-in

Sign-in is **passcode-only**; there is no username field
(`backend/app/api/v1/routes/auth.py`). `provision` creates one local `admin`
account whose passcode is generated, hashed through the application's own
`get_password_hash`, and written to the ignored
`verification/postgres/dogfood-login.txt` — never printed. No authentication
code is weakened, bypassed or duplicated, and the account exists only in
`bob_dogfood`.

The legacy startup bootstrap, which seeds accounts of its own, stays disabled;
`provision` creates only the `packing_lists_seq` sequence that `packing_lists`
declares a default against, because a table cannot be created without it.

## What the local schema is, and is not

`george.*` is built by replaying the real Bob migrations through the true
head, so the part Bob depends on has the migrated shape and
`alembic_version` is stamped honestly — `SCHEMA_CHECK=fail` passes because the
database really is at head.

The `public` tables are created from the application's own models, for the
reason LOCAL_POSTGRES.md already records: the Alembic history is not a complete
empty-database bootstrap. They are therefore **empty and structural**. Legacy
Operations pages will show nothing, and that is expected — business figures in
this environment come from the guarded remote read, never from local rows.

## Verification record, 2026-09-08

Backend booted reporting `schema check q1r2s3t4u5v6 == head`, `startup bootstrap
disabled`, `schedulers disabled`. A 36-check smoke suite run entirely through
the frontend origin passed 36/36: passcode login and rejection of a wrong
passcode and of an unauthenticated request; Page creation, UUID identity,
purpose, empty Page, UUID routing; rename preserving the UUID; three Pins,
dense positions, manual reorder persisted, remove-to-Ungrouped keeping the Pin;
persistence across a fresh session; seven `page_events` rows recording
`create/rename/add/add/add/place/remove`; a Pin run returning real receipts
(`source_table=new_transactions`, `filters_applied` citing `metrics.yaml`, a
`snapshot_timestamp`); and 403 from both the workflow-write and business-write
gates. `python ops/verify_integration.py pure` passed 832 tests.

No model request was made. Smoke artifacts were removed afterwards.

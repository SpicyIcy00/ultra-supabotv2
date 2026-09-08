# Local PostgreSQL integration environment

This is the zero-cost database environment for Page/Pin integration and Alembic
rehearsal. It is synthetic, local-only, and deliberately unable to use an
inherited database, model, delivery, StoreHub, Sheets, or n8n credential.

Runtime files are ignored under `verification/postgres/`:

- PostgreSQL 17 native binaries at `verification/postgres/pgsql/`
- cluster data, logs, and generated local credentials
- JUnit reports from each local target

The cluster listens on `127.0.0.1:55432`. `pg_hba.conf` has one IPv4 loopback
SCRAM rule and no trust, replication, IPv6, LAN, or wildcard rule. The helper
asserts the live server address and the synthetic manifest before migration.
It never reads a dotenv file and never prints a generated credential.

Use the repository virtual environment's Python. From the integration worktree:

```powershell
$Python = Resolve-Path ..\..\.venv\Scripts\python.exe
& $Python ops/local_postgres.py init
& $Python ops/local_postgres.py start
& $Python ops/local_postgres.py status
& $Python ops/local_postgres.py provision
```

`provision` creates fresh local roles and these isolated databases at revision
`p0q1r2s3t4u5`:

| Database | Purpose |
|---|---|
| `george_integration` | repeatable transactional Page/Pin live tests |
| `george_upgrade_rehearsal` | persistent online upgrade to `q1r2s3t4u5v6` |
| `george_downgrade_rehearsal` | disposable upgrade/live-test/downgrade cycle |

The fixtures contain invented store, product, transaction, inventory,
conversation, call, and pin rows. Store IDs match `metrics.yaml` so vetted scope
resolution can execute; names and business figures are synthetic. There is no
production connection or data-copy operation in the helper.

Run the migration and Page/Pin checks with:

```powershell
& $Python ops/local_postgres.py tests --database george_integration
& $Python ops/local_postgres.py app-tests --database george_integration

& $Python ops/local_postgres.py upgrade --database george_upgrade_rehearsal
& $Python ops/local_postgres.py tests --database george_upgrade_rehearsal
& $Python ops/local_postgres.py verify --database george_upgrade_rehearsal

& $Python ops/local_postgres.py upgrade --database george_downgrade_rehearsal
& $Python ops/local_postgres.py tests --database george_downgrade_rehearsal
& $Python ops/local_postgres.py downgrade --database george_downgrade_rehearsal
& $Python ops/local_postgres.py verify --database george_downgrade_rehearsal
```

`verify` checks the loopback connection, manifest and Alembic revision; exact
synthetic Pin and conversation UUIDs; tool-call retention; owner-separated Page
backfill; Ungrouped retention; dense order; restored legacy grouping after
downgrade; database ownership; and the `george_ro` and `george_log` privilege
boundaries. Downgrade is hard-restricted to its dedicated database.

The original Alembic history is not a complete empty-database bootstrap: its
first revision assumes legacy tables already exist. The helper therefore builds
a documented synthetic pre-Page baseline from the current model subset and the
George migrations through `p0q1r2s3t4u5`. This proves Page migration behavior on
representative shapes. It does not prove restore compatibility, migration lock
duration, or results over the full Aji schema and row distribution.

`read-tests` intentionally runs the production-value golden/read suite and will
fail on these synthetic rows. It records the boundary between local structural
verification and checks that require approved representative Aji data plus the
legacy vending views, dispatch view, barcode table, and complete snapshot/import
coverage.

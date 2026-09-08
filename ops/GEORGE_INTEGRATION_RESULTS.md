# Local verification record — 2026-09-08

Branch: `integration/george-v1`, based on
`dbc7311256e60f38c3d8bbdf83ce708983fd6a6d`.
Runtime/CI changes tested at `2e450cc`; the following commit adds documentation
only. Obtain the final documentation-inclusive SHA with `git rev-parse HEAD`.

## Executed results

| Suite | Passed | Failed | Skipped | Xfail | Xpass |
|---|---:|---:|---:|---:|---:|
| Full pure backend (`ops/verify_integration.py pure`) | 832 | 0 | 0 | 0 | 0 |
| Explicit contracts (`ops/verify_integration.py contracts`) | 746 | 0 | 0 | 0 | 0 |
| Full frontend Vitest, 38 files | 530 | 0 | 0 | 0 | 0 |
| Local Page/Pin live suite, baseline target | 15 | 0 | 0 | 0 | 0 |
| Local Page/Pin live suite, upgraded target | 15 | 0 | 0 | 0 | 0 |
| Local Page/Pin live suite, downgrade target before downgrade | 15 | 0 | 0 | 0 | 0 |
| Canonical app-db runner, baseline target | 3 | 0 | 0 | 0 | 0 |

Contract tests are a subset of the pure suite, not 746 additional distinct tests.
Pure coverage includes 22 deployment, 99 legacy Operations authorization,
102 workflow, 35 Page Workshop, 28 Page writer, 30 Page reader and 37 Page context
tests. The remaining existing George contracts, parser and presentation tests
also execute in the pure suite. No DB/model credentials were needed.

`npx tsc -b --noEmit`: PASS, including routing middleware/configuration types.
`npm run build`: PASS, including generated PWA service worker (44 precache entries).
`git diff --check`: PASS. CI YAML category/secret separation inspected locally.
The extracted bootstrap's statements were compared against the original source:
identical except exception payloads are no longer logged.

Ignored raw reports: `verification/pure.xml`, `verification/contracts.xml`,
`verification/frontend.json`. No remote CI was triggered. Existing FastAPI,
Pydantic and Alembic deprecations, Browserslist age and DOM/router warnings remain.
No dependency cleanup or UI redesign was included.

## Local PostgreSQL rehearsal

PostgreSQL 17.11 was extracted under the ignored `verification/postgres`
directory and initialized with a `127.0.0.1:55432` listener and a single
loopback SCRAM HBA rule. Three databases were built from synthetic fixtures:
integration, persistent upgrade rehearsal, and disposable downgrade rehearsal.
No dotenv file or inherited database/model/delivery credential is read.

The online Page migration completed on both rehearsal databases. The dedicated
downgrade target then completed `q1r2s3t4u5v6 -> p0q1r2s3t4u5`. Independent
verification passed on all three final states: exact Pin and conversation UUIDs,
tool calls, owner-separated same-title Pages, Ungrouped Pins, dense position,
restored legacy grouping, application ownership, `george_ro` read-only/no-George
access, and `george_log` INSERT-only/no-read access.

The full read/golden suite was also attempted to define the synthetic boundary:
66 passed, 82 failed, and 3 skipped. Those failures are expected and are not
product regressions: the suite asserts recorded Aji values and requires legacy
barcode/dispatch/vending objects and complete inventory, StoreHub and vending
coverage which this Page/Pin fixture intentionally does not invent.

See [LOCAL_POSTGRES.md](LOCAL_POSTGRES.md) for setup and repeatable commands. Ignored JUnit reports
are under `verification/`.

## Not executed — not passes or pytest skips

| Work | Status |
|---|---|
| Hosted staging DB revision | BLOCKED — REQUIRES HOSTED STAGING DATABASE |
| Read-only golden values and full-schema tools | BLOCKED — REQUIRES REPRESENTATIVE AJI DATA/SCHEMA |
| Browser login/reload and deployed API/SSE smoke | BLOCKED — REQUIRES HOSTED STAGING |
| Vercel-to-backend SSE/auth/proxy smoke | BLOCKED — REQUIRES PROVIDER CONFIGURATION |
| Page Workshop and Investigation model evals | NOT AUTHORIZED; not collected by executed suites |

Local database connections, migrations, rolled-back application writes and role
checks were performed only against generated localhost targets. The nine Page
model scenarios and the Investigation mixed-driver xfail are unchanged. No
production data was used as a substitute. No export was taken.

## Isolation evidence

| Claim | Local evidence | Deployed proof |
|---|---|---|
| Preview has no production fallback | 15 routing tests, static production rewrite removed, integration branch denied production default | Provider origin/alias and middleware verification pending |
| Schedulers register/start no jobs when disabled | Constructor spy; real startup with disabled scheduler | Actual service flag pending |
| Workflow writer omitted | Actual route expression + real capability registry/schema; HTTP mutation gate | Actual service flag pending |
| Pins/Pages remain available | Tool schema and HTTP gate tests; existing Page contracts/DOM tests | Real DB smoke pending |
| No legacy boot writes when disabled | Real startup with bootstrap tripwire; launcher migration gate | Actual service flags pending |
| Startup logs avoid credential values | URL log removed; enabled-bootstrap exception sentinel test | No deployed startup logs yet |
| DATABASE_URL/log target separate from production | Local targets are generated and asserted loopback-only | Hosted target still blocked |
| Business read target known | Synthetic `george_ro` target and privilege checks pass | Representative hosted data still blocked |
| StoreHub/n8n/Telegram/Sheets unavailable | Operational non-read HTTP gate; required credential omissions documented | Provider omissions/DB jobs not yet verified |
| Migration touched only staging | Two local synthetic upgrades and one dedicated downgrade completed | Hosted rehearsal pending |

Mocked HTTP, schema and component checks are not claimed as a real deployed
manual smoke test. Source routing cannot prove that a hostname is not an alias
for production. App flags do not disable database-level cron/webhooks or external
n8n workers; provisioning must address those separately.

## Changes and preservation

- `47687a8`: environment-aware same-origin API routing and 15 routing tests.
- `faa907b`: scheduler, workflow writer/API and operational HTTP gates.
- `bb3a1b2`: startup URL/exception log removal.
- `36578e3`: shared gated launcher, extracted gated legacy bootstrap, 22 deployment
  tests and environment examples.
- `2e450cc`: pure/live/model CI separation, explicit local suite runner, ignored
  verification artifacts.
- Final documentation commit: current Page identity clarification, staging setup
  contract, database provisioning guidance and this evidence record.

Diff: `git diff dbc7311..HEAD`. No changes to business definitions, vetted tools,
agent loop, migrations or evals. Existing Page Workshop/Shell history is intact.
Original worktree remains on Page Workshop at dbc7311, with only the same three
dirty paths: `.claude/settings.local.json`, `.claude/settings.json`, `AGENTS.md`.
Those files were not modified. `.git/info/exclude` only gained `.worktrees/` to
hide the local worktree container. Local main remains db4b22f; origin/main f5403cf.

## Recommendation

**DO NOT PUSH yet.** The available local checks pass, but this is not a claim
that the integrated build is fully verified or safe to deploy. Provision and
verify staging DB/provider isolation, perform migration and live API rehearsals,
then return to the publish approval checkpoint. No push, deployment, PR, provider
change or model transmission was performed.

See `GEORGE_INTEGRATION_V1.md` for the exact environment matrix, role/schema
requirements, startup-write classification and proposed later publish action.
Downgrade loses UUID identity, empty Pages, purpose, manual order and page_events;
it is not a lossless rollback.

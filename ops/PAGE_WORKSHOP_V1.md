# Page Workshop V1

Approved 2026-09-08. A Page is now a persistent personal object, including when
it is empty. This replaces the earlier grouping of Pins by a mutable name.
Identity must survive rename, order must survive changes to Pin creation dates,
and future capabilities need a stable parent. Sentinel Pins and name cascades
are not part of this model.

## Identity, purpose and compatibility

`george.pages` stores UUID `id`, `owner`, `title`, nullable `purpose`,
`created_at` and `updated_at`, with `UNIQUE(owner, title)`.
`george.pins.page_id` references that identity; `position` orders its analyses.
Canonical routes are `/pages/:pageId` and `/pages/ungrouped`.
`/pages?p=<name>` remains a temporary exact-name compatibility resolver.

Ungrouped is `page_id = NULL`, not a Page row or a reserved title. It cannot be
renamed, described, deleted or reordered. Pins can move into and out of it.

Purpose is visible, editable descriptive text, limited to one line and 200
characters. George receives it explicitly as user-authored Page purpose. It
cannot override system instructions, business definitions, tool constraints or
security boundaries. Title validation retains the existing naming rule: trim,
collapse whitespace, reject blank, preserve case, at most 100 characters.
Case-only collisions require the existing explicit disambiguation path.

Scope is `{page_id: UUID | null}`. The title at answer time is stored beside it
for presentation. Readers and writers close over the ID, so rename leaves a
thread bound to the same Page. On reload, an existing ID always wins. A legacy
title-only post may recover an ID only through an exact current owner-scoped
match. If it no longer matches, scope is unrecoverable; no guessing or historical
post rewriting is permitted.

## Ordered analyses and atomic writes

Migration preserves each Page's old `created_at DESC, id DESC` Pin order. New
analyses intentionally append at the bottom. Every add, remove, move and reorder
leaves every affected real Page dense at `0..n-1` before commit. Placement is
relational: before/after a Pin ID, top or bottom. The service calculates positions.
Per-owner transaction advisory locks serialize structural writes, including
creation of empty Pages and moves from Ungrouped.

The injected PageWriter is bound to the authenticated owner and supports explicit
owned Page targets as well as current scope. George has two Page tools:

- `create_page(title, purpose, analyses)` creates an empty Page or an atomic
  collection of analyses from executed pinnable calls or existing owned Pins.
- `edit_page(operations, page_id=None)` changes the scoped Page, or the explicitly
  supplied owned Page. It supports rename, purpose, add, add existing, remove,
  move to another Page and relational placement. It has no delete operation.

Trusted request context includes lightweight owned Page IDs and titles. George
can resolve a human title without replaying Page contents, then supply an ID.
The write service refuses destination titles. Pin IDs are authoritative too;
an ambiguous convenience title returns candidates with IDs and Page labels.

All targets, calls, ownership, bounds, memberships and placements are checked
before mutation. Batch preflight simulates destination capacity and placement
against preceding operations. The caller commits once; a failed commit produces
no success frame. Analytical reads happen before, outside that transaction.
Saving existing investigation calls does not rerun them. Duplicate new reads,
`view_page`, writes, model figures, prose and arbitrary SQL cannot become analyses.
Moving an existing Pin preserves its tool calls and definitions provenance.

| Bound | V1 maximum |
|---|---:|
| Pages per owner | 50 |
| Analyses per Page | 50 |
| Pins per owner | 500 |
| Analyses per create | 6; guidance prefers 3–4 |
| Operations per edit | 10 |
| Adds per edit | 6 |
| Page title | 100 characters |
| Purpose | 200 characters, single line |

`page_writer.py` and `page_operations.py` name the service constants;
`metrics.yaml` supplies conversational bounds and semantics, checked for agreement
by contract tests. Tool schemas reflect the build/edit bounds.

## Confirmation and audit

George's remove means **Remove from Page → kept in Ungrouped**, never deletion.
The confirmation says “Removed ATP from Rockwell Weekly · kept in Ungrouped”.
Manual **Delete** retains actual Pin deletion. Manual **Delete Page** deletes
only the Page object and moves all its Pins to Ungrouped.

`george.page_events` is the append-only structural audit: owner, Page ID, actor,
operation, relevant Pin ID, metadata before/after, conversation ID and timestamp.
It contains no replay results. Manual and conversational changes use the same
service semantics. George's ordinary tool-call log also remains intact.

`page_changed` confirms committed mutations with Page ID, title, purpose,
operations and updated time. The UI refreshes queries and preserves scope by ID.
There is no optimistic success, Page-change River post kind, or structural-edit
River spam. Claim protection uses the committed operation types in the current
turn: a rename cannot justify claiming a move. Negation handling is retained;
this is a bounded phrase check, not a universal natural-language verifier.

## Migration and verification

Revision `q1r2s3t4u5v6` inserts ordinary generated Page UUIDs per exact owner/title
group, backfills IDs by those inserted rows and calculates dense positions.
Before dropping `pins.page`, it raises on any mismatch in grouping counts,
owner/title mapping, grouped Pin IDs, virtual Ungrouped membership, original
ordering or density. Original Pin tool calls and historical posts are untouched.

`tests/pages_live.py` applies the migration inside each test's transaction when
needed. The live round-trip test upgrades, verifies, downgrades and rolls back,
then checks schema and original Pin calls through a fresh session. These are
test dry runs, not a production migration deployment.

Verification commands from the repository root (use the existing virtualenv):

```text
python -m pytest tests --ignore=tests/evals -q
python -m pytest tests/golden.py -q
python -m pytest tests/test_page_workshop_live.py -q
cd frontend
npm test
npx tsc -b --noEmit
npm run build
```

Run the first command without live credentials for the pure suite, and with
configured application/read-only DB credentials for the complete live suite.
Load credentials without printing them; set `ENVIRONMENT=production` to avoid
SQL echo. Tests isolate the real conversation-log credential. Golden tests are
invoked separately because `golden.py` is not a default pytest discovery name.
On restricted Windows environments, the PWA build may need `TEMP` and `TMP`
pointing to a writable workspace-local directory.

The opt-in model scenarios are separate:
`GEORGE_EVALS=1 python -m pytest tests/evals/test_page_workshop_evals.py -q`.
They use the live model and read-only business tools, with fake Page writes.
They cover request builds, investigation reuse, empty Pages, rename, remove,
ambiguity, adds, destination-ID resolution and relational reorder. A failed
behavioural scenario is a finding; do not change architecture to force it green.

## Completion verification — 2026-09-08

| Check | Result |
|---|---|
| Full backend without live credentials | 810 passed; 30 database-dependent skips |
| Full backend with live DB access, excluding model evals | 841 passed |
| Golden tools, invoked separately | 123 passed |
| Migration dry run, downgrade and rollback | Passed inside live suite; original calls and grouping verified |
| Frontend Vitest | 37 files, 515 tests passed |
| `tsc -b --noEmit` | Passed |
| Production frontend build, including PWA | Passed using workspace-local temporary directory |
| Page Workshop model evals | Nine scenarios added; live run blocked pending explicit authorization to send business results to the configured model API |

Automatic approval review rejected the model eval invocation for that data
transfer; no live-model behavioural pass or new behavioural xfail is claimed.
The existing Investigation mixed-driver xfail remains unchanged. Existing
Pydantic/Alembic deprecation warnings and frontend dependency/router warnings
remain. No production migration, push or PR was performed.

## Deferred scope

V1 provides ordered analyses. **Sections are a V1.1 candidate**, with future
`section_id` compatible with the existing Page identity and ordering semantics.
No drag-and-drop, separate planner, sub-agent loop, FFR templates or placeholders
are introduced. Investigation V1 bounds and the mixed-driver behavioural xfail
remain unchanged; no driver-gap math is added.

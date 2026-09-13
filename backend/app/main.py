import sys
import asyncio
from pathlib import Path
from fastapi import Depends, FastAPI, Response, status
from app.core.deployment import require_business_writes
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import assert_secret_key_usable, settings
from app.services.schema_context import SchemaContext

# Fix for Windows: Use WindowsSelectorEventLoopPolicy for async operations with psycopg
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# ---------------------------------------------------------------------------
# Refuse to boot on an untrustworthy signing key.
#
# HERE, at module level, and not inside startup_event: this runs before the app
# object exists, so there is no chance of a route being served, and it cannot be
# swallowed by one of the try/except blocks that startup uses to keep optional
# services from blocking a deploy. A deployment missing SECRET_KEY should fail
# loudly and stay down, not come up quietly signing tokens with a value that is
# printed in this repository.
# ---------------------------------------------------------------------------
try:
    assert_secret_key_usable()
except Exception as exc:
    print(f"FATAL: {exc}", file=sys.stderr, flush=True)
    raise

app = FastAPI(
    dependencies=[Depends(require_business_writes)],
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json"
)

# CRITICAL: CORS must be added IMMEDIATELY after app creation and BEFORE routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Startup event: Initialize SchemaContext
@app.on_event("startup")
async def startup_event():
    """Initialize services on application startup"""

    # FIRST: refuse to serve against a schema this code cannot use. On
    # 2026-09-04 the chats deploy booted two migrations behind and served 500s
    # until a person noticed; the day before, workflow saves had been failing
    # the same way. A crash here fails the deploy where the deploy log is.
    # SCHEMA_CHECK=warn keeps serving and reports on /health; see schema_check.
    from app.core.database import engine as _engine
    from app.core.schema_check import verify as _verify_schema
    app.state.schema = (await _verify_schema(_engine)).as_dict()

    # Do not print connection strings or exception payloads at startup.
    print("Database configuration loaded; schema verified")

    if settings.STARTUP_BOOTSTRAP_ENABLED:
        from app.services.startup_bootstrap import bootstrap
        await bootstrap()
    else:
        print("Startup bootstrap disabled: no legacy DDL, backfills or seeds")

    # Initialize schema context with database connection
    business_rules_path = Path(__file__).parent.parent / "business_rules.yaml"
    SchemaContext.initialize(
        database_url=settings.DATABASE_URL,
        business_rules_path=str(business_rules_path)
    )
            
    print("SchemaContext initialized")

    # Start the in-process weekly auto-report scheduler
    try:
        from app.services.scheduler import start_scheduler
        start_scheduler()
    except Exception as e:
        print(f"Scheduler start warning: {type(e).__name__}")

    print("REGISTERED ROUTES START")
    for route in app.routes:
        if hasattr(route, "path"):
            print(f"ROUTE: {route.path}")
    print("REGISTERED ROUTES END")


# Shutdown event: Clean up resources
@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on application shutdown"""
    try:
        from app.services.scheduler import shutdown_scheduler
        shutdown_scheduler()
    except Exception as e:
        print(f"Scheduler shutdown warning: {type(e).__name__}")
    SchemaContext.shutdown()
    print("SchemaContext shut down")

from app.api.v1.routes import analytics, chatbot, stores, products, reports, report_presets, google_sheets, saved_queries, replenishment, store_filters, barcodes, scheduled_reports, vending, dashboard_defaults, auth, admin, packing, george, george_pins, george_pages, george_workflows, storehub_imports, brief

app.include_router(auth.router, prefix=f"{settings.API_V1_PREFIX}/auth", tags=["auth"])
app.include_router(admin.router, prefix=f"{settings.API_V1_PREFIX}/admin", tags=["admin"])
app.include_router(packing.router, prefix=f"{settings.API_V1_PREFIX}/packing", tags=["packing"])
app.include_router(analytics.router, prefix=f"{settings.API_V1_PREFIX}/analytics")
app.include_router(chatbot.router, prefix=f"{settings.API_V1_PREFIX}/chatbot")
app.include_router(reports.router, prefix=f"{settings.API_V1_PREFIX}/reports", tags=["reports"])
app.include_router(report_presets.router, prefix=f"{settings.API_V1_PREFIX}/report-presets")
app.include_router(stores.router, prefix=f"{settings.API_V1_PREFIX}/stores", tags=["stores"])
app.include_router(products.router, prefix=f"{settings.API_V1_PREFIX}/products", tags=["products"])
app.include_router(google_sheets.router, prefix=f"{settings.API_V1_PREFIX}/sheets", tags=["google-sheets"])
app.include_router(saved_queries.router, prefix=f"{settings.API_V1_PREFIX}/saved-queries", tags=["saved-queries"])
app.include_router(scheduled_reports.router, prefix=f"{settings.API_V1_PREFIX}/scheduled-reports", tags=["scheduled-reports"])
app.include_router(replenishment.router, prefix=f"{settings.API_V1_PREFIX}/replenishment", tags=["replenishment"])
app.include_router(store_filters.router, prefix=f"{settings.API_V1_PREFIX}/store-filters", tags=["store-filters"])
app.include_router(barcodes.router, prefix=f"{settings.API_V1_PREFIX}/barcodes", tags=["barcodes"])
app.include_router(vending.router, prefix=f"{settings.API_V1_PREFIX}/vending", tags=["vending"])
app.include_router(dashboard_defaults.router, prefix=f"{settings.API_V1_PREFIX}/dashboard-defaults", tags=["dashboard-defaults"])
# George — vetted-tool agent. Separate from `chatbot`, which is the older
# NL->SQL system; the two deliberately share no code path.
app.include_router(george.router, prefix=f"{settings.API_V1_PREFIX}/george", tags=["george"])
app.include_router(george_pins.router, prefix=f"{settings.API_V1_PREFIX}/george/pins", tags=["george-pins"])
app.include_router(george_pages.router, prefix=f"{settings.API_V1_PREFIX}/george/pages", tags=["george-pages"])
app.include_router(george_workflows.router, prefix=f"{settings.API_V1_PREFIX}/george/workflows", tags=["george-workflows"])
app.include_router(brief.router, prefix=f"{settings.API_V1_PREFIX}/brief", tags=["brief"])
app.include_router(storehub_imports.router, prefix=f"{settings.API_V1_PREFIX}/storehub-imports", tags=["storehub-imports"])


@app.get("/")
def root():
    return {"message": "BI Dashboard API", "version": settings.VERSION}

# How stale the schema readout on /health may be, in seconds.
#
# The schema check used to run ONCE, at startup, and /health replayed that
# snapshot for the life of the process. So a database that drifted while the
# app ran — a migration applied beside it, a restore, a rollback of the other
# half of the deploy — was invisible until something restarted, which is the
# defect card P0.4 names. /health now re-reads, and this bounds the cost: a
# platform poller on a five-second interval hits the database twice a minute,
# not twelve times.
SCHEMA_RECHECK_SECONDS = 30.0


async def _live_schema() -> tuple[dict, str]:
    """
    The schema state as it is NOW, with how we know it.

    Returns (schema, source) where source is `live` (just read), `cached` (read
    within the window above), or `startup` (the live read failed and this is
    the boot-time snapshot — said plainly, never passed off as current).
    """
    import time

    from app.core.schema_check import compare, expected_heads, read_current

    snapshot = getattr(app.state, "schema", None) or {
        "ok": False, "current": [], "expected": [], "problem": "startup has not run",
    }
    cached = getattr(app.state, "schema_live", None)
    now = time.monotonic()
    if cached and now - cached[0] < SCHEMA_RECHECK_SECONDS:
        return cached[1], "cached"

    try:
        from app.core.database import engine
        schema = compare(await read_current(engine), expected_heads()).as_dict()
    except Exception as exc:  # noqa: BLE001 - health must not fail on a readout
        # Never the exception's payload: a connection error carries the URL.
        snapshot = dict(snapshot)
        snapshot["recheck_error"] = type(exc).__name__
        return snapshot, "startup"

    app.state.schema_live = (now, schema)
    return schema, "live"


@app.get("/health")
async def health_check(response: Response):
    """
    Liveness, which build is running, and the schema state as of now.

    503 when the database is not at the migration head this build ships, so a
    platform health check fails instead of routing traffic to a process that
    will 500.

    WHICH BUILD. A schema revision identifies the database and identified
    nothing about the code, so "is the fix live yet" had no answer but trying
    it. `build` is read from what the platform reported, and is
    `{"commit": null, "source": "unknown"}` when nothing reported anything —
    a guess here is a readout somebody would trust while debugging the wrong
    code.

    AS OF NOW, not as of boot. `schema_checked` says which: `live` or `cached`
    is a reading of the database, `startup` means the re-read failed and this
    is the boot snapshot.
    """
    from app.core.build import revision

    schema, source = await _live_schema()
    # How many george_ro connections this process holds right now, against the
    # cap it enforces — the number to read when the pooler complains.
    try:
        from tools._common import connection_gate_status
        george_pool = connection_gate_status()
    except Exception as exc:  # noqa: BLE001 - health must not fail on a readout
        george_pool = {"error": f"{type(exc).__name__}: {exc}"}
    body = {
        "status": "healthy" if schema["ok"] else "schema_mismatch",
        "build": revision(),
        "schema": schema,
        "schema_checked": source,
        "george_pool": george_pool,
    }
    if not schema["ok"]:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return body



# Version: 1.0.0

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
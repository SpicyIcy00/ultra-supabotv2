import sys
import asyncio
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.services.schema_context import SchemaContext

# Fix for Windows: Use WindowsSelectorEventLoopPolicy for async operations with psycopg
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI(
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
    
    # Debug: Print database connection info (redacted)
    try:
        db_url = settings.DATABASE_URL
        if "@" in db_url:
            # simple redaction
            prefix = db_url.split("@")[0]
            suffix = db_url.split("@")[1]
            redacted_prefix = prefix.split(":")[0] + ":****"
            print(f"DEBUG: Connecting to database at: {redacted_prefix}@{suffix}")
        else:
            print(f"DEBUG: Connecting to database at: {db_url}")
    except Exception as e:
        print(f"DEBUG: Error logging DB info: {e}")

    # Apply any pending schema changes that bypass alembic
    try:
        from app.core.database import engine
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE store_tiers ADD COLUMN IF NOT EXISTS max_cover_days INTEGER NOT NULL DEFAULT 10"
            ))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS product_barcodes (
                    id SERIAL PRIMARY KEY,
                    product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    barcode VARCHAR(13) NOT NULL UNIQUE,
                    base_digits VARCHAR(12),
                    generated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_product_barcodes_product_id ON product_barcodes (product_id)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_product_barcodes_barcode ON product_barcodes (barcode)"
            ))
            # Percentile algorithm (v2): algorithm selector + output columns on
            # shipment_plans, plus the service_overrides feedback table.
            await conn.execute(text("""
                ALTER TABLE shipment_plans
                    ADD COLUMN IF NOT EXISTS algorithm            VARCHAR(20) NOT NULL DEFAULT 'legacy',
                    ADD COLUMN IF NOT EXISTS abc_class            VARCHAR(1),
                    ADD COLUMN IF NOT EXISTS service_quantile     NUMERIC(4, 2),
                    ADD COLUMN IF NOT EXISTS segment              VARCHAR(10),
                    ADD COLUMN IF NOT EXISTS needs_count          BOOLEAN,
                    ADD COLUMN IF NOT EXISTS silent_stockout      BOOLEAN,
                    ADD COLUMN IF NOT EXISTS days_since_last_sale INTEGER,
                    ADD COLUMN IF NOT EXISTS trusted_ledger       BOOLEAN
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS service_overrides (
                    store_id          VARCHAR(24)   NOT NULL,
                    product_id        VARCHAR(24)   NOT NULL,
                    quantile_override NUMERIC(4, 2) NOT NULL,
                    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT timezone('Asia/Manila', now()),
                    PRIMARY KEY (store_id, product_id)
                )
            """))
            # Transparency columns on shipment_plans (percentile output)
            await conn.execute(text("""
                ALTER TABLE shipment_plans
                    ADD COLUMN IF NOT EXISTS p_days_used     INTEGER,
                    ADD COLUMN IF NOT EXISTS quantile_source VARCHAR(16)
            """))
            # Per-store percentile (v2) tuning — separate from legacy store_tiers.
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS percentile_store_config (
                    store_id    VARCHAR(24)   PRIMARY KEY,
                    store_name  VARCHAR(120),
                    review_days INTEGER       NOT NULL DEFAULT 7,
                    lead_days   INTEGER       NOT NULL DEFAULT 2,
                    quantile_a  NUMERIC(4, 2) NOT NULL DEFAULT 0.95,
                    quantile_b  NUMERIC(4, 2) NOT NULL DEFAULT 0.90,
                    quantile_c  NUMERIC(4, 2) NOT NULL DEFAULT 0.85,
                    notes       TEXT,
                    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            # Seed the 7 retail stores (only inserts missing rows; never overwrites edits)
            await conn.execute(text("""
                INSERT INTO percentile_store_config
                    (store_id, store_name, review_days, lead_days, quantile_a, quantile_b, quantile_c)
                VALUES
                    ('6639efd54694700008d7ccc6', 'Rockwell',   7, 2, 0.98, 0.92, 0.85),
                    ('68c5bb269da1d500073690c2', 'Opus',       7, 2, 0.97, 0.92, 0.85),
                    ('668023c94721460006092609', 'Fairview',   7, 2, 0.97, 0.90, 0.85),
                    ('668a43f60fa9990007cfa158', 'Greenhills', 7, 2, 0.95, 0.90, 0.85),
                    ('66cfff31aa7adf0007c9de41', 'North Edsa', 7, 2, 0.95, 0.90, 0.85),
                    ('67612230a740d90007464e26', 'Magnolia',   7, 2, 0.95, 0.90, 0.85),
                    ('69c73fcb277aa600076dfaaa', 'Shangri-La', 7, 2, 0.95, 0.90, 0.85)
                ON CONFLICT (store_id) DO NOTHING
            """))
            # Auto-report (scheduled weekly replenishment → Sheets) config tables
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS auto_report_settings (
                    id                     INTEGER      PRIMARY KEY,
                    enabled                BOOLEAN      NOT NULL DEFAULT FALSE,
                    day_of_week            INTEGER      NOT NULL DEFAULT 0,
                    hour                   INTEGER      NOT NULL DEFAULT 6,
                    minute                 INTEGER      NOT NULL DEFAULT 0,
                    algorithm              VARCHAR(20)  NOT NULL DEFAULT 'legacy',
                    calc_mode              VARCHAR(20)  NOT NULL DEFAULT 'snapshot',
                    apply_stockout_buffer  BOOLEAN      NOT NULL DEFAULT FALSE,
                    show_zero_requested    BOOLEAN      NOT NULL DEFAULT FALSE,
                    post_backup            BOOLEAN      NOT NULL DEFAULT TRUE,
                    last_run_at            TIMESTAMPTZ,
                    last_run_status        VARCHAR(20),
                    last_run_detail        TEXT,
                    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            await conn.execute(text(
                "INSERT INTO auto_report_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
            ))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS auto_report_store (
                    store_id    VARCHAR(24)  PRIMARY KEY,
                    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
                    sheet_name  VARCHAR(120),
                    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            # Seed one opt-in row per configured store tier (never overwrites edits)
            await conn.execute(text("""
                INSERT INTO auto_report_store (store_id, enabled)
                SELECT store_id, TRUE FROM store_tiers
                ON CONFLICT (store_id) DO NOTHING
            """))
            # Scheduled AI-chat reports (re-run saved query -> deliver to Telegram)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS scheduled_reports (
                    id                VARCHAR(36)  PRIMARY KEY,
                    title             VARCHAR(200) NOT NULL,
                    question          TEXT         NOT NULL,
                    sql               TEXT         NOT NULL,
                    frequency         VARCHAR(10)  NOT NULL DEFAULT 'daily',
                    day_of_week       INTEGER      NOT NULL DEFAULT 0,
                    hour              INTEGER      NOT NULL DEFAULT 8,
                    minute            INTEGER      NOT NULL DEFAULT 0,
                    telegram_chat_id  VARCHAR(64)  NOT NULL,
                    include_csv       BOOLEAN      NOT NULL DEFAULT TRUE,
                    enabled           BOOLEAN      NOT NULL DEFAULT TRUE,
                    last_run_at       TIMESTAMPTZ,
                    last_run_status   VARCHAR(20),
                    last_run_detail   VARCHAR(500),
                    created_at        TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now()),
                    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            # Flexible scheduling + multiple recipients (JSON columns).
            await conn.execute(text("""
                ALTER TABLE scheduled_reports
                    ADD COLUMN IF NOT EXISTS times              TEXT,
                    ADD COLUMN IF NOT EXISTS days_of_week       TEXT,
                    ADD COLUMN IF NOT EXISTS days_of_month      TEXT,
                    ADD COLUMN IF NOT EXISTS telegram_chat_ids  TEXT
            """))
        print("Schema migration: max_cover_days + product_barcodes + percentile columns + store config + auto_report + scheduled_reports ensured")
    except Exception as e:
        print(f"Schema migration warning: {e}")

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
        print(f"Scheduler start warning: {e}")

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
        print(f"Scheduler shutdown warning: {e}")
    SchemaContext.shutdown()
    print("SchemaContext shut down")

from app.api.v1.routes import analytics, chatbot, stores, products, reports, report_presets, google_sheets, saved_queries, replenishment, store_filters, barcodes, scheduled_reports

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


@app.get("/")
def root():
    return {"message": "BI Dashboard API", "version": settings.VERSION}

@app.get("/health")
def health_check():
    return {"status": "healthy"}



# Version: 1.0.0

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
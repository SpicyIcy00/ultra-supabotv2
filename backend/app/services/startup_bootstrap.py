"""Legacy boot writes, retained for production compatibility.

Run explicitly when provisioning a staging clone; normal staging boot disables
STARTUP_BOOTSTRAP_ENABLED. See ops/GEORGE_INTEGRATION_V1.md for classification.
This is outside Bob and uses the application role.
"""

async def bootstrap():
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
            # Dashboard defaults (which stores / vending machines are
            # pre-selected) — server-side so they apply on every device.
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS dashboard_defaults (
                    scope       VARCHAR(20)  NOT NULL,
                    item_id     VARCHAR(64)  NOT NULL,
                    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now()),
                    PRIMARY KEY (scope, item_id)
                )
            """))
            # Flexible scheduling + multiple recipients (JSON columns).
            await conn.execute(text("""
                ALTER TABLE scheduled_reports
                    ADD COLUMN IF NOT EXISTS times              TEXT,
                    ADD COLUMN IF NOT EXISTS days_of_week       TEXT,
                    ADD COLUMN IF NOT EXISTS days_of_month      TEXT,
                    ADD COLUMN IF NOT EXISTS day_times          TEXT,
                    ADD COLUMN IF NOT EXISTS telegram_chat_ids  TEXT
            """))
        print("Schema migration: max_cover_days + product_barcodes + percentile columns + store config + auto_report + scheduled_reports ensured")
    except Exception as e:
        print(f"Schema migration warning: {type(e).__name__}")

    # --- Warehouse Packing step 1: auth + role-based page access ---
    # Mirrors backend/sql/001_auth_roles.sql so a fresh deploy self-heals.
    #
    # Deliberately its own transaction: engine.begin() rolls back everything on
    # any failure, so sharing a block with the migrations above would mean one
    # unrelated broken statement silently leaves the app with no way to log in.
    try:
        from app.core.database import engine
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS app_users (
                    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                    username      VARCHAR(64)  NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    role          VARCHAR(32)  NOT NULL DEFAULT 'warehouse_staff',
                    display_name  VARCHAR(120),
                    active        BOOLEAN      NOT NULL DEFAULT TRUE,
                    created_at    TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS role_page_access (
                    role     VARCHAR(32)  NOT NULL,
                    page_key VARCHAR(64)  NOT NULL,
                    enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
                    PRIMARY KEY (role, page_key)
                )
            """))
            # Seed the page matrix (never overwrites toggles you have changed)
            await conn.execute(text("""
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
                ON CONFLICT (role, page_key) DO NOTHING
            """))
            # Bootstrap admin — username 'admin', password 'ChangeMe!2026'.
            # CHANGE THIS PASSWORD after the first login; the hash is public.
            await conn.execute(text("""
                INSERT INTO app_users (username, password_hash, role, display_name, active)
                VALUES (
                    'admin',
                    '$2b$12$pUaBn6sOnpQ4yTkBjCYpQOfdyvCRXgPEWjHb8SC0vWx2hqUEItxN2',
                    'admin',
                    'Administrator',
                    TRUE
                )
                ON CONFLICT (username) DO NOTHING
            """))
            # --- Step 1b: passcode-only login (no username) ---
            await conn.execute(text(
                "ALTER TABLE app_users ADD COLUMN IF NOT EXISTS passcode_hash VARCHAR(255)"
            ))
            # Seed a passcode for admin only if it has none, so a passcode
            # changed from the admin screen is never reset by a redeploy.
            await conn.execute(text("""
                UPDATE app_users
                SET passcode_hash = '$2b$12$9oTe/PBeAYgkXHNEWCsEyecFBrBk1qKTFf9CYJmubwBms2rgXW3Pu'
                WHERE username = 'admin' AND passcode_hash IS NULL
            """))
            # The shared warehouse account. password_hash is unused under
            # passcode login but is NOT NULL, so it gets an unmatchable marker.
            await conn.execute(text("""
                INSERT INTO app_users (username, password_hash, passcode_hash, role, display_name, active)
                VALUES (
                    'warehouse',
                    'x',
                    '$2b$12$bBY9rl0E0q7M94GxIFdjQ.Sl4anWcfmrlviSJgnCpyD9Z6ReBOn6i',
                    'warehouse_staff',
                    'Warehouse',
                    TRUE
                )
                ON CONFLICT (username) DO NOTHING
            """))
            # Report actual state, not just "ran without raising" — an empty
            # app_users table is the difference between a working login and a
            # locked-out deploy, and it is worth seeing in the Railway logs.
            users = (await conn.execute(
                text("SELECT count(*) FROM app_users WHERE active AND passcode_hash IS NOT NULL")
            )).scalar()
            grants = (await conn.execute(
                text("SELECT count(*) FROM role_page_access WHERE enabled")
            )).scalar()
        print(f"Auth migration: app_users ensured ({users} account(s) able to sign in, {grants} page grant(s))")
    except Exception as e:
        print(f"AUTH MIGRATION FAILED — login will not work: {type(e).__name__}")

    # --- Warehouse Packing step 2: packing schema ---
    # Mirrors backend/sql/003_packing_schema.sql. Own transaction for the same
    # reason as the auth block above.
    try:
        from app.core.database import engine
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_weight_g NUMERIC"
            ))
            await conn.execute(text(
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS nickname TEXT"
            ))
            # This was an expression index on lower(nickname). SQLAlchemy's
            # inspector reports column_names as [None] for expression indexes,
            # which crashed SchemaContext's cache builder on startup. It also
            # bought nothing: product search is ILIKE '%term%', which no btree
            # index can serve, over ~115 rows.
            await conn.execute(text("DROP INDEX IF EXISTS ix_products_nickname"))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS packing_lists (
                    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                    category   TEXT,
                    created_by UUID         REFERENCES app_users(id),
                    status     TEXT         NOT NULL DEFAULT 'pending'
                                            CHECK (status IN ('pending', 'in_progress', 'done')),
                    created_at TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_packing_lists_created_at ON packing_lists (created_at DESC)"
            ))
            # total_kg / total_packs are generated so the arithmetic can never
            # come from a client. FLOOR on total_packs: a partial pack is not a
            # pack. NULLIF guards a zero/NULL snapshot from failing the insert.
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS packing_items (
                    id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                    packing_list_id        UUID         NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
                    product_id             VARCHAR(24)  NOT NULL REFERENCES products(id),
                    unit                   TEXT         NOT NULL CHECK (unit IN ('packs', 'grams')),
                    quantity               NUMERIC      NOT NULL,
                    pack_weight_g_snapshot NUMERIC,
                    total_kg NUMERIC GENERATED ALWAYS AS (
                        CASE WHEN unit = 'packs'
                             THEN quantity * pack_weight_g_snapshot / 1000
                             ELSE quantity / 1000
                        END
                    ) STORED,
                    total_packs NUMERIC GENERATED ALWAYS AS (
                        CASE WHEN unit = 'packs'
                             THEN quantity
                             ELSE FLOOR(quantity / NULLIF(pack_weight_g_snapshot, 0))
                        END
                    ) STORED,
                    actual_packed NUMERIC,
                    remarks       TEXT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('Asia/Manila', now())
                )
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_packing_items_list ON packing_items (packing_list_id)"
            ))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_packing_items_product ON packing_items (product_id)"
            ))
            # Human-readable list reference (PL0001…), derived from a sequence
            # so concurrent creates cannot collide.
            await conn.execute(text("CREATE SEQUENCE IF NOT EXISTS packing_lists_seq"))
            await conn.execute(text(
                "ALTER TABLE packing_lists ADD COLUMN IF NOT EXISTS seq BIGINT"
            ))
            await conn.execute(text(
                "ALTER TABLE packing_lists ALTER COLUMN seq "
                "SET DEFAULT nextval('packing_lists_seq')"
            ))
            # Backfill oldest-first so numbering follows creation order.
            await conn.execute(text("""
                WITH ordered AS (
                    SELECT id, row_number() OVER (ORDER BY created_at) AS rn
                    FROM packing_lists
                    WHERE seq IS NULL
                )
                UPDATE packing_lists p
                SET seq = o.rn
                FROM ordered o
                WHERE p.id = o.id
            """))
            # is_called = false: the next nextval() returns exactly this value,
            # so numbering continues without a gap.
            await conn.execute(text("""
                SELECT setval(
                    'packing_lists_seq',
                    (SELECT COALESCE(MAX(seq), 0) + 1 FROM packing_lists),
                    false
                )
            """))
            await conn.execute(text("""
                ALTER TABLE packing_lists ADD COLUMN IF NOT EXISTS reference TEXT
                    GENERATED ALWAYS AS ('PL' || lpad(seq::text, 4, '0')) STORED
            """))
            await conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_packing_lists_reference "
                "ON packing_lists (reference)"
            ))
            # These columns hold the Manila wall-clock reading, matching every
            # other table in this schema. A brief revision defaulted them to
            # now() instead, which would have left packing the only tables
            # storing true UTC instants — 8 hours apart from transactions and
            # products on any join. Restated here so a database that took the
            # now() default gets put back.
            #
            # Clients must render these WITHOUT converting zones; see
            # formatDateTime in frontend/src/services/packingApi.ts.
            await conn.execute(text(
                "ALTER TABLE packing_lists ALTER COLUMN created_at "
                "SET DEFAULT timezone('Asia/Manila', now())"
            ))
            await conn.execute(text(
                "ALTER TABLE packing_items ALTER COLUMN created_at "
                "SET DEFAULT timezone('Asia/Manila', now())"
            ))
            seeded = (await conn.execute(
                text("SELECT count(*) FROM products WHERE pack_weight_g IS NOT NULL")
            )).scalar()
        print(f"Packing migration: schema ensured ({seeded} product(s) with a pack weight)")
    except Exception as e:
        print(f"PACKING MIGRATION FAILED: {type(e).__name__}")


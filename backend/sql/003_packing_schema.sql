-- ===========================================================================
-- Warehouse Packing — Step 2: schema
--
-- Run these statements one at a time in the Supabase SQL editor.
-- Idempotent — safe to re-run.
--
-- Mirrored in backend/app/main.py's startup block so a fresh deploy self-heals.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. products: per-pack weight, and the informal name staff already use.
--
--    nickname is what warehouse staff call the product ("Dikiam 140g"), as
--    opposed to products.name, the catalogue name ("Aji Dikiam Sweet Taiwan").
--    Staff search by nickname; everything still ties back to the real id/SKU.
--
--    products.category is deliberately untouched — it means something else in
--    this system (POS pricing category). Packing category lives on the list.
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_weight_g NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS nickname      TEXT;

-- An earlier revision created an expression index here, ON products
-- (lower(nickname)). SQLAlchemy's inspector reports column_names as [None] for
-- expression indexes, which crashed SchemaContext's cache builder and took the
-- whole app down on startup. Drop it if it is still around.
--
-- No replacement: product search is ILIKE '%term%', which no btree index can
-- serve anyway, across roughly 115 packable products.
DROP INDEX IF EXISTS ix_products_nickname;


-- ---------------------------------------------------------------------------
-- 2. packing_lists — one physical packing run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packing_lists (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    category   TEXT,
    created_by UUID         REFERENCES app_users(id),
    status     TEXT         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'done')),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now())
);

CREATE INDEX IF NOT EXISTS ix_packing_lists_created_at ON packing_lists (created_at DESC);


-- ---------------------------------------------------------------------------
-- 3. packing_items — one product on a list.
--
--    pack_weight_g_snapshot is copied from products.pack_weight_g at the time
--    the row is added and never live-referenced: packaging sizes change, and a
--    list packed last month must keep reporting the weights it was packed at.
--
--    total_kg / total_packs are generated, so the arithmetic cannot drift from
--    whatever a client believes. NULLIF guards the divide: a snapshot of 0 or
--    NULL yields NULL rather than failing the insert.
--
--    total_packs uses FLOOR — "how many COMPLETE packs can this much raw
--    product make". A partial pack is not a pack.
-- ---------------------------------------------------------------------------
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
);

CREATE INDEX IF NOT EXISTS ix_packing_items_list    ON packing_items (packing_list_id);
CREATE INDEX IF NOT EXISTS ix_packing_items_product ON packing_items (product_id);


-- ---------------------------------------------------------------------------
-- 4. Let warehouse_staff reach the packing page (idempotent).
-- ---------------------------------------------------------------------------
INSERT INTO role_page_access (role, page_key, enabled)
VALUES ('warehouse_staff', 'packing', TRUE), ('admin', 'packing', TRUE)
ON CONFLICT (role, page_key) DO NOTHING;

"""
George — product catalog tool.

Two public functions: get_product() and get_product_categories().

Architecture rules this module is built to (see CLAUDE.md):
  - No freehand SQL. One SELECT template with an explicit column list; every
    predicate is either read from definitions/metrics.yaml or a bound
    parameter. `products.embedding` is a pgvector column and is never selected.
  - Every return is {rows, meta}, with source_table, filters_applied and
    snapshot_timestamp.
  - No business definition is hardcoded. Category normalization, the SKU
    ambiguity policy, the barcode match and the name search columns all come
    from metrics.yaml.
  - Read-only Postgres role, enforced in tools/_common.connect().

This is a CATALOG tool. It deliberately returns no stock and no sales figures —
those live in tools/inventory.py and tools/sales.py, and duplicating them here
would mean two definitions of the same number.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional


from ._common import (
    DICT_ROW,
    DEFAULT_MAX_ROWS as _MAX_ROWS,
    DEFS_PATH as _DEFS_PATH,
    connect as _connect,
    load_defs as _load_defs,
    req as _req,
)

# Explicit column list. `embedding` (pgvector, entirely NULL) is excluded, and
# there is no SELECT * anywhere — business_rules.yaml:1214 negative example 2.
_COLUMNS = [
    "p.id",
    "p.sku",
    "p.name",
    "p.nickname",
    "p.category AS category_raw",
    "p.unit_price",
    "p.cost",
    "p.tags",
    "p.pack_weight_g",
    "p.track_stock_level",
    "p.is_parent_product",
    "p.barcode AS barcode_raw",
]


def _split_barcodes(raw: Optional[str]) -> list[str]:
    """products.barcode is a comma-separated list — see metrics.yaml products.barcode."""
    if not raw:
        return []
    return [b for b in (x.strip() for x in raw.replace(" ", "").split(",")) if b]


def resolve_category(cur: Any, defs: dict, category: str) -> tuple[str, Optional[str]]:
    """
    The catalogue's own spelling of a category the caller named, and a note
    when it differed — or a refusal that NAMES EVERY CATEGORY (P2S.7).

    WHY. "analyze tradsnax per store" cost four reads of spelling in both
    P2S.6 runs: `category='TRADSNAX'` matched nothing (the catalogue says
    `tradsnax`), a name search for it matched nothing, and so did `snax`,
    before `trad` turned up a product that happened to carry the category.
    An exact match that returns nothing for a real category is an answer that
    looks like "no products", which is the thing a refusal exists to prevent.

    So one grouped statement over the catalogue, the same one the categories
    read uses: an exact match stands; a match ignoring case and surrounding
    space is the category; anything else is refused with the list, so the
    next read is the right one.
    """
    cat_sql = _req(defs, "products.category_normalization.sql")
    cur.execute(f"SELECT DISTINCT {cat_sql} AS category FROM products p")
    known = sorted(str(r["category"]) for r in cur.fetchall())
    if category in known:
        return category, None
    want = str(category).strip().lower()
    folded = [k for k in known if k.strip().lower() == want]
    if len(folded) == 1:
        return folded[0], (f"category {category!r} is spelled {folded[0]!r} in the "
                           f"catalogue, and that is what was read")
    raise ValueError(
        f"No category is called {category!r}. The categories are: "
        f"{', '.join(known)} (metrics.yaml: products.category_normalization)."
    )


def get_product(
    sku: Optional[str] = None,
    name: Optional[str] = None,
    category: Optional[str] = None,
    barcode: Optional[str] = None,
) -> dict:
    """
    Look up products in the catalog.

    Args:
        sku:      case-insensitive exact SKU. SKUs are NOT unique — every match
                  is returned as its own row and the ambiguity is reported in
                  meta. Nothing is merged.
        name:     case-insensitive substring, searched across name and nickname.
                  Substring only, never fuzzy.
        category: a normalized category, matched ignoring case. 'Uncategorized'
                  selects products with a NULL or blank category. One that
                  does not exist is refused with every category named.
        barcode:  exact barcode. Matches an element of the comma-separated
                  products.barcode list, or a row in product_barcodes.

    All four omitted returns the whole catalog, capped and reported as
    truncated. Multiple arguments are ANDed.

    Returns:
        {"rows": [...], "meta": {...}}. A non-empty meta["notice"] MUST be
        surfaced to the user.
    """
    defs = _load_defs()
    cat_sql = _req(defs, "products.category_normalization.sql")
    uncat = _req(defs, "products.category_normalization.uncategorized_label")

    predicates: list[str] = []
    params: dict[str, Any] = {}
    filters_applied: list[str] = []
    matched_on: list[str] = []
    source_table = "products"
    joins = ""

    if sku is not None:
        predicates.append("lower(p.sku) = lower(%(sku)s)")
        params["sku"] = sku
        filters_applied.append(
            f"lower(p.sku) = lower({sku!r})   # metrics.yaml: products.sku (match: case_insensitive)"
        )
        matched_on.append("sku")

    if name is not None:
        # name OR nickname, both from the yaml's search_columns.
        cols = _req(defs, "products.name.search_columns")
        ors = " OR ".join(f"p.{c} ILIKE %(name)s" for c in cols)
        predicates.append(f"({ors})")
        params["name"] = f"%{name}%"
        filters_applied.append(
            f"({' OR '.join(f'p.{c}' for c in cols)}) ILIKE '%{name}%'"
            f"   # metrics.yaml: products.name (substring, never fuzzy)"
        )
        matched_on.append("name")

    if category is not None:
        predicates.append(f"{cat_sql} = %(category)s")
        params["category"] = category
        filters_applied.append(
            f"{cat_sql} = {category!r}"
            f"   # metrics.yaml: products.category_normalization"
        )
        matched_on.append("category")

    if barcode is not None:
        # Two sources, both required — see metrics.yaml products.barcode.
        # products.barcode is a LIST: split and match an exact element, never
        # `=` (misses multi-value rows) and never LIKE (matches substrings of
        # other barcodes). product_barcodes holds 22 barcodes found nowhere in
        # products.barcode.
        primary = _req(defs, "products.barcode.match_sql")
        secondary = _req(defs, "products.barcode.secondary_table")
        predicates.append(
            f"({primary} OR EXISTS ("
            f"SELECT 1 FROM {secondary} pb "
            f"WHERE pb.product_id = p.id AND {_req(defs, 'products.barcode.secondary_match_sql')}))"
        )
        params["barcode"] = str(barcode).strip()
        filters_applied.append(
            f"barcode {barcode!r} matches an element of products.barcode OR a "
            f"{secondary} row   # metrics.yaml: products.barcode"
        )
        matched_on.append("barcode")
        source_table = "products + product_barcodes"

    where_sql = " AND ".join(predicates) if predicates else "true"
    if not predicates:
        filters_applied.append("none — full catalog listing")

    sql = (
        f"SELECT {', '.join(_COLUMNS)},\n"
        f"       {cat_sql} AS category\n"
        f"FROM products p{joins}\n"
        f"WHERE {where_sql}\n"
        f"ORDER BY p.name, p.sku\n"
        f"LIMIT {_MAX_ROWS}"
    )

    notices: list[dict] = []

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            if category is not None:
                params["category"], spelled = resolve_category(cur, defs, category)
                if spelled:
                    filters_applied.append(spelled)

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]

            truncated = len(rows) == _MAX_ROWS
            total_matching: Optional[int] = None
            if truncated:
                cur.execute(
                    f"SELECT COUNT(*) AS n FROM products p WHERE {where_sql}", params
                )
                total_matching = cur.fetchone()["n"]

            # Which product_barcodes rows actually contributed, so a caller can
            # tell a catalog barcode from a generated one.
            barcode_source: Optional[dict] = None
            if barcode is not None and rows:
                ids = [r["id"] for r in rows]
                cur.execute(
                    "SELECT product_id, barcode FROM product_barcodes "
                    "WHERE product_id = ANY(%s) AND barcode = %s",
                    (ids, params["barcode"]),
                )
                via_secondary = {r["product_id"] for r in cur.fetchall()}
                barcode_source = {
                    "matched_products_barcode": [
                        r["id"] for r in rows if r["id"] not in via_secondary
                    ],
                    "matched_product_barcodes_table": sorted(via_secondary),
                }

    # ---- shape rows ------------------------------------------------------
    for r in rows:
        r["barcodes"] = _split_barcodes(r.pop("barcode_raw"))
        r["matched_on"] = list(matched_on)
        for k in ("unit_price", "cost", "pack_weight_g"):
            if isinstance(r.get(k), Decimal):
                r[k] = float(r[k])

    # ---- SKU ambiguity ---------------------------------------------------
    # SKUs are not unique and the colliding rows are unrelated products. They
    # are returned SEPARATELY here (one row each) and the collision is named,
    # per metrics.yaml products.sku.ambiguity_policy = separate_or_refuse.
    sku_ambiguity: Optional[dict] = None
    if sku is not None and len(rows) > 1:
        sku_ambiguity = {
            "sku": sku,
            "product_count": len(rows),
            "products": [
                {
                    "id": r["id"],
                    "sku": r["sku"],
                    "name": r["name"],
                    "category": r["category"],
                    "unit_price": r["unit_price"],
                }
                for r in rows
            ],
        }
        notices.append({
            "kind": "ambiguous_sku",
            "message": (
                f"SKU {sku!r} matches {len(rows)} DIFFERENT products, not one "
                f"product with variants: "
                + "; ".join(
                    f"{r['name']} ({r['category']}, PHP {r['unit_price']})" for r in rows
                )
                + ". They are returned as separate rows, not one product."
            ),
            "guidance": (
                "Never sum them; disambiguate with the product_id filter."
            ),
            "source": "definitions/metrics.yaml: products.sku",
        })

    # ---- data quality ----------------------------------------------------
    uncategorized = [r["id"] for r in rows if r["category"] == uncat]
    no_barcode = [r["id"] for r in rows if not r["barcodes"]]
    seen: dict[str, list[str]] = {}
    for r in rows:
        seen.setdefault((r["sku"] or "").lower(), []).append(r["id"])
    dup_groups = {k: v for k, v in seen.items() if len(v) > 1}

    data_quality = {
        "uncategorized": len(uncategorized),
        "uncategorized_note": (
            f"Products with a NULL or blank category, shown as {uncat!r} rather "
            f"than dropped. Database-wide, 83 of 3,678 products are "
            f"uncategorised."
        ),
        "missing_barcode": len(no_barcode),
        "missing_barcode_note": (
            "Products with no barcode at all. Database-wide, 409 of 3,678."
        ),
        "duplicate_sku_groups": len(dup_groups),
        "duplicate_sku_note": (
            "Distinct SKU values in this result that map to more than one "
            "product. Database-wide, 68 SKUs collide case-insensitively."
        ),
    }
    if dup_groups and sku is None:
        notices.append({
            "kind": "duplicate_skus_in_result",
            "message": (
                f"{len(dup_groups)} SKU value(s) in this result map to more than "
                f"one product: "
                + ", ".join(f"{k!r} x{len(v)}" for k, v in list(dup_groups.items())[:5])
                + "."
            ),
            "guidance": "Do not treat SKU as a key.",
            "source": "definitions/metrics.yaml: products.sku",
        })

    meta: dict[str, Any] = {
        "source_table": source_table,
        "filters_applied": filters_applied,
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "row_count": len(rows),
        "truncated": truncated,
        "row_limit": _MAX_ROWS,
        "data_quality": data_quality,
        # No money measure is aggregated here, so the net_sales/product_revenue
        # reconciliation does not apply. Recorded explicitly so a reader can see
        # it was considered rather than forgotten.
        "reconciliation": {
            "applicable": False,
            "reason": (
                "get_product aggregates no money measure; it lists catalog rows. "
                "unit_price and cost are per-product attributes, not sums."
            ),
        },
    }
    if total_matching is not None:
        meta["total_matching"] = total_matching
    if sku_ambiguity is not None:
        meta["sku_ambiguity"] = sku_ambiguity
    if barcode_source is not None:
        meta["barcode_source"] = barcode_source
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}


def get_product_categories() -> dict:
    """
    Every category in the catalogue, with how many products carry it.

    WHY THIS EXISTS (2026-09-15). The owner asked for categories in the `@`
    menu and there was no read that could answer it. `get_product(category=)`
    FILTERS by one exact category and `get_sales(group_by='category')` groups
    sales by it; nothing returned the SET, so a menu of categories could only
    have been a list typed into a client — the thing CLAUDE.md forbids about
    the store list, for the same reason.

    NOT IN THE MODEL'S SCHEMA, deliberately. This is a person's menu, not a
    question George is asked: he reaches for `get_product(category=)` when a
    category is named, and adding a tool would rewrite the cached prefix for
    every request to serve a completion list. `TOOL_FUNCTIONS` is what a pin
    or a workflow step may hold, and nothing here is pinnable — it returns no
    figure about the business, only how many rows carry a label.

    The count is a count of CATALOGUE ROWS, not of anything sold or held, and
    it says so in meta. Measured 2026-09-15: 17 categories over 3,728
    products, the largest 968 and the smallest 1.
    """
    defs = _load_defs()
    cat_sql = _req(defs, "products.category_normalization.sql")
    uncat = _req(defs, "products.category_normalization.uncategorized_label")

    # One SELECT template, no predicate the caller can reach: the whole
    # catalogue, grouped by the normalized category the definitions declare.
    sql = (
        f"SELECT {cat_sql} AS category,\n"
        f"       COUNT(*) AS products\n"
        f"FROM products p\n"
        f"GROUP BY 1\n"
        f"ORDER BY 2 DESC, 1 ASC"
    )
    with _connect() as conn, conn.cursor(row_factory=DICT_ROW) as cur:
        cur.execute("SELECT now() AT TIME ZONE 'Asia/Manila' AS snapshot")
        snapshot = cur.fetchone()["snapshot"]
        cur.execute(sql)
        rows = [{"category": r["category"], "products": int(r["products"])}
                for r in cur.fetchall()]

    return {
        "rows": rows,
        "meta": {
            "source_table": "products",
            "filters_applied": [
                f"{cat_sql} AS category   # metrics.yaml: "
                f"products.category_normalization",
            ],
            "snapshot_timestamp": snapshot.isoformat() if snapshot else None,
            "definitions_path": str(_DEFS_PATH),
            "row_count": len(rows),
            "uncategorized_label": uncat,
            # SAID PLAINLY, because "968" beside a category invites reading it
            # as sales. It is how many catalogue rows wear the label.
            "products_is": "a count of catalogue rows carrying the category, "
                           "not a quantity sold, held or ordered",
            "reconciliation": {
                "applicable": False,
                "reason": ("get_product_categories aggregates no money measure; "
                           "it counts catalog rows per label."),
            },
        },
    }

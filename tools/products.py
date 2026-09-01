"""
George — product catalog tool.

One public function: get_product().

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
        category: exact normalized category. 'Uncategorized' selects products
                  with a NULL or blank category.
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
                + ". They are returned as separate rows and must never be "
                "summed. Disambiguate downstream with the product_id filter."
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
                + ". Do not treat SKU as a key."
            ),
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

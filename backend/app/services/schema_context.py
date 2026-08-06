"""
Schema Context Singleton - Optimized Database Schema Inspector

This module provides a singleton pattern for schema introspection to avoid
creating database engines on every request. The schema is cached on startup
and can be manually invalidated when needed.
"""

from sqlalchemy import inspect, create_engine
from sqlalchemy.engine import Engine
from typing import Dict, List, Any, Optional
from datetime import datetime
import yaml
from pathlib import Path


# =============================================================================
# VENDING DOMAIN (Weimi machines, brand "Hello Aji")
#
# Appended verbatim to the schema string handed to Claude. The raw tables are
# synced from the Weimi API by n8n and carry two traps (cents, fake "CNY"
# currency) that the AI must never get wrong, so they are spelled out here
# rather than left to introspection.
# =============================================================================
VENDING_SCHEMA_NOTES = """
## Vending Machine Data (Weimi / brand "Hello Aji")

A SECOND, COMPLETELY SEPARATE data source from the StoreHub retail-store data
above. Synced from the Weimi API by n8n.

```
VendingDevice (1) ----< (many) VendingAisle          (live stock per slot)
VendingDevice (1) ----< (many) VendingOrder (1) ----< (many) VendingOrderLine
```

**Tables:**
- `vending_devices` — the machines. PK `device_code`. `device_name` is the
  human label ("CMG HQ", "OPUS dispenser") — ALWAYS join to this for names,
  never show a bare device_code. Also `device_id`, `cabinet_total`,
  `layer_total`, `aisle_total`, `last_synced_at`.
- `vending_aisles` — live planogram / current stock per aisle. PK `aisle_id`,
  FK `device_code`. `aisle_code`, `goods_id`, `goods_name`, `price` (CENTS),
  `curr_stock`, `max_stock`, `measurement`, `status`, `updated_at`.
  This is CURRENT stock only — it is not history and holds no sales.
- `vending_orders` — order headers. PK `trade_no_in`, FK `device_code`.
  `total_amount` (CENTS), `pay_amount` (CENTS), `pay_status`,
  `trade_start_time` (when the customer started the purchase),
  `pay_end_time`, `is_cart_order`, `ext` (JSON; `ext->>'payWay'` is the payment
  method, e.g. 'gcashpay').
- `vending_order_lines` — **THE VENDING SALES FACT TABLE.** One row = one item
  sold. PK `line_trade_no_in`, FK `order_trade_no_in` → vending_orders,
  FK `device_code`. `aisle_code`, `goods_id`, `goods_name`,
  `goods_purchase_cost` (CENTS), `goods_retail_price` (CENTS),
  `real_price` (CENTS — the amount actually charged, USE THIS FOR REVENUE),
  `goods_amount` (units on the line), `shipment_status`
  (1 = vend succeeded, 3 = vend FAILED — item never dispensed), `shipment_time`.

**Views (already divided by 100 and rounded to 2 decimals — pesos, not cents):**
- `v_vending_orders_php` — vending_orders with peso money columns.
- `v_vending_order_lines_php` — vending_order_lines with peso money columns,
  plus `device_name`, `profit_php`, and a `missing_cost` flag.
- `v_vending_missing_cost` — the products whose `goods_purchase_cost` is 0.

**CRITICAL VENDING RULES:**
1. **CENTS.** Every money column in the RAW vending tables is an integer number
   of cents: 2000 = PHP 20.00. Divide by 100 (`SUM(real_price) / 100.0`) or use
   a `_php` view. NEVER present a raw cents number as pesos.
   The `_php` views are ALREADY in pesos — never divide those again.
2. **The `currency` column says "CNY" — that is a Weimi hardcoding bug.**
   The real currency is PHP (₱). Always report vending money as pesos. The
   `_php` views relabel it correctly. Never say "CNY"/"yuan" about this data.
3. **Sales truth = `vending_order_lines`.** Compute per-product and per-machine
   totals by aggregating that table. There are no stored per-product totals.
4. **Successful sales only:** filter `shipment_status = 1` for revenue/units.
   `shipment_status = 3` means the vend FAILED — count those as failed vends,
   never as sales.
5. **Profit is overstated where cost is missing:** `goods_purchase_cost = 0`
   means the cost was never entered in the Weimi backend, not that the item is
   free. Flag it (see `v_vending_missing_cost` / the `missing_cost` column).
6. **NEVER join vending data to store data.** `vending_order_lines.goods_id`
   has NOTHING to do with `products.id`, and machines are not rows in `stores`.
   Do not UNION or merge the two domains; answer about one or the other.
7. Vending timestamps are timezone-aware — use `AT TIME ZONE 'Asia/Manila'`
   exactly as with store data. Use `shipment_time` for when an item was
   dispensed, `trade_start_time` for when the order began.

**Correct vending query patterns:**

Revenue + units per machine (last 30 days):
```sql
SELECT
    d.device_name,
    SUM(l.real_price) / 100.0 AS total_revenue,
    SUM(l.goods_amount)       AS total_units
FROM vending_order_lines l
INNER JOIN vending_devices d ON l.device_code = d.device_code
WHERE l.shipment_status = 1
  AND l.shipment_time >= (CURRENT_DATE - INTERVAL '30 days') AT TIME ZONE 'Asia/Manila'
GROUP BY d.device_code, d.device_name
ORDER BY total_revenue DESC
LIMIT 100;
```

Top vending products with profit (cost may be missing):
```sql
SELECT
    l.goods_name,
    SUM(l.goods_amount)                                        AS total_units,
    SUM(l.real_price) / 100.0                                  AS total_revenue,
    SUM(l.real_price - l.goods_purchase_cost * l.goods_amount) / 100.0 AS total_profit,
    BOOL_OR(COALESCE(l.goods_purchase_cost, 0) = 0)            AS missing_cost
FROM vending_order_lines l
WHERE l.shipment_status = 1
  AND l.shipment_time >= DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'Asia/Manila')
GROUP BY l.goods_id, l.goods_name
ORDER BY total_revenue DESC
LIMIT 20;
```

Failed vends per machine:
```sql
SELECT
    d.device_name,
    l.goods_name,
    COUNT(*) AS failed_vends
FROM vending_order_lines l
INNER JOIN vending_devices d ON l.device_code = d.device_code
WHERE l.shipment_status = 3
  AND l.shipment_time >= (CURRENT_DATE - INTERVAL '7 days') AT TIME ZONE 'Asia/Manila'
GROUP BY d.device_code, d.device_name, l.goods_name
ORDER BY failed_vends DESC
LIMIT 50;
```

Current stock per machine (low slots first):
```sql
SELECT
    d.device_name,
    a.aisle_code,
    a.goods_name,
    a.curr_stock,
    a.max_stock,
    a.price / 100.0 AS price_php
FROM vending_aisles a
INNER JOIN vending_devices d ON a.device_code = d.device_code
ORDER BY a.curr_stock ASC, d.device_name
LIMIT 100;
```
"""


class SchemaContext:
    """Singleton class for managing database schema context"""

    _instance: Optional['SchemaContext'] = None
    _schema_cache: Optional[str] = None
    _schema_summary_cache: Optional[Dict[str, Any]] = None
    _last_updated: Optional[datetime] = None
    _sync_engine: Optional[Engine] = None
    _business_rules: Optional[Dict[str, Any]] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def initialize(cls, database_url: str, business_rules_path: Optional[str] = None):
        """
        Initialize the schema context with database connection.
        Call this once at application startup.

        Args:
            database_url: PostgreSQL connection string
            business_rules_path: Path to business_rules.yaml file
        """
        instance = cls()

        # Create sync engine for inspection (inspector doesn't support async)
        if instance._sync_engine is None:
            sync_url = database_url.replace('+asyncpg', '+psycopg')
            instance._sync_engine = create_engine(sync_url, pool_pre_ping=True)

        # Load business rules from YAML
        if business_rules_path:
            instance._load_business_rules(business_rules_path)

        # Build initial cache
        instance._build_schema_cache()
        instance._build_summary_cache()
        instance._last_updated = datetime.now()

    @classmethod
    def get_schema(cls) -> str:
        """
        Get the cached database schema formatted for Claude's context.

        Returns:
            Formatted schema description
        """
        instance = cls()
        if instance._schema_cache is None:
            raise RuntimeError("SchemaContext not initialized. Call initialize() first.")
        return instance._schema_cache

    @classmethod
    def get_schema_summary(cls) -> Dict[str, Any]:
        """
        Get cached schema summary with tables and columns.

        Returns:
            Dictionary with table names and their columns
        """
        instance = cls()
        if instance._schema_summary_cache is None:
            raise RuntimeError("SchemaContext not initialized. Call initialize() first.")
        return instance._schema_summary_cache

    @classmethod
    def get_business_rules(cls) -> Dict[str, Any]:
        """
        Get loaded business rules configuration.

        Returns:
            Business rules dictionary
        """
        instance = cls()
        return instance._business_rules or {}

    @classmethod
    def get_column_synonyms(cls) -> Dict[str, List[str]]:
        """
        Get column synonym mappings for fuzzy matching.

        Returns:
            Dictionary mapping canonical names to synonym lists
        """
        rules = cls.get_business_rules()
        return rules.get('column_synonyms', {})

    @classmethod
    def get_default_filters(cls) -> List[Dict[str, Any]]:
        """
        Get default filters that should always be applied.

        Returns:
            List of filter rules
        """
        rules = cls.get_business_rules()
        return rules.get('default_filters', [])

    @classmethod
    def invalidate(cls):
        """
        Invalidate the schema cache and rebuild.
        Call this after database migrations or schema changes.
        """
        instance = cls()
        if instance._sync_engine is None:
            raise RuntimeError("SchemaContext not initialized. Call initialize() first.")

        instance._build_schema_cache()
        instance._build_summary_cache()
        instance._last_updated = datetime.now()

    @classmethod
    def get_last_updated(cls) -> Optional[datetime]:
        """Get the timestamp when schema was last updated"""
        instance = cls()
        return instance._last_updated

    @classmethod
    def shutdown(cls):
        """
        Dispose of database engine resources.
        Call this at application shutdown.
        """
        instance = cls()
        if instance._sync_engine:
            instance._sync_engine.dispose()
            instance._sync_engine = None

    def _load_business_rules(self, rules_path: str):
        """Load business rules from YAML file"""
        path = Path(rules_path)
        if path.exists():
            with open(path, 'r') as f:
                self._business_rules = yaml.safe_load(f)
        else:
            # Default business rules if file doesn't exist
            self._business_rules = {
                'column_synonyms': {
                    'name': ['product_name', 'name', 'item', 'title', 'product'],
                    'revenue': ['net_amount', 'revenue', 'total_revenue', 'amount', 'sales', 'item_total'],
                    'units': ['units', 'quantity', 'qty', 'units_sold', 'total_quantity'],
                    'date': ['created_at', 'date', 'day', 'month', 'hour', 'timestamp', 'transaction_time'],
                    'store': ['store_name', 'store', 'location'],
                    'category': ['category', 'category_name', 'product_category']
                },
                'default_filters': [
                    {
                        'table': 'new_transactions',
                        'field': 'is_cancelled',
                        'value': False,
                        'always_apply': True,
                        'description': 'Filter out cancelled transactions',
                        'sql_template': 'is_cancelled = false'
                    }
                ],
                'date_defaults': {
                    'timezone': 'Asia/Manila',
                    'week_start': 'Monday',
                    'time_format': '12-hour'
                }
            }

    def _build_schema_cache(self):
        """Build the formatted schema string for Claude"""
        inspector = inspect(self._sync_engine)

        schema_parts = ["# Database Schema\n"]
        schema_parts.append("## Available Tables\n")

        # Get all tables
        tables = inspector.get_table_names()
        views = self._get_view_names(inspector)

        for table_name in sorted(tables):
            schema_parts.append(f"\n### Table: `{table_name}`\n")

            # Get columns
            columns = inspector.get_columns(table_name)
            schema_parts.append("**Columns:**\n")
            for col in columns:
                col_name = col['name']
                col_type = str(col['type'])
                nullable = "NULL" if col['nullable'] else "NOT NULL"
                default = f", DEFAULT: {col['default']}" if col.get('default') else ""
                schema_parts.append(f"- `{col_name}` ({col_type}, {nullable}{default})\n")

            # Get primary keys
            pk = inspector.get_pk_constraint(table_name)
            if pk and pk.get('constrained_columns'):
                pk_cols = ', '.join(pk['constrained_columns'])
                schema_parts.append(f"\n**Primary Key:** {pk_cols}\n")

            # Get foreign keys
            fks = inspector.get_foreign_keys(table_name)
            if fks:
                schema_parts.append("\n**Foreign Keys:**\n")
                for fk in fks:
                    local_cols = ', '.join(fk['constrained_columns'])
                    ref_table = fk['referred_table']
                    ref_cols = ', '.join(fk['referred_columns'])
                    schema_parts.append(f"- `{local_cols}` → `{ref_table}({ref_cols})`\n")

            # Get indexes
            indexes = inspector.get_indexes(table_name)
            if indexes:
                schema_parts.append("\n**Indexes:**\n")
                for idx in indexes:
                    idx_name = idx['name']
                    idx_cols = ', '.join(idx['column_names'])
                    unique = "UNIQUE " if idx.get('unique') else ""
                    schema_parts.append(f"- {unique}INDEX `{idx_name}` on ({idx_cols})\n")

        # Views (peso-formatted / resolved helper views) — queryable like tables
        if views:
            schema_parts.append("\n## Available Views\n")
            for view_name in sorted(views):
                schema_parts.append(f"\n### View: `{view_name}`\n")
                try:
                    columns = inspector.get_columns(view_name)
                except Exception:
                    continue
                schema_parts.append("**Columns:**\n")
                for col in columns:
                    col_name = col['name']
                    col_type = str(col['type'])
                    schema_parts.append(f"- `{col_name}` ({col_type})\n")

        # Add relationships summary
        schema_parts.append("\n## Table Relationships\n")
        schema_parts.append("""
```
Store (1) ----< (many) Transaction (1) ----< (many) TransactionItem >---- (many) Product
Store (1) ----< (many) Inventory >---- (many) Product
```

**Key Relationships:**
- Each Transaction belongs to one Store (via store_id)
- Each Transaction has many TransactionItems (via ref_id/transaction_ref_id)
- Each TransactionItem references one Product (via product_id)
- Each Inventory entry links one Product to one Store (composite key)
""")

        # Vending domain (Weimi machines, brand "Hello Aji") — separate data source
        schema_parts.append(VENDING_SCHEMA_NOTES)

        self._schema_cache = ''.join(schema_parts)

    @staticmethod
    def _get_view_names(inspector) -> List[str]:
        """
        Return view names (including materialized views when supported).

        Views are NOT returned by get_table_names(), so without this the
        peso-formatted vending views and v_new_transaction_items_resolved would
        be invisible to the AI and rejected by the query validator.
        """
        names = []
        try:
            names.extend(inspector.get_view_names())
        except Exception:
            pass
        try:
            names.extend(inspector.get_materialized_view_names())
        except Exception:
            # Not available on older SQLAlchemy / dialects
            pass
        return sorted(set(names))

    def _build_summary_cache(self):
        """Build the schema summary dictionary"""
        inspector = inspect(self._sync_engine)
        summary = {}

        for table_name in inspector.get_table_names():
            columns = inspector.get_columns(table_name)
            summary[table_name] = {
                'columns': [
                    {
                        'name': col['name'],
                        'type': str(col['type']),
                        'nullable': col['nullable']
                    }
                    for col in columns
                ],
                'primary_key': inspector.get_pk_constraint(table_name).get('constrained_columns', []),
                'foreign_keys': [
                    {
                        'columns': fk['constrained_columns'],
                        'references': f"{fk['referred_table']}({', '.join(fk['referred_columns'])})"
                    }
                    for fk in inspector.get_foreign_keys(table_name)
                ]
            }

        # Views have columns but no PK/FK metadata — register them too so they
        # pass the query validator's table whitelist and column checks.
        for view_name in self._get_view_names(inspector):
            if view_name in summary:
                continue
            try:
                columns = inspector.get_columns(view_name)
            except Exception:
                continue
            summary[view_name] = {
                'columns': [
                    {
                        'name': col['name'],
                        'type': str(col['type']),
                        'nullable': col.get('nullable', True)
                    }
                    for col in columns
                ],
                'primary_key': [],
                'foreign_keys': []
            }

        self._schema_summary_cache = summary


# Convenience functions for backward compatibility
async def get_database_schema() -> str:
    """Get the cached database schema (async for compatibility)"""
    return SchemaContext.get_schema()


async def get_schema_summary() -> Dict[str, Any]:
    """Get cached schema summary (async for compatibility)"""
    return SchemaContext.get_schema_summary()

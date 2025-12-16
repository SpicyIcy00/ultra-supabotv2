"""
Dynamic Database Schema Inspector for AI Chatbot

This module inspects the actual database schema using SQLAlchemy's inspector
to provide accurate, up-to-date schema information to Claude for SQL generation.
"""

from sqlalchemy import inspect, MetaData
from sqlalchemy.engine import Engine
from typing import Dict, List, Any


async def get_database_schema() -> str:
    """
    Dynamically inspect the database schema and return a formatted string
    for Claude's context.

    Returns:
        Formatted schema description including tables, columns, types, and relationships
    """
    # Get sync engine for inspection (inspector doesn't support async)
    from sqlalchemy import create_engine
    from app.core.config import settings

    # Create sync connection for inspection
    sync_url = settings.DATABASE_URL.replace('+asyncpg', '')
    sync_engine = create_engine(sync_url)

    inspector = inspect(sync_engine)

    schema_parts = ["# Database Schema\n"]
    schema_parts.append("## Available Tables\n")

    # Get all tables
    tables = inspector.get_table_names()

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

    sync_engine.dispose()

    return ''.join(schema_parts)


async def get_schema_summary() -> Dict[str, Any]:
    """
    Get a summary of available tables and columns for quick reference.

    Returns:
        Dictionary with table names and their columns
    """
    from sqlalchemy import create_engine
    from app.core.config import settings

    sync_url = settings.DATABASE_URL.replace('+asyncpg', '')
    sync_engine = create_engine(sync_url)
    inspector = inspect(sync_engine)

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

    sync_engine.dispose()

    return summary


async def get_sample_data(table_name: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Get sample rows from a table to help Claude understand data patterns.

    Args:
        table_name: Name of the table
        limit: Number of sample rows to retrieve

    Returns:
        List of sample rows as dictionaries
    """
    from sqlalchemy import text
    from app.core.database import get_db

    async for db in get_db():
        try:
            query = text(f"SELECT * FROM {table_name} LIMIT :limit")
            result = await db.execute(query, {"limit": limit})
            rows = result.mappings().all()

            # Convert to list of dicts, handling special types
            samples = []
            for row in rows:
                sample = {}
                for key, value in row.items():
                    # Convert datetime to string, handle None
                    if value is None:
                        sample[key] = None
                    elif hasattr(value, 'isoformat'):
                        sample[key] = value.isoformat()
                    else:
                        sample[key] = str(value)
                samples.append(sample)

            return samples
        except Exception as e:
            print(f"Error fetching sample data from {table_name}: {e}")
            return []


async def build_claude_context() -> str:
    """
    Build comprehensive context for Claude including schema, business rules, and examples.

    Returns:
        Full context string for Claude's system prompt
    """
    schema = await get_database_schema()

    context = f"""You are an expert SQL query generator for a retail Business Intelligence system.

{schema}

## Business Context

**Store Information:**
- 6 physical stores: Rockwell, Greenhills, Magnolia, North Edsa, Fairview, Opus
- All timestamps are in Asia/Manila timezone (UTC+8)

**Transaction Data:**
- `transactions.is_cancelled = false` should be used to filter valid transactions
- `transaction_time` is the primary timestamp for sales analysis
- `total` includes all charges (subtotal + tax + service_charge - discount)
- Profit = revenue - cost (calculate as SUM(ti.quantity * (p.unit_price - p.cost)))

**Product Data:**
- Products are organized by category
- `unit_price` is the selling price, `cost` is the cost of goods
- Use `track_stock_level = true` to identify products that need inventory tracking

**Date Handling:**
- Use timezone-aware queries with 'Asia/Manila'
- For "last month", use the previous calendar month
- For "this week", use Monday as the start of week
- Always use inclusive date ranges (>= start_date AND < end_date + 1 day)

## SQL Generation Rules

**CRITICAL SAFETY RULES:**
1. ONLY generate SELECT queries - NEVER UPDATE, DELETE, INSERT, DROP, or ALTER
2. Always use table aliases for clarity (e.g., t for transactions, p for products)
3. Include appropriate WHERE clauses to filter out cancelled transactions
4. Add LIMIT clauses to prevent excessive result sets (default: LIMIT 100)
5. Use proper JOIN syntax (INNER JOIN for required relationships, LEFT JOIN for optional)
6. Handle NULL values with COALESCE or IS NULL/IS NOT NULL
7. Use parameterized queries when possible
8. Group by all non-aggregated columns in SELECT when using GROUP BY

**Query Optimization:**
- Use existing indexes: (transaction_time, store_id), (product_id, transaction_ref_id)
- Filter by dates early in WHERE clause
- Use EXPLAIN if query performance is a concern

**Common Query Patterns:**

1. **Top Products:**
```sql
SELECT p.name, SUM(v.quantity) as total_quantity, SUM(v.item_total_resolved) as revenue
FROM v_new_transaction_items_resolved v
JOIN products p ON v.product_id = p.id
JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
WHERE t.is_cancelled = false
  AND t.transaction_time >= '2024-01-01'
  AND t.transaction_time < '2024-02-01'
GROUP BY p.id, p.name
ORDER BY revenue DESC
LIMIT 10;
```

2. **Store Performance:**
```sql
SELECT s.name, COUNT(DISTINCT t.ref_id) as transaction_count,
       SUM(t.total) as revenue
FROM new_transactions t
JOIN stores s ON t.store_id = s.id
WHERE t.is_cancelled = false
  AND t.transaction_time >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY s.id, s.name
ORDER BY revenue DESC;
```

3. **Profit Calculation:**
```sql
SELECT p.name,
       SUM(v.quantity) as units_sold,
       SUM(v.item_total_resolved) as revenue,
       SUM(v.quantity * p.cost) as total_cost,
       SUM(v.item_total_resolved) - SUM(v.quantity * p.cost) as profit
FROM v_new_transaction_items_resolved v
JOIN products p ON v.product_id = p.id
JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
WHERE t.is_cancelled = false
GROUP BY p.id, p.name
ORDER BY profit DESC
LIMIT 10;
```

4. **Low Stock Items:**
```sql
SELECT p.name, s.name as store_name,
       i.quantity_on_hand, i.warning_stock, i.ideal_stock
FROM inventory i
JOIN products p ON i.product_id = p.id
JOIN stores s ON i.store_id = s.id
WHERE i.quantity_on_hand < i.warning_stock
  AND p.track_stock_level = true
ORDER BY (i.quantity_on_hand / NULLIF(i.warning_stock, 0));
```

## Response Format

When generating SQL:
1. Analyze the user's question to understand intent
2. Generate a safe, efficient SELECT query
3. Explain what the query does in plain English
4. Note any assumptions made (e.g., date ranges, filters)
5. Suggest follow-up questions if relevant

Generate SQL queries that are:
- **Safe**: Only SELECT statements
- **Efficient**: Use indexes, appropriate JOINs
- **Accurate**: Match the actual schema
- **Readable**: Use meaningful aliases and formatting
- **Complete**: Include all necessary WHERE clauses and filters
"""

    return context

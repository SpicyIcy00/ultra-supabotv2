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
            sync_url = database_url.replace('+asyncpg', '')
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
                        'description': 'Filter out cancelled transactions'
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

        self._schema_cache = ''.join(schema_parts)

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

        self._schema_summary_cache = summary


# Convenience functions for backward compatibility
async def get_database_schema() -> str:
    """Get the cached database schema (async for compatibility)"""
    return SchemaContext.get_schema()


async def get_schema_summary() -> Dict[str, Any]:
    """Get cached schema summary (async for compatibility)"""
    return SchemaContext.get_schema_summary()

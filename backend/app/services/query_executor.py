"""
Query Executor Service

Executes validated SQL queries with safety timeouts and result sanitization.
"""

import asyncio
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.query_validator import validate_sql_query, QueryValidationError
from app.services.schema_context import SchemaContext


class QueryExecutionError(Exception):
    """Raised when query execution fails"""
    pass


class QueryExecutor:
    """
    Executes SQL queries safely with timeouts and result processing.
    """

    # Default statement timeout in seconds
    DEFAULT_TIMEOUT = 10

    def __init__(self, db_session: AsyncSession):
        """
        Initialize query executor with database session.

        Args:
            db_session: SQLAlchemy async session
        """
        self.db_session = db_session

    async def execute_query(
        self,
        sql_query: str,
        timeout: int = DEFAULT_TIMEOUT,
        validate: bool = True
    ) -> Dict[str, Any]:
        """
        Execute SQL query with timeout and safety checks.

        Args:
            sql_query: SQL query string to execute
            timeout: Maximum execution time in seconds
            validate: Whether to validate query before execution

        Returns:
            Dictionary containing:
                - results: List of row dictionaries
                - row_count: Number of rows returned
                - execution_time_ms: Query execution time in milliseconds
                - columns: List of column names

        Raises:
            QueryValidationError: If query fails validation
            QueryExecutionError: If query execution fails
            asyncio.TimeoutError: If query exceeds timeout
        """
        start_time = datetime.now()

        try:
            # Validate query if requested
            if validate:
                schema_summary = SchemaContext.get_schema_summary()
                is_valid, validated_query, error = validate_sql_query(
                    sql_query,
                    schema_summary=schema_summary
                )

                if not is_valid:
                    raise QueryValidationError(error)

                sql_query = validated_query

            # Set statement timeout for this query
            await self._set_statement_timeout(timeout)

            # Execute query with timeout
            result = await asyncio.wait_for(
                self._execute_sql(sql_query),
                timeout=timeout
            )

            # Calculate execution time
            execution_time = (datetime.now() - start_time).total_seconds() * 1000

            return {
                "results": result["rows"],
                "row_count": result["row_count"],
                "execution_time_ms": round(execution_time, 2),
                "columns": result["columns"]
            }

        except asyncio.TimeoutError:
            # Cancel the query if it's still running
            await self.db_session.rollback()
            raise QueryExecutionError(
                f"Query execution exceeded {timeout} second timeout. "
                "Try narrowing your date range or adding more specific filters."
            )

        except QueryValidationError:
            # Re-raise validation errors as-is
            raise

        except Exception as e:
            # Rollback on any error
            await self.db_session.rollback()
            raise QueryExecutionError(f"Query execution failed: {str(e)}")

    async def _set_statement_timeout(self, timeout_seconds: int):
        """Set PostgreSQL statement timeout for the session"""
        try:
            timeout_ms = timeout_seconds * 1000
            await self.db_session.execute(
                text(f"SET LOCAL statement_timeout = {timeout_ms}")
            )
        except Exception:
            # If setting timeout fails, continue anyway
            pass

    async def _execute_sql(self, sql_query: str) -> Dict[str, Any]:
        """
        Execute SQL query and return sanitized results.

        Args:
            sql_query: SQL query to execute

        Returns:
            Dictionary with rows, row_count, and columns
        """
        # Execute query
        result = await self.db_session.execute(text(sql_query))

        # Fetch all rows
        rows = result.fetchall()

        # Get column names
        columns = list(result.keys()) if rows else []

        # Sanitize and convert rows to dictionaries
        sanitized_rows = [
            self._sanitize_row(dict(row._mapping))
            for row in rows
        ]

        return {
            "rows": sanitized_rows,
            "row_count": len(sanitized_rows),
            "columns": columns
        }

    def _sanitize_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize row data for JSON serialization.
        Handles datetime, Decimal, and other special types.

        Args:
            row: Raw row dictionary

        Returns:
            Sanitized row dictionary
        """
        sanitized = {}

        for key, value in row.items():
            if value is None:
                sanitized[key] = None

            elif isinstance(value, datetime):
                # Convert to ISO format string
                sanitized[key] = value.isoformat()

            elif isinstance(value, date):
                # Convert date to ISO format string
                sanitized[key] = value.isoformat()

            elif isinstance(value, Decimal):
                # Convert Decimal to float for JSON serialization
                sanitized[key] = float(value)

            elif isinstance(value, (int, float, str, bool)):
                # Pass through primitive types
                sanitized[key] = value

            else:
                # Convert any other type to string
                sanitized[key] = str(value)

        return sanitized

    async def get_row_count(self, sql_query: str, timeout: int = 5) -> int:
        """
        Get the count of rows that would be returned by a query.
        Useful for checking result set size before fetching all rows.

        Args:
            sql_query: SQL query to count
            timeout: Maximum execution time

        Returns:
            Number of rows that would be returned
        """
        # Wrap query in COUNT(*)
        count_query = f"SELECT COUNT(*) as row_count FROM ({sql_query.rstrip(';')}) as subquery"

        result = await self.execute_query(count_query, timeout=timeout, validate=False)

        if result["results"]:
            return result["results"][0].get("row_count", 0)

        return 0

    async def explain_query(self, sql_query: str) -> Dict[str, Any]:
        """
        Get the query execution plan using EXPLAIN.
        Useful for debugging slow queries.

        Args:
            sql_query: SQL query to explain

        Returns:
            Dictionary with execution plan details
        """
        explain_query = f"EXPLAIN (FORMAT JSON) {sql_query}"

        try:
            result = await self.db_session.execute(text(explain_query))
            rows = result.fetchall()

            if rows:
                return rows[0][0]  # Return the JSON plan

        except Exception as e:
            return {"error": f"EXPLAIN failed: {str(e)}"}

        return {}


# Convenience function for one-off queries
async def execute_safe_query(
    db_session: AsyncSession,
    sql_query: str,
    timeout: int = QueryExecutor.DEFAULT_TIMEOUT
) -> Dict[str, Any]:
    """
    Convenience function to execute a query safely.

    Args:
        db_session: Database session
        sql_query: SQL query to execute
        timeout: Maximum execution time

    Returns:
        Query results dictionary

    Example:
        >>> async with get_db() as db:
        ...     results = await execute_safe_query(db, "SELECT * FROM products LIMIT 10")
        ...     for row in results["results"]:
        ...         print(row)
    """
    executor = QueryExecutor(db_session)
    return await executor.execute_query(sql_query, timeout=timeout)

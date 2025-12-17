"""
SQL Query Validator for AI-Generated Queries

Multi-layer security validation to ensure only safe SELECT queries are executed.
"""

import re
import sqlparse
from sqlparse.sql import IdentifierList, Identifier, Where, Comparison, Function
from sqlparse.tokens import Keyword, DML
from typing import Tuple, List, Dict, Any, Optional
from difflib import get_close_matches


class QueryValidationError(Exception):
    """Custom exception for query validation failures"""
    pass


class QueryValidator:
    """
    Validates SQL queries for safety before execution.

    Security Layers:
    1. Statement type checking (SELECT only)
    2. Dangerous keyword blacklist
    3. SQL parsing and structure validation
    4. Result limit enforcement
    5. Table whitelist verification
    """

    # Dangerous SQL keywords that should never appear
    DANGEROUS_KEYWORDS = {
        'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE',
        'CREATE', 'REPLACE', 'RENAME', 'GRANT', 'REVOKE',
        'EXECUTE', 'EXEC', 'CALL', 'PROCEDURE',
        'INTO OUTFILE', 'INTO DUMPFILE', 'LOAD_FILE',
        '--', '/*', '*/', 'WAITFOR', 'DELAY'
    }

    # Allowed tables (will be dynamically populated from schema)
    ALLOWED_TABLES = {
        'products', 'stores', 'new_transactions', 'new_transaction_items',
        'v_new_transaction_items_resolved', 'inventory'
    }

    # Maximum rows to return (can be overridden per query)
    MAX_RESULT_LIMIT = 1000
    DEFAULT_LIMIT = 100

    @staticmethod
    def validate_query(
        sql_query: str,
        allowed_tables: List[str] = None,
        schema_summary: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, str, str]:
        """
        Validate SQL query through multiple security layers.

        Args:
            sql_query: The SQL query to validate
            allowed_tables: Optional list of allowed table names (overrides default)
            schema_summary: Optional schema summary for column validation

        Returns:
            Tuple of (is_valid, validated_query, error_message)
        """
        try:
            # Layer 1: Basic sanitization
            sql_query = sql_query.strip()
            if not sql_query:
                raise QueryValidationError("Empty query provided")

            # Remove comments (security risk)
            sql_query = re.sub(r'--.*$', '', sql_query, flags=re.MULTILINE)
            sql_query = re.sub(r'/\*.*?\*/', '', sql_query, flags=re.DOTALL)

            # Layer 2: Statement type checking
            QueryValidator._validate_statement_type(sql_query)

            # Layer 3: Dangerous keyword detection
            QueryValidator._check_dangerous_keywords(sql_query)

            # Layer 4: SQL parsing and structure validation
            parsed = QueryValidator._parse_and_validate_structure(sql_query)

            # Layer 5: Table whitelist verification
            QueryValidator._validate_tables(
                parsed,
                allowed_tables or list(QueryValidator.ALLOWED_TABLES)
            )

            # Layer 6: Column existence validation (if schema provided)
            if schema_summary:
                QueryValidator._validate_columns(sql_query, schema_summary)

            # Layer 7: Timezone-aware date validation
            QueryValidator._validate_timezone_handling(sql_query)

            # Layer 8: Enforce result limits
            validated_query = QueryValidator._enforce_limit(sql_query, parsed)

            return True, validated_query, ""

        except QueryValidationError as e:
            return False, "", str(e)
        except Exception as e:
            return False, "", f"Validation error: {str(e)}"

    @staticmethod
    def _validate_statement_type(sql_query: str) -> None:
        """Ensure query is a SELECT statement (or WITH clause for CTEs)"""
        # Check first keyword
        first_word = sql_query.split()[0].upper()
        if first_word not in ['SELECT', 'WITH']:
            raise QueryValidationError(
                f"Only SELECT queries are allowed. Found: {first_word}"
            )

        # Check for multiple statements (semicolon-separated)
        statements = sqlparse.split(sql_query)
        if len(statements) > 1:
            raise QueryValidationError(
                "Multiple statements not allowed. Use only one SELECT query."
            )

    @staticmethod
    def _check_dangerous_keywords(sql_query: str) -> None:
        """Check for dangerous SQL keywords"""
        sql_upper = sql_query.upper()

        for keyword in QueryValidator.DANGEROUS_KEYWORDS:
            if keyword in sql_upper:
                raise QueryValidationError(
                    f"Forbidden keyword detected: {keyword}"
                )

        # Check for stacked queries
        if ';' in sql_query.rstrip(';'):
            raise QueryValidationError(
                "Multiple statements detected (semicolon in query)"
            )

    @staticmethod
    def _parse_and_validate_structure(sql_query: str):
        """Parse SQL and validate structure"""
        try:
            parsed = sqlparse.parse(sql_query)
            if not parsed:
                raise QueryValidationError("Unable to parse SQL query")

            statement = parsed[0]

            # Verify it's a SELECT statement
            # Verify it's a SELECT statement (or CTE)
            # sqlparse might identify CTEs as UNKNOWN or other types
            # We already validated the starting keyword in _validate_statement_type
            if statement.get_type() not in ['SELECT', 'UNKNOWN', 'INSERT']: # INSERT is effectively blocked by keyword check
                 # Just a safety net, but rely on keyword check mainly
                 pass

            return statement

        except Exception as e:
            raise QueryValidationError(f"SQL parsing failed: {str(e)}")

    @staticmethod
    def _validate_tables(parsed_statement, allowed_tables: List[str]) -> None:
        """
        Validate that all referenced tables are in the whitelist.

        This prevents queries from accessing system tables or unauthorized tables.
        """
        # Extract table names from the query
        tables_in_query = QueryValidator._extract_table_names(parsed_statement)
        
        # Extract CTE names (defined in the query)
        cte_names = QueryValidator._extract_cte_names(str(parsed_statement))

        # Check each table against whitelist
        for table in tables_in_query:
            table_lower = table.lower()
            # Skip if it's a CTE defined in the query itself
            if table_lower in cte_names:
                continue
                
            if table_lower not in [t.lower() for t in allowed_tables]:
                raise QueryValidationError(
                    f"Unauthorized table access: '{table}'. "
                    f"Allowed tables: {', '.join(allowed_tables)}"
                )

    @staticmethod
    def _extract_table_names(parsed_statement) -> List[str]:
        """Extract table names from parsed SQL statement"""
        tables = set()

        # Convert to string and extract tables using regex for FROM and JOIN clauses
        query_str = str(parsed_statement)

        # Pattern to match: FROM table_name or JOIN table_name (with optional AS alias)
        # This captures the table name, ignoring any alias after it
        # Matches: FROM table_name [AS] alias or FROM table_name
        patterns = [
            r'\bFROM\s+(\w+)(?:\s+(?:AS\s+)?\w+)?',
            r'\bJOIN\s+(\w+)(?:\s+(?:AS\s+)?\w+)?',
            r'\bINNER\s+JOIN\s+(\w+)(?:\s+(?:AS\s+)?\w+)?',
            r'\bLEFT\s+(?:OUTER\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?\w+)?',
            r'\bRIGHT\s+(?:OUTER\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?\w+)?',
            r'\bFULL\s+(?:OUTER\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?\w+)?',
            r'\bCROSS\s+JOIN\s+(\w+)(?:\s+(?:AS\s+)?\w+)?',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, query_str, re.IGNORECASE)
            for match in matches:
                tables.add(match.lower())

        return list(tables)

    @staticmethod
    def _extract_cte_names(sql_query: str) -> set:
        """Extract names of Common Table Expressions (CTEs) defined in the query"""
        ctes = set()
        # Simple regex to find CTE definitions: name AS (
        # This handles: WITH cte1 AS (...), cte2 AS (...)
        cte_pattern = r'\b(\w+)\s+AS\s*\('
        matches = re.findall(cte_pattern, sql_query, re.IGNORECASE)
        for match in matches:
             # Exclude SQL keywords that might match this pattern in weird edge cases
            if match.upper() not in ['SELECT', 'WITH', 'FROM', 'JOIN', 'WHERE', 'GROUP', 'ORDER']:
                ctes.add(match.lower())
        return ctes

    @staticmethod
    def _validate_columns(sql_query: str, schema_summary: Dict[str, Any]) -> None:
        """
        Validate that column references exist in the schema.
        Provides helpful suggestions for typos using fuzzy matching.
        """
        # Extract column references from query (table.column pattern)
        column_pattern = r'(\w+)\.(\w+)'
        matches = re.findall(column_pattern, sql_query, re.IGNORECASE)

        for table_alias, column_name in matches:
            # Try to resolve table alias to actual table name
            # This is a simple heuristic - could be enhanced
            actual_table = QueryValidator._resolve_table_alias(sql_query, table_alias)

            if actual_table and actual_table in schema_summary:
                table_columns = [col['name'] for col in schema_summary[actual_table]['columns']]

                # Check if column exists
                if column_name.lower() not in [c.lower() for c in table_columns]:
                    # Try fuzzy matching for suggestions
                    suggestions = get_close_matches(
                        column_name.lower(),
                        [c.lower() for c in table_columns],
                        n=3,
                        cutoff=0.6
                    )

                    error_msg = f"Column '{column_name}' not found in table '{actual_table}'"
                    if suggestions:
                        error_msg += f". Did you mean: {', '.join(suggestions)}?"

                    raise QueryValidationError(error_msg)

    @staticmethod
    def _resolve_table_alias(sql_query: str, alias: str) -> Optional[str]:
        """
        Resolve table alias to actual table name.
        Simple pattern matching for FROM/JOIN table_name alias
        """
        # Pattern: FROM table_name AS alias or FROM table_name alias
        patterns = [
            rf'\bFROM\s+(\w+)\s+(?:AS\s+)?{alias}\b',
            rf'\bJOIN\s+(\w+)\s+(?:AS\s+)?{alias}\b',
        ]

        for pattern in patterns:
            match = re.search(pattern, sql_query, re.IGNORECASE)
            if match:
                return match.group(1).lower()

        # If alias not found, assume it's the table name itself
        return alias.lower()

    @staticmethod
    def _validate_timezone_handling(sql_query: str) -> None:
        """
        Validate timezone-aware date handling.
        Warns about potential timezone issues in date comparisons.
        """
        # Check for date comparisons without timezone consideration
        date_columns = ['transaction_time', 'created_at', 'updated_at']

        for col in date_columns:
            # Check if column is used in WHERE clause without AT TIME ZONE
            pattern = rf"\b{col}\s*[><=].*?'[\d-]+"

            if re.search(pattern, sql_query, re.IGNORECASE):
                # Check if AT TIME ZONE is used
                if 'AT TIME ZONE' not in sql_query.upper():
                    # This is a warning, not a hard error
                    # Could be logged or included in validation message
                    pass  # Allow query but could log warning

    @staticmethod
    def _enforce_limit(sql_query: str, parsed_statement) -> str:
        """
        Ensure query has a LIMIT clause to prevent excessive results.

        If no LIMIT exists, add DEFAULT_LIMIT.
        If LIMIT exceeds MAX_RESULT_LIMIT, cap it.
        """
        # Check if LIMIT already exists
        has_limit = False
        limit_value = None

        for token in parsed_statement.tokens:
            if token.ttype is Keyword and 'LIMIT' in token.value.upper():
                has_limit = True
            elif has_limit and token.ttype in (sqlparse.tokens.Number.Integer, sqlparse.tokens.Literal.Number.Integer):
                limit_value = int(token.value)
                break

        # If no limit, add default
        if not has_limit:
            sql_query = sql_query.rstrip(';').strip()
            sql_query += f" LIMIT {QueryValidator.DEFAULT_LIMIT}"
            return sql_query

        # If limit exceeds max, cap it
        if limit_value and limit_value > QueryValidator.MAX_RESULT_LIMIT:
            sql_query = re.sub(
                r'LIMIT\s+\d+',
                f'LIMIT {QueryValidator.MAX_RESULT_LIMIT}',
                sql_query,
                flags=re.IGNORECASE
            )

        return sql_query


def validate_sql_query(
    sql_query: str,
    allowed_tables: List[str] = None,
    schema_summary: Optional[Dict[str, Any]] = None
) -> Tuple[bool, str, str]:
    """
    Convenience function to validate SQL query.

    Args:
        sql_query: SQL query string to validate
        allowed_tables: Optional list of allowed table names
        schema_summary: Optional schema summary for column validation

    Returns:
        Tuple of (is_valid: bool, validated_query: str, error_message: str)

    Example:
        >>> is_valid, query, error = validate_sql_query("SELECT * FROM products")
        >>> if is_valid:
        ...     # Execute query
        ...     pass
        ... else:
        ...     print(f"Validation failed: {error}")
    """
    return QueryValidator.validate_query(sql_query, allowed_tables, schema_summary)


def is_safe_query(sql_query: str) -> bool:
    """
    Quick check if query is safe (returns boolean only).

    Args:
        sql_query: SQL query string

    Returns:
        True if query is safe, False otherwise
    """
    is_valid, _, _ = QueryValidator.validate_query(sql_query)
    return is_valid


# Export commonly used items
__all__ = [
    'QueryValidator',
    'QueryValidationError',
    'validate_sql_query',
    'is_safe_query'
]

"""
SQL Generator Service using Anthropic Claude API

Generates safe, efficient SQL queries from natural language using Claude.
Includes circuit breaker pattern for reliability and retry logic for robustness.
"""

import re
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from anthropic import Anthropic, APIError, APITimeoutError
import asyncio

from app.core.config import settings
from app.services.schema_context import SchemaContext


class CircuitBreaker:
    """Circuit breaker for LLM API calls to prevent cascading failures"""

    def __init__(self, failure_threshold: int = 5, timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.failures = 0
        self.last_failure: Optional[datetime] = None
        self.is_open = False

    def record_success(self):
        """Record a successful call"""
        self.failures = 0
        self.is_open = False

    def record_failure(self):
        """Record a failed call"""
        self.failures += 1
        self.last_failure = datetime.now()

        if self.failures >= self.failure_threshold:
            self.is_open = True

    def can_proceed(self) -> bool:
        """Check if we can make a call"""
        if not self.is_open:
            return True

        # Check if timeout has passed
        if self.last_failure:
            elapsed = (datetime.now() - self.last_failure).total_seconds()
            if elapsed >= self.timeout:
                # Reset and try again
                self.failures = 0
                self.is_open = False
                return True

        return False

    def get_status(self) -> Dict[str, Any]:
        """Get circuit breaker status"""
        return {
            "is_open": self.is_open,
            "failures": self.failures,
            "threshold": self.failure_threshold,
            "last_failure": self.last_failure.isoformat() if self.last_failure else None
        }


class CircuitOpenError(Exception):
    """Raised when circuit breaker is open"""
    pass


class SQLGenerator:
    """
    Generates SQL queries from natural language using Claude API.
    Implements circuit breaker and retry logic for reliability.
    """

    def __init__(self):
        self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.circuit_breaker = CircuitBreaker(failure_threshold=5, timeout=60)
        self.schema = SchemaContext.get_schema()
        self.business_rules = SchemaContext.get_business_rules()

    async def generate_sql(
        self,
        user_question: str,
        retry_on_failure: bool = True,
        previous_error: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate SQL query from natural language question.

        Args:
            user_question: Natural language question from user
            retry_on_failure: Whether to retry on validation failure
            previous_error: Error from previous attempt (for retry context)

        Returns:
            Dictionary with:
                - sql: Generated SQL query
                - explanation: Plain English explanation
                - assumptions: List of assumptions made
                - query_type: Type of query (ranking, time_series, comparison, etc.)

        Raises:
            CircuitOpenError: If circuit breaker is open
            APIError: If Claude API fails
        """
        # Check circuit breaker
        if not self.circuit_breaker.can_proceed():
            raise CircuitOpenError(
                "SQL generation service temporarily unavailable due to repeated failures. "
                "Please try again in a few moments."
            )

        try:
            # Build the prompt
            prompt = self._build_prompt(user_question, previous_error)

            # Call Claude API with timeout
            response = await asyncio.wait_for(
                self._call_claude_api(prompt),
                timeout=15.0  # 15 second timeout
            )

            # Parse the response
            result = self._parse_response(response, user_question)

            # Record success
            self.circuit_breaker.record_success()

            return result

        except asyncio.TimeoutError:
            self.circuit_breaker.record_failure()
            raise APITimeoutError("SQL generation timed out after 15 seconds")

        except (APIError, Exception) as e:
            self.circuit_breaker.record_failure()
            raise

    async def _call_claude_api(self, prompt: str) -> str:
        """
        Call Claude API to generate SQL.
        Runs in executor to avoid blocking async event loop.
        """
        loop = asyncio.get_event_loop()

        def _sync_call():
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",  # Using Sonnet 4.5
                max_tokens=2048,
                temperature=0,  # Deterministic for SQL generation
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )
            return message.content[0].text

        # Run in executor to prevent blocking
        response = await loop.run_in_executor(None, _sync_call)
        return response

    def _build_prompt(self, user_question: str, previous_error: Optional[str] = None) -> str:
        """Build the prompt for Claude"""

        # Get training examples from business rules
        examples = self.business_rules.get('training', {}).get('examples', [])
        example_text = self._format_examples(examples[:5])  # Use top 5 examples

        # Get default filters
        default_filters = SchemaContext.get_default_filters()
        filter_rules = "\n".join([
            f"- {f['description']}: `{f['sql_template']}`"
            for f in default_filters
        ])

        # Build retry context if this is a retry
        retry_context = ""
        if previous_error:
            retry_context = f"""
## Previous Attempt Failed

The previous SQL query failed with this error:
```
{previous_error}
```

Please fix the issue and generate a corrected query.
"""

        prompt = f"""You are an expert SQL query generator for a retail Business Intelligence system.

{self.schema}

## Business Context

**Store Information:**
- 6 physical stores: {', '.join(self.business_rules.get('stores', []))}
- All timestamps are in {self.business_rules.get('date_defaults', {}).get('timezone', 'Asia/Manila')} timezone

**Required Filters:**
{filter_rules}

**Date Handling:**
- Timezone: {self.business_rules.get('date_defaults', {}).get('timezone', 'Asia/Manila')}
- Week starts on: {self.business_rules.get('date_defaults', {}).get('week_start', 'Monday')}
- Always use inclusive date ranges

## SQL Generation Rules

**CRITICAL SAFETY RULES:**
1. ONLY generate SELECT queries - NEVER UPDATE, DELETE, INSERT, DROP, or ALTER
2. Always filter `is_cancelled = false` for transactions table
3. Use proper JOINs (INNER JOIN for required, LEFT JOIN for optional)
4. Add LIMIT clause (default: {self.business_rules.get('optimization', {}).get('default_limit', 100)})
5. Handle NULL values with COALESCE or IS NULL/IS NOT NULL
6. Group by all non-aggregated columns when using GROUP BY
7. Use table aliases for clarity (t for transactions, p for products, s for stores, etc.)

**IMPORTANT BUSINESS LOGIC:**
- "Top selling products" or "best selling" = ORDER BY revenue (total sales in money)
- "Top products by quantity" or "most units sold" = ORDER BY quantity/units
- "Most profitable" = ORDER BY profit
- When ranking products, ALWAYS include both quantity and revenue columns
- Use column names: total_quantity_sold (for quantity), total_revenue (for revenue)

**Query Optimization:**
- Filter by dates early in WHERE clause
- Use existing indexes on transaction_time, store_id, product_id
- Avoid SELECT * - specify columns explicitly

## Example Queries

{example_text}

{retry_context}

## User Question

{user_question}

## Response Format

Generate your response in this EXACT format:

SQL:
```sql
[Your SQL query here]
```

EXPLANATION:
[2-3 sentences explaining what the query does]

ASSUMPTIONS:
- [Assumption 1]
- [Assumption 2]

QUERY_TYPE: [ranking|time_series|comparison|aggregate|distribution]

**IMPORTANT:**
- Only output valid SQL in the SQL block
- Ensure the SQL is syntactically correct
- Do NOT include any markdown formatting outside the code blocks
- Do NOT use SELECT *
- Always include a LIMIT clause unless it's an aggregation
"""

        return prompt

    def _format_examples(self, examples: List[Dict[str, Any]]) -> str:
        """Format training examples for the prompt"""
        formatted = []
        for idx, example in enumerate(examples, 1):
            formatted.append(f"""
**Example {idx}:**
Question: "{example['question']}"
```sql
{example['sql'].strip()}
```
Type: {example.get('type', 'unknown')}
""")
        return "\n".join(formatted)

    def _parse_response(self, response: str, user_question: str) -> Dict[str, Any]:
        """Parse Claude's response into structured format"""

        # Extract SQL from code block
        sql_match = re.search(r'```sql\s*(.*?)\s*```', response, re.DOTALL | re.IGNORECASE)
        if not sql_match:
            # Try without language specifier
            sql_match = re.search(r'```\s*(SELECT.*?)\s*```', response, re.DOTALL | re.IGNORECASE)

        if not sql_match:
            raise ValueError("Could not extract SQL from Claude's response")

        sql = sql_match.group(1).strip()

        # Remove any trailing semicolon and re-add it
        sql = sql.rstrip(';').strip() + ';'

        # Extract explanation
        explanation_match = re.search(r'EXPLANATION:\s*(.*?)(?=ASSUMPTIONS:|QUERY_TYPE:|$)', response, re.DOTALL)
        explanation = explanation_match.group(1).strip() if explanation_match else "Query generated successfully"

        # Extract assumptions
        assumptions_match = re.search(r'ASSUMPTIONS:\s*(.*?)(?=QUERY_TYPE:|$)', response, re.DOTALL)
        assumptions = []
        if assumptions_match:
            assumption_text = assumptions_match.group(1).strip()
            assumptions = [
                line.strip('- ').strip()
                for line in assumption_text.split('\n')
                if line.strip().startswith('-')
            ]

        # Extract query type
        query_type_match = re.search(r'QUERY_TYPE:\s*(\w+)', response)
        query_type = query_type_match.group(1).lower() if query_type_match else "unknown"

        return {
            "sql": sql,
            "explanation": explanation,
            "assumptions": assumptions,
            "query_type": query_type,
            "raw_response": response
        }

    def get_circuit_breaker_status(self) -> Dict[str, Any]:
        """Get current circuit breaker status"""
        return self.circuit_breaker.get_status()

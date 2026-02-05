"""
SQL Generator Service using Anthropic Claude API

Generates safe, efficient SQL queries from natural language using Claude.
Includes circuit breaker pattern for reliability and retry logic for robustness.
"""

import re
from datetime import datetime, timedelta
from difflib import get_close_matches
from typing import Optional, Dict, Any, List, Tuple
from anthropic import Anthropic, APIError, APITimeoutError
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.schema_context import SchemaContext
from app.services.conversation_memory import get_context as get_conversation_context


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
        # Check if API key is set
        if not settings.ANTHROPIC_API_KEY or settings.ANTHROPIC_API_KEY == "":
            raise ValueError(
                "ANTHROPIC_API_KEY environment variable is not set. "
                "Please set it in your Railway environment variables to enable AI Chat functionality."
            )

        self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=60.0)
        self.circuit_breaker = CircuitBreaker(failure_threshold=5, timeout=60)
        self.schema = SchemaContext.get_schema()
        self.business_rules = SchemaContext.get_business_rules()

    async def _get_store_filters(self) -> Dict[str, List[str]]:
        """
        Fetch store filters from database.

        Returns:
            Dictionary with 'sales_stores' and 'inventory_stores' lists.
            Returns defaults if no filters configured.
        """
        try:
            from app.models.store_filter import StoreFilter

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(StoreFilter).order_by(StoreFilter.filter_type, StoreFilter.store_name)
                )
                filters = result.scalars().all()

                store_filters = {
                    'sales_stores': [],
                    'inventory_stores': []
                }

                for f in filters:
                    if f.filter_type == "sales":
                        store_filters['sales_stores'].append(f.store_name)
                    elif f.filter_type == "inventory":
                        store_filters['inventory_stores'].append(f.store_name)

                # Return defaults if empty (not yet initialized)
                if not store_filters['sales_stores']:
                    store_filters['sales_stores'] = [
                        "Rockwell", "Greenhills", "Magnolia",
                        "North Edsa", "Fairview", "Opus"
                    ]
                if not store_filters['inventory_stores']:
                    store_filters['inventory_stores'] = [
                        "Rockwell", "Greenhills", "Magnolia",
                        "North Edsa", "Fairview", "Opus", "AJI BARN"
                    ]

                return store_filters
        except Exception as e:
            # Fallback to defaults on any error
            print(f"Warning: Could not fetch store filters from DB: {e}")
            return {
                'sales_stores': [
                    "Rockwell", "Greenhills", "Magnolia",
                    "North Edsa", "Fairview", "Opus"
                ],
                'inventory_stores': [
                    "Rockwell", "Greenhills", "Magnolia",
                    "North Edsa", "Fairview", "Opus", "AJI BARN"
                ]
            }

    async def generate_sql(
        self,
        user_question: str,
        session_id: Optional[str] = None,
        retry_on_failure: bool = True,
        previous_error: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate SQL query from natural language question.

        Args:
            user_question: Natural language question from user
            session_id: Optional session ID for conversation context
            retry_on_failure: Whether to retry on validation failure
            previous_error: Error from previous attempt (for retry context)

        Returns:
            Dictionary with:
                - sql: Generated SQL query
                - explanation: Plain English explanation
                - assumptions: List of assumptions made
                - query_type: Type of query (ranking, time_series, comparison, etc.)
                - corrections: List of entity name corrections made (if any)

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
            # Preprocess question for entity name corrections
            processed_question, corrections = self._preprocess_question(user_question)

            # Get conversation context if session_id provided
            conversation_context = ""
            if session_id:
                conversation_context = get_conversation_context(session_id)

            # Get store filters from database
            store_filters = await self._get_store_filters()

            # Build the prompt
            prompt = self._build_prompt(processed_question, previous_error, conversation_context, store_filters)

            # Call Claude API with timeout
            response = await asyncio.wait_for(
                self._call_claude_api(prompt),
                timeout=60.0  # 60 second timeout
            )

            # Parse the response
            result = self._parse_response(response, user_question)

            # Add corrections to result
            if corrections:
                result["corrections"] = corrections
                # Also add to assumptions
                result["assumptions"] = corrections + result.get("assumptions", [])

            # Record success
            self.circuit_breaker.record_success()

            return result

        except asyncio.TimeoutError:
            self.circuit_breaker.record_failure()
            raise APITimeoutError("SQL generation timed out after 60 seconds")

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

    def _build_prompt(
        self,
        user_question: str,
        previous_error: Optional[str] = None,
        conversation_context: str = "",
        store_filters: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """Build the prompt for Claude"""

        # Get training examples from business rules - use intelligent selection
        all_examples = self.business_rules.get('training', {}).get('examples', [])
        relevant_examples = self._select_relevant_examples(user_question, all_examples, max_examples=8)
        example_text = self._format_examples(relevant_examples)

        # Get and format negative examples
        negative_examples = self.business_rules.get('negative_examples', [])
        negative_text = self._format_negative_examples(negative_examples[:5])

        # Get default filters
        default_filters = SchemaContext.get_default_filters()
        filter_rules = "\n".join([
            f"- {f['description']}: `{f['sql_template']}`"
            for f in default_filters
        ])

        # Build store filter rules
        store_filter_rules = ""
        if store_filters:
            sales_stores = store_filters.get('sales_stores', [])
            inventory_stores = store_filters.get('inventory_stores', [])

            if sales_stores or inventory_stores:
                sales_list = ', '.join([f"'{s}'" for s in sales_stores])
                inventory_list = ', '.join([f"'{s}'" for s in inventory_stores])

                store_filter_rules = f"""
**IMPORTANT - AUTOMATIC STORE FILTERING:**
- For SALES/TRANSACTION queries (revenue, sales, orders, transactions): ALWAYS filter to these stores: {', '.join(sales_stores)}
  SQL: `s.name IN ({sales_list})`
- For INVENTORY queries (stock, on hand, warehouse): Include these stores: {', '.join(inventory_stores)}
  SQL: `s.name IN ({inventory_list})`
- EXCEPTION: If the user explicitly asks for a specific store (e.g., "Rockwell sales") or says "all stores", use their specification instead.
"""

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
{store_filter_rules}

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

## Common Mistakes to AVOID

{negative_text}

## Example Queries

{example_text}

{conversation_context}

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

    def _select_relevant_examples(
        self,
        question: str,
        examples: List[Dict[str, Any]],
        max_examples: int = 8
    ) -> List[Dict[str, Any]]:
        """
        Select the most relevant examples based on question similarity.

        Uses keyword matching and query type detection to find the best examples
        for the current question.

        Args:
            question: User's question
            examples: All available training examples
            max_examples: Maximum number of examples to return

        Returns:
            List of most relevant examples
        """
        question_lower = question.lower()
        question_words = set(question_lower.split())

        # Keywords that strongly indicate query type
        type_indicators = {
            'ranking': {'top', 'best', 'worst', 'highest', 'lowest', 'most', 'least', 'leading'},
            'time_series': {'trend', 'hourly', 'daily', 'weekly', 'monthly', 'over time', 'by day', 'by hour'},
            'comparison': {'compare', 'vs', 'versus', 'between', 'difference', 'against'},
            'aggregate': {'total', 'sum', 'count', 'average', 'how much', 'how many'},
            'distribution': {'breakdown', 'distribution', 'percentage', 'proportion', 'share'}
        }

        # Detect likely query type from question
        detected_types = set()
        for qtype, keywords in type_indicators.items():
            if any(kw in question_lower for kw in keywords):
                detected_types.add(qtype)

        scored_examples = []
        for example in examples:
            score = 0
            example_question = example.get('question', '').lower()
            example_words = set(example_question.split())
            example_type = example.get('type', 'unknown')

            # Score 1: Word overlap between questions
            overlap = len(question_words & example_words)
            score += overlap * 2

            # Score 2: Query type match
            if example_type in detected_types:
                score += 5

            # Score 3: Entity type match (store, product, category, etc.)
            entity_keywords = ['store', 'product', 'category', 'inventory', 'stock']
            for entity in entity_keywords:
                if entity in question_lower and entity in example_question:
                    score += 3

            # Score 4: Time period match
            time_keywords = ['today', 'yesterday', 'week', 'month', 'year', 'days']
            for time_kw in time_keywords:
                if time_kw in question_lower and time_kw in example_question:
                    score += 2

            # Score 5: Specific store name match
            stores = self.business_rules.get('stores', [])
            for store in stores:
                if store.lower() in question_lower and store.lower() in example_question:
                    score += 4

            scored_examples.append((score, example))

        # Sort by score descending
        scored_examples.sort(key=lambda x: x[0], reverse=True)

        # Return top examples
        return [ex for _, ex in scored_examples[:max_examples]]

    def _format_negative_examples(self, negative_examples: List[Dict[str, Any]]) -> str:
        """
        Format negative examples showing common mistakes to avoid.

        Args:
            negative_examples: List of negative example dictionaries

        Returns:
            Formatted string for prompt
        """
        if not negative_examples:
            return "No common mistakes to highlight."

        formatted = []
        for idx, example in enumerate(negative_examples, 1):
            wrong = example.get('wrong', '').strip()
            correct = example.get('correct', '').strip()
            mistake = example.get('mistake', example.get('description', 'Unknown mistake'))

            formatted.append(f"""
**Mistake {idx}: {mistake}**
WRONG:
```sql
{wrong}
```
CORRECT:
```sql
{correct}
```
""")

        return "\n".join(formatted)

    def _preprocess_question(self, question: str) -> Tuple[str, List[str]]:
        """
        Preprocess user question to fix entity name typos.

        Uses fuzzy matching to detect and correct misspelled store names,
        and potentially product names or categories.

        Args:
            question: Original user question

        Returns:
            Tuple of (corrected question, list of corrections made)
        """
        corrections = []
        words = question.split()

        # Get entity lists
        stores = self.business_rules.get('stores', [])

        # Create lowercase lookup for stores
        store_lower_map = {s.lower(): s for s in stores}
        store_names_lower = list(store_lower_map.keys())

        for i, word in enumerate(words):
            word_lower = word.lower().strip('.,?!')

            # Skip short words or common words
            if len(word_lower) < 4:
                continue

            # Check if it's already an exact match
            if word_lower in store_names_lower:
                # Correct case if needed
                correct_name = store_lower_map[word_lower]
                if word != correct_name:
                    words[i] = correct_name
                continue

            # Try fuzzy matching for stores
            matches = get_close_matches(word_lower, store_names_lower, n=1, cutoff=0.7)
            if matches:
                correct_name = store_lower_map[matches[0]]
                # Only correct if it's not an exact match
                if word_lower != matches[0]:
                    corrections.append(f"Interpreted '{word}' as '{correct_name}'")
                    # Preserve punctuation
                    suffix = ''
                    if word and word[-1] in '.,?!':
                        suffix = word[-1]
                    words[i] = correct_name + suffix

        corrected_question = ' '.join(words)
        return corrected_question, corrections

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

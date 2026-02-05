"""
Response Formatter Module

Formats SQL query results into clean, structured markdown responses.
NO AI calls - pure deterministic formatting for speed and consistency.
"""

from typing import Any, Dict, List, Tuple
from decimal import Decimal
from datetime import datetime, date
import re

from app.services.schema_context import SchemaContext


class ResponseFormatter:
    """Formats query results into structured markdown responses."""

    def __init__(self, max_words: int = 200):
        self.max_words = max_words

        # Load formatting config from business rules
        try:
            business_rules = SchemaContext.get_business_rules()
            formatting_config = business_rules.get('formatting', {})
        except RuntimeError:
            formatting_config = {}

        # Currency and number formatting
        self.currency_symbol = formatting_config.get('currency_symbol', '₱')
        self.decimal_places = formatting_config.get('decimal_places', 2)
        self.thousands_separator = formatting_config.get('thousands_separator', ',')

        # Date/time format patterns
        self.date_format = formatting_config.get('date_format', "%b %d, %Y")
        self.time_format = formatting_config.get('time_format', "%I:%M %p")
        self.datetime_format = formatting_config.get('datetime_format', "%b %d, %Y at %I:%M %p")


    def format_response(
        self,
        user_question: str,
        results: List[Dict[str, Any]],
        chart_data: Dict[str, Any] | None = None,
        query_type: str | None = None
    ) -> str:
        """
        Format results into structured markdown.

        Args:
            user_question: Original user query
            results: SQL query results
            chart_data: Chart configuration from chart intelligence module
            query_type: Query type from SQL generator (ranking, time_series, etc.)

        Returns:
            Formatted markdown string
        """
        if not results:
            return self._format_empty_results(user_question)

        # Use provided query_type from Claude, fallback to detection
        if not query_type or query_type == "unknown":
            query_type = self._detect_query_type(user_question, results)

        # Format based on type
        if query_type == "ranking":
            return self._format_ranking(user_question, results, chart_data)
        elif query_type == "comparison":
            return self._format_comparison(user_question, results, chart_data)
        elif query_type == "time_series":
            return self._format_time_series(user_question, results, chart_data)
        elif query_type == "aggregate":
            return self._format_aggregate(user_question, results)
        else:
            return self._format_generic(user_question, results, chart_data)

    def _detect_query_type(self, question: str, results: List[Dict[str, Any]]) -> str:
        """Detect the type of query based on question and results."""
        question_lower = question.lower()

        # Check for ranking keywords
        if any(kw in question_lower for kw in ['top', 'best', 'worst', 'highest', 'lowest', 'most', 'least']):
            return "ranking"

        # Check for comparison keywords
        if any(kw in question_lower for kw in ['compare', 'vs', 'versus', 'between', 'difference']):
            return "comparison"

        # Check for time series (date columns and multiple rows)
        if len(results) > 1:
            first_row = results[0]
            date_columns = [k for k in first_row.keys() if any(d in k.lower() for d in ['date', 'hour', 'day', 'month', 'year', 'time'])]
            if date_columns:
                return "time_series"

        # Check for aggregate (single row with aggregate functions)
        if len(results) == 1:
            first_row = results[0]
            if any(k.lower().startswith(('total_', 'avg_', 'sum_', 'count_', 'max_', 'min_')) for k in first_row.keys()):
                return "aggregate"

        return "generic"

    def _format_ranking(
        self,
        question: str,
        results: List[Dict[str, Any]],
        chart_data: Dict[str, Any] | None
    ) -> str:
        """Format ranking query results with deterministic template."""
        context = self._extract_context(question)

        sections = []

        # Header
        sections.append(f"**Here is a summary of {context} based on the query results:**\n")

        # Deterministic Summary with exact template
        sections.append("### Summary")
        summary_desc = self._generate_summary_description(question, results)
        sections.append(f"Your {summary_desc} are:")

        # Cap at top 5 for summary display
        top_n = min(5, len(results))
        for idx in range(top_n):
            row = results[idx]
            # Use smart column mapping
            name, revenue, units = self._extract_ranking_columns(row)

            # Format with exact template
            revenue_str = self._format_currency(revenue)
            units_str = self._format_units(units)

            sections.append(f"{idx + 1}. {name} with {revenue_str} revenue from {units_str}")

        sections.append("")  # Blank line

        # Key Insights
        insights = self._generate_insights_ranking(results)
        if insights:
            sections.append("### Key Insights")
            for insight in insights[:3]:  # Max 3 insights
                sections.append(f"• {insight}")
            sections.append("")

        # Notable Findings
        finding = self._generate_notable_finding_ranking(results)
        if finding:
            sections.append("### Notable Findings")
            sections.append(finding)
            sections.append("")

        # Follow-up Questions
        follow_ups = self._generate_follow_ups(question, "ranking", results)
        if follow_ups:
            sections.append("### Follow-up Questions")
            for idx, fq in enumerate(follow_ups[:3], 1):
                sections.append(f"{idx}. {fq}")

        return "\n".join(sections)

    def _format_comparison(
        self,
        question: str,
        results: List[Dict[str, Any]],
        chart_data: Dict[str, Any] | None
    ) -> str:
        """Format comparison query results."""
        context = self._extract_context(question)

        sections = []
        sections.append(f"**Here is a summary of {context} based on the query results:**\n")

        # Summary
        sections.append("### Summary")
        sections.append("Comparison results:")

        for row in results[:5]:  # Limit to 5 items
            item_text = self._format_comparison_item(row)
            sections.append(f"• {item_text}")

        sections.append("")

        # Key Insights
        insights = self._generate_insights_comparison(results)
        if insights:
            sections.append("### Key Insights")
            for insight in insights[:4]:
                sections.append(f"• {insight}")
            sections.append("")

        # Notable Findings
        finding = self._generate_notable_finding_comparison(results)
        if finding:
            sections.append("### Notable Findings")
            sections.append(finding)
            sections.append("")

        # Follow-up Questions
        follow_ups = self._generate_follow_ups(question, "comparison", results)
        if follow_ups:
            sections.append("### Follow-up Questions")
            for idx, fq in enumerate(follow_ups[:3], 1):
                sections.append(f"{idx}. {fq}")

        return "\n".join(sections)

    def _format_time_series(
        self,
        question: str,
        results: List[Dict[str, Any]],
        chart_data: Dict[str, Any] | None
    ) -> str:
        """Format time series query results."""
        context = self._extract_context(question)

        sections = []
        sections.append(f"**Here is a summary of {context} based on the query results:**\n")

        # Summary
        sections.append("### Summary")
        time_summary = self._generate_time_series_summary(results)
        sections.append(time_summary)
        sections.append("")

        # Key Insights
        insights = self._generate_insights_time_series(results)
        if insights:
            sections.append("### Key Insights")
            for insight in insights[:4]:
                sections.append(f"• {insight}")
            sections.append("")

        # Notable Findings
        finding = self._generate_notable_finding_time_series(results)
        if finding:
            sections.append("### Notable Findings")
            sections.append(finding)
            sections.append("")

        # Follow-up Questions
        follow_ups = self._generate_follow_ups(question, "time_series", results)
        if follow_ups:
            sections.append("### Follow-up Questions")
            for idx, fq in enumerate(follow_ups[:3], 1):
                sections.append(f"{idx}. {fq}")

        return "\n".join(sections)

    def _format_aggregate(self, question: str, results: List[Dict[str, Any]]) -> str:
        """Format aggregate query results."""
        context = self._extract_context(question)

        sections = []
        sections.append(f"**Here is a summary of {context} based on the query results:**\n")

        sections.append("### Summary")

        row = results[0]
        for key, value in row.items():
            formatted_value = self._format_value(value, key)
            clean_key = key.replace('_', ' ').title()
            sections.append(f"• **{clean_key}**: {formatted_value}")

        sections.append("")

        # Follow-up Questions
        follow_ups = self._generate_follow_ups(question, "aggregate", results)
        if follow_ups:
            sections.append("### Follow-up Questions")
            for idx, fq in enumerate(follow_ups[:3], 1):
                sections.append(f"{idx}. {fq}")

        return "\n".join(sections)

    def _format_generic(
        self,
        question: str,
        results: List[Dict[str, Any]],
        chart_data: Dict[str, Any] | None
    ) -> str:
        """Format generic query results."""
        context = self._extract_context(question)

        sections = []
        sections.append(f"**Here is a summary of {context} based on the query results:**\n")

        sections.append("### Summary")
        sections.append(f"Found {len(results)} result(s):")

        for idx, row in enumerate(results[:5], 1):
            item_text = self._format_list_item(row)
            sections.append(f"{idx}. {item_text}")

        if len(results) > 5:
            sections.append(f"... and {len(results) - 5} more")

        return "\n".join(sections)

    def _format_empty_results(self, question: str) -> str:
        """Format response when no results found."""
        return f"**No data found for your query.**\n\nTry adjusting your search criteria or time range."

    def _extract_context(self, question: str) -> str:
        """Extract context from question for header."""
        # Simple heuristic - use first meaningful phrase
        words = question.lower().split()
        if 'top' in words or 'best' in words:
            return "your top performers"
        elif 'compare' in words:
            return "the comparison"
        elif 'sales' in words:
            return "sales data"
        elif 'revenue' in words:
            return "revenue data"
        elif 'product' in words:
            return "product information"
        elif 'store' in words:
            return "store performance"
        else:
            return "the data"

    def _generate_summary_description(self, question: str, results: List[Dict[str, Any]]) -> str:
        """Generate description for summary section."""
        question_lower = question.lower()
        count = len(results)

        # Extract metric
        if 'revenue' in question_lower or 'sales' in question_lower:
            metric = "by revenue"
        elif 'quantity' in question_lower or 'units' in question_lower:
            metric = "by quantity sold"
        elif 'profit' in question_lower:
            metric = "by profit"
        else:
            metric = ""

        # Extract subject
        if 'product' in question_lower:
            subject = f"top {count} products"
        elif 'store' in question_lower:
            subject = f"top {count} stores"
        elif 'category' in question_lower:
            subject = f"top {count} categories"
        else:
            subject = f"top {count} items"

        # Extract timeframe
        if 'today' in question_lower:
            timeframe = "today"
        elif 'yesterday' in question_lower:
            timeframe = "yesterday"
        elif 'week' in question_lower:
            timeframe = "this week"
        elif 'month' in question_lower:
            timeframe = "this month"
        elif 'year' in question_lower:
            timeframe = "this year"
        else:
            timeframe = ""

        parts = [subject, metric, timeframe]
        return " ".join(p for p in parts if p)

    def _format_list_item(self, row: Dict[str, Any]) -> str:
        """Format a single row as a list item."""
        parts = []

        # Find name/label column (usually first string column)
        name_col = None
        for key, value in row.items():
            if isinstance(value, str) and len(value) > 0:
                name_col = key
                break

        if name_col:
            parts.append(f"**{row[name_col]}**")

        # Add numeric values
        for key, value in row.items():
            if key == name_col:
                continue

            formatted_value = self._format_value(value, key)
            if formatted_value:
                clean_key = key.replace('_', ' ').replace('total', '').strip()
                if clean_key:
                    parts.append(f"{formatted_value}")
                else:
                    parts.append(formatted_value)

        return " - ".join(parts) if parts else str(row)

    def _format_comparison_item(self, row: Dict[str, Any]) -> str:
        """Format comparison row."""
        parts = []
        for key, value in row.items():
            formatted_value = self._format_value(value, key)
            clean_key = key.replace('_', ' ').title()
            parts.append(f"**{clean_key}**: {formatted_value}")

        return " | ".join(parts)

    def _extract_ranking_columns(self, row: Dict[str, Any]) -> Tuple[str, float, float | None]:
        """
        Extract name, revenue, and units columns using priority mapping.

        Returns:
            Tuple of (name, revenue, units or None)
        """
        # Name column priority: product_name > name > item > title
        name_priorities = ['product_name', 'name', 'item', 'title']
        name = None
        for priority_col in name_priorities:
            for key, value in row.items():
                if key.lower() == priority_col and isinstance(value, str):
                    name = value
                    break
            if name:
                break

        # Fallback: first string column
        if not name:
            for key, value in row.items():
                if isinstance(value, str) and len(value) > 0:
                    name = value
                    break

        if not name:
            name = "Unknown"

        # Revenue column priority: net_amount > revenue > total_revenue > amount > sales > item_total
        revenue_priorities = ['net_amount', 'revenue', 'total_revenue', 'amount', 'sales', 'item_total']
        revenue = 0.0
        revenue_col_found = None
        for priority_col in revenue_priorities:
            for key, value in row.items():
                if key.lower() == priority_col and isinstance(value, (int, float, Decimal)):
                    revenue = float(value)
                    revenue_col_found = key.lower()
                    break
            if revenue != 0.0:
                break

        # Units column priority: units > quantity > qty > units_sold > total_quantity > total_quantity_sold
        units_priorities = ['units', 'quantity', 'qty', 'units_sold', 'total_quantity', 'total_quantity_sold']
        units = None
        for priority_col in units_priorities:
            for key, value in row.items():
                if key.lower() == priority_col and isinstance(value, (int, float, Decimal)):
                    units = float(value)
                    break
            if units is not None:
                break

        # Fallback: look for any numeric column that's not units
        if revenue == 0.0:
            for key, value in row.items():
                if isinstance(value, (int, float, Decimal)) and key.lower() not in units_priorities:
                    revenue = float(value)
                    break

        return (name, revenue, units)

    def _format_currency(self, value: float) -> str:
        """
        Format currency with configured symbol and decimal places.

        Example: 234523.50 -> ₱234,523.50
        """
        return f"{self.currency_symbol}{value:,.{self.decimal_places}f}"

    def _format_units(self, value: float | None) -> str:
        """
        Format units with thousands separators or N/A if missing.

        Example: 156349 -> 156,349 units
                 None -> N/A units
        """
        if value is None:
            return "N/A units"

        # Round to integer for units
        int_value = int(round(value))
        return f"{int_value:,} units"

    def _format_value(self, value: Any, column_name: str = "") -> str:
        """Format a value based on its type and column name."""
        # Robust NULL/empty handling
        if value is None:
            return "N/A"

        # Handle NaN for floats
        if isinstance(value, float) and (value != value):  # NaN check
            return "N/A"

        # Handle empty strings
        if isinstance(value, str) and not value.strip():
            return "N/A"

        # Check if it's a currency column
        is_currency = any(kw in column_name.lower() for kw in ['revenue', 'sales', 'price', 'cost', 'profit', 'total', 'amount'])
        
        # Check if it's a date/time column
        is_date = any(kw in column_name.lower() for kw in ['date', 'time', 'created', 'updated', 'day'])
        
        # Check if it's a percentage column
        is_percent = any(kw in column_name.lower() for kw in ['pct', 'percent', 'percentage', 'ratio', 'margin'])

        # Format dates and datetimes
        if isinstance(value, datetime):
            return self._format_datetime(value)
        elif isinstance(value, date):
            return self._format_date(value)
        
        # Format numbers
        if isinstance(value, (int, float, Decimal)):
            float_val = float(value)
            
            # Percentages
            if is_percent:
                return f"{float_val:.1f}%"
            
            # Currency - keep decimals for smaller amounts
            if is_currency:
                if float_val >= 1000000:
                    return f"{self.currency_symbol}{float_val/1000000:.2f}M"
                elif float_val >= 1000:
                    return f"{self.currency_symbol}{float_val:,.0f}"
                else:
                    return f"{self.currency_symbol}{float_val:,.{self.decimal_places}f}"
            
            # Large numbers - abbreviate
            if float_val >= 1000000:
                return f"{float_val/1000000:.2f}M"
            elif float_val >= 1000:
                return f"{int(float_val):,}"
            else:
                # Small numbers - keep decimals if they exist
                if float_val == int(float_val):
                    return f"{int(float_val):,}"
                else:
                    return f"{float_val:,.2f}"

        # Format strings - check for date patterns
        if isinstance(value, str) and is_date:
            formatted = self._try_format_date_string(value)
            if formatted:
                return formatted

        return str(value)

    def _format_date(self, value: date) -> str:
        """Format a date object to human-readable string.
        
        Example: 2025-12-23 -> Dec 23, 2025
        """
        return value.strftime(self.date_format)
    
    def _format_datetime(self, value: datetime) -> str:
        """Format a datetime object to human-readable string.
        
        Example: 2025-12-23 15:45:00 -> Dec 23, 2025 at 3:45 PM
        """
        return value.strftime(self.datetime_format)
    
    def _format_time(self, value: datetime) -> str:
        """Format a time to human-readable string.
        
        Example: 15:45:00 -> 3:45 PM
        """
        return value.strftime(self.time_format)
    
    def _try_format_date_string(self, value: str) -> str | None:
        """Try to parse and format a date string.
        
        Returns formatted date or None if not a date.
        """
        # Common date patterns to try
        patterns = [
            "%Y-%m-%d",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S%z",
        ]
        
        for pattern in patterns:
            try:
                # Handle timezone offset format
                clean_value = value.replace('+00:00', '+0000').replace('-00:00', '-0000')
                dt = datetime.strptime(clean_value, pattern)
                if pattern in ["%Y-%m-%d"]:
                    return dt.strftime(self.date_format)
                else:
                    return dt.strftime(self.datetime_format)
            except ValueError:
                continue
        
        return None
    
    def _format_number_abbreviated(self, value: float) -> str:
        """Format large numbers with K/M/B suffixes.
        
        Examples:
            1234 -> 1.2K
            1234567 -> 1.2M
            1234567890 -> 1.2B
        """
        if value >= 1_000_000_000:
            return f"{value / 1_000_000_000:.1f}B"
        elif value >= 1_000_000:
            return f"{value / 1_000_000:.1f}M"
        elif value >= 1_000:
            return f"{value / 1_000:.1f}K"
        else:
            return f"{value:.0f}"


    def _generate_insights_ranking(self, results: List[Dict[str, Any]]) -> List[str]:
        """Generate insights for ranking queries."""
        insights = []

        if len(results) < 2:
            return insights

        # Find numeric columns
        first_row = results[0]
        numeric_cols = [k for k, v in first_row.items() if isinstance(v, (int, float, Decimal))]

        if not numeric_cols:
            return insights

        # Use first numeric column for insights
        metric_col = numeric_cols[0]

        # Top performer dominance
        top_value = float(results[0].get(metric_col, 0))
        second_value = float(results[1].get(metric_col, 0)) if len(results) > 1 else 0

        if second_value > 0:
            ratio = top_value / second_value
            if ratio >= 2:
                insights.append(f"Top performer dominates with {ratio:.1f}x more than #2")
            elif ratio >= 1.5:
                insights.append(f"Clear leader with {int((ratio - 1) * 100)}% more than runner-up")

        # Overall distribution
        if len(results) >= 5:
            top_3_total = sum(float(r.get(metric_col, 0)) for r in results[:3])
            total = sum(float(r.get(metric_col, 0)) for r in results)

            if total > 0:
                top_3_pct = int((top_3_total / total) * 100)
                insights.append(f"Top 3 account for {top_3_pct}% of total")

        # Gap analysis
        if len(results) >= 3:
            third_value = float(results[2].get(metric_col, 0))
            if second_value > 0 and third_value > 0:
                gap = int(((second_value - third_value) / second_value) * 100)
                if gap >= 30:
                    insights.append(f"Significant {gap}% drop from #2 to #3")

        return insights[:4]

    def _generate_insights_comparison(self, results: List[Dict[str, Any]]) -> List[str]:
        """Generate insights for comparison queries."""
        insights = []

        if len(results) < 2:
            return insights

        # Find numeric columns
        first_row = results[0]
        numeric_cols = [k for k, v in first_row.items() if isinstance(v, (int, float, Decimal))]

        for col in numeric_cols[:2]:  # Max 2 metrics
            values = [float(r.get(col, 0)) for r in results[:2]]
            if len(values) == 2 and values[1] != 0:
                diff_pct = int(((values[0] - values[1]) / values[1]) * 100)
                clean_col = col.replace('_', ' ').title()

                if diff_pct > 0:
                    insights.append(f"First item has {diff_pct}% higher {clean_col}")
                elif diff_pct < 0:
                    insights.append(f"Second item has {abs(diff_pct)}% higher {clean_col}")

        return insights

    def _generate_insights_time_series(self, results: List[Dict[str, Any]]) -> List[str]:
        """Generate insights for time series queries."""
        insights = []

        if len(results) < 3:
            return insights

        # Find numeric columns
        first_row = results[0]
        numeric_cols = [k for k, v in first_row.items() if isinstance(v, (int, float, Decimal))]

        if not numeric_cols:
            return insights

        metric_col = numeric_cols[0]
        values = [float(r.get(metric_col, 0)) for r in results]

        # Find peak
        max_idx = values.index(max(values))
        max_value = values[max_idx]
        insights.append(f"Peak at position #{max_idx + 1} with {self._format_value(max_value, metric_col)}")

        # Find low
        min_idx = values.index(min(values))
        min_value = values[min_idx]
        if max_value > 0:
            diff_pct = int(((max_value - min_value) / max_value) * 100)
            insights.append(f"Lowest point is {diff_pct}% below peak")

        # Trend detection
        if len(values) >= 3:
            first_half_avg = sum(values[:len(values)//2]) / (len(values)//2)
            second_half_avg = sum(values[len(values)//2:]) / (len(values) - len(values)//2)

            if first_half_avg > 0:
                trend_pct = int(((second_half_avg - first_half_avg) / first_half_avg) * 100)
                if trend_pct > 10:
                    insights.append(f"Upward trend: {trend_pct}% increase over period")
                elif trend_pct < -10:
                    insights.append(f"Downward trend: {abs(trend_pct)}% decrease over period")

        return insights[:4]

    def _generate_notable_finding_ranking(self, results: List[Dict[str, Any]]) -> str:
        """Generate notable finding for ranking."""
        if len(results) < 2:
            return ""

        first_row = results[0]

        # Extract name using the same logic as _extract_ranking_columns
        name, revenue, units = self._extract_ranking_columns(first_row)

        # Use quantity as the primary metric if available, otherwise revenue
        if units is not None and units > 0:
            metric_value = units
            metric_name = "units sold"
            total = sum(self._extract_ranking_columns(r)[2] or 0 for r in results)
        else:
            metric_value = revenue
            metric_name = "revenue"
            total = sum(self._extract_ranking_columns(r)[1] for r in results)

        if total > 0:
            pct = int((metric_value / total) * 100)
            return f"**{name}** is your clear star performer, accounting for {pct}% of the total {metric_name}. This concentration suggests strong product-market fit."

        return f"**{name}** leads significantly in performance."

    def _generate_notable_finding_comparison(self, results: List[Dict[str, Any]]) -> str:
        """Generate notable finding for comparison."""
        if len(results) < 2:
            return ""

        return "The data shows distinct performance patterns between the compared items, suggesting different market dynamics or operational factors."

    def _generate_notable_finding_time_series(self, results: List[Dict[str, Any]]) -> str:
        """Generate notable finding for time series."""
        if len(results) < 3:
            return ""

        return "The time series reveals clear patterns that can inform staffing, inventory, and promotional decisions."

    def _generate_time_series_summary(self, results: List[Dict[str, Any]]) -> str:
        """Generate summary for time series."""
        if not results:
            return "No data available."

        first_row = results[0]
        numeric_cols = [k for k, v in first_row.items() if isinstance(v, (int, float, Decimal))]

        if not numeric_cols:
            return f"Showing {len(results)} time periods."

        metric_col = numeric_cols[0]
        values = [float(r.get(metric_col, 0)) for r in results]

        total = sum(values)
        avg = total / len(values)
        max_val = max(values)
        min_val = min(values)

        return f"Over {len(results)} periods: Total {self._format_value(total, metric_col)}, Average {self._format_value(avg, metric_col)}, Range {self._format_value(min_val, metric_col)} - {self._format_value(max_val, metric_col)}"

    def _generate_follow_ups(
        self,
        question: str,
        query_type: str,
        results: List[Dict[str, Any]] | None = None
    ) -> List[str]:
        """
        Generate contextual follow-up questions based on actual data.

        Args:
            question: Original user question
            query_type: Type of query (ranking, comparison, etc.)
            results: Query results for data-aware suggestions

        Returns:
            List of follow-up question suggestions
        """
        follow_ups = []

        # Extract entity name from first result if available
        top_name = None
        if results and len(results) > 0:
            first_row = results[0]
            # Find name column
            for key in ['product_name', 'name', 'item', 'store_name', 'category']:
                if key in first_row and first_row[key]:
                    top_name = str(first_row[key])
                    break

        if query_type == "ranking":
            if top_name:
                follow_ups = [
                    f"Show me {top_name} sales trend over the past month",
                    f"Which stores sell the most {top_name}?",
                    "How does this compare to last week's rankings?"
                ]
            else:
                follow_ups = [
                    "How does this compare to last month's rankings?",
                    "Break this down by store",
                    "What are the profit margins on these items?"
                ]
        elif query_type == "comparison":
            if top_name:
                follow_ups = [
                    f"Show me the trend for {top_name} over time",
                    "Add more items to this comparison",
                    "What's driving the performance difference?"
                ]
            else:
                follow_ups = [
                    "What's driving the performance difference?",
                    "Show this comparison over time",
                    "How do profit margins compare?"
                ]
        elif query_type == "time_series":
            follow_ups = [
                "Compare to the same period last week",
                "Which products drive the peak periods?",
                "Break this down by store"
            ]
        elif query_type == "aggregate":
            follow_ups = [
                "Break this down by store",
                "Show me the trend over time",
                "How does this compare to yesterday?"
            ]
        else:
            follow_ups = [
                "Break this down differently",
                "How does this compare over time?",
                "Filter by a specific store"
            ]

        return follow_ups[:3]

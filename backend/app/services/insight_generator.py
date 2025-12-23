"""
AI Insight Generator Service

Uses Claude to analyze query results and generate intelligent business insights.
Provides trend detection, anomaly highlighting, and contextual recommendations.
"""

from typing import Any, Dict, List, Optional
from anthropic import Anthropic
import asyncio
import json

from app.core.config import settings
from app.services.schema_context import SchemaContext


class InsightGenerator:
    """Generates AI-powered insights from query results."""

    def __init__(self):
        """Initialize with Anthropic client if API key is available."""
        self.enabled = bool(settings.ANTHROPIC_API_KEY)
        if self.enabled:
            self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
        else:
            self.client = None
    
    async def generate_insights(
        self,
        question: str,
        results: List[Dict[str, Any]],
        query_type: str = "unknown",
        max_insights: int = 4
    ) -> Dict[str, Any]:
        """
        Generate AI-powered insights from query results.
        
        Args:
            question: Original user question
            results: Query results as list of dicts
            query_type: Type of query (ranking, time_series, comparison, aggregate)
            max_insights: Maximum number of insights to generate
            
        Returns:
            Dictionary with:
                - insights: List of insight strings
                - trends: List of detected trends
                - anomalies: List of anomalies
                - recommendations: List of action recommendations
                - summary: One-sentence summary
        """
        if not self.enabled or not results:
            return self._get_default_insights(results, query_type)
        
        try:
            # Build prompt for Claude
            prompt = self._build_insight_prompt(question, results, query_type)
            
            # Call Claude API
            response = await self._call_claude(prompt)
            
            # Parse response
            insights = self._parse_insight_response(response)
            
            return insights
            
        except Exception as e:
            print(f"Insight generation failed: {e}")
            return self._get_default_insights(results, query_type)
    
    async def _call_claude(self, prompt: str) -> str:
        """Call Claude API for insight generation."""
        loop = asyncio.get_event_loop()
        
        def _sync_call():
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",  # Fast model for insights
                max_tokens=500,
                temperature=0.3,  # Slight creativity for insights
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )
            return message.content[0].text
        
        response = await loop.run_in_executor(None, _sync_call)
        return response
    
    def _build_insight_prompt(
        self, 
        question: str, 
        results: List[Dict[str, Any]],
        query_type: str
    ) -> str:
        """Build the prompt for insight generation."""
        
        # Limit results to top 10 for context window
        limited_results = results[:10]
        results_str = json.dumps(limited_results, indent=2, default=str)
        
        prompt = f"""You are a retail business analyst. Analyze these query results and provide insights.

## User Question
{question}

## Query Type
{query_type}

## Data (first 10 rows)
```json
{results_str}
```

## Your Task
Analyze this data and provide:

1. **INSIGHTS**: 2-3 key observations about the data (specific numbers, patterns)
2. **TRENDS**: Any trends you detect (upward, downward, seasonal)
3. **ANOMALIES**: Unusual values or outliers worth noting
4. **RECOMMENDATIONS**: 1-2 actionable recommendations based on the data
5. **SUMMARY**: One sentence summarizing the key takeaway

## Response Format
Respond in this exact JSON format:
```json
{{
    "insights": ["insight 1", "insight 2"],
    "trends": ["trend 1"],
    "anomalies": ["anomaly 1"],
    "recommendations": ["recommendation 1"],
    "summary": "One sentence summary"
}}
```

Be specific with numbers and percentages. Use Philippine Peso (₱) for currency.
Keep each item concise (under 30 words).
"""
        return prompt
    
    def _parse_insight_response(self, response: str) -> Dict[str, Any]:
        """Parse Claude's response into structured insights."""
        try:
            # Extract JSON from response
            import re
            json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
                return json.loads(json_str)
            
            # Try direct JSON parse
            return json.loads(response)
        except (json.JSONDecodeError, AttributeError):
            # Fallback to extracting text
            return {
                "insights": [response[:200]],
                "trends": [],
                "anomalies": [],
                "recommendations": [],
                "summary": "Analysis completed."
            }
    
    def _get_default_insights(
        self, 
        results: List[Dict[str, Any]], 
        query_type: str
    ) -> Dict[str, Any]:
        """Generate basic insights without AI when API is unavailable."""
        insights = []
        trends = []
        anomalies = []
        recommendations = []
        
        if not results:
            return {
                "insights": ["No data available for analysis."],
                "trends": [],
                "anomalies": [],
                "recommendations": ["Try adjusting your date range or filters."],
                "summary": "No results found."
            }
        
        # Basic statistical insights
        row_count = len(results)
        insights.append(f"Query returned {row_count:,} result(s).")
        
        # Find numeric columns for basic analysis
        if results:
            first_row = results[0]
            numeric_cols = [k for k, v in first_row.items() 
                          if isinstance(v, (int, float)) and v is not None]
            
            if numeric_cols and len(results) > 1:
                col = numeric_cols[0]
                values = [float(r.get(col, 0)) for r in results if r.get(col) is not None]
                if values:
                    total = sum(values)
                    avg = total / len(values)
                    max_val = max(values)
                    min_val = min(values)
                    
                    if query_type == "ranking":
                        # Top performer concentration
                        if total > 0:
                            top_pct = int((values[0] / total) * 100)
                            insights.append(f"Top performer accounts for {top_pct}% of total.")
                    
                    elif query_type == "time_series":
                        # Trend detection
                        if len(values) >= 3:
                            first_half = values[:len(values)//2]
                            second_half = values[len(values)//2:]
                            first_avg = sum(first_half) / len(first_half)
                            second_avg = sum(second_half) / len(second_half)
                            
                            if first_avg > 0:
                                change_pct = int(((second_avg - first_avg) / first_avg) * 100)
                                if change_pct > 10:
                                    trends.append(f"Upward trend: +{change_pct}% increase over period.")
                                elif change_pct < -10:
                                    trends.append(f"Downward trend: {change_pct}% decrease over period.")
                    
                    # Range insight
                    if max_val > min_val and min_val > 0:
                        ratio = max_val / min_val
                        if ratio > 5:
                            insights.append(f"High variance: max is {ratio:.1f}x the minimum.")
        
        # Default recommendations based on query type
        if query_type == "ranking":
            recommendations.append("Focus on maintaining top performers while investigating improvement opportunities for lower-ranked items.")
        elif query_type == "time_series":
            recommendations.append("Monitor these patterns to optimize staffing and inventory levels.")
        elif query_type == "comparison":
            recommendations.append("Investigate factors driving performance differences between items.")
        
        return {
            "insights": insights[:4],
            "trends": trends[:2],
            "anomalies": anomalies[:2],
            "recommendations": recommendations[:2],
            "summary": f"Analysis of {row_count} data point(s) completed."
        }


# Convenience function
async def generate_insights(
    question: str,
    results: List[Dict[str, Any]],
    query_type: str = "unknown"
) -> Dict[str, Any]:
    """Generate insights for query results."""
    generator = InsightGenerator()
    return await generator.generate_insights(question, results, query_type)

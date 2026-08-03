"""
Presentation Intelligence

Uses the Claude API to decide HOW to present a query result: the best text
layout (table / numbered list / key-value / prose) AND the best chart
(type + which columns map to which axis). The model sees the column schema and
a small sample of rows, then returns a compact JSON spec. Rendering itself stays
deterministic (no hallucinated numbers, all rows included).

Falls back to the heuristic ChartIntelligence / ResponseFormatter whenever the
model is unavailable or returns something unusable, so the chat never breaks.
"""
import asyncio
import json
import re
from decimal import Decimal
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from anthropic import Anthropic

from app.core.config import settings
from app.services.chart_intelligence import ChartIntelligence
from app.services.response_formatter import ResponseFormatter

# Columns that are never a meaningful chart measure (position indexes, ids).
_NON_METRIC = re.compile(r'^(rank|position|row_number|row_num|index|idx|.*_id|id)$', re.IGNORECASE)

_ALLOWED_CHART_TYPES = {
    "bar", "horizontal_bar", "line", "area", "pie", "stacked_bar",
    "scatter", "lollipop", "pareto", "none",
}
_ALLOWED_TEXT_FORMATS = {"table", "numbered_list", "key_value", "prose"}


class PresentationIntelligence:
    def __init__(self):
        self._client = (
            Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
            if settings.ANTHROPIC_API_KEY else None
        )
        self._chart_intel = ChartIntelligence()
        self._formatter = ResponseFormatter()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def analyze(self, question: str, results: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Ask Claude for a presentation spec. Returns None on any failure."""
        if not results or not self._client:
            return None
        try:
            prompt = self._build_prompt(question, results)
            raw = await asyncio.wait_for(self._call(prompt), timeout=25.0)
            spec = self._parse(raw, results)
            return spec
        except Exception as e:
            print(f"[presentation] analyze failed, using heuristics: {e}")
            return None

    def render_text(self, question: str, results: List[Dict[str, Any]], spec: Optional[Dict[str, Any]]) -> str:
        """Render the answer text. Uses the AI spec if present, else the heuristic formatter."""
        if not spec:
            return self._formatter.format_response(user_question=question, results=results)

        fmt = spec.get("text_format", "table")
        headline = spec.get("headline") or ""
        sections: List[str] = []
        if headline:
            sections.append(f"**{headline}**\n")

        if fmt == "prose":
            body = self._render_prose(results, spec)
        elif fmt == "key_value":
            body = self._render_key_value(results, spec)
        elif fmt == "numbered_list":
            body = self._render_numbered_list(results, spec)
        else:  # table (default)
            body = self._render_table(results, spec)
        sections.append(body)

        # Insights + follow-ups reuse the deterministic generators.
        insights = (self._formatter._generate_insights_comparison(results)
                    if fmt == "table"
                    else self._formatter._generate_insights_ranking(results))
        if insights:
            sections.append("\n### Key Insights")
            for ins in insights[:3]:
                sections.append(f"- {ins}")

        follow_ups = self._formatter._generate_follow_ups(question, "comparison", results)
        if follow_ups:
            sections.append("\n### Follow-up Questions")
            for idx, fq in enumerate(follow_ups[:3], 1):
                sections.append(f"{idx}. {fq}")

        return "\n".join(sections)

    def build_chart(self, question: str, results: List[Dict[str, Any]], spec: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Build a chart config from the AI spec. Returns None when the model
        explicitly wants no chart, or falls back to the heuristic selector when
        the spec is missing/unusable.
        """
        if not spec:
            return self._chart_intel.select_chart(question, results)

        chart = spec.get("chart") or {}
        ctype = chart.get("type")
        if ctype == "none":
            return None
        if ctype not in _ALLOWED_CHART_TYPES:
            return self._chart_intel.select_chart(question, results)

        x = chart.get("x")
        y = chart.get("y")
        cols = set(results[0].keys())
        # y must exist and be a real numeric measure (never rank/id).
        if not x or not y or x not in cols or y not in cols or _NON_METRIC.match(y):
            return self._chart_intel.select_chart(question, results)
        if not self._is_numeric_column(results, y):
            return self._chart_intel.select_chart(question, results)

        return self._assemble_chart(ctype, x, y, chart, results)

    # ------------------------------------------------------------------
    # Claude call
    # ------------------------------------------------------------------

    async def _call(self, prompt: str) -> str:
        loop = asyncio.get_event_loop()

        def _sync():
            msg = self._client.messages.create(
                model="claude-sonnet-4-5",
                max_tokens=700,
                temperature=0,
                messages=[{"role": "user", "content": prompt}],
            )
            return msg.content[0].text

        return await loop.run_in_executor(None, _sync)

    def _build_prompt(self, question: str, results: List[Dict[str, Any]]) -> str:
        columns = list(results[0].keys())
        schema = {c: self._col_kind(results, c) for c in columns}
        sample = results[:8]

        return f"""You are a data-presentation expert for a retail BI dashboard. Decide the CLEAREST way to present this SQL result to a business user. Return STRICT JSON only — no prose, no code fences.

USER QUESTION: "{question}"

COLUMNS (name -> kind): {json.dumps(schema)}
ROW COUNT: {len(results)}
SAMPLE ROWS (up to 8): {json.dumps(sample, default=str)}

Return this exact JSON shape:
{{
  "text_format": "table | numbered_list | key_value | prose",
  "value_columns": ["ordered list of columns to SHOW, most important first; omit redundant id/rank columns unless meaningful"],
  "label_column": "the column that names each row (store/product/category/date), or null",
  "headline": "one short natural-language sentence summarizing the answer",
  "chart": {{
    "type": "bar | horizontal_bar | line | area | pie | stacked_bar | scatter | lollipop | pareto | none",
    "x": "column for the x-axis / category (or null)",
    "y": "column for the y-axis — MUST be a meaningful numeric MEASURE (money, counts, quantities). NEVER use rank, position, row number, or an id as y.",
    "sort": "desc | asc | none",
    "title": "chart title"
  }}
}}

RULES:
- text_format: use "table" when each row has 2+ comparable metrics (e.g. multi-store comparison) — this is usually best for wide results. Use "numbered_list" for a ranking with ONE primary metric. Use "key_value" for a single summary row. Use "prose" for a single scalar answer.
- Chart: pick the single most decision-useful measure for y. If the user asked about sales, y should be a sales/amount column, not a percentage or rank. If nothing is meaningfully chartable (e.g. one row, or only text), set type to "none".
- Prefer line/area for time series (a date/hour/month x-axis), bar/horizontal_bar/lollipop for category rankings, pie only for <=6 parts of a whole.
- Only reference columns that exist. Output JSON only."""

    def _parse(self, raw: str, results: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        text = raw.strip()
        # Strip ```json ... ``` fences if present.
        if text.startswith("```"):
            text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text, flags=re.DOTALL).strip()
        # Grab the outermost JSON object.
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            return None
        spec = json.loads(match.group(0))

        if spec.get("text_format") not in _ALLOWED_TEXT_FORMATS:
            spec["text_format"] = "table"

        # Keep only value_columns that actually exist; default to all columns.
        cols = list(results[0].keys())
        vcs = [c for c in (spec.get("value_columns") or []) if c in cols]
        spec["value_columns"] = vcs or cols

        if spec.get("label_column") not in cols:
            spec["label_column"] = self._guess_label_column(results)
        return spec

    # ------------------------------------------------------------------
    # Text renderers
    # ------------------------------------------------------------------

    def _render_table(self, results: List[Dict[str, Any]], spec: Dict[str, Any]) -> str:
        label = spec.get("label_column")
        value_cols = [c for c in spec["value_columns"] if c != label]
        headers = ([label] if label else []) + value_cols

        def head(c: str) -> str:
            return c.replace('_', ' ').title()

        lines = ["| " + " | ".join(head(h) for h in headers) + " |",
                 "|" + "|".join("---" for _ in headers) + "|"]
        for row in results[:50]:
            cells = []
            if label:
                cells.append(str(row.get(label, "")))
            for c in value_cols:
                cells.append(self._formatter._format_value(row.get(c), c))
            lines.append("| " + " | ".join(cells) + " |")
        if len(results) > 50:
            lines.append(f"\n*Showing 50 of {len(results)} rows.*")
        return "\n".join(lines)

    def _render_numbered_list(self, results: List[Dict[str, Any]], spec: Dict[str, Any]) -> str:
        label = spec.get("label_column")
        value_cols = [c for c in spec["value_columns"] if c != label]
        lines = []
        for idx, row in enumerate(results[:20], 1):
            name = str(row.get(label, f"Row {idx}")) if label else f"Row {idx}"
            parts = []
            for c in value_cols:
                val = self._formatter._format_value(row.get(c), c)
                if val and val != "N/A":
                    parts.append(f"{c.replace('_', ' ').title()}: **{val}**")
            line = f"{idx}. **{name}**"
            if parts:
                line += " — " + ", ".join(parts)
            lines.append(line)
        if len(results) > 20:
            lines.append(f"\n*Showing 20 of {len(results)} results.*")
        return "\n".join(lines)

    def _render_key_value(self, results: List[Dict[str, Any]], spec: Dict[str, Any]) -> str:
        row = results[0]
        lines = []
        for c in spec["value_columns"]:
            val = self._formatter._format_value(row.get(c), c)
            lines.append(f"- **{c.replace('_', ' ').title()}**: {val}")
        return "\n".join(lines)

    def _render_prose(self, results: List[Dict[str, Any]], spec: Dict[str, Any]) -> str:
        row = results[0]
        parts = []
        for c in spec["value_columns"]:
            val = self._formatter._format_value(row.get(c), c)
            parts.append(f"{c.replace('_', ' ').title()} is {val}")
        return ". ".join(parts) + "." if parts else ""

    # ------------------------------------------------------------------
    # Chart assembly
    # ------------------------------------------------------------------

    def _assemble_chart(self, ctype: str, x: str, y: str, chart: Dict[str, Any],
                        results: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        ci = self._chart_intel
        y_lower = y.lower()
        is_currency = any(kw in y_lower for kw in ['revenue', 'sales', 'price', 'cost', 'profit', 'amount', 'basket'])

        data = []
        for row in results:
            try:
                value = float(row.get(y) or 0)
            except (ValueError, TypeError):
                value = 0.0
            data.append({
                "name": ci._format_axis_value(row.get(x), x),
                "fullName": str(row.get(x)),
                "value": value,
            })

        config = {
            "type": ctype,
            "title": chart.get("title") or ci._format_label(y),
            "data": data,
            "x_axis": x,
            "y_axis": y,
            "x_label": ci._format_label(x),
            "y_label": ci._format_label(y),
            "is_currency": is_currency,
            "units_column": None,
            "formatting": {
                "abbreviate_numbers": True,
                "currency_symbol": "₱" if is_currency else None,
                "decimal_places": 0 if is_currency else 2,
                "show_grid": True,
                "show_labels": len(data) <= 12,
                "label_rotation": 45 if len(data) > 5 else 0,
                "max_label_length": 15,
            },
            "tooltip": {
                "show_percentage": ctype == "pie",
                "show_units": False,
                "currency_format": is_currency,
            },
        }

        # Respect an explicit no-sort request (e.g. preserve time/category order)
        # by tagging config so validation doesn't reorder line/area anyway.
        repaired = ci._validate_and_repair(config, results)
        return repaired

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_numeric_column(results: List[Dict[str, Any]], col: str) -> bool:
        for row in results:
            v = row.get(col)
            if v is None:
                continue
            if isinstance(v, (int, float, Decimal)) and not isinstance(v, bool):
                return True
            return False
        return False

    def _col_kind(self, results: List[Dict[str, Any]], col: str) -> str:
        # Token-aware so "yesterday_sales" isn't mistaken for a time column.
        tokens = set(re.split(r'[^a-z]+', col.lower()))
        if tokens & {'date', 'time', 'hour', 'day', 'month', 'year', 'week', 'datetime', 'timestamp'}:
            return "time"
        for row in results:
            v = row.get(col)
            if v is None:
                continue
            if isinstance(v, bool):
                return "boolean"
            if isinstance(v, (int, float, Decimal)):
                return "numeric"
            if isinstance(v, (datetime, date)):
                return "time"
            return "text"
        return "text"

    @staticmethod
    def _guess_label_column(results: List[Dict[str, Any]]) -> Optional[str]:
        for c in results[0].keys():
            v = results[0][c]
            if isinstance(v, str) and v.strip():
                return c
        return None

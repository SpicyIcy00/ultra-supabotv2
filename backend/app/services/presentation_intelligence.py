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
# Token-aware + search-based so "store_rank"/"sales_rank"/"row_number" are all
# caught, not just an exact "rank".
_NON_METRIC = re.compile(
    r'(?:^|_)(rank|ranking|position|index|idx|id|rownum|seq|sequence|ordinal|row)(?:_|$)',
    re.IGNORECASE,
)

_ALLOWED_CHART_TYPES = {
    "bar", "horizontal_bar", "line", "area", "pie", "stacked_bar",
    "scatter", "lollipop", "pareto", "none",
}
_ALLOWED_TEXT_FORMATS = {"table", "numbered_list", "key_value", "prose"}

# Percentage / change / growth columns — a derived rate, not a magnitude measure.
_CHANGE_RE = re.compile(r'(pct|percent|percentage|ratio|change|growth|delta|margin)', re.IGNORECASE)
_TIME_TOKENS = {'date', 'time', 'hour', 'day', 'month', 'year', 'week', 'datetime', 'timestamp', 'quarter'}

# What a "sales"/"revenue"/etc. question maps to in column names. Checked in order.
_MEASURE_KEYWORDS = [
    (('revenue', 'sales', 'turnover', 'net sales', 'gross'), ('net_sales', 'revenue', 'sales', 'turnover', 'gross', 'amount', 'total')),
    (('transaction', 'txn', 'order', 'ticket', 'receipt'), ('txn', 'transaction', 'order', 'ticket', 'receipt', 'count')),
    (('quantity', 'units', 'qty', 'volume', 'sold', 'pieces'), ('qty', 'quantity', 'units', 'volume', 'sold', 'pieces')),
    (('basket', 'avg basket', 'average basket', 'ticket size'), ('basket',)),
    (('profit', 'margin', 'earnings', 'income'), ('profit', 'margin', 'earnings', 'income')),
    (('stock', 'inventory', 'on hand', 'on-hand'), ('stock', 'inventory', 'on_hand', 'qty_on_hand')),
]


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
        """Return a presentation spec. Uses Claude when available, else a
        heuristic spec — either way the result goes through the same shape-based
        coercion so the format always fits the data."""
        if not results:
            return None
        if not self._client:
            return self._heuristic_spec(question, results)
        try:
            prompt = self._build_prompt(question, results)
            raw = await asyncio.wait_for(self._call(prompt), timeout=25.0)
            spec = self._parse(raw, results)
            return spec or self._heuristic_spec(question, results)
        except Exception as e:
            print(f"[presentation] AI analyze failed, using heuristic spec: {e}")
            return self._heuristic_spec(question, results)

    def _heuristic_spec(self, question: str, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Deterministic spec (no AI). The chart is only a hint — build_chart
        picks the real measure/axes/type itself."""
        cols = list(results[0].keys())
        chart = {"type": "bar"} if len(results) >= 2 else {"type": "none"}

        label = self._guess_label_column(results)
        metric_cols = [c for c in cols if c != label and not _NON_METRIC.search(c)]
        # One primary metric per row reads best as a ranked list; wider results as a table.
        default_fmt = "numbered_list" if len(metric_cols) <= 1 else "table"

        spec = {
            "text_format": default_fmt,  # _coerce_spec finalises based on shape
            "value_columns": cols,
            "label_column": label,
            "headline": "",
            "chart": chart,
        }
        return self._coerce_spec(spec, results)

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
        Build a chart. The AI's chart type/title are used as hints, but the
        MEASURE (y) is chosen/validated here from the data + question so the bars
        always reflect the thing asked about (sales -> sales), never a rank.
        """
        if not results or len(results) < 2:
            return None

        cols = list(results[0].keys())
        chart = (spec or {}).get("chart") or {}
        if chart.get("type") == "none":
            return None

        # x-axis: a category/time label — never a numeric measure.
        x = chart.get("x") if chart.get("x") in cols else None
        if not x or self._is_numeric_series(results, x):
            x = self._pick_x_axis(results)
        if not x:
            return None

        # y-axis: trust the AI only if its choice survives every guard; otherwise
        # (and for any rank-shaped / change-% choice) compute the measure here.
        y = chart.get("y")
        y_ok = (
            y in cols
            and self._is_numeric_series(results, y)
            and not _NON_METRIC.search(y)
            and not self._looks_like_rank(results, y)
            and not _CHANGE_RE.search(y)  # prefer magnitude over a %-change column
        )
        if not y_ok:
            y = self._pick_y_measure(question, results, x)
        if not y:
            return None

        ctype = self._pick_chart_type(chart.get("type"), results, x)
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

DECISION FRAMEWORK (apply in order):
1. TEXT FORMAT — match the SHAPE of the data:
   - 1 row, 1 meaningful value  -> "prose"  (e.g. "Total sales today is ₱1.2M")
   - 1 row, several values       -> "key_value"  (a labelled summary of one entity/period)
   - many rows, ONE primary metric per row (a ranking/top-N) -> "numbered_list"
   - many rows, 2+ comparable metrics per row (compare entities side by side) -> "table"
   - a time series (one metric across dates/hours/months) -> "numbered_list" is fine, but the CHART carries it
   When unsure between numbered_list and table: use "table" if there are 3+ value columns, else "numbered_list".
2. CHART — pick the single most decision-useful MEASURE for y (money > counts > quantities). Never use rank, position, row number, an id, or a percentage/change column as y when a magnitude measure exists.
   - time series (x is a date/hour/day/month/week) -> "line" (or "area" for cumulative)
   - category ranking/comparison (x is store/product/category) -> "bar" (or "horizontal_bar" when labels are long, "lollipop" for many)
   - parts of a whole, <=6 slices -> "pie"
   - 80/20 contribution -> "pareto"
   - relationship between two measures -> "scatter"
   - only ONE row, or nothing numeric, or the numbers aren't comparable -> "none"
3. Only reference columns that exist. Prefer fewer, clearer columns over dumping every column.

EXAMPLES:
- "total sales today" -> {{"text_format":"prose","chart":{{"type":"none"}}}}
- "sales by store today" -> {{"text_format":"table","chart":{{"type":"bar","x":"store_name","y":"total_sales"}}}}
- "top 10 products this month" -> {{"text_format":"numbered_list","chart":{{"type":"bar","x":"product_name","y":"revenue"}}}}
- "hourly sales trend today" -> {{"text_format":"numbered_list","chart":{{"type":"line","x":"hour","y":"total_sales"}}}}
- "category share of sales" -> {{"text_format":"table","chart":{{"type":"pie","x":"category","y":"total_sales"}}}}

Output JSON only."""

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

        # Deterministic safety net: force the format to FIT the data shape, no
        # matter what the model said. This is what makes it reliable across any
        # future query, not just the ones we anticipated.
        return self._coerce_spec(spec, results)

    def _coerce_spec(self, spec: Dict[str, Any], results: List[Dict[str, Any]]) -> Dict[str, Any]:
        n = len(results)
        fmt = spec["text_format"]
        label = spec.get("label_column")
        # Meaningful (non-index) value columns present in the data.
        metric_cols = [c for c in spec["value_columns"] if not _NON_METRIC.search(c)]
        value_cols = [c for c in spec["value_columns"] if c != label]

        if n <= 1:
            # A single row can never be a list/table of rows.
            fmt = "prose" if len(value_cols) <= 1 else "key_value"
        else:
            # Multiple rows can never be a single-scalar/summary layout.
            if fmt in ("prose", "key_value"):
                fmt = "table" if len(value_cols) >= 3 else "numbered_list"
            # A numbered list needs a name per row; without one a table reads better.
            if fmt == "numbered_list" and not label:
                fmt = "table"
            # If the model over-collapsed a wide comparison into a list, widen it.
            if fmt == "numbered_list" and len([c for c in value_cols if c in metric_cols]) >= 3:
                fmt = "table"

        spec["text_format"] = fmt
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
        """Self-contained: build points, sort category charts by value desc
        (time charts keep their order), format labels. No external validation."""
        ci = self._chart_intel  # only for label/axis formatting helpers
        y_lower = y.lower()
        is_currency = any(kw in y_lower for kw in
                          ['revenue', 'sales', 'price', 'cost', 'profit', 'amount', 'basket', 'total'])

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

        # Category charts rank by the measure; time charts stay in their order.
        if ctype in ("bar", "horizontal_bar", "lollipop", "pie", "pareto"):
            data.sort(key=lambda d: d["value"], reverse=True)
            data = data[:20]

        title = chart.get("title") or f"{ci._format_label(y)} by {ci._format_label(x)}"

        return {
            "type": ctype,
            "title": title,
            "data": data,
            "x_axis": x,
            "y_axis": y,
            "x_label": ci._format_label(x),
            "y_label": ci._format_label(y),
            "is_currency": is_currency,
            "units_column": None,
            "data_point_count": len(data),
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

    # ------------------------------------------------------------------
    # Chart selection helpers (data-shape based, name-independent)
    # ------------------------------------------------------------------

    @staticmethod
    def _is_numeric_series(results: List[Dict[str, Any]], col: str) -> bool:
        saw = False
        for row in results:
            v = row.get(col)
            if v is None:
                continue
            if isinstance(v, bool) or not isinstance(v, (int, float, Decimal)):
                return False
            saw = True
        return saw

    # Backwards-compatible alias.
    _is_numeric_column = _is_numeric_series

    @staticmethod
    def _looks_like_rank(results: List[Dict[str, Any]], col: str) -> bool:
        """True if the column's values are a 1..N (or 0..N-1) position sequence —
        a rank/row-number regardless of what it's named."""
        vals = []
        for row in results:
            v = row.get(col)
            if v is None:
                continue
            if isinstance(v, bool) or not isinstance(v, (int, float, Decimal)):
                return False
            fv = float(v)
            if fv != int(fv):
                return False  # non-integer -> not a position index
            vals.append(int(fv))
        if len(vals) < 3:
            return False
        s = sorted(vals)
        return s[0] in (0, 1) and s == list(range(s[0], s[0] + len(s)))

    @staticmethod
    def _column_max_abs(results: List[Dict[str, Any]], col: str) -> float:
        m = 0.0
        for row in results:
            v = row.get(col)
            if isinstance(v, (int, float, Decimal)) and not isinstance(v, bool):
                m = max(m, abs(float(v)))
        return m

    def _is_time_col(self, results: List[Dict[str, Any]], col: str) -> bool:
        if set(re.split(r'[^a-z]+', col.lower())) & _TIME_TOKENS:
            return True
        v = results[0].get(col)
        return isinstance(v, (datetime, date))

    def _pick_x_axis(self, results: List[Dict[str, Any]]) -> Optional[str]:
        cols = list(results[0].keys())
        # Prefer a text label column.
        for c in cols:
            if not self._is_numeric_series(results, c) and not self._is_time_col(results, c):
                if isinstance(results[0].get(c), str):
                    return c
        # Then a time column (for trends).
        for c in cols:
            if self._is_time_col(results, c):
                return c
        # Then any non-numeric column.
        for c in cols:
            if not self._is_numeric_series(results, c):
                return c
        return cols[0] if cols else None

    def _pick_y_measure(self, question: str, results: List[Dict[str, Any]], x: str) -> Optional[str]:
        """Pick the measure to plot: match the question's intent, else the
        largest-magnitude real measure. Never a rank/id/%-change column."""
        q = question.lower()
        cands = [
            c for c in results[0].keys()
            if c != x
            and self._is_numeric_series(results, c)
            and not _NON_METRIC.search(c)
            and not self._looks_like_rank(results, c)
        ]
        if not cands:
            return None

        magnitude = [c for c in cands if not _CHANGE_RE.search(c)]
        pool = magnitude or cands

        # 1) Match the metric the user asked about.
        for q_terms, col_terms in _MEASURE_KEYWORDS:
            if any(t in q for t in q_terms):
                for c in pool:
                    cl = c.lower()
                    if any(t in cl for t in col_terms):
                        return c

        # 2) Otherwise the biggest-magnitude measure (sales dwarfs counts/%/rank).
        return max(pool, key=lambda c: self._column_max_abs(results, c))

    def _pick_chart_type(self, ai_type: Optional[str], results: List[Dict[str, Any]], x: str) -> str:
        if self._is_time_col(results, x):
            return "area" if ai_type == "area" else "line"
        if ai_type in ("pie", "pareto", "lollipop", "horizontal_bar") and ai_type in _ALLOWED_CHART_TYPES:
            return ai_type
        # Long labels read better horizontally.
        try:
            longest = max(len(str(r.get(x, ""))) for r in results)
        except ValueError:
            longest = 0
        return "horizontal_bar" if longest > 14 else "bar"

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

"""AI-powered insights for replenishment reports using Claude via direct HTTPS."""
import asyncio
import json
from typing import Any, Dict, List, Optional

import httpx


_ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"


class AIInsightsService:
    MODEL = "claude-haiku-4-5-20251001"

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured")
        self._api_key = api_key

    async def _call(self, prompt: str, max_tokens: int = 800) -> str:
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        payload = {
            "model": self.MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(_ANTHROPIC_API_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["content"][0]["text"]

    # ----------------------------------------------------------------
    # Narrative report
    # ----------------------------------------------------------------

    def _build_narrative_prompt(self, plan: Dict, exceptions: Dict) -> str:
        items = plan.get("items", [])
        run_date = plan.get("run_date", "unknown")
        mode = plan.get("calculation_mode", "unknown")
        summary = plan.get("summary", {})

        # Category roll-up
        cat_summary: Dict[str, Dict] = {}
        critical_items = []

        for item in items:
            cat = item.get("category") or "Uncategorized"
            if cat not in cat_summary:
                cat_summary[cat] = {"skus": 0, "units": 0, "critical": 0}
            cat_summary[cat]["skus"] += 1
            cat_summary[cat]["units"] += item.get("allocated_ship_qty", 0)
            if item.get("days_of_stock", 99) < 3:
                cat_summary[cat]["critical"] += 1
                critical_items.append(item)

        top_priority = sorted(items, key=lambda x: x.get("priority_score", 0), reverse=True)[:10]

        critical_text = "\n".join(
            f"- {i.get('product_name', i['sku_id'])} @ {i.get('store_name', i['store_id'])}: "
            f"{i.get('on_hand', 0)} on hand, {i.get('days_of_stock', 0):.1f} days, need {i.get('requested_ship_qty', 0)} units"
            for i in sorted(critical_items, key=lambda x: x.get("days_of_stock", 0))[:12]
        ) or "None"

        top_text = "\n".join(
            f"- {i.get('product_name', i['sku_id'])} @ {i.get('store_name', i['store_id'])}: "
            f"priority {i.get('priority_score', 0):.2f}, {i.get('days_of_stock', 0):.1f} days, "
            f"ship {i.get('allocated_ship_qty', 0)} units"
            for i in top_priority
        )

        cat_text = "\n".join(
            f"- {cat}: {d['skus']} SKUs, {d['units']} units to ship"
            + (f", {d['critical']} critical" if d["critical"] else "")
            for cat, d in sorted(cat_summary.items(), key=lambda x: x[1]["units"], reverse=True)
        )

        exc_items = exceptions.get("items", [])
        exc_counts: Dict[str, int] = {}
        for e in exc_items:
            exc_counts[e["exception_type"]] = exc_counts.get(e["exception_type"], 0) + 1
        exc_text = (
            ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in exc_counts.items())
            or "None"
        )

        return f"""You are an inventory planning assistant for a Philippine retail chain.

Analyze this weekly replenishment run and write an executive summary.

RUN DATE: {run_date} | MODE: {mode}
TOTAL SKUs: {summary.get('total_skus', 0)} | UNITS TO SHIP: {summary.get('total_allocated_units', 0):,} | STORES: {summary.get('total_stores', 0)}
EXCEPTIONS: {exc_text}

CRITICAL ITEMS (< 3 days of stock):
{critical_text}

TOP 10 HIGHEST PRIORITY:
{top_text}

CATEGORY BREAKDOWN:
{cat_text}

Write a concise 3-paragraph executive summary covering:
1. Overall inventory health and urgency level
2. Which specific products and stores need immediate attention this week
3. Key actions the warehouse team should prioritize

Be specific with product names, store names, and quantities. Keep it under 280 words."""

    # ----------------------------------------------------------------
    # Exception analysis
    # ----------------------------------------------------------------

    def _build_exception_prompt(self, exceptions: List[Dict]) -> str:
        exc_text = "\n".join(
            f"{i}. {e.get('product_name', e['sku_id'])} @ {e.get('store_name', e['store_id'])}: "
            f"type={e['exception_type']}, {e.get('detail', '')}, "
            f"days_of_stock={e.get('days_of_stock', 0):.1f}, "
            f"requested={e.get('requested_qty', 0)}, allocated={e.get('allocated_qty', 0)}"
            for i, e in enumerate(exceptions[:30])
        )

        return f"""You are an inventory expert. For each flagged inventory exception, provide a brief root cause and a specific recommended action.

EXCEPTIONS:
{exc_text}

Respond with a JSON array only. Each element:
{{"index": <0-based int>, "root_cause": "<1 sentence>", "recommended_action": "<concrete action>"}}

Respond with ONLY the JSON array, no other text."""

    # ----------------------------------------------------------------
    # Demand / forecast insights
    # ----------------------------------------------------------------

    def _build_demand_prompt(self, items: List[Dict]) -> str:
        # Items with significant dead days (stockout-constrained; true demand is higher)
        high_dead = sorted(
            [i for i in items if (i.get("dead_days") or 0) >= 5],
            key=lambda x: x.get("dead_days", 0),
            reverse=True,
        )[:10]

        # Cross-store velocity anomalies for the same SKU
        sku_groups: Dict[str, List] = {}
        for item in items:
            key = item.get("product_name") or item["sku_id"]
            sku_groups.setdefault(key, []).append(item)

        anomalies = []
        for sku, group in sku_groups.items():
            if len(group) < 2:
                continue
            vels = [g.get("avg_daily_sales", 0) for g in group]
            if max(vels) > 0 and max(vels) / (min(vels) + 0.01) > 3:
                anomalies.append({
                    "sku": sku,
                    "stores": [
                        {"store": g.get("store_name", g["store_id"]), "velocity": g.get("avg_daily_sales", 0)}
                        for g in group
                    ],
                })

        dead_text = "\n".join(
            f"- {i.get('product_name', i['sku_id'])} @ {i.get('store_name', i['store_id'])}: "
            f"{i.get('dead_days', 0)} dead days, {i.get('avg_daily_sales', 0):.2f} units/day avg, "
            f"{i.get('on_hand', 0)} on hand"
            for i in high_dead
        ) or "None"

        anomaly_text = "\n".join(
            f"- {a['sku']}: " + ", ".join(
                f"{s['store']}={s['velocity']:.2f}/day" for s in a["stores"]
            )
            for a in anomalies[:8]
        ) or "None"

        # Category velocity averages
        cat_vel: Dict[str, List[float]] = {}
        for item in items:
            cat = item.get("category") or "Uncategorized"
            cat_vel.setdefault(cat, []).append(item.get("avg_daily_sales", 0))
        cat_avg_text = "\n".join(
            f"- {cat}: avg {sum(v)/len(v):.2f} units/day across {len(v)} SKUs"
            for cat, v in sorted(cat_vel.items(), key=lambda x: sum(x[1]) / len(x[1]), reverse=True)
        )

        return f"""You are an inventory demand analyst for a Philippine retail chain.

Analyze these patterns from the latest replenishment data and provide actionable insights.

ITEMS WITH HIGH DEAD/STOCKOUT DAYS (true demand may be higher than velocity suggests):
{dead_text}

SAME-SKU VELOCITY DIFFERENCES ACROSS STORES (potential store-level issues):
{anomaly_text}

CATEGORY VELOCITY AVERAGES:
{cat_avg_text}

Provide 4-6 specific insights. For each:
- Identify what the pattern means
- Give a concrete recommendation (e.g., increase safety_days for X, raise velocity multiplier for category Y, investigate dead stock at store Z)

Respond with a JSON array only:
[{{"title": "<short title>", "observation": "<what the data shows>", "action": "<specific recommendation>"}}]

Respond with ONLY the JSON array, no other text."""

    # ----------------------------------------------------------------
    # Main entry point
    # ----------------------------------------------------------------

    async def generate_full_insights(
        self, plan: Dict, exceptions: Dict
    ) -> Dict[str, Any]:
        items = plan.get("items", [])
        exc_items = exceptions.get("items", [])

        narrative_prompt = self._build_narrative_prompt(plan, exceptions)
        exc_prompt = self._build_exception_prompt(exc_items) if exc_items else None
        demand_prompt = self._build_demand_prompt(items) if items else None

        # Build coroutines list, tracking which index is which
        coros = [self._call(narrative_prompt, max_tokens=600)]
        exc_index: Optional[int] = None
        demand_index: Optional[int] = None

        if exc_prompt:
            exc_index = len(coros)
            coros.append(self._call(exc_prompt, max_tokens=900))

        if demand_prompt:
            demand_index = len(coros)
            coros.append(self._call(demand_prompt, max_tokens=800))

        results = await asyncio.gather(*coros, return_exceptions=True)

        # If the narrative call failed, raise so the caller gets a real error
        r0 = results[0]
        if isinstance(r0, Exception):
            raise r0
        narrative: str = r0

        # --- Exception analyses ---
        exception_analyses: List[Dict] = []
        if exc_index is not None:
            raw = results[exc_index]
            if not isinstance(raw, Exception):
                try:
                    parsed = json.loads(raw)
                    for entry in parsed:
                        idx = int(entry.get("index", -1))
                        if 0 <= idx < len(exc_items):
                            exception_analyses.append({
                                **exc_items[idx],
                                "ai_root_cause": entry.get("root_cause", ""),
                                "ai_recommended_action": entry.get("recommended_action", ""),
                            })
                except (json.JSONDecodeError, TypeError, ValueError):
                    pass

        # --- Demand insights ---
        demand_insights: List[Dict] = []
        if demand_index is not None:
            raw = results[demand_index]
            if not isinstance(raw, Exception):
                try:
                    demand_insights = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    pass

        return {
            "run_date": plan.get("run_date"),
            "narrative": narrative,
            "exception_analyses": exception_analyses,
            "demand_insights": demand_insights,
        }

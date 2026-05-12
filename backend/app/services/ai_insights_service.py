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

    async def _call(self, prompt: str, max_tokens: int = 800, system: Optional[str] = None) -> str:
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        payload: Dict[str, Any] = {
            "model": self.MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            payload["system"] = system
        async with httpx.AsyncClient(timeout=90.0) as client:
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

Be specific with product names, store names, and quantities. Keep it under 280 words.
IMPORTANT: Write plain prose only. No markdown, no bullet points, no bold, no headers."""

    # ----------------------------------------------------------------
    # Exception analysis
    # ----------------------------------------------------------------

    def _build_exception_prompt(self, exceptions: List[Dict]) -> str:
        exc_text = "\n".join(
            f"{i+1}. {e.get('product_name', e['sku_id'])} @ {e.get('store_name', e['store_id'])}: "
            f"type={e['exception_type']}, {e.get('detail', '')}, "
            f"days_of_stock={e.get('days_of_stock', 0):.1f}, "
            f"requested={e.get('requested_qty', 0)}, allocated={e.get('allocated_qty', 0)}"
            for i, e in enumerate(exceptions[:30])
        )

        return f"""You are an inventory expert. For each flagged inventory exception below, provide a root cause and recommended action.

EXCEPTIONS:
{exc_text}

Respond with a JSON array only. Return exactly one object per exception, in the same order.
Each object: {{"root_cause": "<1 sentence>", "recommended_action": "<concrete action>"}}

Respond with ONLY the JSON array, no other text, no markdown."""

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

Respond with ONLY the JSON array, no other text, no markdown fences.
"""

    # ----------------------------------------------------------------
    # AI Reasoning Mode — raw snapshot analysis
    # ----------------------------------------------------------------

    _REASONING_SYSTEM = (
        "You are a replenishment analyst for Aji Ichiban, a snack retail chain in the Philippines. "
        "You will be given 28 days of raw inventory and sales data for one product at one store. "
        "No formula output will be given. Reason from the data only. "
        "Output: (1) true daily velocity when in stock, (2) how long recent restocks lasted, "
        "(3) recommended min stock, (4) recommended ship quantity, "
        "(5) one paragraph plain-English reasoning. "
        "Be conservative — stockouts cost more than overstock."
    )

    def _build_snapshot_payload(
        self,
        name: str,
        store: str,
        category: str,
        on_hand: int,
        snapshots: List[tuple],
    ) -> str:
        if not snapshots:
            return (
                f"PRODUCT: {name}\nSTORE: {store}\nCATEGORY: {category}\n\n"
                f"No snapshot history available for this period.\n"
                f"CURRENT ON HAND: {on_hand}"
            )

        rows = []
        prev_qty: Optional[int] = None
        for snap_date, qty in snapshots:
            if prev_qty is None:
                rows.append(f"{snap_date} | {qty:5d} |        - | (start)")
            elif qty > prev_qty:
                rows.append(f"{snap_date} | {qty:5d} |        - | RESTOCK +{qty - prev_qty}")
            elif qty == 0 and prev_qty == 0:
                rows.append(f"{snap_date} | {qty:5d} |        0 | STOCKOUT (continued)")
            elif qty == 0:
                rows.append(f"{snap_date} | {qty:5d} | {prev_qty:7d} | STOCKOUT")
            else:
                rows.append(f"{snap_date} | {qty:5d} | {prev_qty - qty:7d} |")
            prev_qty = qty

        table = "DATE        | ON HAND | SOLD EST | NOTES\n" + "\n".join(rows)
        return (
            f"PRODUCT: {name}\nSTORE: {store}\nCATEGORY: {category}\n\n"
            f"{table}\n\n"
            f"CURRENT ON HAND: {on_hand}\n"
            f"SNAPSHOT COVERAGE: {len(snapshots)} days"
        )

    async def _analyze_single_item(
        self,
        name: str,
        store: str,
        category: str,
        on_hand: int,
        snapshots: List[tuple],
    ) -> Dict[str, Any]:
        payload = self._build_snapshot_payload(name, store, category, on_hand, snapshots)
        user_prompt = (
            f"{payload}\n\n"
            "Respond ONLY with valid JSON (no markdown fences):\n"
            '{"true_velocity": <float>, "avg_restock_duration_days": <float or null>, '
            '"recommended_min_qty": <integer>, "recommended_ship_qty": <integer>, '
            '"reasoning": "<one paragraph>"}'
        )
        raw = await self._call(user_prompt, max_tokens=500, system=self._REASONING_SYSTEM)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1] if len(parts) > 1 else cleaned
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()
        result = json.loads(cleaned)
        return {
            "true_velocity": result.get("true_velocity"),
            "avg_restock_duration_days": result.get("avg_restock_duration_days"),
            "recommended_min_qty": max(0, int(round(result.get("recommended_min_qty", 0)))),
            "recommended_ship_qty": max(0, int(round(result.get("recommended_ship_qty", 0)))),
            "reasoning": str(result.get("reasoning", ""))[:1000],
        }

    async def analyze_store_with_reasoning(
        self,
        items: List[Dict],
        snapshot_map: Dict[str, List[tuple]],
    ) -> List[Dict]:
        """Run AI Reasoning Mode: analyze each item from raw snapshot data only.
        Items with no snapshot history are skipped (marked with no_data=True).
        """
        CONCURRENT = 15

        # Only send items that actually have snapshot history to Claude
        has_data = [it for it in items if snapshot_map.get(it["sku_id"])]
        no_data_ids = {it["sku_id"] for it in items if not snapshot_map.get(it["sku_id"])}

        async def process(item: Dict) -> Dict:
            sku_id = item["sku_id"]
            try:
                result = await self._analyze_single_item(
                    name=item.get("product_name") or sku_id,
                    store=item.get("store_name") or item["store_id"],
                    category=item.get("category") or "Unknown",
                    on_hand=int(item.get("on_hand", 0)),
                    snapshots=snapshot_map.get(sku_id, []),
                )
                return {"sku_id": sku_id, "store_id": item["store_id"], **result}
            except Exception as e:
                return {
                    "sku_id": sku_id,
                    "store_id": item["store_id"],
                    "true_velocity": None,
                    "avg_restock_duration_days": None,
                    "recommended_min_qty": 0,
                    "recommended_ship_qty": 0,
                    "reasoning": f"Analysis unavailable: {str(e)[:200]}",
                    "error": True,
                }

        results: List[Dict] = []
        for i in range(0, len(has_data), CONCURRENT):
            chunk = has_data[i:i + CONCURRENT]
            chunk_results = await asyncio.gather(*[process(it) for it in chunk])
            results.extend(chunk_results)

        # Append placeholder entries for items with no snapshot data
        for item in items:
            if item["sku_id"] in no_data_ids:
                results.append({
                    "sku_id": item["sku_id"],
                    "store_id": item["store_id"],
                    "true_velocity": None,
                    "avg_restock_duration_days": None,
                    "recommended_min_qty": 0,
                    "recommended_ship_qty": 0,
                    "reasoning": "No snapshot history available for this SKU.",
                    "no_data": True,
                })

        return results

    # ----------------------------------------------------------------
    # AI quantity calculation
    # ----------------------------------------------------------------

    async def _calculate_batch_quantities(
        self, batch: List[Dict], cross_store_ctx: Dict[str, str]
    ) -> List[Dict]:
        lines = []
        for i, item in enumerate(batch):
            name = item.get("product_name") or item["sku_id"]
            ctx = cross_store_ctx.get(name, "")
            line = (
                f"{i+1}. {name} @ {item.get('store_name', item['store_id'])}"
                f" ({item.get('category', '?')})"
                f"\n   velocity={item.get('avg_daily_sales', 0):.2f}/day"
                f", dead_days={item.get('dead_days', 0)}"
                f", on_hand={item.get('on_hand', 0)}"
                f", formula_min={item.get('min_level', 0):.0f}"
                f", formula_ship={item.get('allocated_ship_qty', 0)}"
                f", days_stock={item.get('days_of_stock', 0):.1f}"
            )
            if ctx:
                line += f"\n   cross-store: {ctx}"
            lines.append(line)

        prompt = f"""You are an expert inventory planner for a Philippine retail chain.

Calculate the optimal min_qty (minimum stock reorder point) and ship_qty for each item.

DEFINITIONS:
- min_qty: minimum stock level to maintain before reordering. Baseline = formula_min already shown.
- ship_qty: units to send NOW. Baseline = formula_ship already shown.

ADJUSTMENT LOGIC (apply with judgment):
1. Dead days correction: dead_days > 0 means the product was stocked out — true demand is higher than velocity shows. Increase min_qty proportionally: add ~velocity × (dead_days/28) × 1.5 to formula_min.
2. Cross-store uncertainty: if the same SKU has >3× velocity spread across stores, add ~20% buffer to min_qty.
3. Critical urgency: if days_stock < 3 and formula_ship = 0, something is wrong — set ship_qty to at least velocity × 7.
4. Overstock: if days_stock > 90, ship_qty = 0.

ITEMS:
{chr(10).join(lines)}

Return ONLY a JSON array in the exact same order as the input items:
[{{"ai_min_qty": <integer>, "ai_ship_qty": <integer>, "ai_reasoning": "<one sentence max>"}}]"""

        raw = await self._call(prompt, max_tokens=max(400, len(batch) * 80))
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1] if len(parts) > 1 else cleaned
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()
        parsed = json.loads(cleaned)

        results = []
        for i, item in enumerate(batch):
            e = parsed[i] if i < len(parsed) else {}
            results.append({
                "sku_id": item["sku_id"],
                "store_id": item["store_id"],
                "ai_min_qty": max(0, int(round(e.get("ai_min_qty", item.get("min_level", 0))))),
                "ai_ship_qty": max(0, int(round(e.get("ai_ship_qty", item.get("allocated_ship_qty", 0))))),
                "ai_reasoning": str(e.get("ai_reasoning", ""))[:200],
            })
        return results

    async def calculate_ai_quantities(self, items: List[Dict]) -> List[Dict]:
        """Calculate AI-optimized min quantities and ship quantities for all plan items."""
        if not items:
            return []

        # Build cross-store velocity context (same SKU across stores)
        sku_vel_map: Dict[str, List[str]] = {}
        for item in items:
            name = item.get("product_name") or item["sku_id"]
            entry = f"{item.get('store_name', item['store_id'])}={item.get('avg_daily_sales', 0):.2f}/day"
            sku_vel_map.setdefault(name, []).append(entry)

        cross_store_ctx: Dict[str, str] = {
            name: ", ".join(stores[:5])
            for name, stores in sku_vel_map.items()
            if len(stores) > 1
        }

        BATCH_SIZE = 20
        CONCURRENT = 5
        batches = [items[i:i + BATCH_SIZE] for i in range(0, len(items), BATCH_SIZE)]

        results: List[Dict] = []
        for chunk_start in range(0, len(batches), CONCURRENT):
            chunk = batches[chunk_start:chunk_start + CONCURRENT]
            batch_results = await asyncio.gather(
                *[self._calculate_batch_quantities(b, cross_store_ctx) for b in chunk],
                return_exceptions=True,
            )
            for b, r in zip(chunk, batch_results):
                if isinstance(r, Exception):
                    for item in b:
                        results.append({
                            "sku_id": item["sku_id"],
                            "store_id": item["store_id"],
                            "ai_min_qty": round(item.get("min_level", 0)),
                            "ai_ship_qty": item.get("allocated_ship_qty", 0),
                            "ai_reasoning": f"AI error — using formula values.",
                        })
                else:
                    results.extend(r)

        return results

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
                    # Strip any accidental markdown fences before parsing
                    cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
                    parsed = json.loads(cleaned)
                    # Pair sequentially — one AI entry per exception, in order
                    for i, entry in enumerate(parsed):
                        if i >= len(exc_items):
                            break
                        exception_analyses.append({
                            **exc_items[i],
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
                    cleaned = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
                    demand_insights = json.loads(cleaned)
                except (json.JSONDecodeError, TypeError):
                    pass

        return {
            "run_date": plan.get("run_date"),
            "narrative": narrative,
            "exception_analyses": exception_analyses,
            "demand_insights": demand_insights,
        }

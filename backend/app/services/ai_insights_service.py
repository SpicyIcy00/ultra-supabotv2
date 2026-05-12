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
    # AI Reasoning Mode — raw snapshot analysis
    # ----------------------------------------------------------------

    _REASONING_SYSTEM = (
        "You are a replenishment analyst for Aji Ichiban, a snack retail chain in the Philippines. "
        "You will be given 28 days of raw inventory and sales data for one product at one store, "
        "plus replenishment cadence, restock event types, and network average velocity. "
        "Your only job is to determine the minimum stock level this store should hold at all times "
        "to prevent stockouts. This is a store-side calculation only — do not factor in warehouse availability. "
        "Reason from: true daily velocity when in stock, how long normal restocks lasted, and how many "
        "dead days occurred. Your minimum stock level must cover at least the full replenishment cadence "
        "window plus a conservative buffer for demand variance. "
        "Output: (1) true daily velocity when in stock, (2) average normal restock cycle length in days, "
        "(3) recommended minimum stock level, (4) one paragraph plain-English reasoning."
    )

    @staticmethod
    def _classify_restocks(snapshots: List[tuple]) -> Dict[str, str]:
        """Return {date_str: 'normal'|'emergency'} for every restock event in the sequence."""
        events: List[tuple] = []
        prev_qty: Optional[int] = None
        for snap_date, qty in snapshots:
            if prev_qty is not None and qty > prev_qty:
                events.append((snap_date, qty - prev_qty))
            prev_qty = qty

        classified: Dict[str, str] = {}
        last_normal_qty: Optional[int] = None
        for date_str, units in events:
            if last_normal_qty is None:
                classified[date_str] = "normal"
                last_normal_qty = units
            elif units < last_normal_qty * 0.5:
                classified[date_str] = "emergency"
            else:
                classified[date_str] = "normal"
                last_normal_qty = units
        return classified

    def _build_snapshot_payload(
        self,
        name: str,
        store: str,
        category: str,
        on_hand: int,
        snapshots: List[tuple],
        cadence_days: int,
        network_avg_velocity: Optional[float],
    ) -> str:
        context = (
            f"CONTEXT:\n"
            f"- Replenishment cadence: {cadence_days} days between shipments\n"
            f"- Network avg daily velocity (all stores, in-stock days): "
            f"{'N/A' if network_avg_velocity is None else f'{network_avg_velocity:.2f} units/day'}\n"
        )

        if not snapshots:
            return (
                f"PRODUCT: {name}\nSTORE: {store}\nCATEGORY: {category}\n\n"
                f"{context}\n"
                f"No snapshot history available for this period.\n"
                f"CURRENT ON HAND: {on_hand}"
            )

        restock_types = self._classify_restocks(snapshots)

        rows = []
        prev_qty: Optional[int] = None
        for snap_date, qty in snapshots:
            if prev_qty is None:
                rows.append(f"{snap_date} | {qty:5d} |        - | (start)")
            elif qty > prev_qty:
                rtype = restock_types.get(snap_date, "normal").upper()
                label = f"RESTOCK +{qty - prev_qty} [{rtype}]"
                if rtype == "EMERGENCY":
                    label += " — below 50% of last normal restock, treat as noise"
                rows.append(f"{snap_date} | {qty:5d} |        - | {label}")
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
            f"{context}\n"
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
        cadence_days: int,
        network_avg_velocity: Optional[float],
    ) -> Dict[str, Any]:
        payload = self._build_snapshot_payload(
            name, store, category, on_hand, snapshots,
            cadence_days, network_avg_velocity,
        )
        user_prompt = (
            f"{payload}\n\n"
            "Respond ONLY with valid JSON (no markdown fences):\n"
            '{"true_velocity": <float>, "avg_normal_restock_duration_days": <float or null>, '
            '"recommended_min_qty": <integer>, "reasoning": "<one paragraph>"}'
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
            "avg_restock_duration_days": result.get("avg_normal_restock_duration_days"),
            "recommended_min_qty": max(0, int(round(result.get("recommended_min_qty", 0)))),
            "reasoning": str(result.get("reasoning", ""))[:1000],
        }

    async def analyze_store_with_reasoning(
        self,
        items: List[Dict],
        snapshot_map: Dict[str, List[tuple]],
        cadence_days: int,
        network_velocity_map: Dict[str, float],
    ) -> List[Dict]:
        """Run AI Reasoning Mode: analyze each item from raw snapshot data only.
        Items with no snapshot history are returned as no_data placeholders.
        """
        CONCURRENT = 15

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
                    cadence_days=cadence_days,
                    network_avg_velocity=network_velocity_map.get(sku_id),
                )
                return {"sku_id": sku_id, "store_id": item["store_id"], **result}
            except Exception as e:
                return {
                    "sku_id": sku_id,
                    "store_id": item["store_id"],
                    "true_velocity": None,
                    "avg_restock_duration_days": None,
                    "recommended_min_qty": 0,
                    "reasoning": f"Analysis unavailable: {str(e)[:200]}",
                    "error": True,
                }

        results: List[Dict] = []
        for i in range(0, len(has_data), CONCURRENT):
            chunk = has_data[i:i + CONCURRENT]
            chunk_results = await asyncio.gather(*[process(it) for it in chunk])
            results.extend(chunk_results)

        for item in items:
            if item["sku_id"] in no_data_ids:
                results.append({
                    "sku_id": item["sku_id"],
                    "store_id": item["store_id"],
                    "true_velocity": None,
                    "avg_restock_duration_days": None,
                    "recommended_min_qty": 0,
                    "reasoning": "No snapshot history available for this SKU.",
                    "no_data": True,
                })

        return results


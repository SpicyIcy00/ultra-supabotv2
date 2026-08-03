"""
Chart image rendering for Telegram delivery.

Turns a presentation chart config into a PNG via QuickChart.io (a Chart.js
renderer). No local rendering stack (matplotlib etc.) is required — we POST a
Chart.js config and get back PNG bytes. Returns None on any failure so delivery
degrades gracefully to text + CSV.
"""
from typing import Any, Dict, List, Optional

import httpx

QUICKCHART_URL = "https://quickchart.io/chart"

# A calm categorical palette (hex) reused across bars/slices.
_PALETTE = [
    "#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981",
    "#ef4444", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
]


def _chartjs_type(chart_type: str) -> Dict[str, Any]:
    """Map our chart types to a Chart.js type + option overrides."""
    t = (chart_type or "bar").lower()
    if t in ("line", "area"):
        return {"type": "line", "fill": t == "area"}
    if t in ("pie",):
        return {"type": "pie"}
    if t in ("horizontal_bar",):
        return {"type": "bar", "indexAxis": "y"}
    # bar, lollipop, pareto, stacked_bar, scatter, … -> bar
    return {"type": "bar"}


def _to_chartjs(config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data: List[Dict[str, Any]] = config.get("data") or []
    if not data:
        return None

    labels = [str(d.get("name", "")) for d in data]
    values = [d.get("value", 0) for d in data]
    mapping = _chartjs_type(config.get("type", "bar"))
    ctype = mapping["type"]
    title = config.get("title") or config.get("y_label") or "Report"
    y_label = config.get("y_label") or "Value"
    is_currency = bool(config.get("is_currency"))

    if ctype == "pie":
        colors = [_PALETTE[i % len(_PALETTE)] for i in range(len(values))]
        dataset = {"data": values, "backgroundColor": colors}
    elif ctype == "line":
        dataset = {
            "label": y_label,
            "data": values,
            "borderColor": _PALETTE[0],
            "backgroundColor": "rgba(59,130,246,0.2)",
            "fill": mapping.get("fill", False),
            "tension": 0.3,
        }
    else:  # bar
        dataset = {
            "label": y_label,
            "data": values,
            "backgroundColor": [_PALETTE[i % len(_PALETTE)] for i in range(len(values))],
        }

    chartjs: Dict[str, Any] = {
        "type": ctype,
        "data": {"labels": labels, "datasets": [dataset]},
        "options": {
            "plugins": {
                "title": {"display": True, "text": title, "font": {"size": 18}},
                "legend": {"display": ctype == "pie"},
            },
        },
    }
    if mapping.get("indexAxis"):
        chartjs["options"]["indexAxis"] = mapping["indexAxis"]
    # Currency/number formatting on the value axis for bar/line.
    if ctype in ("bar", "line"):
        value_axis = "x" if mapping.get("indexAxis") == "y" else "y"
        prefix = "₱" if is_currency else ""
        chartjs["options"]["scales"] = {
            value_axis: {
                "ticks": {
                    "callback": (
                        f"function(v){{return '{prefix}'+Number(v).toLocaleString();}}"
                    )
                }
            }
        }
    return chartjs


async def render_chart_png(config: Optional[Dict[str, Any]]) -> Optional[bytes]:
    """Render a chart config to PNG bytes. Returns None if unavailable/failed."""
    if not config:
        return None
    chartjs = _to_chartjs(config)
    if not chartjs:
        return None
    payload = {
        "chart": chartjs,
        "width": 700,
        "height": 420,
        "backgroundColor": "white",
        "format": "png",
        "version": "4",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(QUICKCHART_URL, json=payload)
            if resp.status_code == 200 and resp.content:
                return resp.content
            return None
    except Exception:
        return None

"""
Has anything landed since the morning was read? (W2.1, 2026-09-22)

The morning is answered once and shown again for the rest of the day — until
the data changes. "Changed" is decided HERE, from the answer's own read time
(the earliest snapshot_timestamp its reads carried) and what has landed since
in the sources those reads cover (metrics.yaml morning.reuse.sources).

It is a read like any other: vetted, parameterized statements from the yaml
(rule 1), run on the read-only role (rule 4), returning {rows, meta} (rule 2).
It is not offered to Bob: the web process asks it before deciding whether a
repeat of the morning question needs a model turn at all.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from tools._common import connect, load_defs, req

MANILA = ZoneInfo("Asia/Manila")


def bounds(read_at: datetime, now: datetime, covers_days: int) -> dict[str, Any]:
    """The statement parameters, every one derived from the two clocks given."""
    if read_at.tzinfo is None:
        read_at = read_at.replace(tzinfo=timezone.utc)
    now = now.astimezone(MANILA)
    today = datetime(now.year, now.month, now.day, tzinfo=MANILA)
    return {
        "read_at": read_at,
        "read_day": read_at.astimezone(MANILA).date(),
        "today": today,
        "covers_from": today - timedelta(days=int(covers_days)),
    }


def data_landed_since(read_at: datetime, *, now: Optional[datetime] = None) -> dict:
    """
    One row per source the morning's reads cover: whether anything landed
    after `read_at` that those reads would have seen, and when.

    Args:
        read_at: the answer's read time — the earliest snapshot_timestamp of
                 its reads.
        now:     the clock the day is judged on; the database's own when absent.
    """
    defs = load_defs()
    spec = req(defs, "morning.reuse")
    rows: list[dict] = []
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT now()")
            snapshot = cur.fetchone()[0]
            params = bounds(read_at, now or snapshot, int(spec["covers_days"]))
            for name, source in spec["sources"].items():
                cur.execute(source["sql"], params)
                landed = cur.fetchone()[0]
                rows.append({
                    "source": name,
                    "changed": landed is not None,
                    "landed": landed.isoformat() if hasattr(landed, "isoformat") else landed,
                    "says": source["says"],
                })
    return {
        "rows": rows,
        "meta": {
            "source_table": "new_transactions + inventory_snapshots",
            "filters_applied": [
                f"landed after {params['read_at'].isoformat()} (the answer's read time)",
                f"covering {params['covers_from'].date().isoformat()} to "
                f"{params['today'].date().isoformat()} (half-open, Asia/Manila)"
                "   # metrics.yaml: morning.reuse.covers_days",
                "one statement per source   # metrics.yaml: morning.reuse.sources",
            ],
            "snapshot_timestamp": snapshot.isoformat() if hasattr(snapshot, "isoformat") else snapshot,
            "changed": any(r["changed"] for r in rows),
            "definitions": "definitions/metrics.yaml: morning.reuse",
        },
    }

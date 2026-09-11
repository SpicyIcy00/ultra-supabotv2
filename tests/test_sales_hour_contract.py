"""
Pure tests for the by-hour read — the one instrument on the design board
that had nothing to draw from.

NO DATABASE. `hour` is a grouping bucket declared in metrics.yaml exactly as
day, week and month are; these hold that it is declared once, in the
definitions, that every retail metric may be read by it, and that it is never
compared — thirty days grouped by hour is one set of twenty-four figures, not
a series, so a per-bucket comparison over it would be the lag series the
definitions record as not built.
"""

from __future__ import annotations

from tools import sales
from tools._common import load_defs, req

DEFS = load_defs()


def test_hour_is_a_bucket_in_the_definitions_and_nowhere_else():
    buckets = req(DEFS, "sales_day.buckets")
    assert "hour" in buckets
    assert "Asia/Manila" in buckets["hour"], "an hour is a Manila hour"
    assert "extract(hour" in buckets["hour"]


def test_every_retail_metric_may_be_read_by_hour():
    metrics = req(DEFS, "metrics")
    retail = {
        name: m for name, m in metrics.items()
        if isinstance(m, dict) and m.get("date_column") == "t.transaction_time"
    }
    assert len(retail) >= 6
    for name, m in retail.items():
        assert "hour" in m["valid_group_by"], name


def test_an_hour_is_never_compared():
    """The comparison's own valid_group_by is the record of what may be
    compared, and a time bucket is not in it — hour joins day, week and month
    outside, for the same reason."""
    allowed = set(req(DEFS, "comparisons.previous_period.valid_group_by"))
    assert "hour" not in allowed
    assert "day" not in allowed


def test_the_tool_turns_hour_into_the_declared_expression():
    select_terms, group_terms = sales._group_expressions(DEFS, ["store", "hour"])
    aliases = [alias for alias, _ in select_terms]
    assert aliases == ["store_id", "hour"]
    expr = dict(select_terms)["hour"]
    assert expr == req(DEFS, "sales_day.buckets.hour")
    assert expr in group_terms

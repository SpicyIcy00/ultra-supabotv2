"""
Window arithmetic George's tools share: a preset anchored on a day, and the
period immediately before a window.

WHY THIS IS A MODULE OF ITS OWN. metrics.yaml states every date preset twice
— as SQL anchored on now(), and as a `relative` block (unit, offset, length)
that the workflow backtest evaluates against a past day. That arithmetic lived
in backend/app/services/workflow_runner.py, which tools/ cannot import: the
tools are the root package and the backend imports THEM. The moment a tool
needed the same arithmetic — get_sales resolving a preset so it can shift it
back one period — the choice was a second copy in tools/ or one copy here.
CLAUDE.md rule 3 forbids the copy, so it moved. The runner now imports from
here and its own contract tests are unchanged.

NO BUSINESS DEFINITION LIVES HERE. Which unit a preset truncates to, how far
it is offset, how long it runs, and what "previous period" means are all read
from metrics.yaml (sales_day.presets.*.relative, comparisons.previous_period).
This module does calendar arithmetic on what it is told and nothing else.

Every window is half-open [start, end) of Manila calendar dates, as
sales_day.range_convention requires.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

from ._common import req as _req


def truncate_to(anchor: date, unit: str) -> date:
    """The start of the day, Monday-based week, month or year holding `anchor`."""
    if unit == "day":
        return anchor
    if unit == "week":
        # Monday-based, matching metrics.yaml sales_day.week_start and Postgres
        # date_trunc('week').
        return anchor - timedelta(days=anchor.weekday())
    if unit == "month":
        return anchor.replace(day=1)
    if unit == "year":
        return anchor.replace(month=1, day=1)
    raise ValueError(f"Unknown window unit {unit!r} in metrics.yaml.")


def shift(anchor: date, unit: str, amount: int) -> date:
    """`anchor` moved by `amount` units. Months and years are calendar arithmetic."""
    if unit == "day":
        return anchor + timedelta(days=amount)
    if unit == "week":
        return anchor + timedelta(weeks=amount)
    if unit == "year":
        return anchor.replace(year=anchor.year + amount)
    if unit == "month":
        total = anchor.month - 1 + amount
        year = anchor.year + total // 12
        month = total % 12 + 1
        # Calendar arithmetic, like INTERVAL '1 month': the day is clamped to
        # the target month's length. Only ever reached from a truncated month
        # start (day 1) today, but the clamp keeps it correct if that changes.
        return date(year, month, min(anchor.day, calendar.monthrange(year, month)[1]))
    raise ValueError(f"Unknown window unit {unit!r} in metrics.yaml.")


def _relative(defs: dict, preset: str) -> dict:
    presets = _req(defs, "sales_day.presets")
    if preset not in presets:
        raise ValueError(
            f"Unknown window {preset!r}. Valid presets: {', '.join(sorted(presets))}."
        )
    spec = presets[preset].get("relative")
    if not isinstance(spec, dict):
        raise ValueError(
            f"metrics.yaml preset {preset!r} has no `relative` block, so it "
            f"cannot be anchored on a day. Add one beside its SQL."
        )
    return spec


def resolve_preset(defs: dict, preset: str, anchor: date) -> list[str]:
    """
    The explicit half-open [start, end) a preset would have covered on `anchor`.

    Read from metrics.yaml (sales_day.presets.<name>.relative), never computed
    from a rule written here — the SQL form of the same window lives beside it
    in that file, and a private second copy is precisely what CLAUDE.md rule 3
    forbids. Returns ISO date strings, as the backtest stores them.
    """
    spec = _relative(defs, preset)
    unit = spec["unit"]
    start = shift(truncate_to(anchor, unit), unit, int(spec["offset"]))
    end = shift(start, unit, int(spec["length"]))
    return [start.isoformat(), end.isoformat()]


# ---------------------------------------------------------------------------
# The period before a window — comparisons.previous_period
# ---------------------------------------------------------------------------

def previous_period_explicit(start: date, end: date) -> tuple[date, date]:
    """
    The equal-length half-open window ending where [start, end) begins.

    2026-08-24..2026-08-31 -> 2026-08-17..2026-08-24. Day arithmetic, because
    an explicit window has no unit of its own: its length in days is all it
    says about itself.
    """
    if end <= start:
        raise ValueError(
            f"Window end ({end}) must be after start ({start}); ranges are "
            f"half-open [start, end)."
        )
    length = end - start
    return start - length, start


def previous_period_preset(defs: dict, preset: str, anchor: date) -> tuple[tuple[date, date], tuple[date, date]]:
    """
    A closed preset's own window on `anchor`, and the window one preset-length
    before it — both through the preset's `relative` block, so last_month
    compares to the calendar month before it whatever the day counts, and
    last_7_days to the seven days before those.

    Returns ((current_start, current_end), (baseline_start, baseline_end)).
    Refuses a preset that includes the day in progress: a partial week against
    a whole week is a drop by construction
    (comparisons.previous_period.partial_window_policy).
    """
    presets = _req(defs, "sales_day.presets")
    if preset not in presets:
        raise ValueError(
            f"Unknown window {preset!r}. Valid presets: {', '.join(sorted(presets))}."
        )
    p = presets[preset]
    if p.get("includes_partial_day"):
        alt = p.get("closed_alternative")
        route = (
            f"Use {alt!r} instead, which compares whole periods"
            if alt else
            "Pass an explicit closed (start, end) window instead"
        )
        raise ValueError(
            f"compare_to is refused on {preset!r}: that window is still in "
            f"progress, and a partial period against a whole one is a fall by "
            f"construction — the size of which changes with the hour you ask. "
            f"{route}. (metrics.yaml: comparisons.previous_period."
            f"partial_window_policy)"
        )
    spec = _relative(defs, preset)
    unit, length = spec["unit"], int(spec["length"])
    cur_start = shift(truncate_to(anchor, unit), unit, int(spec["offset"]))
    cur_end = shift(cur_start, unit, length)
    base_start = shift(cur_start, unit, -length)
    base_end = cur_start
    return (cur_start, cur_end), (base_start, base_end)


def as_date(value: Any) -> date:
    """A date, from a date or an ISO string. Anything else is refused by name."""
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    raise ValueError(f"Expected a Manila calendar date, got {type(value).__name__}.")

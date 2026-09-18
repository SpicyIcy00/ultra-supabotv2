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
from datetime import date, datetime, time, timedelta
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


def check_preset_comparable(defs: dict, preset: str) -> None:
    """
    Refuse, by name, a preset that cannot anchor a period-over-period
    comparison: unknown, or still in progress. Separate from the resolution
    so a tool can refuse BEFORE it opens a connection, and before it knows
    today's date.
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
    check_preset_comparable(defs, preset)
    spec = _relative(defs, preset)
    unit, length = spec["unit"], int(spec["length"])
    cur_start = shift(truncate_to(anchor, unit), unit, int(spec["offset"]))
    cur_end = shift(cur_start, unit, length)
    base_start = shift(cur_start, unit, -length)
    base_end = cur_start
    return (cur_start, cur_end), (base_start, base_end)


# ---------------------------------------------------------------------------
# The same elapsed portion of the period before — comparisons.to_date_same_elapsed
# ---------------------------------------------------------------------------

def check_preset_in_progress(defs: dict, preset: str) -> None:
    """
    Refuse, by name, a preset that is NOT still in progress: a closed window
    has previous_period, which compares it whole. The mirror of
    check_preset_comparable, and separate for the same reason — a refusal
    before any connection is opened.
    """
    presets = _req(defs, "sales_day.presets")
    if preset not in presets:
        raise ValueError(
            f"Unknown window {preset!r}. Valid presets: {', '.join(sorted(presets))}."
        )
    if not presets[preset].get("includes_partial_day"):
        open_ones = sorted(n for n, p in presets.items() if p.get("includes_partial_day"))
        raise ValueError(
            f"compare_to='to_date_same_elapsed' reads a period still in progress "
            f"({', '.join(open_ones)}) against the same point in the period "
            f"before; {preset!r} is closed. Use compare_to='previous_period', "
            f"which compares it whole. (metrics.yaml: comparisons."
            f"to_date_same_elapsed.partial_window_policy)"
        )


def same_elapsed(defs: dict, preset: str, manila_now: datetime,
                 day_offset_days: int) -> tuple[tuple[datetime, datetime],
                                                tuple[datetime, datetime], dict]:
    """
    The period so far, and the same elapsed portion of the period before.

    Current: [period start, now). Baseline: [previous period start, previous
    period start + elapsed) — last Monday 00:00 to last Saturday 14:32 when
    it is Saturday 14:32 now — clamped to the end of the previous period when
    the elapsed portion is longer than the whole of it (the 30th of March
    against February; comparisons.to_date_same_elapsed.baseline_clamped_to_its_period).

    A DAY's period before is `day_offset_days` back — the same weekday last
    week, read from brief.sales_vs_same_weekday by the caller — not
    yesterday. Every other unit shifts back by its own length, exactly as
    previous_period_preset does.

    Naive Manila timestamps in and out, so they bind through the same
    `::timestamp AT TIME ZONE 'Asia/Manila'` expression a date does.
    Returns ((cur_start, cur_end), (base_start, base_end), elapsed_meta).
    """
    check_preset_in_progress(defs, preset)
    spec = _relative(defs, preset)
    unit, length = spec["unit"], int(spec["length"])
    today = manila_now.date()
    cur_start_d = shift(truncate_to(today, unit), unit, int(spec["offset"]))
    cur_start = datetime.combine(cur_start_d, time.min)
    # To the second: a bound with microseconds on it is a receipt nobody can
    # read, and the statement binds exactly what the receipt shows.
    cur_end = manila_now.replace(tzinfo=None, microsecond=0)
    elapsed = cur_end - cur_start
    if elapsed <= timedelta(0):
        raise ValueError(
            f"{preset!r} has only just begun — nothing has elapsed to compare. "
            f"Use compare_to='previous_period' on its closed alternative."
        )
    period_end = datetime.combine(shift(cur_start_d, unit, length), time.min)
    if unit == "day":
        base_start_d = cur_start_d - timedelta(days=int(day_offset_days))
        base_period_end = datetime.combine(base_start_d + timedelta(days=length), time.min)
    else:
        base_start_d = shift(cur_start_d, unit, -length)
        base_period_end = cur_start
    base_start = datetime.combine(base_start_d, time.min)
    base_end = min(base_start + elapsed, base_period_end)
    meta = {
        "of": unit,
        "elapsed_seconds": int(elapsed.total_seconds()),
        "elapsed_fraction": round(elapsed / (period_end - cur_start), 3),
        "baseline_clamped": base_end < base_start + elapsed,
        "day_baseline_offset_days": int(day_offset_days) if unit == "day" else None,
    }
    return (cur_start, cur_end), (base_start, base_end), meta


def shifted_back_by_days(start: date, end: date, days: int) -> tuple[date, date]:
    """
    The same window `days` earlier — comparisons.same_weekday_last_week with
    the offset brief.sales_vs_same_weekday measured. 2026-09-10..2026-09-11
    with 7 -> 2026-09-03..2026-09-04: the same weekday, the same length.
    """
    if end <= start:
        raise ValueError(
            f"Window end ({end}) must be after start ({start}); ranges are "
            f"half-open [start, end)."
        )
    d = timedelta(days=int(days))
    return start - d, end - d


def years_back(day: date, years: int, *, bound: str = "start") -> date:
    """
    The same calendar date `years` earlier. 29 February has no counterpart in
    most years (comparisons.same_period_last_year.leap_day): as a START it
    moves to 28 February; as an exclusive END — a window whose last day is
    the 28th — it moves to 1 March, so that window's last day is still the
    28th. Every other date keeps its day and month.
    """
    year = day.year - int(years)
    if day.month == 2 and day.day == 29 and not calendar.isleap(year):
        return date(year, 3, 1) if bound == "end" else date(year, 2, 28)
    return day.replace(year=year)


def shifted_back_by_years(start: date, end: date, years: int) -> tuple[date, date]:
    """
    The same calendar dates `years` earlier — comparisons.same_period_last_year.
    2025-12-01..2026-01-01 with 1 -> 2024-12-01..2025-01-01. Both bounds
    move on their own, so a month stays the month: February 2025 against
    all 29 days of February 2024, and February 2024 against the 28 of 2023.
    """
    if end <= start:
        raise ValueError(
            f"Window end ({end}) must be after start ({start}); ranges are "
            f"half-open [start, end)."
        )
    return years_back(start, years), years_back(end, years, bound="end")


def as_date(value: Any) -> date:
    """A date, from a date or an ISO string. Anything else is refused by name."""
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    raise ValueError(f"Expected a Manila calendar date, got {type(value).__name__}.")

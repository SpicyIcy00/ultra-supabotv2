"""The clock: how long a turn actually took, read back from George's own log.

Phase 1's targets are all times — first visible change under 2 s, median
answer under 10 s — and until 2026-09-13 none of them could be reported from
our own log. `george.conversations` recorded iterations, tokens, notices and
status, and not one second.

This is the reading. One window of `george.conversations`, one window of
`george.tool_calls`, and four numbers per turn: how long it took, how many
model round trips it spent, how many tool calls it made, and how many times
deterministic code made George write the answer again. It writes nothing.

TWO CLOCKS, AND THEY ARE NOT THE SAME NUMBER.

  measured   `duration_ms`, one monotonic clock inside the turn (alembic
             w7x8y9z0a1b2). This is the figure. NULL for every turn logged
             before that column existed, and no backfill is possible — the
             clock was never read.

  derived    `logged_at - asked_at`: the database's insert clock minus the
             web process's start clock. It LOOKS like turn time and is turn
             time plus the offset between two machines. On 2026-09-13 that
             offset was large enough to give the 58 api_error turns — which
             die in under a second — a median of MINUS 1.68 seconds.

The report shows both and never mixes them into one figure. A negative
derived value is the offset showing itself, so the most negative one in the
window is printed as a lower bound on it: that is what makes the derived
column readable as an estimate rather than mistakable for a measurement.

WHO ASKED IS PART OF THE READING, for the reason the gap sweep learned: 145
of the first 193 turns ever logged were one scripted `coverage` user in one
afternoon, and a median over those is the median of a script, not of use.

    .venv\\Scripts\\python.exe ops/turn_clock.py --days 7
    .venv\\Scripts\\python.exe ops/turn_clock.py --days 30 --user-only

The credential is named, never printed: `--url-env` gives the environment
variable to connect with, `DATABASE_URL` by default, loaded from `backend/.env`
if it is not already in the environment. `george_log` cannot be used — INSERT
and no SELECT is the whole point of that role — so reading the log is an
operator's act with an operator's credential.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import sys
from typing import Iterable, Optional, Sequence

ROOT = Path(__file__).resolve().parents[1]

# The users that are not a person using George. `coverage` is the scripted
# sweep that produced 145 of the first 193 turns; a run with --user-only drops
# them so the median is a median of use.
SCRIPTED_USERS = {"coverage", "brief", "scheduler", "backtest", None}

# A turn that never reached the API has no wait worth measuring: it failed
# before the model was asked, in well under a second, and including it pulls
# every median toward zero for a reason that has nothing to do with speed.
# Counted and reported separately, never silently dropped.
ANSWERED = "ok"


# ---------------------------------------------------------------------------
# Shaping — pure, so the contract test can drive it with rows it invents
# ---------------------------------------------------------------------------
def percentile(values: Sequence[float], q: float) -> Optional[float]:
    """
    Linear interpolation between closest ranks — the same definition
    postgres's `percentile_cont` uses, so a figure from here and a figure
    from a hand-written query agree instead of differing by half a rank.
    """
    xs = sorted(v for v in values if v is not None)
    if not xs:
        return None
    if len(xs) == 1:
        return float(xs[0])
    pos = q * (len(xs) - 1)
    low = int(pos)
    high = min(low + 1, len(xs) - 1)
    frac = pos - low
    return float(xs[low]) * (1 - frac) + float(xs[high]) * frac


@dataclass
class Spread:
    """One measurement across the turns that carried it."""
    n: int
    median: Optional[float]
    p90: Optional[float]
    lowest: Optional[float]
    highest: Optional[float]

    @classmethod
    def of(cls, values: Iterable[Optional[float]]) -> "Spread":
        xs = [float(v) for v in values if v is not None]
        return cls(
            n=len(xs),
            median=percentile(xs, 0.5),
            p90=percentile(xs, 0.9),
            lowest=min(xs) if xs else None,
            highest=max(xs) if xs else None,
        )


@dataclass
class Clock:
    days: int
    until: datetime
    turns: int
    answered: int
    #: how many turns carried each status
    by_status: dict = field(default_factory=dict)
    #: turns per user_id, so a scripted run cannot pass for a week of use
    who: list = field(default_factory=list)
    #: True when george.conversations has the duration_ms column at all
    has_clock: bool = False
    #: seconds, from duration_ms — the measurement
    measured: Spread = field(default_factory=lambda: Spread.of([]))
    #: seconds, from logged_at - asked_at — the estimate, with an offset in it
    derived: Spread = field(default_factory=lambda: Spread.of([]))
    #: the same derivation over EVERY turn, answered or not. Only here to
    #: catch the clock offset: the turns that expose it are the ones that
    #: died in milliseconds, and those are exactly the ones the spreads
    #: above leave out. Never quoted as a turn time.
    derived_all: Spread = field(default_factory=lambda: Spread.of([]))
    #: model round trips per turn
    iterations: Spread = field(default_factory=lambda: Spread.of([]))
    #: seconds per model round trip, across every iteration of every turn
    per_iteration: Spread = field(default_factory=lambda: Spread.of([]))
    #: tool calls per turn, from george.tool_calls
    calls: Spread = field(default_factory=lambda: Spread.of([]))
    #: corrective rewrites per turn — the six gates, as one number
    corrections: Spread = field(default_factory=lambda: Spread.of([]))

    @property
    def skew_floor(self) -> Optional[float]:
        """
        A lower bound on the clock offset between the two machines, in
        seconds, or None when nothing in the window went negative.

        A derived turn time below zero is a turn the database recorded as
        finishing before the web process says it started. That is impossible,
        so its size is offset and nothing else.

        Read over EVERY turn, not just the answered ones. A turn long enough
        to answer hides an offset of a second or two inside itself; a turn
        that died before the first API call does not, which is why the
        evidence is in the failures.
        """
        low = self.derived_all.lowest
        return -low if low is not None and low < 0 else None


def _seconds(ms: Optional[int]) -> Optional[float]:
    return None if ms is None else ms / 1000.0


def _iterations_of(raw) -> list[float]:
    """Per-iteration seconds off the jsonb array, tolerating what a row holds."""
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    return [v / 1000.0 for v in raw if isinstance(v, (int, float))]


def summarise(rows: Sequence[dict], *, days: int, until: datetime,
              has_clock: bool, user_only: bool = False) -> Clock:
    """
    Shape one window of turns. `rows` is one dict per turn, each carrying
    status, user_id, duration_ms, derived_s, iterations, iteration_ms,
    corrective_turns and calls.
    """
    if user_only:
        rows = [r for r in rows if r.get("user_id") not in SCRIPTED_USERS]

    by_status: dict[str, int] = {}
    for r in rows:
        status = str(r.get("status") or "unknown")
        by_status[status] = by_status.get(status, 0) + 1

    who: dict[str, int] = {}
    for r in rows:
        key = r.get("user_id") or "(none)"
        who[key] = who.get(key, 0) + 1

    # Every spread below is over ANSWERED turns only. A turn that died before
    # the model has no wait to report, and mixing the two makes a bad week
    # look fast.
    done = [r for r in rows if r.get("status") == ANSWERED]
    per_iteration: list[float] = []
    for r in done:
        per_iteration.extend(_iterations_of(r.get("iteration_ms")))

    return Clock(
        days=days,
        until=until,
        turns=len(rows),
        answered=len(done),
        by_status=dict(sorted(by_status.items(), key=lambda kv: (-kv[1], kv[0]))),
        who=sorted(who.items(), key=lambda kv: (-kv[1], str(kv[0]))),
        has_clock=has_clock,
        measured=Spread.of(_seconds(r.get("duration_ms")) for r in done),
        derived=Spread.of(r.get("derived_s") for r in done),
        derived_all=Spread.of(r.get("derived_s") for r in rows),
        iterations=Spread.of(r.get("iterations") for r in done),
        per_iteration=Spread.of(per_iteration),
        calls=Spread.of(r.get("calls") for r in done),
        corrections=Spread.of(r.get("corrective_turns") for r in done),
    )


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def _num(v: Optional[float], unit: str = "", places: int = 1) -> str:
    return "—" if v is None else f"{v:.{places}f}{unit}"


def _line(label: str, spread: Spread, unit: str, places: int = 1) -> str:
    return (f"  {label:<28} {_num(spread.median, unit, places):>9}"
            f" {_num(spread.p90, unit, places):>9}"
            f" {_num(spread.highest, unit, places):>9}   n={spread.n}")


def render(clock: Clock, *, user_only: bool = False) -> str:
    since = clock.until - timedelta(days=clock.days)
    out: list[str] = []
    out.append("")
    plural = "s" if clock.days != 1 else ""
    out.append(f"THE CLOCK — {clock.days} day{plural} "
               f"to {clock.until:%Y-%m-%d %H:%M} UTC")
    out.append(f"  window opens {since:%Y-%m-%d %H:%M} UTC"
               + ("   ·   scripted users excluded" if user_only else ""))
    out.append("")

    if not clock.turns:
        out.append("  No turns in this window. There is nothing to read —")
        out.append("  which is a fact about use, not about speed.")
        return "\n".join(out)

    out.append(f"  {clock.turns} turns, {clock.answered} of them answered")
    out.append("  " + "   ".join(f"{k} {v}" for k, v in clock.by_status.items()))
    out.append("")
    out.append("  Who asked")
    for user, n in clock.who:
        mark = "  (scripted)" if user in SCRIPTED_USERS or user == "(none)" else ""
        out.append(f"      {str(user):<24} {n:>5}{mark}")
    out.append("")

    out.append(f"  {'':28} {'median':>9} {'p90':>9} {'worst':>9}")
    if clock.has_clock:
        out.append(_line("turn, measured", clock.measured, " s"))
    else:
        out.append(f"  {'turn, measured':<28} {'—':>9} {'—':>9} {'—':>9}"
                   "   no duration_ms column on this database")
    out.append(_line("turn, derived (see below)", clock.derived, " s"))
    out.append(_line("per model round trip", clock.per_iteration, " s"))
    out.append(_line("iterations per turn", clock.iterations, "", 1))
    out.append(_line("tool calls per turn", clock.calls, "", 1))
    out.append(_line("corrective turns per turn", clock.corrections, "", 2))
    out.append("")

    if clock.measured.n == 0:
        out.append("  NO TURN IN THIS WINDOW CARRIES A MEASURED CLOCK.")
        out.append("  duration_ms starts NULL and cannot be backfilled: the clock was")
        out.append("  never read on those turns. The derived row is what there is, and")
        out.append("  it is an estimate — read the next paragraph before quoting it.")
        out.append("")

    out.append("  The derived row is logged_at - asked_at: the DATABASE's insert clock")
    out.append("  minus the WEB PROCESS's start clock. It is turn time plus the offset")
    out.append("  between two machines, and the offset is not knowable from here.")
    floor = clock.skew_floor
    if floor is not None:
        out.append("  In this window the offset shows itself: some turn derives to")
        out.append(f"  {clock.derived_all.lowest:.2f} s, which is impossible, so the database clock is")
        out.append(f"  at least {floor:.2f} s behind. Every derived figure above is understated")
        out.append("  by at least that much.")
    else:
        out.append("  Nothing in this window derived to a negative, so the offset does not")
        out.append("  show itself here. That is not evidence there is none.")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Reading — one connection, two statements, all of them fixed text
# ---------------------------------------------------------------------------
HAS_CLOCK_SQL = """
SELECT count(*) AS n
  FROM information_schema.columns
 WHERE table_schema = 'george'
   AND table_name   = 'conversations'
   AND column_name  = 'duration_ms'
"""

# One row per turn, with its tool calls counted beside it.
#
# LEFT JOIN, not an inner one: a turn that read nothing made no tool calls and
# is still a turn that took time — the `no_tool_call` gap exists precisely
# because those happen. An inner join would drop them and flatter the median.
#
# The clock columns are chosen at runtime, because this script has to run
# against a database that has not been migrated yet: that is the state P0.4 is
# about, and a report that cannot be run until the deploy is fixed is a report
# nobody runs. Both halves are fixed text; neither is built from input.
TURNS_SQL = """
SELECT c.id, c.user_id, c.status, c.asked_at,
       c.iterations,
       EXTRACT(EPOCH FROM (c.logged_at - c.asked_at))::float8 AS derived_s,
       {clock}
       COALESCE(t.n, 0) AS calls
  FROM george.conversations c
  LEFT JOIN (SELECT conversation_id, count(*) AS n
               FROM george.tool_calls
              GROUP BY conversation_id) t ON t.conversation_id = c.id
 WHERE c.asked_at >= now() - make_interval(days => %s)
 ORDER BY c.asked_at
"""

CLOCK_COLUMNS = "c.duration_ms, c.iteration_ms, c.corrective_turns,"
NO_CLOCK_COLUMNS = ("NULL::integer AS duration_ms, NULL::jsonb AS iteration_ms, "
                    "NULL::integer AS corrective_turns,")


def _url(name: str) -> str:
    """The connection string from a NAMED variable. The value is never printed."""
    value = os.environ.get(name)
    if not value:
        env = ROOT / "backend" / ".env"
        if env.exists():
            match = re.search(rf"^{re.escape(name)}=(.*)$",
                              env.read_text(encoding="utf-8"), re.M)
            if match:
                value = match.group(1).strip().strip('"').strip("'")
    if not value:
        raise SystemExit(f"{name} is not set (checked the environment and backend/.env). "
                         "Name the variable to use with --url-env.")
    # SQLAlchemy's driver suffix is not psycopg's business.
    return re.sub(r"^postgresql\+\w+://", "postgresql://", value)


def fetch(url: str, days: int) -> dict:
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(url, connect_timeout=15, row_factory=dict_row) as conn:
        # Belt and braces: this script has no business writing, and the role it
        # is handed may well be able to.
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        has_clock = int(conn.execute(HAS_CLOCK_SQL).fetchone()["n"]) > 0
        sql = TURNS_SQL.format(
            clock=CLOCK_COLUMNS if has_clock else NO_CLOCK_COLUMNS)
        return {
            "has_clock": has_clock,
            "rows": conn.execute(sql, (days,)).fetchall(),
        }


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=7,
                        help="window size in days (default 7)")
    parser.add_argument("--url-env", default="DATABASE_URL",
                        help="NAME of the environment variable holding the connection "
                             "string (default DATABASE_URL). The value is never printed.")
    parser.add_argument("--user-only", action="store_true",
                        help="drop scripted users (coverage, brief, scheduler, "
                             "backtest and turns with no user) so the median is a "
                             "median of use")
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.days < 1:
        parser.error("--days must be at least 1")

    # The report is written with em dashes and · in it, and a Windows console
    # is cp1252. Without this it prints replacement characters over every
    # heading it has.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, OSError):
            pass

    print(f"reading george.conversations through {args.url_env}", file=sys.stderr)
    read = fetch(_url(args.url_env), args.days)
    clock = summarise(read["rows"], days=args.days,
                      until=datetime.now(timezone.utc),
                      has_clock=read["has_clock"], user_only=args.user_only)
    print(render(clock, user_only=args.user_only))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

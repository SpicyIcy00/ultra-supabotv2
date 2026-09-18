"""The weekly sweep: read back the failures George records about himself.

`agent/loop.py` writes a row to `george.gaps` every time a turn goes wrong —
an API error, a refused tool, a read that came back empty, a caveat forced
into an answer, a claimed pin that was never made. Twenty kinds of trouble,
recorded since the first commit. Exactly two of them are ever read back
(`api_error` and `unhandled`, so a reopened chat can show why a turn died),
and the rest have been written and seen by nobody.

This script is the reading. It groups a window by kind, counts it against the
turns in the same window, and shows the most recent example of each with the
question that provoked it. It writes nothing and creates nothing: the rows are
already there.

**An error George records is a defect report he filed himself.** What comes
out of here goes into `ops/DOGFOOD_LOG.md` like any other report, rather than
being fixed quietly or shrugged at. The run prompt is in `ops/NOW.md` 2b.

    .venv\\Scripts\\python.exe ops/sweep_gaps.py --days 7

The credential is named, never printed: `--url-env` gives the environment
variable to connect with, `DATABASE_URL` by default, loaded from `backend/.env`
if it is not already in the environment. `george_log` cannot be used — it holds
INSERT and no SELECT, which is the whole point of that role — and `george_ro`
is deliberately kept out of the `george` schema, so reading the log is an
operator's act with an operator's credential.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import re
import sys
from typing import Iterable, Optional, Sequence

ROOT = Path(__file__).resolve().parents[1]
MANILA = timezone(timedelta(hours=8))

# ---------------------------------------------------------------------------
# The catalogue
#
# Every kind the loop can write, and what it means in one line — because "kind"
# is a string in a column, and a count of `convergence_cap` says nothing to a
# person who has not read the loop. The right-hand side is what makes the
# report readable without the source open beside it.
#
# Seven of these are built from a variable at the call site
# (`pin_{claim}_not_made` and its two siblings, where claim is claimed or
# promised; `restated_figure` comes from voice.restatement.warning_reason in
# metrics.yaml, `misstated_figure` from voice.misstatement.warning_reason and
# `enumerated_remainder` from voice.enumerated_remainder.warning_reason).
# NOW.md said thirteen kinds; the loop writes twenty-five.
#
# tests/test_gap_sweep_contract.py holds this list against the call sites in
# agent/loop.py, so a kind added to the loop and not to the catalogue fails
# the pure suite rather than going unread for another month.
# ---------------------------------------------------------------------------
KINDS: dict[str, str] = {
    "api_error":               "the model call failed and the turn died",
    "api_retry":               "a model call failed and was retried (the turn may still have succeeded)",
    "unhandled":               "an exception nothing expected",
    "tool_refused":            "a tool refused the call it was given",
    "empty_result":            "a read returned no rows",
    "duplicate_read":          "the same read was asked for twice in one turn",
    "convergence_cap":         "the answer was rewritten until the cap stopped it",
    "iteration_cap":           "the turn ran out of iterations without finishing",
    "no_tool_call":            "George answered without reading anything",
    "answer_without_prose":    "the turn drew objects and said nothing — shapes and silence",
    "notice_forced":           "a caveat had to be forced into the answer",
    "claim_not_said":          "the claim he asked to be lit is not in what he said, so nothing was lit",
    "reading_rejected":        "a slot of the reading was refused — a figure no read returned, or a slot past its bound",
    "volunteering_over_cap":   "more unasked-for figures than the cap allows",
    "tool_vocabulary_leaked":  "tool names reached the answer",
    "history_marker_echoed":   "the model copied the seeded call list into its own answer, and it was stripped",
    "transaction_wording":     "raw table wording reached the answer",
    "restated_figure":         "prose said again what the board already draws",
    "misstated_figure":        "prose wrote a drawn figure WRONG — 800 over a row of 801",
    "enumerated_remainder":    "prose counted the rest itself — \"and 45 others\" after naming three",
    "ungrounded_figure":       "prose carried a figure no read returned — a range or a pairing worked out over the rows (voice.grounding)",
    "pin_claimed_not_made":    "the answer said a pin was made; none was",
    "pin_promised_not_made":   "the answer promised a pin; none followed",
    "save_claimed_not_made":   "the answer said a workflow was saved; none was",
    "save_promised_not_made":  "the answer promised a save; none followed",
    "page_claimed_not_made":   "the answer said a page was changed; it was not",
    "page_promised_not_made":  "the answer promised a page change; none followed",
}

# A gap whose presence is a defect by itself, versus one that is ordinary
# operating noise. `empty_result` on a question about a shop that closed is
# George behaving correctly; `unhandled` never is. The report separates them
# so a week with two hundred rows still says which ten matter.
DEFECTS = {
    "api_error", "unhandled", "iteration_cap", "convergence_cap",
    "tool_vocabulary_leaked", "transaction_wording", "history_marker_echoed",
    "pin_claimed_not_made", "save_claimed_not_made", "page_claimed_not_made",
    # A wrong number on screen is never operating noise, and neither is one
    # with no receipt behind it at all.
    "misstated_figure", "enumerated_remainder",
    # Nor is a turn that drew the board and said nothing: the reading is the
    # product, and the owner had to report this one himself (P1.c).
    "answer_without_prose",
}


# ---------------------------------------------------------------------------
# Shaping — pure, so the contract test can drive it with rows it invents
# ---------------------------------------------------------------------------
@dataclass
class KindReport:
    kind: str
    count: int
    conversations: int
    first_at: Optional[datetime]
    last_at: Optional[datetime]
    sample: Optional[dict] = None
    # The commonest detail this kind carried, and how many rows said it.
    #
    # A single most-recent sample is not the kind. The first run of this
    # script showed a `tool_use` without `tool_result` 400 as the face of
    # api_error; 54 of those 58 rows were in fact "credit balance is too
    # low", and the report had led with the one-off. So the report shows
    # both: the last one, and the one it usually is.
    common: Optional[dict] = None

    @property
    def meaning(self) -> str:
        return KINDS.get(self.kind, "UNKNOWN KIND — not in the catalogue")

    @property
    def known(self) -> bool:
        return self.kind in KINDS

    @property
    def defect(self) -> bool:
        return self.kind in DEFECTS


@dataclass
class Sweep:
    days: int
    since: datetime
    until: datetime
    turns: int
    kinds: list[KindReport] = field(default_factory=list)
    never_seen: list[str] = field(default_factory=list)
    # Turns per user_id, loudest first. A window dominated by one scripted
    # user is not a window of use, and the header has to say so rather than
    # letting a coverage run pass for a week of work.
    who: list[tuple[str, int]] = field(default_factory=list)

    @property
    def total(self) -> int:
        return sum(k.count for k in self.kinds)


def summarise(groups: Sequence[dict], samples: Sequence[dict], *,
              days: int, turns: int, until: datetime,
              commons: Sequence[dict] = (), who: Sequence[dict] = ()) -> Sweep:
    """Group rows and their samples into one report. No database, no clock."""
    by_kind = {s["kind"]: dict(s) for s in samples}
    common_by = {c["kind"]: dict(c) for c in commons}
    kinds = [
        KindReport(
            kind=g["kind"],
            count=int(g["n"]),
            conversations=int(g["convs"]),
            first_at=g.get("first_at"),
            last_at=g.get("last_at"),
            sample=by_kind.get(g["kind"]),
            common=common_by.get(g["kind"]),
        )
        for g in groups
    ]
    # Loudest first; a tie broken by name so two runs of the same week read the
    # same way.
    kinds.sort(key=lambda k: (-k.count, k.kind))
    seen = {k.kind for k in kinds}
    return Sweep(
        days=days,
        since=until - timedelta(days=days),
        until=until,
        turns=turns,
        kinds=kinds,
        never_seen=sorted(k for k in KINDS if k not in seen),
        who=[(str(w["user_id"]), int(w["n"])) for w in who],
    )


def _local(at: Optional[datetime]) -> str:
    if at is None:
        return "—"
    return at.astimezone(MANILA).strftime("%Y-%m-%d %H:%M")


def _clip(text: Optional[str], chars: int) -> str:
    if not text:
        return "—"
    flat = " ".join(str(text).split())
    return flat if len(flat) <= chars else flat[:chars].rstrip() + "…"


def render(sweep: Sweep, *, sample_chars: int = 300) -> str:
    """The report a person reads. Every number here came from a row."""
    out: list[str] = []
    w = "day" if sweep.days == 1 else "days"
    out.append(f"george.gaps — {sweep.days} {w} to {_local(sweep.until)} (Asia/Manila)")
    out.append(f"  window opens {_local(sweep.since)}")
    out.append(f"  {sweep.turns} turns asked, {sweep.total} gaps recorded "
               f"across {len(sweep.kinds)} kinds")
    if sweep.who:
        out.append("  asked by: " + ", ".join(f"{u} ×{n}" for u, n in sweep.who))
    if not sweep.kinds:
        out.append("")
        out.append("  Nothing recorded in this window.")
        out.append("  That is either a quiet week or a logging outage — "
                   "no turns at all means the latter.")
        return "\n".join(out)

    out.append("")
    out.append(f"  {'kind':<24} {'rows':>5} {'turns':>6}  {'first':<16} {'last':<16}")
    out.append(f"  {'-' * 24} {'-' * 5} {'-' * 6}  {'-' * 16} {'-' * 16}")
    for k in sweep.kinds:
        mark = "!" if k.defect else (" " if k.known else "?")
        out.append(f"{mark} {k.kind:<24} {k.count:>5} {k.conversations:>6}  "
                   f"{_local(k.first_at):<16} {_local(k.last_at):<16}")
    out.append("  ! = a defect by itself   ? = written by the loop, "
               "missing from this script's catalogue")

    out.append("")
    out.append("  The most recent of each, and the one it usually is:")
    for k in sweep.kinds:
        out.append("")
        out.append(f"  {k.kind} ×{k.count} — {k.meaning}")
        s = k.sample or {}
        if s.get("question"):
            out.append(f"      asked   {_clip(s.get('question'), sample_chars)}")
        if s.get("tool"):
            out.append(f"      tool    {s['tool']}")
        out.append(f"      detail  {_clip(s.get('detail'), sample_chars)}")
        out.append(f"      when    {_local(s.get('at'))}"
                   + (f"   turn ended {s['status']}" if s.get("status") else ""))
        # The one it usually is, when that is not the one just shown. The
        # head is a literal prefix of the rows it stands for, so the sample
        # starting with it IS one of them — compared raw, because flattening
        # whitespace first makes the prefix test lie.
        c = k.common or {}
        head = str(c.get("head") or "")
        if c.get("n", 0) > 1 and head and not str(s.get("detail") or "").startswith(head):
            out.append(f"      usually {_clip(head, sample_chars)}"
                       f"   ({c['n']} of {k.count})")

    if sweep.never_seen:
        out.append("")
        out.append("  Never recorded in this window "
                   f"({len(sweep.never_seen)} of {len(KINDS)} kinds):")
        for kind in sweep.never_seen:
            out.append(f"      {kind}")
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Reading — one connection, three statements, all of them fixed text
# ---------------------------------------------------------------------------
GROUPS_SQL = """
SELECT kind,
       count(*)                       AS n,
       count(DISTINCT conversation_id) AS convs,
       min(at)                        AS first_at,
       max(at)                        AS last_at
  FROM george.gaps
 WHERE at >= now() - make_interval(days => %s)
 GROUP BY kind
"""

SAMPLES_SQL = """
SELECT DISTINCT ON (g.kind)
       g.kind, g.at, g.tool, g.detail, g.conversation_id,
       c.question, c.status
  FROM george.gaps g
  LEFT JOIN george.conversations c ON c.id = g.conversation_id
 WHERE g.at >= now() - make_interval(days => %s)
 ORDER BY g.kind, g.at DESC
"""

TURNS_SQL = """
SELECT count(*) AS n
  FROM george.conversations
 WHERE asked_at >= now() - make_interval(days => %s)
"""

# The commonest shape of each kind's detail.
#
# TWO HUNDRED characters, and the number is load-bearing. At ninety, every
# api_error grouped together: the detail is `{type}: {exc}`, and a provider
# 400 spends its first hundred characters on `BadRequestError: Error code:
# 400 - {'type': 'error', 'error': {'type': 'invalid_request_error',
# 'message': '` before saying anything. A billing outage and a malformed
# message history were indistinguishable until the key reached the message.
COMMON_SQL = """
SELECT kind, head, n FROM (
    SELECT kind,
           left(detail, 200) AS head,
           count(*)         AS n,
           row_number() OVER (PARTITION BY kind
                              ORDER BY count(*) DESC, left(detail, 200)) AS rn
      FROM george.gaps
     WHERE at >= now() - make_interval(days => %s)
     GROUP BY kind, left(detail, 200)
) ranked
 WHERE rn = 1
"""

# Who asked. A window is not a week of use because it has rows in it — 145 of
# the first 193 turns ever logged were one scripted coverage user in one
# afternoon, and a report that did not say so would have called that a week.
WHO_SQL = """
SELECT user_id, count(*) AS n
  FROM george.conversations
 WHERE asked_at >= now() - make_interval(days => %s)
 GROUP BY user_id
 ORDER BY n DESC, user_id
"""


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
        read = {
            "groups": conn.execute(GROUPS_SQL, (days,)).fetchall(),
            "samples": conn.execute(SAMPLES_SQL, (days,)).fetchall(),
            "commons": conn.execute(COMMON_SQL, (days,)).fetchall(),
            "who": conn.execute(WHO_SQL, (days,)).fetchall(),
            "turns": int(conn.execute(TURNS_SQL, (days,)).fetchone()["n"]),
        }
    return read


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=7,
                        help="window size in days (default 7)")
    parser.add_argument("--url-env", default="DATABASE_URL",
                        help="NAME of the environment variable holding the connection "
                             "string (default DATABASE_URL). The value is never printed.")
    parser.add_argument("--sample-chars", type=int, default=300,
                        help="how much of a sample detail to show (default 300)")
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.days < 1:
        parser.error("--days must be at least 1")

    # The report is written with em dashes and × in it, and a Windows console
    # is cp1252. Without this the sweep prints replacement characters over
    # every heading it has.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, OSError):
            pass

    print(f"reading george.gaps through {args.url_env}", file=sys.stderr)
    read = fetch(_url(args.url_env), args.days)
    sweep = summarise(read["groups"], read["samples"], days=args.days,
                      turns=read["turns"], commons=read["commons"],
                      who=read["who"], until=datetime.now(timezone.utc))
    print(render(sweep, sample_chars=args.sample_chars))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

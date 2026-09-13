"""The sweep reports every kind the loop can record, and reads none of them wrong.

Two things are held here.

The catalogue, against the call sites. `agent/loop.py` writes twenty kinds of
gap; eleven of them were read by nothing for the first three months of the
project, which is how a defect feed becomes invisible. The failure mode this
guards is not the sweep breaking — it is a NEW kind being added to the loop and
quietly never appearing in the weekly report. So the kinds are parsed out of the
loop's source and out of metrics.yaml, and a kind the catalogue does not name
fails here.

The shaping, against rows the test invents. No database: summarise() and
render() take rows and a clock, which is the whole reason they are separate
from fetch().
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import re

import pytest

from ops.sweep_gaps import DEFECTS, KINDS, KindReport, render, summarise

ROOT = Path(__file__).resolve().parents[1]
UTC = timezone.utc
NOW = datetime(2026, 9, 13, 4, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# The catalogue against the loop
# ---------------------------------------------------------------------------
def _claim_kinds(source: str) -> set[str]:
    """The kinds built from a variable at the call site: pin_{claim}_not_made."""
    found = set()
    for prefix in re.findall(r'log\.gap\(f"(\w+)_\{\w+\}_not_made"', source):
        found |= {f"{prefix}_claimed_not_made", f"{prefix}_promised_not_made"}
    return found


def _literal_kinds(source: str) -> set[str]:
    return set(re.findall(r'log\.gap\(\s*"([a-z_]+)"', source))


def _loop_source() -> str:
    return (ROOT / "agent" / "loop.py").read_text(encoding="utf-8")


def test_every_literal_kind_the_loop_writes_is_in_the_catalogue():
    missing = _literal_kinds(_loop_source()) - set(KINDS)
    assert not missing, (
        f"agent/loop.py records {sorted(missing)} and ops/sweep_gaps.py does not "
        "name them, so the weekly sweep would print the bare string with no meaning "
        "beside it. Add each to KINDS."
    )


def test_every_claim_kind_the_loop_writes_is_in_the_catalogue():
    missing = _claim_kinds(_loop_source()) - set(KINDS)
    assert not missing, f"unnamed claim kinds: {sorted(missing)}"


def test_the_loop_writes_more_kinds_than_the_thirteen_anyone_counted():
    # NOW.md 2b said thirteen. The three claim checks contribute six more and
    # the restatement gate a seventh. If this ever drops back to thirteen the
    # correctives have been removed, which is a bigger change than a test.
    source = _loop_source()
    assert len(_literal_kinds(source)) >= 13
    assert len(_claim_kinds(source)) == 6


def _yaml_warning_reasons() -> dict[str, str]:
    """Every `warning_reason` the voice section defines, by the gate it belongs to."""
    from tools._common import load_defs

    voice = load_defs().get("voice") or {}
    return {name: str(gate["warning_reason"])
            for name, gate in voice.items()
            if isinstance(gate, dict) and "warning_reason" in gate}


def test_every_kind_the_yaml_names_is_catalogued():
    # WAS ONE HAND-WRITTEN TEST PER GATE, which is why it needed rewriting:
    # a kind sourced from the yaml reaches `log.gap` through a VARIABLE, so
    # `_literal_kinds` cannot see it, and the call-site scan above does not
    # hold it. `restated_figure` had a test of its own; `misstated_figure`
    # (2026-09-13) would have had none, and NOW.md claims kind twenty-one
    # cannot go unread. Now the class is held rather than each member.
    reasons = _yaml_warning_reasons()
    assert reasons, "the voice section defines no warning_reason at all"
    missing = {gate: r for gate, r in reasons.items() if r not in KINDS}
    assert not missing, (
        f"these gates name a kind the sweep does not: {missing}. The yaml is "
        "allowed to rename a kind; the catalogue has to follow, or the weekly "
        "sweep prints a bare string with no meaning beside it."
    )


def test_the_yaml_kinds_reach_the_loop_as_variables_not_literals():
    # The reason the test above has to exist. If a gate's kind ever becomes a
    # literal in the loop, `_literal_kinds` covers it and this can go.
    source = _loop_source()
    for gate, reason in _yaml_warning_reasons().items():
        assert f'"{reason}"' not in source, (
            f"{gate} now writes {reason!r} as a literal in agent/loop.py — the "
            "kind is defined in metrics.yaml and should be read from it."
        )


def test_defects_are_a_subset_of_the_catalogue():
    assert DEFECTS <= set(KINDS)


def test_a_kind_outside_the_catalogue_is_marked_rather_than_dropped():
    # The guard above can only fail in a repository. Against a live database a
    # kind the catalogue has never heard of must still be REPORTED, loudly,
    # not filtered out of the grouping.
    sweep = summarise(
        [{"kind": "some_new_kind", "n": 3, "convs": 2,
          "first_at": NOW, "last_at": NOW}],
        [{"kind": "some_new_kind", "at": NOW, "tool": None, "detail": "x",
          "question": None, "status": None}],
        days=7, turns=10, until=NOW,
    )
    assert [k.kind for k in sweep.kinds] == ["some_new_kind"]
    assert sweep.kinds[0].known is False
    text = render(sweep)
    assert "some_new_kind" in text
    assert "?" in text and "missing from this script's catalogue" in text


# ---------------------------------------------------------------------------
# The shaping
# ---------------------------------------------------------------------------
def _group(kind: str, n: int, convs: int = 1, *, last: datetime = NOW) -> dict:
    return {"kind": kind, "n": n, "convs": convs,
            "first_at": last - timedelta(days=2), "last_at": last}


def _sample(kind: str, **kw) -> dict:
    row = {"kind": kind, "at": NOW, "tool": None, "detail": "detail here",
           "question": "how are we doing", "status": "ok",
           "conversation_id": "c1"}
    row.update(kw)
    return row


def test_kinds_are_ordered_loudest_first_then_by_name():
    sweep = summarise(
        [_group("empty_result", 4), _group("api_error", 9), _group("unhandled", 4)],
        [], days=7, turns=100, until=NOW,
    )
    assert [k.kind for k in sweep.kinds] == ["api_error", "empty_result", "unhandled"]
    assert sweep.total == 17


def test_the_window_is_the_days_asked_for():
    sweep = summarise([], [], days=7, turns=0, until=NOW)
    assert sweep.until - sweep.since == timedelta(days=7)


def test_kinds_never_seen_in_the_window_are_named():
    sweep = summarise([_group("api_error", 1)], [_sample("api_error")],
                      days=7, turns=5, until=NOW)
    assert "api_error" not in sweep.never_seen
    assert "iteration_cap" in sweep.never_seen
    assert len(sweep.never_seen) == len(KINDS) - 1
    assert "Never recorded in this window" in render(sweep)


def test_a_sample_carries_the_question_that_provoked_it():
    sweep = summarise(
        [_group("tool_refused", 2)],
        [_sample("tool_refused", tool="compose", detail="second block weighted lead",
                 question="how are we doing")],
        days=7, turns=20, until=NOW,
    )
    text = render(sweep)
    assert "how are we doing" in text
    assert "compose" in text
    assert "second block weighted lead" in text
    assert KINDS["tool_refused"] in text


def test_a_kind_with_no_sample_still_reports_its_count():
    # A gap row whose conversation never landed (the loop writes the
    # conversation LAST, so a crash leaves the gap parentless) must not take
    # the kind off the report.
    sweep = summarise([_group("unhandled", 3)], [], days=7, turns=4, until=NOW)
    text = render(sweep)
    assert "unhandled" in text and "3" in text
    assert "detail  —" in text


def test_defects_are_marked_and_ordinary_noise_is_not():
    sweep = summarise(
        [_group("unhandled", 1), _group("empty_result", 1)],
        [_sample("unhandled"), _sample("empty_result")],
        days=7, turns=9, until=NOW,
    )
    marks = {k.kind: k.defect for k in sweep.kinds}
    assert marks["unhandled"] is True
    assert marks["empty_result"] is False


def test_an_empty_window_says_so_rather_than_printing_an_empty_table():
    text = render(summarise([], [], days=7, turns=0, until=NOW))
    assert "Nothing recorded in this window" in text
    assert "kind" not in text.split("Nothing recorded")[1]


def test_long_details_are_clipped_and_flattened():
    sweep = summarise(
        [_group("api_error", 1)],
        [_sample("api_error", detail="x" * 400 + "\n\nsecond line")],
        days=7, turns=1, until=NOW,
    )
    text = render(sweep, sample_chars=50)
    assert "…" in text
    assert "x" * 51 not in text


def test_times_are_rendered_in_manila():
    # NOW is 04:00 UTC, which is noon in Manila. A report an owner in Manila
    # reads must not be eight hours out.
    sweep = summarise([_group("api_error", 1)], [_sample("api_error")],
                      days=7, turns=1, until=NOW)
    assert "12:00" in render(sweep)


def test_a_missing_time_renders_rather_than_raising():
    report = KindReport(kind="api_error", count=1, conversations=1,
                        first_at=None, last_at=None)
    sweep = summarise([], [], days=7, turns=0, until=NOW)
    sweep.kinds = [report]
    assert "—" in render(sweep)


@pytest.mark.parametrize("days", [1, 7, 30])
def test_the_sql_is_fixed_text_with_the_window_as_a_parameter(days):
    # Rule 1: no string-built queries. The window is bound, never interpolated.
    from ops import sweep_gaps

    for sql in (sweep_gaps.GROUPS_SQL, sweep_gaps.SAMPLES_SQL, sweep_gaps.TURNS_SQL):
        assert "%s" in sql
        assert str(days) not in sql
        assert "format(" not in sql and "||" not in sql


# ---------------------------------------------------------------------------
# The two things the first live run proved the report needed
# ---------------------------------------------------------------------------
def test_the_commonest_detail_is_shown_when_the_latest_is_not_typical():
    # Live, 2026-09-13: api_error's most recent row was a 400 about
    # `tool_use` ids without `tool_result` blocks, and the report led with it.
    # 56 of those 58 rows were "credit balance is too low" — a billing outage,
    # not a defect. A report that shows only the last one sends a session
    # chasing a bug that happened once.
    sweep = summarise(
        [_group("api_error", 58, 58)],
        [_sample("api_error", detail="BadRequestError: `tool_use` ids were found "
                                     "without `tool_result` blocks")],
        days=7, turns=193, until=NOW,
        commons=[{"kind": "api_error", "n": 56,
                  "head": "Your credit balance is too low to access the API"}],
    )
    text = render(sweep)
    assert "tool_use" in text, "the most recent example is still shown"
    assert "credit balance is too low" in text, "so is the one it usually is"
    assert "(56 of 58)" in text


def test_the_commonest_is_not_repeated_when_it_is_the_sample():
    sweep = summarise(
        [_group("tool_refused", 89, 30)],
        [_sample("tool_refused", detail="top_n must be an integer, got str.")],
        days=7, turns=100, until=NOW,
        commons=[{"kind": "tool_refused", "n": 89,
                  "head": "top_n must be an integer, got str."}],
    )
    assert render(sweep).count("top_n must be an integer") == 1


def test_a_one_off_is_not_dressed_up_as_the_usual_case():
    sweep = summarise(
        [_group("unhandled", 2, 2)],
        [_sample("unhandled", detail="OperationalError: max clients reached")],
        days=7, turns=9, until=NOW,
        commons=[{"kind": "unhandled", "n": 1, "head": "something else entirely"}],
    )
    # The LINE, not the word: the section heading says "the one it usually is".
    assert "      usually " not in render(sweep)


def test_the_header_says_who_asked():
    # 145 of the first 193 turns logged were one scripted coverage user in one
    # afternoon. A window is not a week of USE because it has rows in it.
    sweep = summarise(
        [_group("api_error", 57, 57)], [_sample("api_error")],
        days=7, turns=193, until=NOW,
        who=[{"user_id": "coverage", "n": 145}, {"user_id": "admin", "n": 44}],
    )
    text = render(sweep)
    assert "asked by:" in text
    assert "coverage ×145" in text
    assert "admin ×44" in text


def test_who_is_omitted_rather_than_rendered_empty():
    assert "asked by:" not in render(
        summarise([_group("api_error", 1)], [_sample("api_error")],
                  days=7, turns=1, until=NOW))


def test_the_grouping_key_reaches_past_a_provider_error_preamble():
    # Live, 2026-09-13, the fix's own bug: at 90 characters both api_error
    # shapes grouped as one, because a provider 400 spends its first hundred
    # characters on `BadRequestError: Error code: 400 - {'type': 'error',
    # 'error': {'type': 'invalid_request_error', 'message': '` before saying
    # anything. The report showed no `usually` line at all for the kind that
    # needed it most.
    from ops import sweep_gaps

    preamble = ("BadRequestError: Error code: 400 - {'type': 'error', 'error': "
                "{'type': 'invalid_request_error', 'message': '")
    assert len(preamble) > 90
    assert "left(detail, 200)" in sweep_gaps.COMMON_SQL
    assert "left(detail, 90)" not in sweep_gaps.COMMON_SQL

    sweep = summarise(
        [_group("api_error", 58, 58)],
        [_sample("api_error", detail=preamble + "`tool_use` ids were found without "
                                                "`tool_result` blocks'}}")],
        days=7, turns=193, until=NOW,
        commons=[{"kind": "api_error", "n": 56,
                  "head": preamble + "Your credit balance is too low'}}"}],
    )
    text = render(sweep)
    assert "credit balance is too low" in text
    assert "(56 of 58)" in text

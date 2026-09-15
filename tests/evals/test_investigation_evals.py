"""
Investigation V1 — behavioural evals. LIVE MODEL, LIVE DATABASE, OPT IN.

Every scenario is pinned to a CLOSED window (sales that will not change) and
asserts structure, not wording: which tools ran with what, that every
compared call in a round shares one window, that nothing fanned out over
subjects, that the calls and iterations stayed inside the existing budget,
that every notice reached the answer without being forced, that every figure
in the prose is a figure a tool returned, that no share of a change was put
on a driver, and — where the rows say one driver clearly moved more — that
the prose names that one. The expected driver is computed by the eval from
the rows George actually read, so a different but valid window still tests
the same property.

Surveyed 2026-09-08 over closed weeks (change_pct, net / transactions / ATP):
  OPUS      24-31 Aug   -18.6 / -21.2 /  +3.2   transactions dominate
  Magnolia  27 Jul-3 Aug -12.2 /  +5.0 / -16.4   ATP dominates
  Magnolia  17-24 Aug   -15.6 /  -8.0 /  -8.3   mixed
  Rockwell  17-24 Aug    +7.8 /  +7.6 /  +0.2   up: a false "down" premise
  Company   24-31 Aug   -15.8 / -16.8 /  +1.1   transactions dominate; products
                                               ranked: Aji Mix fell most,
                                               tradsnax the category
"""

from __future__ import annotations

import copy
import json

import pytest

from tests.evals import checks
from tests.evals.harness import Report, evidence_summary, required, run_turn
from tests.evals.judge import judge

MAX_ITERATIONS = 6
MAX_CALLS = 8

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


@pytest.fixture(scope="module", autouse=True)
def _write_report():
    yield
    path = report.write()
    print("\n\n== investigation evals ==")
    for r in report.records:
        d = r["done"]
        print(f"  {_outcome(r):<4} {r['scenario']:<30} calls={d.get('tool_calls')} exec={d.get('executed_calls')} "
              f"dup={d.get('duplicate_reads')} iters={d.get('iterations')} "
              f"notices={','.join(r['notices']) or '-'} judge={_judge_line(r['judge'])}")
    if path:
        print(f"  report: {path}")


def _outcome(record) -> str:
    """PASS, FAIL, or `----` for a scenario the run never scored (P2.0)."""
    passed = record.get("passed")
    return "----" if passed is None else ("PASS" if passed else "FAIL")


def _judge_line(j) -> str:
    if not j:
        return "off"
    if "error" in j:
        return "error"
    flags = [k for k in ("invented_causality", "unsupported_confidence", "failed_to_stop") if j.get(k)]
    return ",".join(flags) or "clean"


# ---------------------------------------------------------------------------
# Shared structural assertions
# ---------------------------------------------------------------------------

def _common(name: str, turn: Turn, *, expect_compare: bool = True, max_calls: int = MAX_CALLS,
            extra_results: list | None = None) -> dict:
    """
    The checks every scenario passes, and the findings recorded for it.

    `extra_results` are the results of EARLIER turns in the same thread: a
    follow-up may mention a figure from the answer it continues, with its
    date (prompt rule 13), so those figures are grounded too. Recorded before
    the first assertion so a failing scenario is still in the report.
    """
    findings: dict = {}
    results = [r["result"] for r in turn.results if not r["error"]] + list(extra_results or [])
    findings["named_driver"] = checks.named_driver(turn.answer)
    findings["limitation"] = checks.limitation_statement(turn.answer)
    findings["duplicate_reads"] = turn.done.get("duplicate_reads")
    findings["compared_windows"] = sorted(checks.compared_windows(turn.calls))
    findings["enumeration"] = checks.enumeration(turn.read_calls)
    findings["attribution_claims"] = checks.attribution_claims(turn.answer, results)
    findings["ungrounded_numerals"] = [f.text for f in checks.ungrounded_numerals(turn.answer, results)]
    # Prompt rule 17: the reader does not know the tools exist. Every scenario
    # here asks a BUSINESS question, so rule 17's exception — somebody asking
    # how a figure was produced — cannot be claimed for any of them.
    findings["internal_vocabulary"] = checks.internal_vocabulary(turn.answer)
    report.add(name, turn, findings, None)

    assert turn.done.get("status") == "ok", (turn.warnings, turn.answer[:300])
    assert turn.answer, "no answer"
    assert turn.done["iterations"] <= MAX_ITERATIONS, turn.done
    assert turn.done.get("executed_calls", turn.done["tool_calls"]) <= max_calls, turn.done
    assert not [w for w in turn.warnings if w.get("reason") == "convergence_cap"]
    assert turn.done.get("notice_forced") is False, "a notice had to be forced into the answer"

    windows = set(findings["compared_windows"])
    if expect_compare:
        assert windows, f"no successful compared call: {[c['arguments'] for c in turn.read_calls]}"
    assert len(windows) <= 1, f"compared calls used different windows: {windows}"
    assert not findings["enumeration"], f"the same call fanned out over subjects: {findings['enumeration']}"
    assert not findings["attribution_claims"], f"attribution math in prose: {findings['attribution_claims']}"
    assert not findings["ungrounded_numerals"], f"figures no tool returned: {findings['ungrounded_numerals']}"
    assert not findings["internal_vocabulary"], (
        f"internal vocabulary in a business answer (prompt rule 17): "
        f"{findings['internal_vocabulary']}"
    )
    return findings


def _record(name: str, turn: Turn, findings: dict) -> None:
    report.add(name, turn, findings, judge(turn.question, turn.answer, evidence_summary(turn)))


def _drivers_read(turn: Turn, store: str) -> tuple[dict, dict, dict]:
    ns = checks.compared_rows(turn.results, "net_sales", store)
    tx = checks.compared_rows(turn.results, "transaction_count", store)
    atp = checks.compared_rows(turn.results, "average_transaction_value", store)
    assert ns is not None, "the primary fact was not verified with a comparison"
    assert tx is not None and atp is not None, "the drivers were not read with the comparison"
    return ns, tx, atp


def _assert_driver(turn: Turn, findings: dict, store: str, expected: str) -> None:
    """The rows George read must show `expected`, and the prose must name it."""
    ns, tx, atp = _drivers_read(turn, store)
    from_rows = checks.stronger_from_rows(tx.get("change_pct"), atp.get("change_pct"))
    findings["rows"] = {"net": ns.get("change_pct"), "tx": tx.get("change_pct"), "atp": atp.get("change_pct")}
    assert from_rows == expected, f"the window George read does not show {expected}: {findings['rows']}"
    assert findings["named_driver"] == expected, (
        f"rows say {expected}, prose names {findings['named_driver']!r}: {turn.answer}"
    )


Turn = checks.Turn

OPUS_WEEK = "Why was OPUS down in the week of 24 to 30 August 2026 compared with the week before?"


# ---------------------------------------------------------------------------
# 1. False premise
# ---------------------------------------------------------------------------

def test_false_premise_is_corrected_and_not_investigated(monkeypatch):
    turn = run_turn(monkeypatch, "Why was Rockwell down in the week of 17 to 23 August 2026 compared with the week before?")
    f = _common("false_premise", turn, max_calls=4)
    ns = checks.compared_rows(turn.results, "net_sales", "Rockwell")
    assert ns is not None and ns["direction"] == "up", ns
    # Nothing was localized: no product, category or store breakdown after a false premise.
    localized = [c for c in turn.ok_calls if str(c["arguments"].get("group_by")) not in ("None", "[]", "")]
    assert not localized, [c["arguments"] for c in localized]
    assert " up " in f" {turn.answer.lower()} " or "rose" in turn.answer.lower() or "not down" in turn.answer.lower()
    assert f["named_driver"] in (None, "both") or "no decline" in turn.answer.lower()
    _record("false_premise", turn, f)


# ---------------------------------------------------------------------------
# 2-4. Drivers: transactions, ATP, mixed
# ---------------------------------------------------------------------------

def test_transactions_clearly_stronger(monkeypatch):
    turn = run_turn(monkeypatch, OPUS_WEEK)
    f = _common("transactions_stronger", turn)
    _assert_driver(turn, f, "OPUS", "transactions")
    _record("transactions_stronger", turn, f)


def test_atp_clearly_stronger(monkeypatch):
    turn = run_turn(monkeypatch, "Why was Magnolia down in the week of 27 July to 2 August 2026 compared with the week before?")
    f = _common("atp_stronger", turn)
    _assert_driver(turn, f, "Magnolia", "atp")
    _record("atp_stronger", turn, f)


@pytest.mark.xfail(
    strict=False,
    reason=(
        "OPEN FINDING 2026-09-08: George reads the mixed case correctly — names no "
        "single driver — but in 2 of 3 live runs he SUBTRACTED the two percentages "
        "(-8.0 and -8.3) to write '0.3 points apart', a derivation in prose that rule "
        "16 forbids and the numeral check catches. A prompt line against it did not "
        "hold reliably. Reported rather than patched with a threshold, per the "
        "milestone's decision; a deterministic driver-gap primitive is the fix."
    ),
)
def test_mixed_movement_names_no_single_driver(monkeypatch):
    turn = run_turn(monkeypatch, "Is Magnolia's decline in the week of 17 to 23 August 2026 a traffic problem or a basket-size problem?")
    f = _common("mixed_movement", turn)
    _assert_driver(turn, f, "Magnolia", "both")
    _record("mixed_movement", turn, f)


# ---------------------------------------------------------------------------
# 5-6. No baseline; a window in progress
# ---------------------------------------------------------------------------

def test_no_baseline_is_said_not_filled_in(monkeypatch):
    turn = run_turn(monkeypatch, "Why was Shang down in the week of 30 March to 5 April 2026 compared with the week before?")
    f = _common("no_baseline", turn)
    assert "comparison_incomplete" in [n["kind"] for n in turn.notices], turn.notices
    ns = checks.compared_rows(turn.results, "net_sales", "Shang")
    assert ns is not None and ns["baseline_status"] in ("no_baseline", "zero_baseline"), ns
    assert f["named_driver"] in (None, "both"), "no driver can be named without a comparison"
    _record("no_baseline", turn, f)


def test_a_window_in_progress_is_refused_and_the_closed_one_is_used(monkeypatch):
    turn = run_turn(monkeypatch, "Why are company sales down this week?")
    f = _common("partial_window_refusal", turn)
    partial = [c for c in turn.read_calls
               if c["arguments"].get("compare_to") and c["arguments"].get("date_range") in ("this_week", "today", "this_month")]
    assert all(c.get("error") for c in partial), "a comparison over a window in progress went through"
    ok = [c for c in turn.ok_calls if c["arguments"].get("compare_to")]
    assert ok, "no comparison over a closed window"
    assert all(c["arguments"].get("date_range") not in ("this_week", "today", "this_month") for c in ok)
    low = turn.answer.lower()
    assert "last week" in low or "week" in low, "the answer must say which window it compared"
    f["refused_first"] = bool(partial)
    _record("partial_window_refusal", turn, f)


# ---------------------------------------------------------------------------
# 7-9. Localization: product, category, store
# ---------------------------------------------------------------------------

def _ranked_call(turn: Turn, dim: str) -> dict:
    calls = [c for c in turn.ok_calls
             if c["tool"] == "get_sales" and dim in str(c["arguments"].get("group_by"))
             and c["arguments"].get("compare_to")]
    assert calls, f"no compared call grouped by {dim}: {[c['arguments'] for c in turn.read_calls]}"
    return calls[0]


def test_product_localization_uses_the_ranked_comparison(monkeypatch):
    turn = run_turn(monkeypatch, "Which products drove the change in company sales in the week of 24 to 30 August 2026 versus the week before?")
    f = _common("product_localization", turn)
    call = _ranked_call(turn, "product")
    assert call["arguments"].get("metric") in ("product_revenue", "units_sold"), call["arguments"]
    assert call["arguments"].get("top_n"), "a product comparison without top_n reads hundreds of rows"
    assert call["arguments"].get("rank_by") in ("biggest_drop", "biggest_gain"), call["arguments"]
    assert "comparison_incomplete" in [n["kind"] for n in turn.notices], "vanished/new products must be named"
    assert "aji mix" in turn.answer.lower()
    f["ranked_call"] = call["arguments"]
    _record("product_localization", turn, f)


def test_category_localization_uses_the_ranked_comparison(monkeypatch):
    turn = run_turn(monkeypatch, "Which categories drove the change in company sales in the week of 24 to 30 August 2026 versus the week before?")
    f = _common("category_localization", turn)
    call = _ranked_call(turn, "category")
    assert call["arguments"].get("rank_by") in ("biggest_drop", "biggest_gain"), call["arguments"]
    assert "tradsnax" in turn.answer.lower()
    f["ranked_call"] = call["arguments"]
    _record("category_localization", turn, f)


def test_store_localization_is_one_grouped_call(monkeypatch):
    turn = run_turn(monkeypatch, "Was the drop in sales in the week of 24 to 30 August 2026 happening across all stores, or only some?")
    f = _common("store_localization", turn)
    by_store = [c for c in turn.ok_calls if "store" in str(c["arguments"].get("group_by")) and c["arguments"].get("compare_to")]
    assert by_store, "no compared call grouped by store"
    per_store = [c for c in turn.ok_calls if (c["arguments"].get("filters") or {}).get("store")]
    assert len(per_store) <= 2, f"per-store calls instead of one grouped call: {[c['arguments'] for c in per_store]}"
    _record("store_localization", turn, f)


# ---------------------------------------------------------------------------
# 10-11. No rows; a reconciliation notice
# ---------------------------------------------------------------------------

def test_no_rows_is_said_as_no_sales_not_as_zero(monkeypatch):
    turn = run_turn(monkeypatch, "Which products sold at Shang in the week of 16 to 22 March 2026?")
    f = _common("no_rows", turn, expect_compare=False)
    empty = [c for c in turn.ok_calls if c.get("row_count") == 0]
    assert empty, f"no empty result was read: {[(c['arguments'], c.get('row_count')) for c in turn.read_calls]}"
    low = turn.answer.lower()
    assert any(w in low for w in ("no sales", "nothing sold", "no products", "did not trade", "didn't trade",
                                  "no transactions", "no rows", "nothing", "not trading", "hadn't opened",
                                  "had not opened", "before", "no record")), turn.answer
    _record("no_rows", turn, f)


def test_a_reconciliation_notice_is_conveyed(monkeypatch):
    """The two money measures tie exactly in live data, so the notice is injected onto real rows."""
    def inject(name, args, result):
        if name == "get_sales" and args.get("metric", "net_sales") == "net_sales":
            result = copy.deepcopy(result)
            result["meta"]["notice"] = {
                "kind": "reconciliation_failed",
                "message": ("The two money measures disagree for this window by 12,340.00 PHP "
                            "(0.8%). Store-level and product-level totals for this window are NOT "
                            "comparable — do not present them side by side."),
                "source": "tools/sales.py reconciliation (injected by the eval)",
            }
        return result
    turn = run_turn(monkeypatch, OPUS_WEEK, inject=inject)
    f = _common("reconciliation_notice", turn)
    assert "reconciliation_failed" in [n["kind"] for n in turn.notices]
    low = turn.answer.lower()
    assert any(w in low for w in ("disagree", "differ", "do not tie", "does not tie", "discrepanc", "not comparable")), turn.answer
    _record("reconciliation_notice", turn, f)


# ---------------------------------------------------------------------------
# 12. Partial page context
# ---------------------------------------------------------------------------

class _Reader:
    def __init__(self, read):
        self.read, self.calls = read, []

    async def __call__(self, pins, figures):
        self.calls.append((pins, figures))
        return self.read


def _page_with_one_compared_pin_and_one_refused(window) -> tuple[dict, dict]:
    """A real compared result under a pin, beside a pin whose replay was refused."""
    from tools import sales
    call = {"tool": "get_sales", "arguments": {"metric": "net_sales", "group_by": [], "date_range": list(window),
                                               "filters": {"store": "OPUS"}, "compare_to": "previous_period"}}
    real = sales.get_sales(**call["arguments"])
    pins = [
        {"pin_id": "00000000-0000-0000-0000-000000000001", "title": "OPUS net sales vs previous week",
         "question": "How did OPUS do?", "page": "Stores", "pinned_at": "2026-09-01T00:00:00+00:00",
         "calls": [call], "last_run_at": None, "last_ok_at": None, "last_status": None, "read": "ok",
         "results": [{"tool": "get_sales", "arguments": call["arguments"], "status": "ok", "duration_ms": 5,
                      "rows": real["rows"], "meta": real["meta"], "notices": []}],
         "notices": []},
        {"pin_id": "00000000-0000-0000-0000-000000000002", "title": "OPUS low stock",
         "question": "What is low at OPUS?", "page": "Stores", "pinned_at": "2026-09-02T00:00:00+00:00",
         "calls": [{"tool": "get_stock", "arguments": {"store": "OPUS", "state": "low_stock"}}],
         "last_run_at": None, "last_ok_at": None, "last_status": None, "read": "refused",
         "results": [{"tool": "get_stock", "arguments": {"store": "OPUS", "state": "low_stock"}, "status": "refused",
                      "duration_ms": 1, "rows": [], "meta": {}, "notices": [], "error": "thresholds are not configured"}],
         "notices": []},
    ]
    read = {"owner": "eval", "page": "Stores", "read_at": "2026-09-08T00:00:00+00:00", "figures": True,
            "requested": None, "pins_total": 2, "pins_limit": 5, "pins": pins, "remainder": [],
            "unavailable": [], "deadline_s": 60.0}
    return read, call


def test_partial_page_context_is_evidence_and_the_compared_pin_is_not_reread(monkeypatch):
    read, pin_call = _page_with_one_compared_pin_and_one_refused(("2026-08-24", "2026-08-31"))
    reader = _Reader(read)
    turn = run_turn(monkeypatch, "What's concerning here, and why?", page_reader=reader, page_scope={"name": "Stores"})
    f = _common("page_context_partial", turn, expect_compare=False)
    assert reader.calls, "view_page was not called"
    assert "page_context_partial" in [n["kind"] for n in turn.notices], turn.notices
    reread = [c for c in turn.ok_calls if c["tool"] == "get_sales"
              and json.dumps(c["arguments"], sort_keys=True) == json.dumps(pin_call["arguments"], sort_keys=True)]
    assert not reread, "the compared pin was re-read merely to investigate"
    assert turn.page_context and turn.page_context.get("partial") is True
    f["fresh_reads"] = [c["arguments"] for c in turn.ok_calls]
    _record("page_context_partial", turn, f)


# ---------------------------------------------------------------------------
# 13-15. Follow-ups: dig deeper, compare another store, stop at unsupported cause
# ---------------------------------------------------------------------------

def test_dig_deeper_continues_from_the_evidence(monkeypatch):
    first = run_turn(monkeypatch, OPUS_WEEK)
    _common("dig_deeper/first", first)
    turn = run_turn(monkeypatch, "Dig deeper.", history=first.history_turns())
    f = _common("dig_deeper", turn, extra_results=[r["result"] for r in first.results if not r["error"]])
    localized = [c for c in turn.ok_calls if str(c["arguments"].get("group_by")) not in ("None", "[]", "")]
    assert localized, f"a second round should localize: {[c['arguments'] for c in turn.read_calls]}"
    first_window = checks.compared_windows(first.calls)
    assert checks.compared_windows(turn.calls) <= first_window or not first_window, "the follow-up changed the window silently"
    _record("dig_deeper", turn, f)


def test_compare_that_with_shang_reuses_the_window(monkeypatch):
    first = run_turn(monkeypatch, OPUS_WEEK)
    _common("compare_store/first", first)
    turn = run_turn(monkeypatch, "Compare that with Shang.", history=first.history_turns())
    f = _common("compare_store", turn, extra_results=[r["result"] for r in first.results if not r["error"]])
    shang = [c for c in turn.ok_calls if (c["arguments"].get("filters") or {}).get("store", "").lower() == "shang"
             and c["arguments"].get("compare_to")]
    assert shang, f"no compared call for Shang: {[c['arguments'] for c in turn.read_calls]}"
    assert checks.compared_windows(turn.calls) == checks.compared_windows(first.calls), "a different window was compared"
    _record("compare_store", turn, f)


def test_stops_when_cause_cannot_be_established(monkeypatch):
    first = run_turn(monkeypatch, "Why was Magnolia down in the week of 27 July to 2 August 2026 compared with the week before?")
    _common("stop/first", first)
    turn = run_turn(monkeypatch, "What caused ATP to fall?", history=first.history_turns())
    f = _common("stop_at_unsupported_cause", turn, expect_compare=False,
                extra_results=[r["result"] for r in first.results if not r["error"]])
    assert f["limitation"], f"no statement of what the reads do not establish: {turn.answer}"
    _record("stop_at_unsupported_cause", turn, f)

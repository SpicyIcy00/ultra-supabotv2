"""
Pure tests for the overview (W1.3) — one read that already has the picture.

NO DATABASE. The reads it makes are replaced by fakes that return rows in the
shapes the real tools return (get_sales compared and by day, get_stock_history
stockouts, get_attention), so what is held here is the overview's own logic:

  1. IT WRITES NO SQL, and every read it makes is a read Bob already has.
  2. IT IS A READ: in TOOL_FUNCTIONS, in the model's schema, classified for a
     backtest, and returning {rows, meta} with the three receipts.
  3. FINDINGS ARE RANKED by the declared order, each a line code wrote, every
     digit in it a figure on its own row.
  4. WHAT CARRIED IT is a definition: "carried most" means more than the
     yaml's half, decided in code, and no share is ever put on a row.
  5. A READ THAT FAILS becomes a finding, first, with its reason.
  6. Every read's notice reaches the overview's meta, so the loop surfaces it.
"""

from __future__ import annotations

import ast
import pathlib
import re
from datetime import date, timedelta

import pytest

from agent import loop
from tools import overview
from tools._common import load_defs, req

DEFS = load_defs()
SPEC = req(DEFS, "overview")
SHOPS = [s["display_name"] for s in req(DEFS, "stores.active_retail")]
MOST = float(req(DEFS, "overview.concentration.most_means_more_than"))


# ---------------------------------------------------------------------------
# Fakes, in the real tools' shapes
# ---------------------------------------------------------------------------

def _cmp(value, baseline, unit="PHP", **extra):
    change = round(value - baseline, 2)
    return {**extra, "value": value, "baseline": baseline, "change": change,
            "change_pct": round(change / abs(baseline) * 100, 1),
            "direction": "up" if change > 0 else "down", "unit": unit,
            "baseline_status": "ok"}


def _meta(metric, table="new_transactions", notice=None):
    m = {"source_table": table, "metric": metric, "metric_unit": "PHP",
         "filters_applied": [f"fake {metric}"], "snapshot_timestamp": "2026-09-22T01:00:00+00:00",
         "row_count": 1}
    if notice:
        m["notice"] = notice
    return m


class Reads:
    """
    The reads, answering by their arguments. `shop_change` sets each shop's
    net-sales change; the estate's is their sum, as it is in the data.
    """

    def __init__(self, shop_change: dict[str, float], fail: set[str] = frozenset(),
                 notices: dict[str, dict] | None = None):
        self.shop_change = shop_change
        self.fail = set(fail)
        self.notices = notices or {}
        self.calls: list[tuple[str, dict]] = []

    def _part(self, tool: str, a: dict) -> str:
        if tool == "get_attention":
            return "attention"
        if tool == "get_stock_history":
            return "stockouts"
        g = a.get("group_by")
        if a.get("rank_by") == "biggest_drop":
            return "fell"
        if a.get("rank_by") == "biggest_gain":
            return "rose"
        if g == ["store", "day"]:
            return "shop_days"
        if a.get("date_range") == "yesterday":
            return "day_" + {"transaction_count": "transactions",
                             "average_transaction_value": "basket"}[a["metric"]]
        who = "estate" if g == [] else "shop"
        return who + "_" + {"net_sales": "sales", "transaction_count": "transactions",
                            "average_transaction_value": "basket",
                            "product_revenue": "products"}[a["metric"]]

    def __call__(self, tool: str):
        def run(**a):
            part = self._part(tool, a)
            self.calls.append((part, dict(a)))
            if part in self.fail:
                raise RuntimeError("connection reset")
            return {"rows": self.rows(part, a), "meta": _meta(a.get("metric", part),
                                                             notice=self.notices.get(part))}
        return run

    def rows(self, part: str, a: dict) -> list[dict]:
        base = 100_000.0
        total = sum(self.shop_change.values())
        if part in ("estate_sales", "estate_products"):
            n = len(self.shop_change)
            return [_cmp(base * n + total, base * n)]
        if part == "estate_transactions":
            return [_cmp(900, 1000, unit="transactions")]
        if part == "estate_basket":
            return [_cmp(420.5, 410.25)]
        if part == "shop_sales":
            return [_cmp(base + c, base, store=s) for s, c in self.shop_change.items()]
        if part == "shop_transactions":
            return [_cmp(95, 100, unit="transactions", store=s) for s in self.shop_change]
        if part == "shop_basket":
            return [_cmp(401, 400, store=s) for s in self.shop_change]
        if part == "shop_days":
            start, end = (date.fromisoformat(d) for d in a["date_range"])
            out, d = [], start
            while d < end:
                for s, c in self.shop_change.items():
                    # The window's Wednesday carries the whole of each shop's change.
                    moved = c if (d >= start + timedelta(days=7) and d.weekday() == 2) else 0
                    out.append({"store": s, "day": d.isoformat(), "value": 10_000.0 + moved})
                d += timedelta(days=1)
            return out
        if part == "fell":
            return [_cmp(5_000, 9_000, product="Aji Mix", sku="SH1"),
                    _cmp(1_000, 2_000, product="Aji Kiamoy", sku="SH2")]
        if part == "rose":
            return [_cmp(4_000, 1_000, product="Aji Squid", sku="SH3")]
        if part == "stockouts":
            return [{"product": "RC Sweet Chili", "sku": "ET040", "store": SHOPS[0],
                     "observed_days": 7, "days_out_of_stock": 6, "days_negative": 0,
                     "current_stockout_run": 3}]
        if part == "day_transactions":
            return [_cmp(40, 80, unit="transactions", store=SHOPS[1])]
        if part == "day_basket":
            return [_cmp(250.25, 325.5, store=SHOPS[1])]
        if part == "attention":
            return [{"source": "sales_vs_same_weekday", "section": "sales_vs_same_weekday",
                     "subject": SHOPS[1], "rank": 1, **_cmp(10_009.5, 26_048.5),
                     "receipts": {"as_of": {"day": "2026-09-21"}}}]
        return []


@pytest.fixture
def reads(monkeypatch):
    def install(shop_change, **kw):
        fake = Reads(shop_change, **kw)
        monkeypatch.setattr(overview, "FUNCTIONS",
                            {t: fake(t) for t in ("get_sales", "get_stock_history", "get_attention")})
        return fake
    return install


def _shops(*changes):
    return dict(zip(SHOPS, changes))


# ---------------------------------------------------------------------------
# 1. No SQL, and only reads that exist
# ---------------------------------------------------------------------------

def test_the_overview_writes_no_sql():
    tree = ast.parse(pathlib.Path(overview.__file__).read_text(encoding="utf-8"))
    called = {(n.func.attr if isinstance(n.func, ast.Attribute) else getattr(n.func, "id", ""))
              for n in ast.walk(tree) if isinstance(n, ast.Call)}
    for forbidden in ("connect", "execute", "executemany", "cursor"):
        assert forbidden not in called, f"overview.py calls {forbidden}()"
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            assert not re.search(r"\bSELECT\b.+\bFROM\b", node.value, re.I | re.S), node.value[:60]


def test_every_read_it_makes_is_a_read_bob_has():
    for part, read in SPEC["reads"].items():
        assert read["tool"] in loop.TOOL_FUNCTIONS, part
        assert read["tool"] in overview.FUNCTIONS, part
        assert overview.FUNCTIONS[read["tool"]] is loop.TOOL_FUNCTIONS[read["tool"]], part


def test_no_store_is_named_in_the_code():
    """The store list lives in the yaml and nowhere else (CLAUDE.md)."""
    text = pathlib.Path(overview.__file__).read_text(encoding="utf-8")
    every = [s.get("display_name") or s.get("name") for g in ("active_retail", "warehouse",
             "closed", "pending_retail") for s in req(DEFS, f"stores.{g}") or []]
    for name in every:
        assert name not in text, f"tools/overview.py names {name!r}"


# ---------------------------------------------------------------------------
# 2. It is a read, like any other
# ---------------------------------------------------------------------------

def test_it_is_registered_as_a_read_and_offered_with_the_presets():
    # DRAWABLE SINCE 2026-09-22 (after wave 1): what Bob asks for, get_overview,
    # is a call asked as one (agent/one_call.py) — the findings read plus the
    # parts a page draws. The findings read is the registered, pinnable one.
    assert loop.TOOL_FUNCTIONS["get_overview_findings"] is overview.get_overview_findings
    assert "get_overview" in loop.one_call.FUNCTIONS and "get_overview" not in loop.TOOL_FUNCTIONS
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == "get_overview")
    offered = schema["input_schema"]["properties"]["date_range"]["oneOf"][0]["enum"]
    assert offered == sorted(req(DEFS, "sales_day.presets"))
    assert "decisions" not in schema["input_schema"]["properties"]
    # Bob is told on the tool when to reach for it — the prompt is W1.1's.
    assert "broad" in schema["description"].lower()


def test_a_backtest_knows_what_it_reproduces():
    bt = req(DEFS, "workflows.backtest")
    assert bt["window_arguments"]["get_overview_findings"] == "date_range"
    assert "get_overview_findings" in bt["partially_reproducible"]


def test_it_returns_rows_and_the_three_receipts(reads):
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))
    out = overview.get_overview_findings()
    assert isinstance(out["rows"], list) and out["rows"]
    meta = out["meta"]
    for key in ("source_table", "filters_applied", "snapshot_timestamp"):
        assert meta.get(key), key
    assert meta["window"]["kind"] == "preset" and meta["window"]["name"] == SPEC["default_window"]
    assert set(meta["parts"]) == set(SPEC["reads"])
    for part in meta["parts"].values():
        assert part["call"]["tool"] in overview.FUNCTIONS


def test_a_window_still_in_progress_is_refused(reads):
    reads(_shops(-1, -1, -1, -1, -1, -1, -1))
    with pytest.raises(ValueError, match="in progress"):
        overview.get_overview_findings("this_week")


def test_the_calls_carry_the_window_and_the_comparison(reads):
    fake = reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))
    overview.get_overview_findings()
    by = dict(fake.calls)
    assert by["estate_sales"]["compare_to"] == SPEC["compare_to"]
    assert by["estate_sales"]["date_range"] == SPEC["default_window"]
    start, end = by["shop_days"]["date_range"]
    assert (date.fromisoformat(end) - date.fromisoformat(start)).days == 14
    assert "compare_to" not in by["shop_days"]  # a series, never differenced by the tool
    assert by["fell"]["top_n"] == SPEC["top_n"]["products"]


# ---------------------------------------------------------------------------
# 3. Ranked findings, each a line of fact code wrote
# ---------------------------------------------------------------------------

def test_findings_follow_the_declared_order(reads):
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))
    rows = overview.get_overview_findings()["rows"]
    order = SPEC["order"]
    places = [order.index(r["finding"]) for r in rows]
    assert places == sorted(places)
    assert rows[0]["finding"] == "estate" and rows[0]["rank"] == 1
    assert [r["rank"] for r in rows] == list(range(1, len(rows) + 1))
    shops = [r for r in rows if r["finding"] == "shop"]
    assert [abs(r["change"]) for r in shops] == sorted((abs(r["change"]) for r in shops), reverse=True)


_NUMERAL = re.compile(r"-?[₱]?\d[\d,]*(?:\.\d+)?")


def _numbers(node) -> set[float]:
    out: set[float] = set()
    if isinstance(node, dict):
        for v in node.values():
            out |= _numbers(v)
    elif isinstance(node, list):
        for v in node:
            out |= _numbers(v)
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        out.add(abs(float(node)))
    return out


def test_every_figure_in_a_fact_is_a_number_on_its_row(reads):
    """Rule 9: code writes every digit, and the digit it writes is a row's figure."""
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))
    out = overview.get_overview_findings()
    for row in out["rows"]:
        allowed = _numbers(row)
        fact = re.sub(r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}\b", "", row["fact"])
        for m in _NUMERAL.finditer(fact):
            n = float(m.group(0).replace("₱", "").replace(",", "").lstrip("-"))
            assert any(abs(n - a) <= 0.5 for a in allowed), (row["finding"], row["fact"], n)


def test_no_row_carries_a_share_of_a_change(reads):
    """Rule 10: the ratio decides a word, and is never a figure anyone can quote."""
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))
    for row in overview.get_overview_findings()["rows"]:
        keys = set(row) | set(row.get("detail") or {})
        assert not keys & {"share", "ratio", "share_of_change", "share_pct", "contribution"}, row
        assert "%" not in row["fact"] or row["finding"] not in ("concentration",), row["fact"]


# ---------------------------------------------------------------------------
# 4. What carried it — the definition, decided in code
# ---------------------------------------------------------------------------

def _shop_concentration(rows):
    return next(r for r in rows if r["finding"] == "concentration" and r["detail"]["of"] == "shops")


def test_one_shop_that_carried_most_of_the_fall_is_named_from_its_row(reads):
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))  # estate -7,500; the first shop -6,000
    row = _shop_concentration(overview.get_overview_findings()["rows"])
    assert row["detail"]["outcome"] == "carried_most"
    assert row["subject"] == SHOPS[0] and row["change"] == -6_000
    assert "carried most" in row["fact"] and SHOPS[0] in row["fact"]
    assert row["detail"]["whole_change"] == -7_500


def test_a_shop_that_fell_more_than_the_estate_carried_all_of_it(reads):
    reads(_shops(-6_000, 2_000, 1_000, 0, 0, 0, 0))  # estate -3,000
    row = _shop_concentration(overview.get_overview_findings()["rows"])
    assert row["detail"]["outcome"] == "carried_all"
    assert "moved the other way" in row["fact"]


def test_a_fall_spread_across_shops_names_no_carrier(reads):
    reads(_shops(-1_000, -1_000, -1_000, -1_000, -900, 0, 0))
    row = _shop_concentration(overview.get_overview_findings()["rows"])
    assert row["detail"]["outcome"] == "spread"
    assert row["fact"].startswith("No one shop carried most")


def test_most_means_what_the_yaml_says(reads, monkeypatch):
    """The threshold is read, not written: move it and the word moves."""
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))  # the first shop is 0.8 of the fall
    assert _shop_concentration(overview.get_overview_findings()["rows"])["detail"]["outcome"] == "carried_most"
    defs = load_defs()
    monkeypatch.setitem(defs["overview"]["concentration"], "most_means_more_than", 0.9)
    assert _shop_concentration(overview.get_overview_findings()["rows"])["detail"]["outcome"] == "spread"


def test_a_rise_is_carried_by_a_shop_that_rose(reads):
    reads(_shops(6_000, 1_000, -500, 0, 0, 0, 0))
    row = _shop_concentration(overview.get_overview_findings()["rows"])
    assert row["change"] > 0 and "rise" in row["fact"]


def test_a_flat_estate_has_nothing_carried(reads):
    reads(_shops(1_000, -1_000, 0, 0, 0, 0, 0))
    rows = overview.get_overview_findings()["rows"]
    assert not [r for r in rows if r["finding"] == "concentration" and r["detail"]["of"] == "shops"]


def test_the_day_that_moved_is_set_against_the_same_weekday(reads):
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))
    days = [r for r in overview.get_overview_findings()["rows"] if r["finding"] == "day_moved"]
    assert len(days) == SPEC["top_n"]["shop_days"]
    first = days[0]
    assert first["subject"] == SHOPS[0] and first["change"] == -6_000
    d, against = (date.fromisoformat(first["detail"][k]) for k in ("day", "against"))
    assert (d - against).days == 7 and d.weekday() == 2


def test_a_shop_flagged_for_its_day_arrives_with_its_drivers(reads):
    """Anything shown that moved is investigated before it is shown."""
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0))
    row = next(r for r in overview.get_overview_findings()["rows"] if r["finding"] == "attention")
    assert row["subject"] == SHOPS[1]
    assert "transactions down 50%" in row["fact"] and "basket down 23.1%" in row["fact"]
    assert row["detail"]["transactions"]["change_pct"] == -50.0


# ---------------------------------------------------------------------------
# 5 and 6. A read that fails, and the notices
# ---------------------------------------------------------------------------

def test_a_read_that_fails_is_a_finding_first_and_the_rest_stand(reads):
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0), fail={"stockouts"})
    out = overview.get_overview_findings()
    assert out["rows"][0]["finding"] == "unread"
    assert "stockouts" in out["rows"][0]["fact"] and "connection reset" in out["rows"][0]["fact"]
    assert out["meta"]["unread"] == ["stockouts"]
    assert out["meta"]["parts"]["stockouts"]["state"] == "failed"
    assert not [r for r in out["rows"] if r["finding"] == "stockout"]
    assert [r for r in out["rows"] if r["finding"] == "estate"]


def test_every_reads_notice_reaches_the_overview(reads):
    n1 = {"kind": "negative_on_hand", "message": "counts below zero"}
    n2 = {"kind": "comparison_incomplete", "message": "some rows not compared"}
    reads(_shops(-6_000, -1_000, -1_000, 500, 0, 0, 0),
          notices={"stockouts": n1, "fell": n2, "rose": n2})
    notice = overview.get_overview_findings()["meta"]["notice"]
    assert notice["kind"] == "multiple"
    assert [n["kind"] for n in notice["items"]] == ["comparison_incomplete", "negative_on_hand"] or \
        sorted(n["kind"] for n in notice["items"]) == ["comparison_incomplete", "negative_on_hand"]
    assert len(notice["items"]) == 2  # the same notice twice is said once
    assert [n["kind"] for n in loop._notices_from({"meta": {"notice": notice}})]


# ---------------------------------------------------------------------------
# Drawable (2026-09-22, after wave 1): asked as one call, it is the findings
# read and the parts a page draws — the findings read's own calls, never a
# second list — so a broad page draws its charts without re-reading.
# ---------------------------------------------------------------------------

def test_asked_as_one_it_is_the_findings_and_the_parts_a_page_draws():
    reads = loop.one_call.get_overview()
    assert reads[0] == {"part": "findings", "tool": "get_overview_findings", "arguments": {}}
    drawn = req(DEFS, "overview.drawn")
    assert [r["part"] for r in reads[1:]] == list(drawn)
    spec = req(DEFS, "overview")
    for r in reads[1:]:
        assert r["tool"] == spec["reads"][r["part"]]["tool"]
        assert r["tool"] in loop.TOOL_FUNCTIONS
        assert loop._unfit_arguments(r["tool"], loop.TOOL_FUNCTIONS[r["tool"]], r["arguments"]) is None


def test_the_parts_carry_the_window_the_findings_read_is_asked_for():
    reads = loop.one_call.get_overview("last_7_days")
    assert reads[0]["arguments"] == {"date_range": "last_7_days"}
    assert next(r for r in reads if r["part"] == "shop_sales")["arguments"]["date_range"] == "last_7_days"


def test_a_window_in_progress_is_refused_once_for_the_whole_call():
    with pytest.raises(ValueError):
        loop.one_call.get_overview("this_week")

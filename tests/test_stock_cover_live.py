"""
Stock cover against real data (W1.5, 2026-09-22).

NEEDS THE DATABASE — run with the rest of the *_live.py files, never by
`verify_integration.py pure`.

The card's "Done when", measured: a line above zero whose cover is under its
window is flagged naming both numbers, and the reorder is a draft instead of a
refusal.
"""

from __future__ import annotations

from tools import replenishment
from tools.brief import get_brief
from tools.stock_cover import get_stock_cover


def test_a_line_running_out_is_above_zero_with_a_level_and_both_numbers():
    r = get_stock_cover()
    meta = r["meta"]
    assert meta["source_table"] and meta["filters_applied"] and meta["snapshot_timestamp"]
    firing = [x for x in r["rows"] if x["state"] == meta["fires"]]
    for x in firing:
        assert x["on_hand"] > 0
        assert x["warning_level"] is not None or x["ideal_level"] is not None
        assert x["cover_days"] is not None and x["window_days"] == meta["window_days"]
        assert x["cover_days"] < x["window_days"]
    # Every line is counted, fired or not.
    assert sum(meta["states"].values()) >= len(r["rows"])


def test_a_line_with_no_level_never_fires():
    r = get_stock_cover(state="no_level", top_n=20)
    for x in r["rows"]:
        assert x["state"] == "no_level"
        assert x["warning_level"] is None and x["ideal_level"] is None


def test_the_aji_barn_reorder_is_a_draft_not_a_refusal():
    r = get_stock_cover(view="draft", store="AJI BARN")
    meta = r["meta"]
    assert meta["is_a_draft"] is True and meta["writes_anything"] is False
    for x in r["rows"]:
        assert x["kind"] in ("move", "order")
        assert x["quantity"] > 0 and x["reason"]


def test_the_replenishment_plan_reads_the_warehouse():
    r = replenishment.get_replenishment(store="AJI BARN", top_n=5)
    assert any("AJI BARN named" in f for f in r["meta"]["filters_applied"])


def test_the_morning_section_is_the_same_rows():
    b = get_brief()
    section = b["meta"]["sections"]["stock_running_out"]
    rows = [x for x in b["rows"] if x["section"] == "stock_running_out"]
    assert section["items"] == len(rows)
    for x in rows:
        assert x["cover_days"] < x["window_days"] and x["on_hand"] > 0

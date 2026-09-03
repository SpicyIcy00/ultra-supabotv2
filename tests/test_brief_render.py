"""
Rendering the brief for Telegram: notice placement and splitting.

NO DATABASE — these run against synthetic briefs, because the two behaviours
that matter most cannot be triggered by today's data. A real brief today fits in
one message, so the splitting path would never execute; and a section with no
notices would never prove that notices come first.
"""

from __future__ import annotations

import re

import pytest

from app.services.brief_telegram import MAX_MESSAGE_LEN, render

STALE = {
    "kind": "stale_sources",
    "message": "purchase_orders last has data from 2026-07-01 (64 days ago, frozen).",
}
GAP = {
    "kind": "snapshot_gaps",
    "message": "The two most recent stock snapshots are 4 days apart.",
}


def _brief(rows, notices=None, sections=None):
    notice = None
    if notices:
        notice = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }
    meta = {
        "as_of": {"today": "2026-09-03", "yesterday": "2026-09-02",
                  "sales_baseline": "2026-08-26"},
        "sections": sections or {},
        "sources": [
            {"source": "transactions", "latest": "2026-09-03", "age_days": 0,
             "fresh": True, "frozen": False},
            {"source": "purchase_orders", "latest": "2026-07-01", "age_days": 64,
             "fresh": False, "frozen": True},
        ],
        "snapshot_timestamp": "2026-09-03T06:00:00+00:00",
        "newest_transaction": "2026-09-03T05:59:00+00:00",
    }
    if notice:
        meta["notice"] = notice
    return {"rows": rows, "meta": meta}


def _sales_row(name, pct=-30.0):
    return {
        "section": "sales_vs_same_weekday", "subject": name, "store_id": "x",
        "value": 24447.0, "baseline": 36579.0, "change": -12132.0,
        "change_pct": pct, "direction": "down", "unit": "PHP",
        "threshold_applied": {}, "receipts": {},
    }


def _stock_row(name):
    return {"section": "stock_crossed_out", "subject": name, "sku": "SH1",
            "store": "OPUS", "was": 29.0, "now": -2.0, "receipts": {}}


# ---------------------------------------------------------------------------
# Notice placement
# ---------------------------------------------------------------------------

def test_section_notices_appear_above_that_sections_items():
    """
    A caveat below the fold is a caveat nobody reads. Telegram truncates and
    phones cut off, so a notice under its figures is a notice that did not
    happen.
    """
    out = render(_brief([_stock_row("Beef Jerky")], notices=[GAP]))[0]
    assert out.index("4 days apart") < out.index("Beef Jerky")


def test_brief_level_notices_appear_before_every_section():
    out = render(_brief([_sales_row("Greenhills")], notices=[STALE]))[0]
    assert out.index("64 days ago") < out.index("Sales vs the same weekday")


def test_stale_sources_are_stated_not_omitted():
    """A source quietly left out reads as 'nothing happened there'."""
    out = render(_brief([_sales_row("Greenhills")], notices=[STALE]))[0]
    assert "purchase_orders" in out and "frozen" in out


def test_freshness_is_not_printed_twice():
    """
    The stale_sources notice already names every silent source. Repeating the
    same facts in a second line teaches the reader to skim past notices, which
    is the one thing they must not do.
    """
    out = render(_brief([_sales_row("Greenhills")], notices=[STALE]))[0]
    assert out.count("purchase_orders") == 1


# ---------------------------------------------------------------------------
# Splitting
# ---------------------------------------------------------------------------

def test_a_short_brief_is_one_message():
    msgs = render(_brief([_sales_row("Greenhills"), _stock_row("Beef Jerky")]))
    assert len(msgs) == 1
    assert len(msgs[0]) <= MAX_MESSAGE_LEN


def test_a_long_brief_splits_and_every_part_fits():
    rows = [_stock_row(f"A very long product name number {i:03d}") for i in range(300)]
    msgs = render(_brief(rows, notices=[STALE, GAP]))
    assert len(msgs) > 1
    for m in msgs:
        assert len(m) <= MAX_MESSAGE_LEN, len(m)


def test_splitting_never_cuts_an_item_in_half():
    """
    telegram_sender truncates at 4096 and appends "(truncated)", which for a
    brief means losing whole items with no sign of what went missing. Splitting
    happens between items instead.
    """
    rows = [_stock_row(f"Product {i:03d}") for i in range(300)]
    joined = "\n".join(render(_brief(rows)))
    for i in range(300):
        # Every item that appears at all appears complete, with its quantities.
        if f"Product {i:03d}" in joined:
            line = next(l for l in joined.splitlines() if f"Product {i:03d}" in l)
            assert "29 → -2" in line, line
    assert "truncated" not in joined


def test_a_continuation_repeats_the_section_notices():
    """
    A second message listing items while the caveats stayed behind in the first
    is exactly the failure that putting notices on top is meant to prevent.
    """
    rows = [_stock_row(f"Product {i:03d}") for i in range(300)]
    msgs = render(_brief(rows, notices=[GAP]))
    continuations = [m for m in msgs if "(continued)" in m]
    assert continuations, "expected the stock section to spill"
    for m in continuations:
        assert "4 days apart" in m


def test_multi_part_messages_are_numbered():
    rows = [_stock_row(f"Product {i:03d}") for i in range(300)]
    msgs = render(_brief(rows))
    assert all(re.search(r"\(\d+/\d+\)", m) for m in msgs)


# ---------------------------------------------------------------------------
# Empty is not quiet
# ---------------------------------------------------------------------------

def test_a_quiet_morning_states_the_finding_not_an_absence():
    """
    A quiet morning is a RESULT — everything stayed inside its normal range —
    and it is what makes a noisy morning mean something. "Nothing to report"
    reads as absence and is indistinguishable from a section that broke.
    """
    out = render(_brief([], sections={
        "sales_vs_same_weekday": {"items": 0, "stores_considered": 7},
        "stock_crossed_out": {"items": 0, "compared": ["2026-09-01", "2026-09-02"]},
        "newly_dead": {"items": 0, "window_days": 30},
    }))[0]
    assert "No store moved beyond its normal range" in out
    assert "7 compared against the same weekday last week" in out
    assert "Nothing went out of stock." in out
    assert "Nothing crossed 30 days without a sale." in out


def test_a_section_that_could_not_run_does_not_look_quiet():
    """The failure mode this whole distinction exists to prevent."""
    out = render(_brief([], sections={
        "sales_vs_same_weekday": {"items": 0, "stores_considered": 0},
        "stock_crossed_out": {"items": 0, "compared": [None, None]},
    }))[0]
    assert "Could not compare sales" in out
    assert "Could not compare stock" in out
    assert "missing data, not a quiet morning" in out
    assert "No store moved beyond its normal range" not in out


# ---------------------------------------------------------------------------
# HTML safety
# ---------------------------------------------------------------------------

def test_product_names_with_html_characters_are_escaped():
    """
    "Tong Garden Onion & Garlic" is a real product. An unescaped ampersand makes
    Telegram reject the whole message with a 400, losing the entire brief.
    """
    row = _stock_row("Tong Garden Onion & Garlic <Broad> Beans")
    out = render(_brief([row]))[0]
    assert "&amp;" in out and "&lt;Broad&gt;" in out
    assert "Onion & Garlic" not in out


def test_negative_money_puts_the_sign_outside_the_symbol():
    out = render(_brief([_sales_row("Greenhills")]))[0]
    assert "-₱12,132" in out
    assert "₱-12,132" not in out

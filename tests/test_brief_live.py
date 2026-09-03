"""
The morning brief against real data.

NEEDS THE DATABASE — skipped with the rest of the golden suite when
GEORGE_DATABASE_URL is unset.
"""

from __future__ import annotations

from datetime import date, timedelta

from tools.brief import get_brief


def test_the_baseline_is_always_the_same_weekday():
    """
    The invariant the whole design rests on. Day-over-day swings a median 21.3%
    against 12.5% for the same weekday a week earlier, and Sunday averages three
    times Monday — so a brief compared with the previous day would report a
    catastrophe every Monday by construction.
    """
    for offset in range(7):          # every weekday, not just today
        day = date(2026, 8, 31) + timedelta(days=offset)
        meta = get_brief(as_of=day)["meta"]
        yesterday = date.fromisoformat(meta["as_of"]["yesterday"])
        baseline = date.fromisoformat(meta["as_of"]["sales_baseline"])
        assert yesterday.weekday() == baseline.weekday(), (day, yesterday, baseline)
        assert (yesterday - baseline).days == 7


def test_every_row_carries_its_own_receipts():
    """
    A brief mixes sources between 0 and 64 days old. One timestamp for the page
    would lend the freshest source's credibility to the stalest source's facts.
    """
    r = get_brief()
    for row in r["rows"]:
        receipts = row["receipts"]
        assert receipts["source_table"]
        assert receipts["filters_applied"]
        assert receipts["snapshot_timestamp"]
        assert receipts["as_of"]


def test_frozen_and_stale_sources_are_named_not_omitted():
    """A source quietly left out reads as 'nothing happened there'."""
    meta = get_brief()["meta"]
    by_name = {s["source"]: s for s in meta["sources"]}
    # Every source the brief could draw on is accounted for, used or not.
    for expected in ("transactions", "inventory_snapshots", "vending_aisles",
                     "stock_transfers", "purchase_orders"):
        assert expected in by_name, expected

    frozen = [s for s in meta["sources"] if s["frozen"]]
    assert frozen, "the CSV imports are static and must be reported as such"
    for s in frozen:
        assert s["age_days"] is not None and s["latest"]

    notice = meta.get("notice")
    kinds = {i["kind"] for i in (notice.get("items", [notice]) if notice else [])}
    assert "stale_sources" in kinds


def test_the_absolute_floor_keeps_small_stores_from_dominating():
    """
    Both conditions must hold. A store moving 40% on a tiny baseline is a large
    percentage describing a small amount of money, and without the floor the
    smallest store would be in the brief every morning.
    """
    r = get_brief()
    for row in r["rows"]:
        if row["section"] != "sales_vs_same_weekday":
            continue
        t = row["threshold_applied"]
        assert abs(row["change_pct"]) >= t["pct_threshold"]
        assert abs(row["change"]) >= t["absolute_floor"]
        # The floor is derived from that store's own median, not a global number.
        assert "median day" in t["floor_basis"]


def test_stock_section_reports_which_snapshot_days_it_compared():
    """
    Coverage has gaps, so "yesterday" is sometimes not the day before. The brief
    names the two dates it actually used rather than implying consecutive days.
    """
    meta = get_brief()["meta"]
    compared = meta["sections"]["stock_crossed_out"]["compared"]
    assert len(compared) == 2 and all(compared), compared

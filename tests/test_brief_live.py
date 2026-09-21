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


def test_the_stale_line_a_reader_sees_names_nothing_internal():
    """
    `stale_sources` is the notice most often forced into Bob's answer, and the
    loop appends a forced message VERBATIM — so this string IS the block the
    owner has asked three times to be rid of. It was ~100 words of per-source
    dates naming `vending_aisles` and `stock_transfers`, which are TABLE NAMES,
    in the one field `notices.contract` reserves for the reader.

    UI rule 4's own amendment is the warrant: "a notice may be one line that
    names it, visible without interaction, with its explanation on tap." The
    dates moved to `guidance`, which reaches the model and is never rendered.
    It stays COMPLETE ON ITS OWN, as the contract requires: which sources, that
    they are old, and what that means for the figures.

    IT LIVES HERE AND NOT IN THE CONTRACT FILE because it builds a real brief.
    Written into tests/test_notice_drawing_contract.py on 2026-09-21 it broke
    CI: `verify_integration.py pure` runs every test_*.py that is not
    `_live.py` AND FAILS ON ANY SKIP, so a test that skips without a database
    is a red build, not a quiet one. The half of it that needs no database —
    that the message is BUILT from the yaml's reader names with the dates in
    `guidance` — stayed there, where it runs every time.
    """
    import pytest

    notice = get_brief()["meta"].get("notice")
    notice = notice[0] if isinstance(notice, list) else notice
    found = [n for n in ([notice] + list((notice or {}).get("items") or []))
             if isinstance(n, dict) and n.get("kind") == "stale_sources"]
    if not found:
        pytest.skip("no source is stale right now")
    said = found[0]["message"]

    for internal in ("vending_aisles", "stock_transfers", "purchase_orders",
                     "inventory_snapshots", "vending_lines"):
        assert internal not in said, f"{internal} is a table name, not the reader's word"
    assert len(said.split()) <= 45, f"the line a reader sees is {len(said.split())} words: {said}"
    # And it still conveys its own fingerprint, so Bob echoing it passes the gate.
    low = said.lower()
    assert any(w in low for w in ("too old", "stale", "days old"))
    assert any(w in low for w in ("source", "transfer", "purchase order", "vending",
                                 "covers nothing"))
    assert found[0].get("guidance"), "the dates have to survive somewhere, for the model"

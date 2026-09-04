"""
George's opening line: which item speaks, and what he says when none does.

NO DATABASE — these run against synthetic briefs, for the same reason
test_brief_render.py does. The two behaviours that matter most cannot be
triggered on demand by today's data: a morning where a section could not run at
all, and a tie between two items on the same figure.

THE CENTRAL ASSERTION OF THIS FILE is that "nothing crossed the threshold" is
never rendered as "nothing moved beyond normal" when a section did not run.
tools/brief.py refuses to conflate those two (metrics.yaml
brief.empty_section_must_distinguish); the greeting is the last place that
guarantee could be lost, because it is the one place that reduces the whole
brief to a single sentence.
"""

from __future__ import annotations

import pytest

# The same guard test_pins_contract uses: nothing here opens a connection, but
# george_greeting imports tools.brief, which imports tools/_common, which
# imports psycopg at module scope.
pytest.importorskip("psycopg", reason="george_greeting imports the brief tool, which imports psycopg")

from app.services.george_greeting import (  # noqa: E402
    MAX_FOLLOW_UPS,
    build_greeting,
    follow_ups,
)
from tools._common import load_defs  # noqa: E402
from tools.brief import most_notable  # noqa: E402

DEFS = load_defs()

SALES_RECEIPTS = {
    "source_table": "new_transactions",
    "filters_applied": ["t.is_cancelled = false   # metrics.yaml: filters.cancelled"],
    "as_of": {"day": "2026-09-02", "baseline": "2026-08-26",
              "comparison": "same weekday last week"},
    "snapshot_timestamp": "2026-09-03T06:00:00+00:00",
}

STOCK_RECEIPTS = {
    "source_table": "inventory_snapshots",
    "filters_applied": ["was quantity_on_hand > 0, now <= 0"],
    "as_of": {"compared": ["2026-09-01", "2026-09-02"]},
    "snapshot_timestamp": "2026-09-03T06:00:00+00:00",
}


def sales_row(subject, value, baseline, **kw):
    change = value - baseline
    return {
        "section": "sales_vs_same_weekday",
        "subject": subject,
        "store_id": subject.lower(),
        "value": value,
        "baseline": baseline,
        "change": change,
        "change_pct": round(change / baseline * 100.0, 1),
        "direction": "up" if change > 0 else "down",
        "unit": "PHP",
        "receipts": SALES_RECEIPTS,
        **kw,
    }


def stock_row(subject, was, now=0, store="Rockwell"):
    return {
        "section": "stock_crossed_out",
        "subject": subject,
        "sku": f"SKU-{subject[:4].upper()}",
        "store": store,
        "was": was,
        "now": now,
        "receipts": STOCK_RECEIPTS,
    }


def dead_row(subject, qty, store="Fairview", last_sold="2026-08-03"):
    return {
        "section": "newly_dead",
        "subject": subject,
        "sku": None,
        "store": store,
        "quantity_on_hand": qty,
        "last_sold": last_sold,
        "receipts": {"source_table": "inventory + new_transaction_items",
                     "snapshot_timestamp": "2026-09-03T06:00:00+00:00"},
    }


def brief(rows, sections=None, notices=None):
    """A brief in the shape get_brief() returns, with sections defaulted sane."""
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["section"]] = counts.get(r["section"], 0) + 1
    secs = {
        "sales_vs_same_weekday": {"items": counts.get("sales_vs_same_weekday", 0),
                                  "ran": True},
        "stock_crossed_out": {"items": counts.get("stock_crossed_out", 0), "ran": True},
        "newly_dead": {"items": counts.get("newly_dead", 0), "ran": True,
                       "window_days": 30},
    }
    for name, over in (sections or {}).items():
        secs[name] = {**secs.get(name, {}), **over}

    meta = {
        "source_table": "multiple — each row carries its own receipts",
        "snapshot_timestamp": "2026-09-03T06:00:00+00:00",
        "as_of": {"today": "2026-09-03", "yesterday": "2026-09-02",
                  "sales_baseline": "2026-08-26"},
        "sections": secs,
        "row_count": len(rows),
    }
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }
    return {"rows": rows, "meta": meta}


# ---------------------------------------------------------------------------
# Notability
# ---------------------------------------------------------------------------

def test_sales_outranks_a_larger_number_in_another_section():
    """
    Section precedence is not a magnitude comparison.

    A stock crossing of 9,000 units does not outrank a store down PHP 40,000,
    and the two measures are not commensurable in the first place — one is
    pesos and the other is boxes of sweets.
    """
    payload = brief([stock_row("Muscat Gummy", was=9000),
                     sales_row("Fairview", 20000, 60000)])
    assert most_notable(payload, defs=DEFS)["subject"] == "Fairview"


def test_within_sales_the_biggest_money_wins_not_the_biggest_percentage():
    """
    The reason brief.notability.measure is `change` and not `change_pct`.

    Fairview is down 60% of a small day; Rockwell is down 40% of a large one.
    Ranking on percentage hands the opening line to the smallest store nearly
    every morning, which is the failure absolute_floor_fraction already exists
    to prevent one layer down.
    """
    fairview = sales_row("Fairview", 8000, 20000)     # -12,000  -60.0%
    rockwell = sales_row("Rockwell", 33000, 55000)    # -22,000  -40.0%
    assert abs(fairview["change_pct"]) > abs(rockwell["change_pct"])
    assert most_notable(brief([fairview, rockwell]), defs=DEFS)["subject"] == "Rockwell"


def test_a_rise_and_a_fall_are_ranked_on_size_alone():
    """Direction is reported, never ranked. A store up 30k leads one down 12k."""
    up = sales_row("Shang", 60000, 30000)        # +30,000
    down = sales_row("Magnolia", 18000, 30000)   # -12,000
    assert most_notable(brief([up, down]), defs=DEFS)["subject"] == "Shang"


def test_ties_break_on_subject_not_row_order():
    """
    Two items on the same figure must not swap places between two runs of the
    same morning. Row order follows the order store ids come back in, so it is
    not a stable tie-break.
    """
    a = sales_row("Aurora", 10000, 30000)   # -20,000
    z = sales_row("Zamora", 10000, 30000)   # -20,000
    assert most_notable(brief([a, z]), defs=DEFS)["subject"] == "Aurora"
    assert most_notable(brief([z, a]), defs=DEFS)["subject"] == "Aurora"


def test_an_unmeasurable_row_is_not_ranked_as_zero():
    """A row missing its measure is skipped, not silently ranked last."""
    broken = sales_row("Broken", 10000, 30000)
    broken["change"] = None
    payload = brief([broken, stock_row("Muscat Gummy", was=12)])
    assert most_notable(payload, defs=DEFS)["subject"] == "Muscat Gummy"


def test_an_empty_brief_has_no_notable_item():
    assert most_notable(brief([]), defs=DEFS) is None


# ---------------------------------------------------------------------------
# The three shapes
# ---------------------------------------------------------------------------

def test_a_quiet_morning_says_so_and_invites():
    g = build_greeting(brief([]), defs=DEFS)
    assert g["kind"] == "quiet"
    assert g["headline"] == "Nothing moved beyond normal today. What do you need?"
    assert g["item"] is None
    assert g["blind_sections"] == []


def test_a_blind_morning_is_not_a_quiet_one():
    """
    THE ASSERTION THIS FILE EXISTS FOR.

    No items, and stock could not run. That is not a quiet morning, and the
    words "nothing moved beyond normal" must not be said about a section
    nobody was able to look at.
    """
    payload = brief([], sections={
        "stock_crossed_out": {"items": 0, "ran": False,
                              "reason": "there were no stock snapshots to compare"},
    })
    g = build_greeting(payload, defs=DEFS)

    assert g["kind"] == "could_not_look"
    assert g["blind_sections"] == ["stock_crossed_out"]
    assert "I couldn't check stock this morning" in g["headline"]
    assert "there were no stock snapshots to compare" in g["headline"]
    # The quiet sentence may still appear, but only ever about the OTHER
    # sections, and never as the whole claim.
    assert not g["headline"].startswith("Nothing moved beyond normal")
    assert "Nothing moved beyond normal today" not in g["headline"]


def test_two_blind_sections_are_both_named():
    payload = brief([], sections={
        "sales_vs_same_weekday": {"items": 0, "ran": False,
                                  "reason": "no store had both days of sales to compare"},
        "stock_crossed_out": {"items": 0, "ran": False,
                              "reason": "there were no stock snapshots to compare"},
    })
    g = build_greeting(payload, defs=DEFS)
    assert g["kind"] == "could_not_look"
    assert "sales or stock" in g["headline"]
    assert "no store had both days of sales to compare" in g["headline"]
    assert "there were no stock snapshots to compare" in g["headline"]


def test_an_item_alongside_a_blind_section_never_claims_the_rest_was_normal():
    """
    The same rule inside the `item` shape. One sales item and no stock
    snapshots: "nothing else moved beyond normal" would be a claim about
    exactly the section that was not checked.
    """
    payload = brief(
        [sales_row("Rockwell", 33000, 55000)],
        sections={"stock_crossed_out": {"items": 0, "ran": False,
                                        "reason": "there were no stock snapshots to compare"}},
    )
    g = build_greeting(payload, defs=DEFS)
    assert g["kind"] == "item"
    assert "Nothing else moved beyond normal" not in g["headline"]
    assert "I couldn't check stock this morning" in g["headline"]


def test_a_lone_item_on_a_fully_checked_morning_may_say_the_rest_was_normal():
    g = build_greeting(brief([sales_row("Rockwell", 33000, 55000)]), defs=DEFS)
    assert g["kind"] == "item"
    assert "Nothing else moved beyond normal." in g["headline"]


def test_other_items_are_offered_rather_than_listed():
    payload = brief([sales_row("Rockwell", 33000, 55000),
                     stock_row("Muscat Gummy", was=42),
                     dead_row("Hello Panda", 18)])
    g = build_greeting(payload, defs=DEFS)
    assert "2 other items in this morning's brief" in g["headline"]
    assert "Nothing else moved beyond normal" not in g["headline"]


# ---------------------------------------------------------------------------
# What the sentence says
# ---------------------------------------------------------------------------

def test_the_sales_sentence_carries_its_day_its_figure_and_its_baseline():
    g = build_greeting(brief([sales_row("Rockwell", 33000, 55000)]), defs=DEFS)
    h = g["headline"]
    assert "Rockwell took ₱33,000" in h
    assert "Wed 2 Sep 2026" in h          # the day, never "yesterday"
    assert "40% under the same Wednesday last week" in h
    assert "₱55,000" in h                 # the baseline it is measured against


def test_the_percentage_is_the_rows_own_never_recomputed():
    """
    Two different numbers for the same thing on one screen is worse than
    either. The sentence must read change_pct off the row, so it can never
    disagree with the receipts underneath it.
    """
    row = sales_row("Rockwell", 33000, 55000)
    row["change_pct"] = -37.6          # deliberately not (33000-55000)/55000
    g = build_greeting(brief([row]), defs=DEFS)
    assert "38% under" in g["headline"]


def test_the_stock_sentence_names_both_snapshot_days():
    g = build_greeting(brief([stock_row("Muscat Gummy", was=42)]), defs=DEFS)
    h = g["headline"]
    assert "went out of stock at Rockwell" in h
    assert "42 on hand on Tue 1 Sep 2026" in h
    assert "0 on Wed 2 Sep 2026" in h


def test_the_dead_stock_sentence_names_the_window_and_the_last_sale():
    g = build_greeting(brief([dead_row("Hello Panda", 18)]), defs=DEFS)
    h = g["headline"]
    assert "gone 30 days without a sale" in h
    assert "18 still on hand" in h
    assert "Mon 3 Aug 2026" in h


# ---------------------------------------------------------------------------
# Receipts and notices survive the reduction
# ---------------------------------------------------------------------------

def test_the_item_is_the_row_itself_with_its_own_receipts():
    """
    Not a copy and not a summary — the display has to be able to show the same
    provenance the brief carries (UI rules 3 and 6).
    """
    row = sales_row("Rockwell", 33000, 55000)
    g = build_greeting(brief([row]), defs=DEFS)
    assert g["item"] is row
    assert g["item"]["receipts"]["snapshot_timestamp"] == "2026-09-03T06:00:00+00:00"
    assert g["item"]["receipts"]["source_table"] == "new_transactions"


@pytest.mark.parametrize("count", [1, 3])
def test_every_notice_survives_including_inside_the_multiple_container(count):
    notices = [
        {"kind": "stale_sources", "message": "purchase_orders is 64 days old."},
        {"kind": "snapshot_gaps", "message": "The snapshots are 4 days apart."},
        {"kind": "low_stock_not_operational", "message": "Thresholds were never set."},
    ][:count]
    g = build_greeting(brief([sales_row("Rockwell", 33000, 55000)], notices=notices),
                       defs=DEFS)
    assert [n["kind"] for n in g["notices"]] == [n["kind"] for n in notices]


def test_the_brief_meta_comes_through_whole():
    """The greeting has no timestamp of its own — it carries the brief's."""
    g = build_greeting(brief([]), defs=DEFS)
    assert g["meta"]["snapshot_timestamp"] == "2026-09-03T06:00:00+00:00"
    assert set(g["meta"]["sections"]) == {
        "sales_vs_same_weekday", "stock_crossed_out", "newly_dead",
    }


# ---------------------------------------------------------------------------
# The obvious next question
#
# A chip is a QUESTION, not a staged answer. These assert the two things that
# could go wrong: a chip that asks about something the brief never mentioned,
# and a chip offered on a morning with nothing to ask about.
# ---------------------------------------------------------------------------

def test_each_item_gets_its_own_question():
    """One chip per item, and the question fits the section it came from."""
    chips = follow_ups(brief([
        sales_row("Rockwell", 48210, 36800),
        stock_row("Hello Panda", was=14),
        dead_row("Choco Boy", qty=40),
    ]), defs=DEFS)
    labels = [c["label"] for c in chips]
    assert labels == ["Why?", "On order?", "What happened?"]


def test_a_chip_only_ever_names_a_subject_the_brief_named():
    """
    Derived, not generated — the guarantee that makes this safe to run on every
    page load with no model call.
    """
    chips = follow_ups(brief([stock_row("Hello Panda", was=14, store="Fairview")]),
                       defs=DEFS)
    assert chips[0]["question"] == "Is Hello Panda on order for Fairview?"


def test_the_first_chip_belongs_to_the_item_george_led_with():
    """
    Ordered by the SAME ranking that chose the opening line. A chip list whose
    first entry was about a different item than the sentence above it would read
    as a non sequitur.
    """
    payload = brief([
        dead_row("Choco Boy", qty=9999),
        sales_row("Rockwell", 48210, 36800),
    ])
    lead = most_notable(payload, defs=DEFS)
    chips = follow_ups(payload, defs=DEFS)
    assert lead["subject"] == "Rockwell"
    assert "Rockwell" in chips[0]["question"]


def test_a_quiet_morning_offers_no_chips():
    """
    Nothing crossed a threshold, so there is nothing to ask ABOUT. A chip here
    would be a suggestion George invented, which is the one thing this whole
    derivation avoids.
    """
    g = build_greeting(brief([]), defs=DEFS)
    assert g["kind"] == "quiet"
    assert g["follow_ups"] == []


def test_a_blind_morning_still_offers_chips_for_what_did_run():
    """
    A section that could not run silences its own chip, not the others'. The
    rows that exist still deserve their question.
    """
    payload = brief(
        [sales_row("Rockwell", 48210, 36800)],
        sections={
            "sales_vs_same_weekday": {"ran": True},
            "stock_crossed_out": {"ran": False, "reason": "there were no stock snapshots"},
        },
    )
    g = build_greeting(payload, defs=DEFS)
    assert g["kind"] == "item"
    assert [c["label"] for c in g["follow_ups"]] == ["Why?"]


def test_chips_are_capped_and_deduplicated():
    """
    A row of chips is a shortcut; a grid of them is a menu, and the input box is
    already the menu. Two stores losing the same SKU is one useful question.
    """
    same = [stock_row("Hello Panda", was=n, store="Rockwell") for n in (14, 9, 3)]
    assert len(follow_ups(brief(same), defs=DEFS)) == 1

    many = [sales_row(f"Store {i}", 1000 * (10 - i), 500) for i in range(6)]
    assert len(follow_ups(brief(many), defs=DEFS)) == MAX_FOLLOW_UPS


def test_a_chip_never_asks_for_advice_no_tool_can_give():
    """
    Every question has to be answerable from the read tools. "Should we
    discount it" is advice; "how did it sell" is a query.
    """
    for chip in follow_ups(brief([
        sales_row("Rockwell", 48210, 36800),
        stock_row("Hello Panda", was=14),
        dead_row("Choco Boy", qty=40),
    ]), defs=DEFS):
        low = chip["question"].lower()
        assert not low.startswith("should ")
        assert "should we" not in low

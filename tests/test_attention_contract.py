"""
Pure tests for the judgement layer — what deserves attention today.

NO DATABASE, NO MODEL. get_brief is replaced with a payload shaped exactly as
the real one, so the ranking, the silence and the senses are decidable from
their inputs; and the definitions are held to reference only floors that
already exist, because a threshold typed here would be the one thing this
layer exists not to do.
"""

from __future__ import annotations

import pytest

from agent import loop
from tools import attention
from tools._common import load_defs, req

DEFS = load_defs()
ADEFS = req(DEFS, "attention")


def _brief(rows, *, sections=None, sources=None, notice=None):
    return {
        "rows": rows,
        "meta": {
            "source_table": "multiple — each row carries its own receipts",
            "filters_applied": ["brief written on 2026-09-12 (Asia/Manila); yesterday = 2026-09-11"],
            "snapshot_timestamp": "2026-09-12T06:00:00+08:00",
            "as_of": {"today": "2026-09-12", "yesterday": "2026-09-11", "sales_baseline": "2026-09-04"},
            "sections": sections or {
                "sales_vs_same_weekday": {"ran": True, "items": len([r for r in rows if r.get("section") == "sales_vs_same_weekday"])},
                "stock_crossed_out": {"ran": True, "items": 0},
                "newly_dead": {"ran": True, "items": 0},
            },
            "sources": sources or [
                {"source": "transactions", "latest": "2026-09-11", "age_days": 1, "fresh": True, "frozen": False},
                {"source": "purchase_orders", "latest": "2026-07-13", "age_days": 61, "fresh": False, "frozen": True},
            ],
            **({"notice": notice} if notice else {}),
        },
    }


SALES = [
    {"section": "sales_vs_same_weekday", "subject": "Fairview", "value": 30000.0, "baseline": 20000.0,
     "change": 10000.0, "change_pct": 50.0, "direction": "up", "receipts": {"source_table": "new_transactions"}},
    {"section": "sales_vs_same_weekday", "subject": "OPUS", "value": 40000.0, "baseline": 70000.0,
     "change": -30000.0, "change_pct": -42.9, "direction": "down", "receipts": {"source_table": "new_transactions"}},
    {"section": "sales_vs_same_weekday", "subject": "Rockwell", "value": 45000.0, "baseline": 35000.0,
     "change": 10000.0, "change_pct": 28.6, "direction": "up", "receipts": {"source_table": "new_transactions"}},
]
CROSSED = [{"section": "stock_crossed_out", "subject": "Aji Mix", "store": "OPUS", "was": 40, "now": 0,
            "receipts": {"source_table": "inventory_snapshots"}}]


# ---------------------------------------------------------------------------
# 1. The definitions invent nothing
# ---------------------------------------------------------------------------

def test_every_source_names_a_floor_that_exists_and_a_read_that_is_registered():
    for name, spec in req(ADEFS, "sources").items():
        assert req(DEFS, spec["floor"]) is not None, f"{name}: floor {spec['floor']} is not a definition"
        assert spec["via"] in loop.TOOL_FUNCTIONS, f"{name}: {spec['via']} is not a read"
        # The measure is the one the brief's own notability ranks that section by.
        assert req(DEFS, f"brief.notability.measure.{spec['section']}") == spec["measure"]
    for name in req(ADEFS, "order"):
        assert name in req(ADEFS, "sources"), f"{name} is ordered but not a source"


def test_every_blind_sense_names_the_definition_that_records_the_gap():
    for name, spec in req(ADEFS, "cannot_notice").items():
        assert req(DEFS, spec["why"]) is not None, f"{name}: {spec['why']} is not a definition"
        assert str(spec["says"]).strip()


def test_the_read_is_offered_to_the_model_with_silence_and_senses_in_its_description():
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == "get_attention")
    text = schema["description"]
    assert "silent" in text and "senses" in text
    assert "morning" in text


def test_the_morning_is_a_message_kind_the_scope_section_teaches():
    kinds = req(DEFS, "investigation.message_kinds.kinds")
    assert "morning" in kinds and "get_attention" in kinds["morning"]
    assert "get_attention" in loop.SCOPE_SECTION


# ---------------------------------------------------------------------------
# 2. Ranking: money first, largest against its floor first, ties by name
# ---------------------------------------------------------------------------

def test_survivors_rank_by_source_order_then_by_absolute_size_then_by_subject(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(CROSSED + SALES))
    out = attention.get_attention()
    ranked = [(r["source"], r["subject"]) for r in out["rows"]]
    assert ranked == [
        ("sales_vs_same_weekday", "OPUS"),        # |−30,000| first, whatever the percentage
        ("sales_vs_same_weekday", "Fairview"),    # 10,000, tie with Rockwell broken by name
        ("sales_vs_same_weekday", "Rockwell"),
        ("stock_crossed_out", "Aji Mix"),         # a shelf that emptied comes after money
    ]
    assert [r["rank"] for r in out["rows"]] == [1, 2, 3, 4]
    assert out["meta"]["silent"] is False


def test_a_row_keeps_everything_the_brief_gave_it_and_names_its_floor(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(SALES[:1]))
    row = attention.get_attention()["rows"][0]
    assert row["receipts"] == {"source_table": "new_transactions"}
    assert row["value"] == 30000.0 and row["baseline"] == 20000.0
    assert row["floor"] == "brief.sales_vs_same_weekday"
    assert row["measure"] == "change" and row["size"] == 10000.0


# ---------------------------------------------------------------------------
# 3. Silence is the normal state
# ---------------------------------------------------------------------------

def test_nothing_crossed_is_silent_and_says_so(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief([]))
    out = attention.get_attention()
    assert out["rows"] == []
    assert out["meta"]["silent"] is True
    assert out["meta"]["row_count"] == 0


def test_a_section_that_could_not_run_is_a_blind_sense_not_a_quiet_one(monkeypatch):
    sections = {
        "sales_vs_same_weekday": {"ran": False, "items": 0, "reason": "no store had both days of sales to compare"},
        "stock_crossed_out": {"ran": True, "items": 0},
        "newly_dead": {"ran": True, "items": 0},
    }
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief([], sections=sections))
    out = attention.get_attention()
    assert out["meta"]["silent"] is True
    blind = [s for s in out["meta"]["senses"] if s["source"] == "sales_vs_same_weekday"]
    assert blind and blind[0]["can_notice"] is False
    assert "could not run" in blind[0]["why_not"]


# ---------------------------------------------------------------------------
# 4. Every sense is dated
# ---------------------------------------------------------------------------

def test_senses_carry_their_age_and_a_frozen_one_says_so(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(SALES))
    senses = {s["source"]: s for s in attention.get_attention()["meta"]["senses"]}
    assert senses["transactions"]["can_notice"] is True
    assert senses["transactions"]["last_moved"] == "2026-09-11"
    assert senses["purchase_orders"]["can_notice"] is False
    assert "frozen" in senses["purchase_orders"]["why_not"]
    assert senses["purchase_orders"]["last_moved"] == "2026-07-13"
    # And the senses with no definition of normal, from the yaml.
    for name in req(ADEFS, "cannot_notice"):
        assert senses[name]["can_notice"] is False and senses[name]["why_not"]


def test_the_briefs_notice_passes_through_whole(monkeypatch):
    notice = {"kind": "low_stock_not_operational", "message": "There is no 'newly low on stock' section.", "source": "x"}
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(SALES, notice=notice))
    assert attention.get_attention()["meta"]["notice"] == notice


# ---------------------------------------------------------------------------
# 5. The silent morning is its own outcome, and the room does not open on it
# ---------------------------------------------------------------------------

def test_a_silent_attention_result_is_recognised_from_its_frame():
    from app.services.standing_runner import silent_in
    assert silent_in("tool_result", {"tool": "get_attention", "meta": {"silent": True}}) is True
    assert silent_in("tool_result", {"tool": "get_attention", "meta": {"silent": False}}) is False
    assert silent_in("tool_result", {"tool": "get_brief", "meta": {"silent": True}}) is False
    assert silent_in("tool_call", {"tool": "get_attention"}) is False


def test_latest_answer_offers_only_answers():
    """`silent` is a status the constraint allows and latest_answer never offers."""
    import inspect
    from app.services import standing_questions
    src = inspect.getsource(standing_questions.latest_answer)
    assert 'last_status == "ok"' in src
    from app.models.george_standing import GeorgeStandingQuestion
    checks = " ".join(str(c.sqltext) for c in GeorgeStandingQuestion.__table__.constraints
                      if getattr(c, "sqltext", None) is not None)
    assert "'silent'" in checks

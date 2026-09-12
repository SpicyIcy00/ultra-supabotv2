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


# ---------------------------------------------------------------------------
# 6. Learning from what you do (2026-09-12) — recorded gestures only
# ---------------------------------------------------------------------------

from datetime import datetime, timedelta, timezone   # noqa: E402

LDEFS = req(ADEFS, "learning")
NOW = datetime(2026, 9, 12, 6, 0, tzinfo=timezone.utc)
ORDER = list(req(ADEFS, "order"))


def _d(what, outcome, days_ago, by="ice"):
    return {"what": what, "outcome": outcome, "decided_by": by,
            "decided_at": (NOW - timedelta(days=days_ago)).isoformat()}


def _ranked():
    return attention.rank(CROSSED + SALES, ADEFS)


def test_every_row_carries_a_stable_identity_from_source_subject_and_shop():
    rows = _ranked()
    ids = [r["identity"] for r in rows]
    assert ids == ["sales_vs_same_weekday|OPUS|", "sales_vs_same_weekday|Fairview|",
                   "sales_vs_same_weekday|Rockwell|", "stock_crossed_out|Aji Mix|OPUS"]
    assert attention.identity("stock_crossed_out", CROSSED[0]) == "stock_crossed_out|Aji Mix|OPUS"


def test_the_closed_set_of_outcomes_is_one_list_held_in_three_places():
    outcomes = list(req(LDEFS, "outcomes"))
    from app.models.george_decision import DECISION_OUTCOMES, GeorgeDecision
    assert list(DECISION_OUTCOMES) == outcomes
    checks = " ".join(str(c.sqltext) for c in GeorgeDecision.__table__.constraints
                      if getattr(c, "sqltext", None) is not None)
    for o in outcomes:
        assert f"'{o}'" in checks
    from app.services import decisions
    assert decisions.WINDOW_DAYS == int(req(LDEFS, "window_days"))
    assert req(LDEFS, "only_recorded_gestures") is True


def test_no_log_means_nothing_learned_and_nothing_inferred():
    rows, meta = attention.learn(_ranked(), None, LDEFS, ORDER, now=NOW)
    assert meta["read"] is False and "nothing inferred" in meta["why"]
    assert [r["subject"] for r in rows] == ["OPUS", "Fairview", "Rockwell", "Aji Mix"]
    assert not any("learning" in r for r in rows)


def test_a_log_that_could_not_be_read_says_so_and_leaves_the_order_alone():
    rows, meta = attention.learn(_ranked(), {"error": "ConnectionRefused"}, LDEFS, ORDER, now=NOW)
    assert meta["read"] is False and "could not be read" in meta["why"]
    assert [r["rank"] for r in rows] == [1, 2, 3, 4]


def test_set_aside_three_times_ranks_below_everything_else_whatever_its_size():
    times = int(req(LDEFS, "rules.dismissed_ranks_last.times"))
    log = [_d("sales_vs_same_weekday|OPUS|", "dismissed", n) for n in range(times)]
    rows, meta = attention.learn(_ranked(), log, LDEFS, ORDER, now=NOW)
    assert [r["subject"] for r in rows] == ["Fairview", "Rockwell", "Aji Mix", "OPUS"]
    opus = rows[-1]
    assert opus["rank"] == 4
    assert opus["learning"]["rule"] == "dismissed_ranks_last"
    assert opus["learning"]["reason"] == f"ranked lower: set aside {times} times"
    assert meta["adjusted"] == 1 and meta["in_window"] == times


def test_set_aside_fewer_times_than_the_rule_says_moves_nothing():
    times = int(req(LDEFS, "rules.dismissed_ranks_last.times"))
    log = [_d("sales_vs_same_weekday|OPUS|", "dismissed", n) for n in range(times - 1)]
    rows, _ = attention.learn(_ranked(), log, LDEFS, ORDER, now=NOW)
    assert rows[0]["subject"] == "OPUS" and "learning" not in rows[0]
    assert [d["outcome"] for d in rows[0]["decisions"]] == ["dismissed"] * (times - 1)


def test_opened_or_asked_about_lately_ranks_first_within_its_source_not_above_money():
    log = [_d("stock_crossed_out|Aji Mix|OPUS", "opened", 1),
           _d("sales_vs_same_weekday|Rockwell|", "asked", 2)]
    rows, _ = attention.learn(_ranked(), log, LDEFS, ORDER, now=NOW)
    # Rockwell moves to the front of the sales rows; the shelf stays after money.
    assert [r["subject"] for r in rows] == ["Rockwell", "OPUS", "Fairview", "Aji Mix"]
    assert rows[0]["learning"]["reason"] == "ranked higher: asked 2 days ago"
    assert rows[3]["learning"]["reason"] == "ranked higher: opened yesterday"


def test_attention_older_than_the_rule_allows_no_longer_ranks_first():
    days = int(req(LDEFS, "rules.attended_ranks_first.days"))
    rows, _ = attention.learn(_ranked(), [_d("sales_vs_same_weekday|Rockwell|", "opened", days + 1)],
                              LDEFS, ORDER, now=NOW)
    assert [r["subject"] for r in rows][:3] == ["OPUS", "Fairview", "Rockwell"]
    assert "learning" not in rows[2]


def test_kept_is_written_on_the_row_and_a_change_of_mind_is_two_rows_both_counted():
    log = [_d("sales_vs_same_weekday|Fairview|", "kept", 10),
           _d("sales_vs_same_weekday|Fairview|", "left", 3)]
    rows, _ = attention.learn(_ranked(), log, LDEFS, ORDER, now=NOW)
    fairview = next(r for r in rows if r["subject"] == "Fairview")
    assert fairview["kept"] is True
    assert fairview["learning"] == {"rule": "kept_is_marked", "effect": "row_carries_kept", "reason": "kept"}
    assert [d["outcome"] for d in fairview["decisions"]] == ["left", "kept"], "newest first"
    assert fairview["decisions"][0]["by"] == "ice"


def test_decisions_outside_the_window_are_not_read():
    window = int(req(LDEFS, "window_days"))
    log = [_d("sales_vs_same_weekday|OPUS|", "dismissed", window + n) for n in range(1, 5)]
    rows, meta = attention.learn(_ranked(), log, LDEFS, ORDER, now=NOW)
    assert meta["in_window"] == 0 and rows[0]["subject"] == "OPUS" and rows[0]["decisions"] == []


def test_the_read_applies_the_log_it_is_handed_and_reports_it(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(CROSSED + SALES))
    times = int(req(LDEFS, "rules.dismissed_ranks_last.times"))
    log = [_d("sales_vs_same_weekday|OPUS|", "dismissed", n) for n in range(times)]
    out = attention.get_attention(decisions=log)
    assert out["rows"][-1]["subject"] == "OPUS"
    assert out["meta"]["learning"]["read"] is True and out["meta"]["learning"]["adjusted"] == 1
    assert any("attention.learning" in f for f in out["meta"]["filters_applied"])
    quiet = attention.get_attention()
    assert quiet["meta"]["learning"]["read"] is False


# ---------------------------------------------------------------------------
# 7. The log reaches the read through the loop, and never through the model
# ---------------------------------------------------------------------------

def test_the_decisions_argument_is_keyword_only_and_absent_from_the_schema():
    import inspect
    param = inspect.signature(attention.get_attention).parameters["decisions"]
    assert param.kind is inspect.Parameter.KEYWORD_ONLY
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == "get_attention")
    assert "decisions" not in schema["input_schema"]["properties"]


def test_the_loop_injects_it_from_a_reader_the_context_carries():
    import asyncio
    from agent.write_tools import WriteContext
    argument, reader_name = loop.INJECTED_READS["get_attention"]
    assert argument == "decisions"
    assert reader_name in WriteContext.__dataclass_fields__

    async def reader():
        return [{"what": "x", "outcome": "kept", "decided_at": NOW.isoformat()}]

    async def broken():
        raise RuntimeError("no database")

    ctx = WriteContext(decisions_reader=reader)
    got = asyncio.run(loop._injected_args("get_attention", {"as_of": "2026-09-12"}, ctx))
    assert got == {"as_of": "2026-09-12", "decisions": [{"what": "x", "outcome": "kept", "decided_at": NOW.isoformat()}]}
    # No reader: the model's arguments pass through untouched.
    assert asyncio.run(loop._injected_args("get_attention", {"as_of": "2026-09-12"}, WriteContext())) == {"as_of": "2026-09-12"}
    # Another tool: untouched.
    assert asyncio.run(loop._injected_args("get_sales", {"group_by": []}, ctx)) == {"group_by": []}
    # A reader that fails hands the tool the failure, not silence.
    got = asyncio.run(loop._injected_args("get_attention", {}, WriteContext(decisions_reader=broken)))
    assert got["decisions"]["error"].startswith("RuntimeError")


def test_the_web_process_and_the_standing_runner_both_bind_the_reader():
    import inspect
    from app.api.v1.routes import george as route
    from app.services import standing_runner
    assert "decisions_reader=_decisions_reader()" in inspect.getsource(route)
    assert "decisions_reader=_decisions_reader()" in inspect.getsource(standing_runner)
    paths = {(r.path, tuple(sorted(r.methods))) for r in route.router.routes if hasattr(r, "methods")}
    assert ("/decisions", ("POST",)) in paths


def test_recording_a_decision_refuses_an_outcome_outside_the_set():
    import asyncio
    from app.services import decisions

    class _Session:
        def add(self, row): raise AssertionError("nothing should be added")
        async def flush(self): raise AssertionError("nothing should be flushed")

    with pytest.raises(decisions.DecisionRefused, match="not a decision"):
        asyncio.run(decisions.record(_Session(), what="x", source="s", subject="OPUS",
                                     outcome="ignored", decided_by="ice"))
    with pytest.raises(decisions.DecisionRefused, match="blank"):
        asyncio.run(decisions.record(_Session(), what="  ", source="s", subject="OPUS",
                                     outcome="kept", decided_by="ice"))

"""
Set it aside with a reason, and he learns (W2.3, 2026-09-22).

NO DATABASE, NO MODEL. What this holds:

  - one tap for why: three reasons, declared, in order, each a told stance
    Bob himself cannot record;
  - "that kind of item" is keyed off the row's own fields by code;
  - known / not important quiet that exact kind and subject in the reads that
    apply it, and the receipts say so; nothing else is quieted;
  - "wrong" quiets nothing: the row stays, marked, with a notice that is
    always drawn and always required;
  - the set-asides reach the reads through the loop as a declared setting the
    model can never send, and reach the prompt on their own list;
  - the memory view says what each one is, and Forget undoes it.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone

import pytest

from agent import beliefs, loop
from agent.write_tools import WriteContext
from tools import attention, dismissal
from tools._common import load_defs, req

DEFS = load_defs()
D = req(DEFS, "dismissal")
NOW = datetime(2026, 9, 22, 2, 0, tzinfo=timezone.utc)


def _brief(rows):
    return {"rows": rows, "meta": {
        "source_table": "multiple", "filters_applied": [],
        "snapshot_timestamp": "2026-09-22T06:00:00+08:00",
        "as_of": {"today": "2026-09-22"}, "sections": {}, "sources": [],
    }}


SALES = [
    {"section": "sales_vs_same_weekday", "subject": "OPUS", "value": 40000.0, "baseline": 70000.0,
     "change": -30000.0, "change_pct": -42.9, "direction": "down"},
    {"section": "sales_vs_same_weekday", "subject": "Rockwell", "value": 45000.0, "baseline": 35000.0,
     "change": 10000.0, "change_pct": 28.6, "direction": "up"},
]
CROSSED = [{"section": "stock_crossed_out", "subject": "Aji Mix", "store": "OPUS", "was": 40, "now": 0}]


def _q(kind, subject, reason, **kw):
    return {"kind": kind, "subject": subject, "reason": reason, "on": "2026-09-22",
            "by": "joy", "id": "b1", **kw}


# ---------------------------------------------------------------------------
# 1. The definitions: one tap, three reasons, nothing invented
# ---------------------------------------------------------------------------

def test_three_reasons_in_the_order_they_are_offered():
    assert D["order"] == ["known", "not_important", "wrong"]
    assert set(D["reasons"]) == set(D["order"])
    for name, r in D["reasons"].items():
        for field in ("said", "stance", "told", "stance_said", "claim", "quiets"):
            assert field in r, f"{name} has no {field}"
        # A stored view carries no figure (agent/beliefs.py rule 2).
        assert not re.search(r"\d", r["claim"]), name


def test_wrong_quiets_nothing_and_the_other_two_quiet():
    assert D["reasons"]["known"]["quiets"] is True
    assert D["reasons"]["not_important"]["quiets"] is True
    assert D["reasons"]["wrong"]["quiets"] is False


def test_bob_cannot_record_a_set_aside_himself():
    """The stances are not judgment.stances, so record_belief refuses them: a person's gesture only."""
    for r in D["reasons"].values():
        assert r["stance"] not in req(DEFS, "judgment.stances")
        accepted, rejected = beliefs.validate(
            [{"stance": r["stance"], "subject_kind": "store", "subject": "OPUS",
              "claim": "set aside", "told": "known"}],
            DEFS, is_executed=lambda call: True)
        assert not accepted and rejected


def test_the_disputed_notice_has_a_fingerprint_and_is_always_drawn():
    kind = D["disputed_notice_kind"]
    assert "must_convey" in req(DEFS, "notices")[kind]
    drawn = req(DEFS, "surface.desk.notices")
    assert kind in drawn["data_may_be_wrong"] and kind not in drawn["explains_only"]
    # And the loop requires it: prose that ignores it is unsurfaced.
    missing = loop._unsurfaced([{"kind": kind, "message": "..."}],
                               "OPUS fell 42.9% yesterday.", DEFS)
    assert missing
    said = loop._unsurfaced([{"kind": kind, "message": "..."}],
                            "Joy said OPUS's figure may be wrong, so treat it with care.", DEFS)
    assert not said


def test_every_kind_word_is_a_kind_that_can_be_produced():
    for kind in D["kind_words"]:
        if kind == "default":
            continue
        assert dismissal.valid_kind(kind, DEFS), kind


def test_a_kind_no_row_could_carry_is_refused():
    assert dismissal.valid_kind("attention.stock_crossed_out", DEFS)
    assert dismissal.valid_kind("overview.stockout", DEFS)
    assert not dismissal.valid_kind("overview.estate", DEFS)       # the frame, never quieted
    assert not dismissal.valid_kind("overview.attention", DEFS)    # takes the warning list's kind
    assert not dismissal.valid_kind("attention.made_up", DEFS)
    assert not dismissal.valid_kind("anything", DEFS)
    assert not dismissal.valid_kind("", DEFS)


# ---------------------------------------------------------------------------
# 2. The key is read off the row
# ---------------------------------------------------------------------------

def test_the_key_comes_from_the_rows_own_fields():
    row = {"source": "stock_crossed_out", "subject": "Aji Mix", "store": "OPUS"}
    assert dismissal.key_of("attention", row, DEFS) == {
        "item": "attention", "kind": "attention.stock_crossed_out", "subject": "Aji Mix at OPUS"}
    # A shop's own row names the shop once.
    shop = {"source": "sales_vs_same_weekday", "subject": "OPUS", "store": "OPUS"}
    assert dismissal.key_of("attention", shop, DEFS)["subject"] == "OPUS"


def test_a_warning_list_finding_has_the_warning_lists_kind():
    finding = {"finding": "attention", "metric": "stock_crossed_out", "subject": "Aji Mix", "where": "OPUS"}
    row = {"source": "stock_crossed_out", "subject": "Aji Mix", "store": "OPUS"}
    assert dismissal.key_of("finding", finding, DEFS)["kind"] == dismissal.key_of("attention", row, DEFS)["kind"]
    assert dismissal.key_of("finding", finding, DEFS)["subject"] == "Aji Mix at OPUS"


def test_the_frame_of_the_picture_is_never_an_item():
    for kind in ("estate", "concentration", "shop", "unread", "drivers"):
        assert dismissal.key_of("finding", {"finding": kind, "subject": "OPUS"}, DEFS) is None


# ---------------------------------------------------------------------------
# 3. The read: quieter, and says so; wrong stays, marked
# ---------------------------------------------------------------------------

def test_no_set_aside_changes_nothing_but_the_key_on_each_row(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(SALES + CROSSED))
    out = attention.get_attention()
    assert len(out["rows"]) == 3
    assert all(r["dismiss"]["kind"].startswith("attention.") for r in out["rows"])
    assert out["meta"]["quieted"] == [] and out["meta"]["disputed"] == []
    assert "notice" not in out["meta"]


def test_a_known_kind_stops_reappearing_and_the_receipt_counts_it(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(SALES + CROSSED))
    out = attention.get_attention(quieted=[_q("attention.stock_crossed_out", "aji mix at opus", "known")])
    subjects = [r["subject"] for r in out["rows"]]
    assert "Aji Mix" not in subjects and len(out["rows"]) == 2
    assert [r["rank"] for r in out["rows"]] == [1, 2]
    assert out["meta"]["quieted"][0]["subject"] == "Aji Mix at OPUS"
    assert out["meta"]["quieted"][0]["reason"] == "known"
    assert any("dismissal.setting" in f for f in out["meta"]["filters_applied"])


def test_only_that_kind_about_that_subject(monkeypatch):
    """OPUS's sales day set aside does not quiet OPUS's shelf, nor Rockwell's day."""
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(SALES + CROSSED))
    out = attention.get_attention(quieted=[_q("attention.sales_vs_same_weekday", "OPUS", "not_important")])
    left = {(r["source"], r["subject"]) for r in out["rows"]}
    assert ("sales_vs_same_weekday", "OPUS") not in left
    assert ("sales_vs_same_weekday", "Rockwell") in left
    assert ("stock_crossed_out", "Aji Mix") in left


def test_wrong_keeps_the_row_marked_with_a_notice(monkeypatch):
    monkeypatch.setattr(attention, "get_brief", lambda as_of=None: _brief(SALES + CROSSED))
    out = attention.get_attention(quieted=[_q("attention.sales_vs_same_weekday", "OPUS", "wrong")])
    opus = next(r for r in out["rows"] if r["subject"] == "OPUS")
    assert opus["disputed"]["reason"] == "wrong" and opus["disputed"]["by"] == "joy"
    assert len(out["rows"]) == 3 and out["meta"]["quieted"] == []
    assert out["meta"]["notice"]["kind"] == D["disputed_notice_kind"]
    assert "joy said OPUS may be wrong" in out["meta"]["notice"]["message"]


def test_the_doubt_joins_a_notice_already_there():
    meta = {"notice": {"kind": "stale_sources", "message": "old"}}
    extra = {"kind": D["disputed_notice_kind"], "message": "doubt"}
    dismissal.merge_notice(meta, extra)
    dismissal.merge_notice(meta, extra)   # the same doubt twice is one notice
    assert meta["notice"]["kind"] == "multiple"
    assert [n["kind"] for n in meta["notice"]["items"]] == ["stale_sources", D["disputed_notice_kind"]]


def test_the_findings_read_takes_the_setting_and_passes_it_to_the_warning_list():
    import inspect
    from tools import overview
    assert "quieted" in inspect.signature(overview.get_overview_findings).parameters
    assert "quieted" in inspect.signature(overview._run).parameters
    for read in D["setting"]["participates_in"]:
        assert "quieted" in inspect.signature(loop.TOOL_FUNCTIONS[read]).parameters, read


# ---------------------------------------------------------------------------
# 4. The loop: a declared setting the model can never send
# ---------------------------------------------------------------------------

def test_the_loop_hands_the_reads_what_was_set_aside():
    bound = [_q("attention.newly_dead", "Haw Flakes at OPUS", "known")]
    ctx = WriteContext(settings={D["setting"]["name"]: bound})
    got = asyncio.run(loop._injected_args("get_attention", {}, ctx))
    assert got["quieted"] == bound
    got = asyncio.run(loop._injected_args("get_overview_findings", {}, ctx))
    assert got["quieted"] == bound
    # A read that does not apply it gets nothing.
    assert "quieted" not in asyncio.run(loop._injected_args("get_sales", {"group_by": []}, ctx))


def test_the_model_cannot_quiet_anything_himself():
    sent = {"quieted": [_q("attention.newly_dead", "x", "known")]}
    assert "quieted" not in asyncio.run(loop._injected_args("get_attention", dict(sent), WriteContext()))


def test_the_argument_is_never_in_the_models_schema():
    for schema in loop.build_tool_schemas():
        if schema["name"] in D["setting"]["participates_in"]:
            assert "quieted" not in (schema.get("input_schema") or {}).get("properties", {})


# ---------------------------------------------------------------------------
# 5. The register: bound from the views that stand, on its own list
# ---------------------------------------------------------------------------

def _belief(i, stance, *, told=None, kind="store", subject="OPUS", at=None):
    return {"id": f"b{i}", "subject_kind": kind, "subject": subject, "stance": stance,
            "claim": "c", "told": told, "confirmed_at": at or NOW - timedelta(minutes=i),
            "held_since": at or NOW - timedelta(minutes=i), "created_by": "joy"}


def test_set_asides_are_bound_from_the_views_that_stand():
    from app.services import belief_store
    rows = [_belief(1, "set_aside_known", told="I already know about this",
                    kind="attention.stock_crossed_out", subject="Aji Mix at OPUS"),
            _belief(2, "said_wrong", told="I think this is wrong",
                    kind="attention.sales_vs_same_weekday", subject="OPUS"),
            _belief(3, "needs_attention")]
    bound = belief_store.bound_settings(rows, DEFS)
    got = bound[D["setting"]["name"]]
    assert [(g["kind"], g["subject"], g["reason"]) for g in got] == [
        ("attention.stock_crossed_out", "Aji Mix at OPUS", "known"),
        ("attention.sales_vs_same_weekday", "OPUS", "wrong")]
    assert got[0]["by"] == "joy" and got[0]["on"] == "2026-09-22"
    # Forgotten views are not in `rows` (current()), so Undo unbinds by construction.
    assert D["setting"]["name"] not in belief_store.bound_settings(rows[2:], DEFS)


def test_a_month_of_taps_never_pushes_a_told_view_out_of_the_prompt():
    from app.services import belief_store
    told = _belief(0, "means", told="we means the shops")
    taps = [_belief(i, "set_aside_not_important", told="This is not important to me",
                    kind="attention.newly_dead", subject=f"Line {chr(65 + i % 26)}{i}")
            for i in range(1, 40)]
    own = [_belief(100 + i, "unremarkable") for i in range(3)]
    carried = belief_store.in_prompt([told, *taps, *own])
    assert "b0" in carried
    assert all(f"b{100 + i}" in carried for i in range(3))
    assert sum(1 for c in carried if c in {t["id"] for t in taps}) == D["in_prompt"]


def test_the_memory_view_says_what_each_set_aside_is():
    from app.services import self_reader
    words = self_reader._stance_words()
    for r in D["reasons"].values():
        assert words[r["stance"]] == r["stance_said"]


# ---------------------------------------------------------------------------
# 6. What Bob noticed: watch posts and stuck items
# ---------------------------------------------------------------------------

def test_a_stuck_item_is_keyed_from_its_own_id():
    from app.services import dismissals
    key = dismissals.stuck_key("stuck:workflow:Monday reorder", DEFS)
    assert key == {"item": "stuck", "kind": "stuck.workflow", "subjects": ["Monday reorder"]}
    with pytest.raises(dismissals.NotAnItem):
        dismissals.stuck_key("stuck:nonsense:x", DEFS)
    with pytest.raises(dismissals.NotAnItem):
        dismissals.stuck_key("a1b2", DEFS)


def test_a_watch_post_is_keyed_on_its_condition_and_the_subjects_it_named():
    from app.services import dismissals
    payload = {"added": [{"subject": "Aji Mix", "store": "OPUS"}, {"subject": "Haw Flakes", "store": "OPUS"}]}
    key = dismissals.key_from_watch_post(payload, "stock_crossed_out", DEFS)
    assert key == {"kind": "watch.stock_crossed_out", "subjects": ["Aji Mix at OPUS", "Haw Flakes at OPUS"]}
    # Nothing started: what stopped is what it named.
    assert dismissals.key_from_watch_post({"cleared": [{"subject": "OPUS"}]}, "sales_moved", DEFS)["subjects"] == ["OPUS"]


def test_a_post_is_hidden_only_when_every_subject_it_names_was_set_aside():
    from app.services import dismissals
    kind = "watch.stock_crossed_out"
    q = [_q(kind, "Aji Mix at OPUS", "known")]
    assert dismissals.judge(kind, ["Aji Mix at OPUS"], q, DEFS) == (True, None)
    # A new shelf beside a quieted one is news about the new shelf.
    assert dismissals.judge(kind, ["Aji Mix at OPUS", "Haw Flakes at OPUS"], q, DEFS)[0] is False
    # A different kind about the same subject is not quieted.
    assert dismissals.judge("watch.newly_dead", ["Aji Mix at OPUS"], q, DEFS) == (False, None)


def test_a_post_called_wrong_stays_and_says_who():
    from app.services import dismissals
    kind = "watch.sales_moved"
    hidden, disputed = dismissals.judge(kind, ["OPUS"], [_q(kind, "OPUS", "wrong")], DEFS)
    assert hidden is False and "joy said OPUS may be wrong" in disputed


def test_the_route_is_a_writer_bound_to_the_person():
    import inspect
    from app.api.v1.routes import bob as route
    paths = {getattr(r, "path", "") for r in route.router.routes}
    assert "/dismissals" in paths
    src = inspect.getsource(route.dismiss_item)
    assert "user.username" in src and "_bob_user" in src
    # No tool: Bob holds no writer for it.
    assert not any("dismiss" in name for name in loop.TOOL_FUNCTIONS)

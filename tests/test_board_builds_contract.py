"""
The board builds in front of him (P2S.7, 2026-09-18).

The owner: *"when it does how are we doing it should still display like the
normal data first and then it goes deeper so theres something to see already
and the more pop up so you can really see it building"*. Measured on
verification/p2s6-gate-2.json: the shops at 10.4 s, George's board at 59.6 s,
the end at 105.7 s — and nothing new in between, because the default was
drawn once a turn and every compose REPLACED the turn's board.

What holds it, and what this file checks:

  - a compose FOLDS into the turn's board (agent/compose.fold): a new key is
    added at the end, a known key changes where it stands, and nothing
    already drawn moves;
  - a put over a read a DEFAULT drew replaces that default where it stands;
  - a later compose that only changes one key leaves the rest standing — the
    `why` turn's second compose erased its first under the old rule;
  - one lead across the turn, settled by his first compose.
"""

from __future__ import annotations

from agent import compose

DEFAULTS = [
    {"op": "put", "kind": "dumbbell", "key": "read-0", "seq": 0, "weight": "lead", "default": True},
    {"op": "put", "kind": "figure", "key": "read-1", "seq": 1, "weight": "quiet", "default": True},
]


def keys(board):
    return [b["key"] for b in board]


def test_his_block_over_a_defaults_read_takes_its_place():
    board = compose.fold(DEFAULTS, [
        {"op": "put", "kind": "ranked", "key": "shops", "seq": 0, "weight": "lead"},
    ], first=True)
    assert keys(board) == ["shops", "read-1"]
    assert "default" not in board[0]


def test_a_default_stops_leading_the_moment_he_composes():
    board = compose.fold(DEFAULTS, [
        {"op": "put", "kind": "figure", "key": "atv", "seq": 1, "weight": "lead"},
    ], first=True)
    assert [(b["key"], b["weight"]) for b in board] == [("read-0", "quiet"), ("atv", "lead")]


def test_a_new_key_is_added_at_the_end_and_nothing_moves():
    first = compose.fold([], [
        {"op": "put", "kind": "figure", "key": "a", "seq": 0, "weight": "lead"},
        {"op": "put", "kind": "figure", "key": "b", "seq": 1, "weight": "supporting"},
    ], first=True)
    later = compose.fold(first, [
        {"op": "put", "kind": "heatmap", "key": "c", "seq": 2, "weight": "supporting"},
    ])
    assert keys(later) == ["a", "b", "c"]
    assert later[:2] == first


def test_a_second_compose_that_only_changes_one_key_leaves_the_rest():
    """verification/p2s6-gate-2.json `why`: three blocks, then one change."""
    first = compose.fold([], [
        {"op": "put", "kind": "figure", "key": "ne-week", "seq": 0, "weight": "lead"},
        {"op": "put", "kind": "dumbbell", "key": "stores-week", "seq": 3, "weight": "supporting"},
        {"op": "put", "kind": "figure", "key": "ne-basket", "seq": 2, "weight": "quiet"},
    ], first=True)
    later = compose.fold(first, [{"op": "change", "key": "stores-week", "weight": "lead"}])
    assert keys(later) == ["ne-week", "stores-week", "ne-basket"]
    # THE LEAD IS SETTLED BY HIS FIRST COMPOSE: a later ask to lead is drawn
    # supporting where it stands, because the lead is drawn first and moving
    # it moved the board (the `morning` turn of verification/p2s7-gate.json).
    assert [b["weight"] for b in later] == ["lead", "supporting", "quiet"]
    assert later[1]["kind"] == "dumbbell" and later[1]["seq"] == 3


def test_a_put_under_a_known_key_replaces_it_where_it_stands():
    first = compose.fold([], [
        {"op": "put", "kind": "figure", "key": "a", "seq": 0, "weight": "lead"},
        {"op": "put", "kind": "figure", "key": "b", "seq": 1, "weight": "quiet"},
    ], first=True)
    later = compose.fold(first, [{"op": "put", "kind": "ranked", "key": "a", "seq": 4,
                                  "weight": "lead"}])
    assert keys(later) == ["a", "b"] and later[0]["seq"] == 4


def test_an_edit_to_an_earlier_turns_object_is_kept_as_the_edit():
    later = compose.fold([], [{"op": "quiet", "key": "from-yesterday"}], first=True)
    assert later == [{"op": "quiet", "key": "from-yesterday"}]


def test_a_drop_is_his_and_removes_it():
    first = compose.fold([], [
        {"op": "put", "kind": "figure", "key": "a", "seq": 0, "weight": "lead"},
        {"op": "put", "kind": "figure", "key": "b", "seq": 1, "weight": "quiet"},
    ], first=True)
    assert keys(compose.fold(first, [{"op": "drop", "key": "b"}])) == ["a"]


def test_this_turns_objects_are_on_the_board_the_next_compose_sees():
    calls = {0: {"tool": "get_sales", "arguments": {"group_by": "store"}}}
    board = [{"op": "put", "kind": "ranked", "key": "shops", "seq": 0, "weight": "lead"},
             {"op": "put", "kind": "figure", "key": "read-1", "seq": 1, "default": True}]
    objs = compose.as_board_objects(board, calls)
    assert objs == [{"key": "shops", "kind": "ranked",
                     "read": {"tool": "get_sales", "arguments": {"group_by": "store"}}}]


def test_the_loop_folds_rather_than_replaces():
    source = open("agent/loop.py", encoding="utf-8").read()
    assert "composition_recorded = list(result[\"rows\"])" not in source
    assert "compose.fold(turn_board, result[\"rows\"]" in source
    assert "default_composed" not in source


# ---------------------------------------------------------------------------
# Through the real loop: a scripted three-round turn (no database, no API)
# ---------------------------------------------------------------------------

def _scripted_turn(monkeypatch):
    import asyncio
    from agent import loop as george_loop
    from tests.test_convergence_cap_contract import FakeClient, _ToolUse
    from tests.test_loop_correction_contract import StubLog, _TextBlock

    shops = [{"store": s, "value": v, "baseline": b, "change": v - b,
              "change_pct": round(100 * (v - b) / b, 1), "direction": "down" if v < b else "up",
              "baseline_status": "ok"}
             for s, v, b in (("OPUS", 467102, 555147), ("Rockwell", 400000, 394000),
                             ("Magnolia", 300000, 281000))]
    hours = [{"hour": h, "value": 1000.0 + h} for h in range(10, 16)]

    async def fake_read(name, args):
        rows = hours if args.get("group_by") == "hour" else shops
        return ({"rows": rows, "meta": {"source_table": "new_transactions",
                                        "filters_applied": [], "row_count": len(rows),
                                        "snapshot_timestamp": "2026-09-18T00:00:00+00:00"}},
                None, 3)

    replies = [
        [_ToolUse("r0", "get_sales", {"group_by": "store", "date_range": "last_week",
                                      "compare_to": "previous_period"})],
        [_ToolUse("c1", "compose", {"blocks": [
            {"op": "put", "kind": "dumbbell", "key": "shops", "seq": 0, "weight": "lead",
             "claim": "OPUS is the shop that moved"}]}),
         _ToolUse("r2", "get_sales", {"group_by": "hour", "date_range": "last_week",
                                      "filters": {"store": "OPUS"}})],
        [_ToolUse("c3", "compose", {"blocks": [
            {"op": "put", "kind": "table", "key": "opus-hours", "seq": 2,
             "weight": "supporting", "claim": "Where in the day it fell"}],
            "reading": {"claim": "OPUS is the shop that moved"}})],
        [_TextBlock("OPUS is the shop that moved, and it fell through the afternoon.")],
    ]
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    monkeypatch.setattr(george_loop, "_call_tool", fake_read)
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in george_loop.run("how are we doing?")]

    return asyncio.run(collect())


def test_the_board_builds_through_the_loop_and_nothing_moves(monkeypatch):
    from tests.test_loop_correction_contract import frames_of
    frames = frames_of(_scripted_turn(monkeypatch), "compose")
    boards = [[b["key"] for b in f["blocks"]] for f in frames]
    # The shops first (the default), his board over them, the hours read
    # drawn quiet the moment it lands, then his block over it — in place.
    assert boards == [["read-0"], ["shops"], ["shops", "read-2"], ["shops", "opus-hours"]]
    assert frames[0].get("default") is True and not frames[1].get("default")
    assert frames[2]["blocks"][1].get("default") is True
    assert "default" not in frames[3]["blocks"][1]
    # His last compose named only the new block; the lead he drew first stands.
    assert frames[3]["blocks"][0]["weight"] == "lead"


def test_prose_beside_a_compose_is_part_of_the_answer_the_loop_keeps(monkeypatch):
    """verification/p2s7-gate.json: the body beside his final compose, a
    closing line in the next round — the reader saw both, the loop kept and
    judged only the closing line, and the two were joined "overnight.My read"."""
    import asyncio
    from agent import loop as george_loop
    from tests.test_convergence_cap_contract import FakeClient, _ToolUse
    from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of

    async def fake_read(name, args):
        return ({"rows": [{"store": "OPUS", "value": 1.0}], "meta": {
            "source_table": "new_transactions", "filters_applied": [], "row_count": 1,
            "snapshot_timestamp": "2026-09-18T00:00:00+00:00"}}, None, 3)

    replies = [
        [_ToolUse("r0", "get_sales", {"group_by": "store"})],
        [_TextBlock("OPUS is the shop that moved."),
         _ToolUse("c1", "compose", {"blocks": [
             {"op": "put", "kind": "figure", "key": "opus", "seq": 0, "weight": "lead"}]})],
        [_TextBlock("I would leave the rest alone.")],
    ]
    fake = FakeClient(replies)
    kept: list = []

    class Log(StubLog):
        def conversation(self, **kw):
            kept.append(kw.get("final_answer"))

    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    monkeypatch.setattr(george_loop, "_call_tool", fake_read)
    monkeypatch.setattr(george_loop, "ConversationLog", Log)

    async def collect():
        return [f async for f in george_loop.run("how are we doing?")]

    frames = asyncio.run(collect())
    shown = "".join(f["delta"] for f in frames_of(frames, "text"))
    assert shown == "OPUS is the shop that moved.\n\nI would leave the rest alone."
    assert kept == [shown]


def test_the_lead_his_first_compose_settled_stays_the_lead():
    """verification/p2s7-gate-2.json `morning`: the settled lead restated as
    supporting while a new block asked to lead — nothing led, and three drawn
    figures shifted. The settled lead keeps it; the new block supports."""
    first = compose.fold([], [
        {"op": "put", "kind": "figure", "key": "nedsa-drivers", "seq": 1, "weight": "lead"},
        {"op": "put", "kind": "table", "key": "stock", "seq": 2, "weight": "supporting"},
    ], first=True)
    later = compose.fold(first, [
        {"op": "put", "kind": "line", "key": "nedsa-level", "seq": 5, "weight": "lead"},
        {"op": "put", "kind": "figure", "key": "nedsa-drivers", "seq": 1, "weight": "supporting"},
    ])
    assert [(b["key"], b["weight"]) for b in later] == [
        ("nedsa-drivers", "lead"), ("stock", "supporting"), ("nedsa-level", "supporting")]


def test_a_dropped_lead_lets_the_latest_ask_stand():
    first = compose.fold([], [
        {"op": "put", "kind": "figure", "key": "a", "seq": 1, "weight": "lead"}], first=True)
    later = compose.fold(first, [{"op": "drop", "key": "a"},
                                 {"op": "put", "kind": "figure", "key": "b", "seq": 2,
                                  "weight": "lead"}])
    assert [(b["key"], b["weight"]) for b in later] == [("b", "lead")]

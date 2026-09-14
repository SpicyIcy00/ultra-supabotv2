"""
Replay: a stored read, one changed argument, no model.

NO DATABASE, NO MODEL. The session is a stub that records its statements — the
technique test_river_writer_contract uses — and the tool is a stub that records
the arguments it was called with. What is under test is what the service DOES:
which call it runs, which argument it changed, what it refuses, and what it
records.

THE FOUR PROPERTIES WORTH THE FILE:

  1. The arguments the call runs with are the RECORD'S. Everything but the one
     named argument comes off `payload.calls`, so a client cannot put an
     invented call on screen under a receipts line. That was possible until
     P1.i: the endpoint took a whole call list from the request body.
  2. The vocabulary is the definitions'. The five arguments, where each lands
     in the tool's own argument list, and the cap on what is recorded are all
     read from metrics.yaml at run time, so this file asserts against the yaml
     rather than against a literal it would have to be kept in step with.
  3. A refusal is the TOOL'S. A window still in progress comes back as a 200
     with the tool's own sentence, the preset named in it — not an exception,
     not a rephrasing, and with nothing drawn.
  4. Nothing reaches the model. `agent.loop.run` is replaced with something
     that raises, and a replay still answers.
"""

from __future__ import annotations

import asyncio
import functools
import json
import uuid

import pytest

pytest.importorskip("psycopg", reason="the service imports the tools, which import psycopg")
pytest.importorskip("sqlalchemy", reason="the service builds SQLAlchemy text()")

from agent import loop as george_loop                                          # noqa: E402
from app.services import replay as replay_service                              # noqa: E402
from app.services.replay import (                                              # noqa: E402
    ReplayNotFound,
    ReplayRefused,
    arguments,
    board_frame,
    check_value,
    retarget,
    target,
)
from tools._common import load_defs, req                                       # noqa: E402

DEFS = load_defs()
SPEC = req(DEFS, "surface.desk.replay")
OWNER = "ice"
POST = uuid.UUID("11111111-1111-1111-1111-111111111111")

STORED = {
    "group_by": ["store"],
    "date_range": "last_week",
    "filters": {"store": "OPUS"},
    "metric": "net_sales",
    "compare_to": "previous_period",
}

META = {
    "source_table": "new_transactions",
    "filters_applied": ["store = 'OPUS'", "is_cancelled = false"],
    "snapshot_timestamp": "2026-09-14T00:00:00+00:00",
    "metric_unit": "PHP",
}

ROWS = [{"store": "OPUS", "value": 412_300.0, "baseline": 388_100.0,
         "change": 24_200.0, "change_pct": 6.2, "unit": "PHP"}]


# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------

class _Result:
    def __init__(self, row=None, rowcount: int = 1) -> None:
        self._row, self.rowcount = row, rowcount

    def mappings(self):
        return self

    def first(self):
        return self._row


class FakeSession:
    """The post's row for the SELECT; a rowcount for the UPDATE."""

    def __init__(self, payload=None, rowcount: int = 1, found: bool = True) -> None:
        self.payload = payload
        self.rowcount = rowcount
        self.found = found
        self.calls: list[tuple[str, dict]] = []

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        self.calls.append((sql, params or {}))
        if sql.lstrip().upper().startswith("SELECT"):
            row = {"kind": "answer", "payload": self.payload} if self.found else None
            return _Result(row=row)
        return _Result(rowcount=self.rowcount)

    def sql(self, i: int) -> str:
        return self.calls[i][0]

    def params(self, i: int) -> dict:
        return self.calls[i][1]


def payload_with(*calls: dict) -> dict:
    return {"charted": [], "calls": list(calls)}


ANSWER = payload_with({"seq": 3, "tool": "get_sales", "arguments": STORED})


def a_tool(monkeypatch, *, rows=ROWS, meta=META, raises: Exception | None = None):
    """
    Replace get_sales with a stub, and record what it was called with.

    `functools.wraps` the REAL function, so the stub keeps its signature and
    its docstring — which is what `build_tool_schemas` reads. A bare `**kwargs`
    stub has no parameters to generate a schema from, so every argument
    validates against nothing and the validation half of this file proves
    nothing at all.
    """
    seen: list[dict] = []
    real = george_loop.TOOL_FUNCTIONS["get_sales"]

    @functools.wraps(real)
    def fake(**kwargs):
        seen.append(kwargs)
        if raises is not None:
            raise raises
        return {"rows": list(rows), "meta": dict(meta)}

    monkeypatch.setitem(george_loop.TOOL_FUNCTIONS, "get_sales", fake)
    return seen


def run(session, **kw) -> dict:
    return asyncio.run(replay_service.replay(
        session, username=OWNER, post_id=POST,
        **{"seq": 3, "argument": "window", "value": "last_month", **kw},
    ))


# ---------------------------------------------------------------------------
# The vocabulary is the definitions'
# ---------------------------------------------------------------------------

def test_the_five_arguments_are_read_from_the_definitions():
    assert arguments() == list(SPEC["arguments"])
    assert set(arguments()) == {"window", "store", "group_by", "rank_by", "top_n"}


def test_no_argument_a_replay_may_change_is_a_threshold():
    """
    Scope only — the same rule composition.control_arguments and a workflow
    parameter obey. A threshold is a definition and lives in the yaml where it
    was measured, so there must be no way to move one from a browser.
    """
    for name in arguments():
        assert not any(w in name for w in ("threshold", "min_", "max_", "limit",
                                           "cutoff", "target")), name


def test_window_lands_on_each_tool_s_own_window_argument():
    per_tool = req(DEFS, "workflows.backtest.window_arguments")
    for tool, argument in per_tool.items():
        assert target(tool, "window") == [argument]
    # And the ones that are not date_range are genuinely different.
    assert target("get_dead_stock", "window") == ["window"]
    assert target("get_purchase_plan", "window") == ["lookback_days"]


def test_a_tool_with_no_window_is_refused_by_name():
    with pytest.raises(ReplayRefused) as exc:
        target("get_inventory", "window")
    assert "get_inventory" in str(exc.value)
    assert "get_sales" in str(exc.value)


def test_store_lands_inside_filters():
    assert target("get_sales", "store") == ["filters", "store"]


def test_an_argument_outside_the_five_is_refused_and_says_which_five():
    with pytest.raises(ReplayRefused) as exc:
        target("get_sales", "metric")
    said = str(exc.value)
    assert "'metric'" in said
    for name in arguments():
        assert name in said


def test_the_recorded_cap_is_the_definitions_cap():
    session = FakeSession(payload=ANSWER)
    asyncio.run(replay_service.record(
        session, username=OWNER, post_id=POST, entry={"seq": 1}))
    assert session.params(0)["cap"] == int(SPEC["max_recorded_per_post"])


# ---------------------------------------------------------------------------
# The change itself
# ---------------------------------------------------------------------------

def test_one_argument_changes_and_the_rest_are_the_record_s():
    args, was = retarget("get_sales", STORED, "window", "last_month")
    assert was == "last_week"
    assert args["date_range"] == "last_month"
    assert args["group_by"] == ["store"]
    assert args["filters"] == {"store": "OPUS"}
    assert args["metric"] == "net_sales"
    assert args["compare_to"] == "previous_period"


def test_the_stored_call_is_never_mutated():
    before = json.dumps(STORED, sort_keys=True)
    retarget("get_sales", STORED, "store", "Rockwell")
    retarget("get_sales", STORED, "window", ["2026-08-01", "2026-09-01"])
    assert json.dumps(STORED, sort_keys=True) == before


def test_a_store_change_reaches_into_filters():
    args, was = retarget("get_sales", STORED, "store", "Rockwell")
    assert was == "OPUS"
    assert args["filters"] == {"store": "Rockwell"}


def test_null_takes_the_argument_off_rather_than_passing_a_null():
    """"All shops" is the filter coming off, not `store: null` reaching a tool."""
    args, was = retarget("get_sales", STORED, "store", None)
    assert was == "OPUS"
    assert "filters" not in args, "an empty group is an argument the tool never had"


def test_null_leaves_a_group_that_still_holds_something():
    stored = {**STORED, "filters": {"store": "OPUS", "category": "Snacks"}}
    args, _ = retarget("get_sales", stored, "store", None)
    assert args["filters"] == {"category": "Snacks"}


def test_a_store_change_on_a_call_that_had_no_filters_makes_the_group():
    args, was = retarget("get_sales", {"group_by": [], "date_range": "last_week"},
                         "store", "OPUS")
    assert was is None
    assert args["filters"] == {"store": "OPUS"}


@pytest.mark.parametrize("value", [{"a": 1}, 1.5, True, [1, 2], "x" * 200,
                                   ["a"] * 40])
def test_a_value_of_the_wrong_shape_is_refused(value):
    with pytest.raises(ReplayRefused):
        check_value(value)


@pytest.mark.parametrize("value", ["last_month", 20, ["2026-08-01", "2026-09-01"], None])
def test_the_shapes_an_argument_can_be_are_accepted(value):
    check_value(value)


# ---------------------------------------------------------------------------
# The stored call, and who it belongs to
# ---------------------------------------------------------------------------

def test_the_call_is_read_off_the_post_and_ownership_is_in_the_where_clause():
    session = FakeSession(payload=ANSWER)
    tool, args = asyncio.run(replay_service.stored_call(
        session, username=OWNER, post_id=POST, seq=3))
    assert (tool, args) == ("get_sales", STORED)
    assert "owner_user = :me" in session.sql(0)
    assert session.params(0)["me"] == OWNER


def test_a_post_that_is_not_yours_is_not_found():
    session = FakeSession(found=False)
    with pytest.raises(ReplayNotFound):
        asyncio.run(replay_service.stored_call(
            session, username=OWNER, post_id=POST, seq=3))


def test_a_call_the_answer_never_kept_names_the_ones_it_did():
    session = FakeSession(payload=ANSWER)
    with pytest.raises(ReplayNotFound) as exc:
        asyncio.run(replay_service.stored_call(
            session, username=OWNER, post_id=POST, seq=9))
    assert "3" in str(exc.value)


def test_an_answer_with_no_calls_says_so_rather_than_rebuilding_one():
    """A call rebuilt from charted rows would be an invented call."""
    session = FakeSession(payload={"charted": [{"seq": 1, "rows": ROWS}]})
    with pytest.raises(ReplayNotFound) as exc:
        asyncio.run(replay_service.stored_call(
            session, username=OWNER, post_id=POST, seq=1))
    assert "never rebuilt" in str(exc.value)


# ---------------------------------------------------------------------------
# Running it
# ---------------------------------------------------------------------------

def test_the_tool_receives_the_stored_arguments_with_one_changed(monkeypatch):
    seen = a_tool(monkeypatch)
    out = run(FakeSession(payload=ANSWER))
    assert out["status"] == "ok"
    assert seen == [{**STORED, "date_range": "last_month"}]
    assert out["was"] == "last_week"
    assert out["value"] == "last_month"
    assert out["arguments"]["date_range"] == "last_month"


def test_the_rows_and_the_receipts_come_back_whole(monkeypatch):
    a_tool(monkeypatch)
    out = run(FakeSession(payload=ANSWER))
    assert out["rows"] == ROWS
    for key in ("source_table", "filters_applied", "snapshot_timestamp"):
        assert out["meta"][key] == META[key]


def test_an_explicit_window_is_not_refused_as_an_unknown_preset(monkeypatch):
    """
    P1.i. `date_range` is a oneOf and the pin validator took the FIRST enum it
    found whatever the value's shape was, so the explicit half-open window the
    tool documents was refused as an invalid preset. "last week" -> "August" is
    this card's own Done-when and could not run.
    """
    seen = a_tool(monkeypatch)
    out = run(FakeSession(payload=ANSWER), value=["2026-08-01", "2026-09-01"])
    assert out["status"] == "ok"
    assert seen[0]["date_range"] == ["2026-08-01", "2026-09-01"]


def test_a_preset_that_is_not_one_is_still_refused(monkeypatch):
    a_tool(monkeypatch)
    with pytest.raises(ReplayRefused) as exc:
        run(FakeSession(payload=ANSWER), value="augustish")
    assert "augustish" in str(exc.value)


def test_a_window_still_in_progress_is_refused_by_name_and_stays_a_result(monkeypatch):
    """
    The tool's own sentence, carried whole. Not an exception: a tool declining
    to compare a partial period against a whole one is a real answer, and the
    preset it names is the half a person acts on.
    """
    a_tool(monkeypatch, raises=ValueError(
        "compare_to is refused on 'this_month': that window is still in "
        "progress, and a partial period against a whole one is a fall by "
        "construction. Use 'last_month' instead, which compares whole periods."))
    out = run(FakeSession(payload=ANSWER), value="this_month")
    assert out["status"] == "refused"
    assert "'this_month'" in out["refusal"]
    assert "last_month" in out["refusal"]
    assert out["rows"] == [] and out["blocks"] == []


def test_a_refusal_is_recorded_as_one(monkeypatch):
    a_tool(monkeypatch, raises=ValueError("no."))
    session = FakeSession(payload=ANSWER)
    run(session, value="this_month")
    entry = json.loads(session.params(1)["entry"])
    assert entry["status"] == "refused"


def test_nothing_reaches_the_model(monkeypatch):
    def never(*a, **k):
        raise AssertionError("a replay asked the model something")

    monkeypatch.setattr(george_loop, "run", never)
    a_tool(monkeypatch)
    assert run(FakeSession(payload=ANSWER))["status"] == "ok"


# ---------------------------------------------------------------------------
# The board frame
# ---------------------------------------------------------------------------

def test_an_ok_read_comes_back_with_one_validated_block(monkeypatch):
    a_tool(monkeypatch)
    blocks = run(FakeSession(payload=ANSWER))["blocks"]
    assert len(blocks) == 1
    assert blocks[0]["key"] == "read-3"
    assert blocks[0]["seq"] == 3
    assert blocks[0]["kind"] in req(DEFS, "composition.widgets")


def test_the_mark_is_chosen_from_the_rows_and_nothing_else(monkeypatch):
    a_tool(monkeypatch, rows=[
        {"store": "OPUS", "value": 1.0, "baseline": 2.0, "change_pct": -1.0},
        {"store": "Rockwell", "value": 3.0, "baseline": 2.0, "change_pct": 1.0},
    ])
    assert run(FakeSession(payload=ANSWER))["blocks"][0]["kind"] == "dumbbell"


def test_the_block_never_characterises_the_rows(monkeypatch):
    """Nobody looked at these rows, so nothing may say what they mean."""
    a_tool(monkeypatch)
    block = run(FakeSession(payload=ANSWER))["blocks"][0]
    for said in ("claim", "note", "emphasise"):
        assert said not in block


def test_more_rows_than_a_screen_is_sent_draws_nothing(monkeypatch):
    many = [{"store": f"s{i}", "value": float(i)}
            for i in range(george_loop.MAX_ROWS_TO_CLIENT + 1)]
    a_tool(monkeypatch, rows=many)
    out = run(FakeSession(payload=ANSWER))
    assert out["status"] == "ok" and out["rows"] == many
    assert out["blocks"] == [], "an object over a prefix draws a different chart"


def test_a_read_that_returned_nothing_draws_nothing(monkeypatch):
    a_tool(monkeypatch, rows=[])
    assert run(FakeSession(payload=ANSWER))["blocks"] == []


def test_board_frame_is_empty_for_anything_but_ok():
    assert board_frame("get_sales", STORED,
                       {"status": "refused", "rows": ROWS, "meta": META}, 3) == []


# ---------------------------------------------------------------------------
# The record on the post
# ---------------------------------------------------------------------------

def test_the_change_is_recorded_on_the_post_with_both_sides_of_it(monkeypatch):
    a_tool(monkeypatch)
    session = FakeSession(payload=ANSWER)
    out = run(session)
    assert out["recorded"] is True
    entry = json.loads(session.params(1)["entry"])
    assert entry["seq"] == 3
    assert entry["tool"] == "get_sales"
    assert entry["argument"] == "window"
    assert entry["was"] == "last_week"
    assert entry["value"] == "last_month"
    assert entry["status"] == "ok"
    assert entry["at"]


def test_the_record_touches_no_key_the_answer_already_carries(monkeypatch):
    a_tool(monkeypatch)
    session = FakeSession(payload=ANSWER)
    run(session)
    sql = session.sql(1)
    assert "'{replays}'" in sql
    for key in ("charted", "calls", "composition", "reading", "page_context"):
        assert key not in sql


def test_the_record_is_owned_and_appends(monkeypatch):
    a_tool(monkeypatch)
    session = FakeSession(payload=ANSWER)
    run(session)
    sql = session.sql(1)
    assert "owner_user = :me" in sql
    assert "||" in sql, "the entry is appended to what is there, never a rewrite"
    assert "ORDER BY e.i" in sql, "the trim must keep the newest, not an arbitrary set"


def test_a_replay_whose_post_was_never_written_says_it_recorded_nothing(monkeypatch):
    """UI rule 8: a claim about state renders from a result, never a literal."""
    a_tool(monkeypatch)
    out = run(FakeSession(payload=ANSWER, rowcount=0))
    assert out["status"] == "ok"
    assert out["recorded"] is False


def test_the_definitions_say_the_record_is_on_the_post():
    assert SPEC["recorded"] == "answer_post_payload"
    assert SPEC["model_consulted"] is False


# ---------------------------------------------------------------------------
# A control is a replay, and the two vocabularies meet in the yaml
# ---------------------------------------------------------------------------

def test_every_control_argument_names_a_replay_argument():
    """
    A drawn control is replayed by tapping it, and George composes one in the
    TOOL'S vocabulary (`date_range`). A control argument with no replay
    argument behind it draws a chip whose every option is refused on click —
    which is worse than no control, and is the same failure compose.py already
    refuses a window control on a tool with no date_range for.
    """
    for control in req(DEFS, "composition.control_arguments"):
        assert replay_service.canonical(control) in arguments(), control


def test_a_control_s_own_name_resolves_before_anything_runs(monkeypatch):
    seen = a_tool(monkeypatch)
    session = FakeSession(payload=ANSWER)
    out = run(session, argument="date_range", value="last_month")
    assert seen[0]["date_range"] == "last_month"
    # One vocabulary on the way out and on the record, never the caller's.
    assert out["argument"] == "window"
    assert json.loads(session.params(1)["entry"])["argument"] == "window"


def test_an_argument_that_is_neither_is_still_refused():
    with pytest.raises(ReplayRefused):
        target("get_sales", replay_service.canonical("metric"))

"""
What you tell him, he keeps and acts on (P2S.11, 2026-09-18).

The owner: "if i tell it some info like dont focus on [per gram] beacause its
per gram products cause they kinda dont matter and product categories too
will it remeber it and actually use that info?" Checked against the code the
same day, three things were wrong, and each has its own section here:

  1. IT WOULD LAPSE. Told views shared the twelve prompt slots with George's
     own, newest-confirmed first, and he re-confirms his own constantly.
  2. IT CHANGED WORDS, NOT READS. No read could leave a category out, so the
     rankings still led with per-gram lines while he talked around them.
  3. NOTHING BOUND IT. "Leave per gram out" had no stance to be kept as and
     no declared setting for the reads to apply.

NO DATABASE. The read-level test drives get_sales against a fake connection
and reads the statement it would have run.
"""

from __future__ import annotations

import sys
import pathlib
from datetime import datetime, timedelta, timezone

import pytest

from agent import beliefs, loop as george_loop, write_tools
from tools import _common
from tools._common import load_defs, req

pytest.importorskip("sqlalchemy")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
from app.services import belief_store                      # noqa: E402

DEFS = load_defs()
NOW = datetime(2026, 9, 19, 2, 0, tzinfo=timezone.utc)
SAID = datetime(2026, 9, 18, 17, 30, tzinfo=timezone.utc)   # 01:30 on the 19th in Manila


def own(i: int) -> dict:
    return {"id": f"own{i}", "subject_kind": "store", "subject": "Rockwell",
            "stance": "needs_attention", "claim": "Rockwell is losing customers.",
            "evidence": [{"tool": "get_sales", "arguments": {}}], "told": None,
            "confirmed_at": NOW - timedelta(minutes=i), "held_since": NOW - timedelta(days=2)}


TOLD = {"id": "t1", "subject_kind": "category", "subject": "per gram",
        "stance": "leave_out", "claim": "Per gram products do not matter to them.",
        "evidence": [], "told": "dont focus on per gram, they kinda dont matter",
        "confirmed_at": SAID, "held_since": SAID}


# ------------------------------------------------------------ 1. it is kept


def test_a_told_view_is_attached_even_with_forty_newer_beliefs():
    """The card's own contract: forty of his views confirmed since, and the
    thing they told him is still in the block and still counted as applied."""
    rows = [own(i) for i in range(40)] + [TOLD]
    block = belief_store.as_block(rows, latest_data=NOW, now=NOW)
    assert "[id: t1]" in block and "per gram" in block
    assert "t1" in belief_store.in_prompt(rows)
    # His own views keep their own cap, unchanged.
    assert sum(1 for i in belief_store.in_prompt(rows) if i.startswith("own")) \
        == belief_store.MAX_IN_PROMPT


def test_the_register_lists_what_they_told_him_first():
    """Every reader cuts from the top of current() — the prompt and the memory
    screen's first twenty — so a told view must be at the top."""

    class _Result:
        def __init__(self, rows):
            self.rows = rows

        def mappings(self):
            return self.rows

    class _Session:
        async def execute(self, *_a, **_k):
            return _Result([own(0), own(1), TOLD, own(2)])

    import asyncio
    held = asyncio.run(belief_store.current(_Session()))
    assert held[0]["id"] == "t1"
    assert [r["id"] for r in held[1:]] == ["own0", "own1", "own2"]


def test_the_block_says_a_left_out_category_is_already_left_out():
    block = belief_store.as_block([TOLD], now=NOW)
    assert "[leave_out]" in block and "do not bring it back in words" in block


# ------------------------------------------------------------- 3. it binds


def test_a_leave_out_view_binds_the_declared_setting_with_their_words_and_date():
    bound = belief_store.bound_settings([own(0), TOLD], DEFS)
    assert bound == {"left_out_categories": [{
        "category": "per gram", "told": TOLD["told"],
        # The Manila date they said it — the date the receipt names.
        "on": "2026-09-19", "id": "t1"}]}


def test_a_means_view_and_a_forgotten_view_bind_nothing():
    means = {**TOLD, "id": "m1", "stance": "means"}
    assert belief_store.bound_settings([means, own(0)], DEFS) == {}
    # Forgotten and superseded views never reach `rows` (current()), so
    # Forget and "include it again" unbind by construction.
    assert belief_store.bound_settings([], DEFS) == {}


def test_the_setting_is_declared_with_every_field_the_contract_requires():
    decl = req(DEFS, "settings.declared.left_out_categories")
    for field in req(DEFS, "settings.declaration_requires"):
        assert field in decl
    assert decl["bound_by"] == {**decl["bound_by"], "stance": "leave_out",
                                "subject_kind": "category"}
    assert "leave_out" in req(DEFS, "judgment.taught.stances")
    assert decl["leaves_out_of"] == "lists" and decl["never_out_of"] == "totals"


def _resolver(known=("per gram", "tradsnax", "aji mix")):
    def resolve(name):
        hit = [k for k in known if k.lower() == name.strip().lower()]
        return (hit[0], "") if hit else (None, f"No category is called {name!r}.")
    return resolve


def _item(**over):
    base = {"stance": "leave_out", "subject_kind": "category", "subject": "PER GRAM",
            "claim": "Per gram products do not matter to them.",
            "told": "dont focus on per gram, they kinda dont matter"}
    base.update(over)
    return base


def test_a_leave_out_view_is_kept_in_the_catalogues_spelling():
    ok, bad = beliefs.validate([_item()], DEFS, is_executed=lambda c: False,
                               resolve_category=_resolver())
    assert not bad and ok[0]["subject"] == "per gram" and ok[0]["evidence"] == []


@pytest.mark.parametrize("over, why", [
    ({"subject": "gummies"}, "No category is called"),
    ({"subject_kind": "store", "subject": "Rockwell"}, "about a category"),
    ({"told": None}, "needs `told`"),
    ({"evidence": [{"tool": "get_sales", "arguments": {}}]}, "rests on what the person SAID"),
])
def test_a_leave_out_view_that_would_leave_out_nothing_is_refused(over, why):
    ok, bad = beliefs.validate([_item(**over)], DEFS, is_executed=lambda c: True,
                               resolve_category=_resolver())
    assert not ok and why in bad[0]["reason"]


def test_without_a_catalogue_to_check_against_a_binding_view_is_refused():
    ok, bad = beliefs.validate([_item()], DEFS, is_executed=lambda c: False)
    assert not ok and "catalogue" in bad[0]["reason"]


# ---------------------------------------------------- 2. the reads apply it

BOUND = [{"category": "per gram", "told": "dont focus on per gram", "on": "2026-09-18"}]


def test_a_list_leaves_the_category_out_and_its_receipt_names_the_instruction():
    left = _common.left_out(DEFS, BOUND, lists=True)
    assert left["predicate"].startswith("lower(") and "<> ALL(%(left_out_categories)s)" in left["predicate"]
    assert left["params"] == {"left_out_categories": ["per gram"]}
    assert left["filters_applied"][0].startswith(
        "per gram left out at your instruction, 2026-09-18")
    assert left["setting"]["left_out"] == ["per gram"]


def test_a_total_stays_whole_and_says_why():
    left = _common.left_out(DEFS, BOUND, lists=False)
    assert left["predicate"] is None and left["filters_applied"] == []
    assert "never out of totals" in left["setting"]["not_applied"]


def test_a_read_that_names_the_category_or_one_product_leaves_nothing_out():
    named = _common.left_out(DEFS, BOUND, lists=True, asked_category="PER GRAM")
    assert named["predicate"] is None
    assert "asked for by name" in named["filters_applied"][0]
    one = _common.left_out(DEFS, BOUND, lists=True, names_product=True)
    assert one["predicate"] is None and "one product" in one["setting"]["not_applied"]


def test_nothing_bound_says_nothing():
    assert _common.left_out(DEFS, None, lists=True) == {
        "predicate": None, "params": {}, "filters_applied": [], "setting": None}


def test_another_alias_reads_the_same_category():
    left = _common.left_out(DEFS, BOUND, lists=True, alias="pr")
    assert "pr.category" in left["predicate"] and "p.category" not in left["predicate"]


class _Zeros(dict):
    """Any aggregate the read asks for, as zero: the statement is the test."""

    def __missing__(self, key):
        return 0


class _Cursor:
    def __init__(self):
        self.statements: list[tuple[str, dict]] = []
        self._last = ""

    def execute(self, sql, params=None):
        self.statements.append((sql, params or {}))
        self._last = sql

    def fetchone(self):
        from datetime import date
        if "manila_today" in self._last:
            return {"read_at": NOW, "manila_today": date(2026, 9, 19),
                    "manila_now": datetime(2026, 9, 19, 10, 0)}
        if " AS s," in self._last:
            return {"s": date(2026, 9, 12), "e": date(2026, 9, 19)}
        return _Zeros()

    def fetchall(self):
        return []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _Conn:
    def __init__(self):
        self.cur = _Cursor()

    def cursor(self, **_k):
        return self.cur

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _run_sales(monkeypatch, **kwargs):
    from tools import sales
    conn = _Conn()
    monkeypatch.setattr(sales, "_connect", lambda: conn)
    out = sales.get_sales(**kwargs)
    return out, conn.cur.statements


def test_what_fell_by_product_is_read_without_the_category(monkeypatch):
    """The done-when's read: products at a shop, grouped — the statement
    itself carries the clause, and the receipt names the instruction."""
    out, statements = _run_sales(monkeypatch, group_by="product", date_range="last_7_days",
                                 metric="product_revenue", filters={"store": "Rockwell"},
                                 left_out=BOUND)
    main = [(s, p) for s, p in statements if "GROUP BY" in s]
    assert main and all("<> ALL(%(left_out_categories)s)" in s for s, _ in main)
    assert main[0][1]["left_out_categories"] == ["per gram"]
    assert any(f.startswith("per gram left out at your instruction, 2026-09-18")
               for f in out["meta"]["filters_applied"])
    assert out["meta"]["settings"]["left_out_categories"]["left_out"] == ["per gram"]
    # The rows no longer cover the till, so they are not reconciled against it.
    assert out["meta"]["reconciliation"]["applicable"] is False


def test_a_shops_total_is_the_tills_figure_whatever_is_bound(monkeypatch):
    out, statements = _run_sales(monkeypatch, group_by="store", date_range="last_7_days",
                                 left_out=BOUND)
    assert not any("left_out_categories" in s for s, _ in statements)
    assert not any("at your instruction" in f for f in out["meta"]["filters_applied"])
    assert out["meta"]["settings"]["left_out_categories"]["left_out"] == []


# ------------------------------------------ the loop hands it over; he cannot


class _Ctx:
    def __init__(self, settings):
        self.settings = settings


def test_the_loop_hands_the_setting_to_exactly_the_reads_it_declares():
    ctx = _Ctx({"left_out_categories": BOUND})
    declared = req(DEFS, "settings.declared.left_out_categories.participates_in")
    for tool in declared:
        assert george_loop._bound_settings_for(tool, ctx) == {"left_out": BOUND}
    assert george_loop._bound_settings_for("get_attention", ctx) == {}
    assert george_loop._bound_settings_for("get_sales", _Ctx(None)) == {}


def test_every_read_the_declaration_names_takes_it_and_the_model_never_sees_it():
    import inspect
    declared = req(DEFS, "settings.declared.left_out_categories.participates_in")
    for tool in declared:
        param = inspect.signature(george_loop.TOOL_FUNCTIONS[tool]).parameters["left_out"]
        assert param.kind is inspect.Parameter.KEYWORD_ONLY
    for schema in george_loop.build_tool_schemas(DEFS):
        assert "left_out" not in schema["input_schema"]["properties"], schema["name"]


def test_a_left_out_the_model_sends_is_dropped():
    """He may record what he was told; he may never bind a value himself."""
    import asyncio
    args = asyncio.run(george_loop._injected_args(
        "get_sales", {"group_by": "product", "left_out": ["tradsnax"]}, _Ctx(None)))
    assert "left_out" not in args
    args = asyncio.run(george_loop._injected_args(
        "get_sales", {"group_by": "product", "left_out": ["tradsnax"]},
        _Ctx({"left_out_categories": BOUND})))
    assert args["left_out"] == BOUND


def test_he_is_told_on_the_tool_to_record_what_to_ignore_the_same_turn():
    doc = write_tools.record_belief.__doc__
    assert "WHEN THEY SAY WHAT TO IGNORE, RECORD IT THE SAME TURN" in doc
    assert "supersedes that view with a `means` view" in doc


def test_the_web_process_and_the_schedule_both_pass_what_is_bound():
    import inspect
    from app.api.v1.routes import george as route
    from app.services import standing_runner
    assert "bound_settings(rows, _load_defs())" in inspect.getsource(route._beliefs_for)
    assert "bound_settings=bound_settings or None" in inspect.getsource(route.ask)
    assert "left_out=bound.get(\"left_out_categories\")" in inspect.getsource(route.open_object)
    assert "bound_settings=bound or None" in inspect.getsource(standing_runner)


def test_a_turn_hands_the_bound_setting_to_its_reads_and_not_to_the_model(monkeypatch):
    """
    The whole path through a real loop: the web process binds it, the model
    asks for products and for get_change, and every read — the one it named
    and the ones get_change becomes — is dispatched with it; the calls
    recorded for pins and the board carry only what the model asked.
    """
    import asyncio
    from tests.test_convergence_cap_contract import FakeClient, _ToolUse
    from tests.test_loop_correction_contract import StubLog, _TextBlock

    products = {"metric": "product_revenue", "group_by": "product",
                "date_range": "last_week", "top_n": 5}
    fake = FakeClient([[_ToolUse("tu-1", "get_sales", products),
                        _ToolUse("tu-2", "get_change", {"store": "North Edsa"})],
                       [_TextBlock("Done.")]])
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)
    dispatched: list[tuple[str, dict]] = []

    async def fake_read(name, args):
        dispatched.append((name, args))
        return ({"rows": [], "meta": {"source_table": "t", "filters_applied": [],
                                      "snapshot_timestamp": "2026-09-19T00:00:00+00:00"}},
                None, 1)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run(
            "what fell?", bound_settings={"left_out_categories": BOUND})]

    frames = asyncio.run(collect())
    declared = req(DEFS, "settings.declared.left_out_categories.participates_in")
    assert len(dispatched) > 2, "get_change expands into its reads"
    for name, args in dispatched:
        assert (args.get("left_out") == BOUND) == (name in declared), name
    # What the model and the record see is what the model asked.
    calls = [f for f in frames if f.startswith("event: tool_call")]
    assert calls and not any("left_out" in f for f in calls)

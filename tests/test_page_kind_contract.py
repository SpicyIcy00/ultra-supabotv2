"""
A kept page's KIND (W4.1, 2026-09-23) — "make how each page style work idealy".

NO DATABASE, NO MODEL. What holds:

  1. THE FOUR KINDS ARE THE YAML'S, and one set: every kind the yaml declares
     is one the API accepts, and every kind the API accepts the yaml declares
     and says how to draw. An unknown kind is refused — by the service, by
     Bob's tools, and in the database's own CHECK.
  2. THE DERIVATION READS WHAT THE PINS CARRY. The four real pages of
     2026-09-23 — Estate Dashboard, Store Dashboard, Estate Week, AJI BARN
     Reorder — each derive to a kind, from their stored calls and nothing
     else. A title is never read, so renaming a page never moves it.
  3. A KIND IS PRESENTATION. Setting one changes two columns: no pin changes
     page, position or calls, and no figure is touched.
  4. NULL IS ITS OWN STATE. Nobody has said, the kind is DERIVED on every
     read and never stored, and `kind_set_by` says which of user / bob /
     derived it was. A page shape is never handed out with a null kind.
  5. EVERY CHANGE IS AUDITED — `set_kind` in page_events, before and after,
     from the owner's PUT or from Bob's edit_page alike.
"""

from __future__ import annotations

import asyncio
import copy
import uuid

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import write_tools                                            # noqa: E402
from agent.write_tools import PageRefused                                # noqa: E402
from app.models.bob_page import BobPage, BobPageEvent, PAGE_OPERATIONS   # noqa: E402
from app.services import page_kind, page_operations, page_writer         # noqa: E402
from app.services.page_writer import PageValidationError                 # noqa: E402
from tools._common import load_defs, req                                 # noqa: E402
from tests.test_page_writer_contract import ME, FakeSession, _page, _pin  # noqa: E402
from tests.test_page_workshop_contract import FakeWriter, _ctx, _schema  # noqa: E402

DEFS = load_defs()
KINDS = ("dashboard", "week", "list", "collection")


def _run(coro):
    return asyncio.run(coro)


def _events(s: FakeSession) -> list[BobPageEvent]:
    return [o for o in s.added if isinstance(o, BobPageEvent)]


# ---------------------------------------------------------------------------
# The four real pages, as george.pins held them on 2026-09-23.
#
# Read off the live rows, verbatim, and kept here because the derivation has
# to be right about THESE pages: they are the ones the owner was looking at
# when he asked for this. Each entry is (page carries a date window, the
# analyses in page order, each its stored calls).
# ---------------------------------------------------------------------------

def _sales(**arguments) -> dict:
    return {"tool": "get_sales", "arguments": arguments}


ESTATE_DASHBOARD = (True, [
    # "The week's drivers" — the estate's three headline metrics, ungrouped.
    [_sales(metric=m, group_by=[], compare_to="previous_period", date_range="last_week")
     for m in ("net_sales", "transaction_count", "average_transaction_value")],
    # "The shops, the days, and what moved in the range".
    [_sales(metric="net_sales", group_by="store", compare_to="previous_period",
            date_range="last_week"),
     _sales(metric="net_sales", group_by="day", date_range="last_week"),
     _sales(top_n=5, metric="product_revenue", rank_by="biggest_drop", group_by="product",
            compare_to="previous_period", date_range="last_week"),
     _sales(top_n=5, metric="product_revenue", rank_by="biggest_gain", group_by="product",
            compare_to="previous_period", date_range="last_week")],
    # "What crossed, and what the shops hold".
    [{"tool": "get_attention", "arguments": {}},
     {"tool": "get_stock", "arguments": {"group_by": ["state"]}},
     {"tool": "get_dead_stock", "arguments": {}}],
    # "What is on order".
    [{"tool": "get_purchasing", "arguments": {"top_n": 10, "measure": "ordered_value",
                                              "group_by": ["supplier"],
                                              "date_range": "last_30_days"}}],
])

STORE_DASHBOARD = (False, [
    [_sales(metric="net_sales", group_by="store", compare_to="to_date_same_elapsed",
            date_range="this_week")],
    [_sales(metric="transaction_count", group_by="store", compare_to="to_date_same_elapsed",
            date_range="this_week")],
    [_sales(metric="average_transaction_value", group_by="store",
            compare_to="to_date_same_elapsed", date_range="this_week")],
    [_sales(metric="net_sales", group_by="store", compare_to="previous_period",
            date_range="last_week")],
])

ESTATE_WEEK = (False, [
    [_sales(metric="net_sales", group_by=[], compare_to="previous_period",
            date_range="last_week")],
    [_sales(metric="net_sales", group_by="store", compare_to="previous_period",
            date_range="last_week")],
    [_sales(metric="transaction_count", group_by="store", compare_to="previous_period",
            date_range="last_week")],
    [_sales(metric="average_transaction_value", group_by="store",
            compare_to="previous_period", date_range="last_week")],
])

AJI_BARN_REORDER = (False, [
    [_sales(top_n=15, metric="product_revenue", group_by="product",
            date_range="last_30_days")],
    [{"tool": "get_dead_stock", "arguments": {"top_n": 15, "window": "last_30_days"}}],
    [{"tool": "get_purchasing", "arguments": {"store": "AJI BARN", "measure": "ordered_value",
                                              "group_by": "status",
                                              "date_range": "last_30_days"}}],
    [{"tool": "get_stock", "arguments": {"store": "AJI BARN", "top_n": 15,
                                         "direction": "highest"}}],
    [_sales(top_n=15, metric="units_sold", group_by="product", date_range="last_30_days")],
])


# ---------------------------------------------------------------------------
# 1. The four kinds are the yaml's, and one set
# ---------------------------------------------------------------------------

def test_the_yaml_declares_exactly_the_four_kinds_the_api_accepts():
    """
    One vocabulary. The yaml is where a kind is declared (CLAUDE.md rule 3),
    the CHECK in migration c4d5e6f7a8b9 is the same four names, and the
    service accepts those and no others — so a fifth kind cannot appear in one
    place and be unknown in another.
    """
    assert tuple(page_kind.kinds()) == KINDS
    assert set(req(DEFS, "pages.kinds.catalogue")) == set(KINDS)
    assert page_kind.default_kind() == "collection"
    constraint = next(c for c in BobPage.__table__.constraints
                      if getattr(c, "name", None) == "ck_pages_kind")
    for name in KINDS:
        assert f"'{name}'" in str(constraint.sqltext)
    assert "'derived'" not in str(
        next(c for c in BobPage.__table__.constraints
             if getattr(c, "name", None) == "ck_pages_kind_set_by").sqltext), (
        "derived is what a NULL kind reads as, never something anybody stores")


def test_every_kind_says_what_it_means_and_how_it_draws():
    """
    A kind is a DRAWING rule, so the yaml carries the drawing: a width for
    every shape agent/default_composition.shape_for can produce, whether a run
    of consecutive single-figure analyses groups into one row, whether the
    title reads as a head or a caption, and whether the page is dated. None of
    it is in a component (CLAUDE.md rule 3).
    """
    shapes = {"figure", "dumbbell", "contributors", "line", "ranked", "table",
              "heatmap", "multiples", "stacked", "memory"}
    for name in KINDS:
        entry = req(DEFS, f"pages.kinds.catalogue.{name}")
        assert entry["means"].strip() and entry["when"].strip()
        draws = page_kind.draws(name)
        assert draws["title_as"] in ("head", "caption")
        assert isinstance(draws["dateline"], bool)
        assert isinstance(draws["group_single_figures"], bool)
        assert isinstance(draws["comparisons_before_lists"], bool)
        assert int(draws["max_in_a_row"]) >= 1
        assert set(draws["sizes"]) == shapes, name
        assert set(draws["sizes"].values()) | {draws["default_size"]} <= {
            "small", "medium", "wide", "full"}
    # The four jobs, as the card states them: a dashboard groups its stat
    # tiles into a row, a week is one dated column, a list gives the rows the
    # width and demotes the chart beside them.
    assert page_kind.draws("dashboard")["group_single_figures"] is True
    assert page_kind.draws("dashboard")["title_as"] == "caption"
    assert page_kind.draws("week")["dateline"] is True
    assert page_kind.draws("week")["max_in_a_row"] == 1
    assert page_kind.draws("list")["sizes"]["table"] == "full"
    assert page_kind.draws("list")["sizes"]["line"] == "small"


def test_no_kind_asks_for_an_analysis_to_be_dimmed_or_dropped():
    """
    Emphasis adds, never dims (the owner, 2026-09-18), and a kind never hides
    an analysis. Nothing in a `draws` block may say so — there is no key for
    it, and the sizes are widths, not visibilities.
    """
    for name in KINDS:
        keys = set(page_kind.draws(name))
        assert not (keys & {"hide", "fade", "dim", "collapse", "omit", "opacity"}), name


def test_every_matcher_names_a_kind_and_only_conditions_the_code_implements():
    """
    The yaml and the derivation cannot drift in silence. A matcher naming a
    condition page_kind.py does not implement raises — it never becomes a
    matcher that quietly never fires.
    """
    matchers = req(DEFS, "pages.kinds.derivation.matchers")
    assert matchers, "a derivation with no matchers derives nothing"
    for matcher in matchers:
        assert matcher["gives"] in KINDS
        assert matcher["why"].strip(), matcher["name"]
        page_kind.check(matcher["gives"])
        conditions = page_kind._conditions_of(matcher)
        assert conditions, f"{matcher['name']} matches on nothing"
    bad = dict(matchers[0], **{"the_title_says_so": True})
    with pytest.raises(KeyError, match="the_title_says_so"):
        page_kind._conditions_of(bad)


def test_an_unknown_kind_is_refused_everywhere_it_can_be_named():
    """By the module, by the service's plan, and by Bob's two tools."""
    with pytest.raises(page_kind.KindRefused, match="not a kind of page"):
        page_kind.check("report")
    with pytest.raises(page_kind.KindRefused):
        page_kind.check(None)

    page = _page()
    s = FakeSession(pages=[page])
    with pytest.raises(PageValidationError, match="set_kind"):
        _run(page_operations.apply_edit(s, owner=ME, page_id=page.id,
                                        operations=[{"op": "set_kind", "kind": "report"}]))
    assert _events(s) == [], "a refused edit writes nothing"

    ctx = _ctx(FakeWriter())
    with pytest.raises(PageRefused, match="not a kind of page"):
        _run(write_tools.create_page("A page", kind="report", ctx=ctx))
    with pytest.raises(PageRefused, match="not a kind of page"):
        _run(write_tools.edit_page([{"op": "set_kind", "kind": "report"}], ctx=ctx))


# ---------------------------------------------------------------------------
# 2. The derivation reads what the pins carry
# ---------------------------------------------------------------------------

def test_the_four_real_pages_each_derive_to_a_kind():
    """
    The pages the owner was looking at on 2026-09-23, with their stored calls
    verbatim, and WHY each lands where it does.
    """
    # Estate Dashboard: five different tools across four analyses — sales,
    # attention, stock, dead stock, purchasing. Several corners of the
    # business at a glance; nobody reads that top to bottom.
    window, analyses = ESTATE_DASHBOARD
    assert page_kind.derive(analyses, has_date_window=window) == "dashboard"

    # Store Dashboard: the same read (get_sales by store) four times with a
    # different metric or window each time. A rack of numbers you check.
    window, analyses = STORE_DASHBOARD
    assert page_kind.derive(analyses, has_date_window=window) == "dashboard"

    # Estate Week: every one of the four reads last week, and every one is
    # compared to the period before. One window looked at from four sides,
    # which is what a week page is.
    window, analyses = ESTATE_WEEK
    assert page_kind.derive(analyses, has_date_window=window) == "week"

    # AJI BARN Reorder: four of the five analyses are list reads — top sellers,
    # dead stock, the largest holdings — and nothing on the page is compared to
    # a baseline. A working page you read down.
    window, analyses = AJI_BARN_REORDER
    assert page_kind.derive(analyses, has_date_window=window) == "list"


def test_the_derivation_never_reads_a_word():
    """
    A matcher matches on what the pins CARRY. A page called "Dashboard" full
    of long lists is a list — the derivation is not given a title, a purpose
    or a pin's name, and `calls_of` takes the stored calls and nothing else.
    """
    _, analyses = AJI_BARN_REORDER
    pins = [_pin(title="Dashboard of everything") for _ in analyses]
    for pin, calls in zip(pins, analyses):
        pin.tool_calls = calls
    assert page_kind.calls_of(pins) == [list(a) for a in analyses]
    assert page_kind.derive(page_kind.calls_of(pins)) == "list"


def test_a_page_with_too_little_on_it_is_the_default():
    """Two readings are not yet a style, and an empty page has no style at all."""
    _, analyses = STORE_DASHBOARD
    assert page_kind.derive([]) == "collection"
    assert page_kind.derive(analyses[:1]) == "collection"
    assert page_kind.derive(analyses[:1]) == page_kind.default_kind()


def test_the_derivation_is_deterministic_and_changes_nothing_it_reads():
    """Pure: same page, same answer, and the calls handed in come back untouched."""
    window, analyses = AJI_BARN_REORDER
    before = copy.deepcopy(analyses)
    first = page_kind.derive(analyses, has_date_window=window)
    for _ in range(3):
        assert page_kind.derive(analyses, has_date_window=window) == first
    assert analyses == before


def test_a_call_is_projected_to_a_shape_only_when_that_is_honest():
    """
    Two projections are honest without running the read: a bounded ranked set
    of named rows is a list, and a measured read with no grouping returns one
    row, which is a figure. Everything else is unknown and counts for nothing.
    """
    assert page_kind.call_shape(_sales(metric="net_sales", group_by=[])) == "figure"
    assert page_kind.call_shape(_sales(metric="net_sales")) == "figure"
    assert page_kind.call_shape(_sales(metric="net_sales", group_by="store")) == "unknown"
    assert page_kind.call_shape(_sales(top_n=10, group_by="product")) == "list"
    assert page_kind.call_shape({"tool": "get_dead_stock", "arguments": {}}) == "list"
    assert page_kind.call_shape({"tool": "get_brief", "arguments": {}}) == "unknown"
    # An analysis is its shape only when EVERY call in it is: one call nobody
    # can place makes the analysis unplaced, because it is drawn as a whole.
    assert page_kind.analysis_shape([_sales(group_by=[]), _sales(group_by=[])]) == "figure"
    assert page_kind.analysis_shape([_sales(group_by=[]), _sales(group_by="store")]) == "unknown"
    assert page_kind.analysis_shape([]) == "unknown"


# ---------------------------------------------------------------------------
# 3. A kind is presentation
# ---------------------------------------------------------------------------

def test_setting_a_kind_moves_no_analysis_and_touches_no_figure():
    """
    The decision, held: a kind changes how the page is DRAWN and never what is
    on it. After a set_kind every pin has the same page, the same position and
    the same stored calls — and nothing was re-run, because the service reads
    no figure at all.
    """
    page = _page()
    pins = [_pin(title=f"A{i}", page=page, position=i) for i in range(3)]
    pins[1].tool_calls = [{"tool": "get_sales", "arguments": {"metric": "net_sales"}}]
    before = [(p.id, p.page_id, p.position, copy.deepcopy(p.tool_calls)) for p in pins]
    s = FakeSession(pages=[page], pins=pins)

    result = _run(page_operations.apply_edit(
        s, owner=ME, page_id=page.id, operations=[{"op": "set_kind", "kind": "dashboard"}]))

    assert [(p.id, p.page_id, p.position, p.tool_calls) for p in pins] == before
    assert page.kind == "dashboard" and page.kind_set_by == "user"
    assert result.page["kind"] == "dashboard"
    assert result.operations[0]["op"] == "set_kind"
    assert result.operations[0]["analyses_unchanged"] == 3
    assert result.operations[0]["to"] == "dashboard"
    assert result.operations[0]["options"] == list(KINDS)


def test_a_kind_never_changes_what_the_page_reports_about_its_analyses():
    """
    The same page under each of the four kinds reports the same analyses, in
    the same order, with the same calls. Only the kind moves.
    """
    page = _page()
    pins = [_pin(title=f"A{i}", page=page, position=i) for i in range(3)]
    seen = []
    for name in KINDS:
        page.kind, page.kind_set_by = name, "user"
        summary = page_operations.page_summary(page, pins)
        seen.append(summary["kind"])
        assert [a["pin_id"] for a in summary["analyses"]] == [str(p.id) for p in pins]
        assert [a["position"] for a in summary["analyses"]] == [0, 1, 2]
        assert [a["calls"] for a in summary["analyses"]] == [p.tool_calls for p in pins]
    assert seen == list(KINDS)


# ---------------------------------------------------------------------------
# 4. Null is its own state, and a page shape never carries a null kind
# ---------------------------------------------------------------------------

def test_nobody_has_said_derives_and_never_stores():
    """
    NULL means nobody has said. The kind is worked out on every read and is
    never written back, so a page whose analyses change is drawn as what it
    now is.
    """
    _, analyses = ESTATE_WEEK
    kind, set_by = page_kind.resolve(None, None, analyses)
    assert (kind, set_by) == ("week", "derived")

    page = _page()
    pins = []
    for i, calls in enumerate(analyses):
        pin = _pin(title=f"A{i}", page=page, position=i)
        pin.tool_calls = calls
        pins.append(pin)
    summary = page_operations.page_summary(page, pins)
    assert summary["kind"] == "week" and summary["kind_set_by"] == "derived"
    assert summary["kind_means"] == page_kind.means("week")
    assert page.kind is None and page.kind_set_by is None, "a derived kind is never stored"


def test_a_stored_kind_is_taken_as_said_and_not_second_guessed():
    """
    Somebody decided. A stored kind is returned as it stands even when the
    pins would derive another — that is the point of setting one. A stored
    value that is no longer one of the four reads as nobody having said,
    rather than refusing to draw the page.
    """
    _, analyses = AJI_BARN_REORDER
    assert page_kind.resolve("dashboard", "user", analyses) == ("dashboard", "user")
    assert page_kind.resolve("week", "bob", analyses) == ("week", "bob")
    assert page_kind.resolve("report", "user", analyses) == ("list", "derived")
    assert page_kind.resolve(None, "user", analyses) == ("list", "derived")


def test_a_page_shape_never_reports_a_null_kind():
    """
    Never null in a response: a page always draws as something. An empty page
    included — it has no analyses to derive from and is the default.
    """
    page = _page()
    for stored in (None, "dashboard"):
        page.kind, page.kind_set_by = stored, ("user" if stored else None)
        summary = page_operations.page_summary(page, [])
        assert summary["kind"] in KINDS
        assert summary["kind_set_by"] in ("user", "bob", "derived")
        assert summary["kind_means"]


# ---------------------------------------------------------------------------
# 5. Every change is audited
# ---------------------------------------------------------------------------

def test_set_kind_is_audited_before_and_after_whoever_made_it():
    page = _page()
    s = FakeSession(pages=[page])
    _run(page_writer.set_kind(s, owner=ME, page_id=page.id, kind="list"))
    [event] = _events(s)
    assert event.operation == "set_kind" and event.operation in PAGE_OPERATIONS
    assert event.actor == "user"
    assert event.before == {"kind": None, "kind_set_by": None}
    assert event.after == {"kind": "list", "kind_set_by": "user"}

    # Bob's writer takes the same path and leaves the same record.
    s = FakeSession(pages=[page])
    _run(page_writer.set_kind(s, owner=ME, page_id=page.id, kind="week",
                              actor=page_writer.Actor("bob")))
    [event] = _events(s)
    assert event.actor == "bob"
    assert event.before == {"kind": "list", "kind_set_by": "user"}
    assert event.after == {"kind": "week", "kind_set_by": "bob"}

    # Setting what is already there is no write and no event.
    s = FakeSession(pages=[page])
    _run(page_writer.set_kind(s, owner=ME, page_id=page.id, kind="week",
                              actor=page_writer.Actor("bob")))
    assert _events(s) == []


def test_the_operation_vocabulary_carries_the_kind_everywhere():
    assert "set_kind" in write_tools.PAGE_EDIT_OPERATIONS
    assert "set_kind" in page_operations.EDIT_OPERATIONS
    assert "set_kind" in PAGE_OPERATIONS
    # A confirmation of it is not corrected as an unbacked claim.
    assert "set_kind" in req(DEFS, "pages.claim_check.operation_phrases")


# ---------------------------------------------------------------------------
# Bob's two writers
# ---------------------------------------------------------------------------

def test_create_page_carries_a_kind_and_the_schema_tells_him_what_one_is():
    w = FakeWriter()
    ctx = _ctx(w)
    _run(write_tools.create_page("Estate Dashboard", kind="dashboard", ctx=ctx))
    assert w.builds[-1].kind == "dashboard"
    # Left out is nobody having said, not a default chosen here.
    _run(write_tools.create_page("Whatever", ctx=ctx))
    assert w.builds[-1].kind is None

    described = _schema("create_page")["input_schema"]["properties"]["kind"]["description"]
    for name in KINDS:
        assert name in described, f"he is never told {name} exists"
    assert "dashboard" in _schema("create_page")["description"]


def test_edit_page_passes_a_kind_on_and_says_it_changes_only_the_drawing():
    w = FakeWriter()
    ctx = _ctx(w)
    _run(write_tools.edit_page([{"op": "set_kind", "kind": "week"}], ctx=ctx))
    [spec] = w.edits
    assert spec.page_id is None, "the page in scope"
    assert spec.operations == [{"op": "set_kind", "kind": "week"}]
    text = _schema("edit_page")["description"]
    assert "set_kind" in text
    for name in KINDS:
        assert name in text


def test_build_me_a_dashboard_is_told_to_make_a_dashboard_page():
    """
    W2.4 made "build me a dashboard" build a kept page. W4.1 makes that page a
    `dashboard` — through the sentence he is told and the tool text, not
    through a rule in code that would guess at every other page too.
    """
    sentence = req(DEFS, "composition.dashboard.sentence")
    assert "create_page" in sentence
    assert 'kind: "dashboard"' in sentence
    assert "pages.kinds" in sentence

"""
Pure tests for the page writer: the rules that hold without a database.

NO DATABASE. What makes a page write safe is decidable from three things, and
all three live here:

  1. THE STATEMENTS CARRY THE SCOPE. Every read the writer makes — a page by
     id, a pin by id, a page's pins, the caller's pages — is compiled and
     checked for the owner column. A foreign row is unreachable because the
     SQL cannot reach it, not because a check remembered to look.
  2. THE RULES ARE THE OLD RULES. A title is normalised exactly as a page name
     was (trim, collapse, keep case), refused blank or over-long; a purpose is
     one line or nothing; positions are dense; placement is relational and a
     raw integer has nowhere to go.
  3. AMBIGUITY REFUSES. Two candidates for a title is a typed refusal naming
     both with ids, never a choice.

test_page_workshop_live.py exercises the same functions against the real
database inside one rolled-back transaction.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import Select
from sqlalchemy.dialects import postgresql

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from app.models.bob_page import BobPage, PAGE_OPERATIONS               # noqa: E402
from app.models.bob_pin import BobPin                                   # noqa: E402
from app.services import page_operations, page_writer, pin_writer             # noqa: E402
from app.services.page_writer import (                                        # noqa: E402
    ANY_PAGE,
    MAX_PAGES_PER_OWNER,
    MAX_PINS_PER_PAGE,
    MAX_PURPOSE_LEN,
    MAX_TITLE_LEN,
    AmbiguousTarget,
    NotAPage,
    PageNotFound,
    PageValidationError,
    PinNotFound,
    _placement_index,
    normalize_purpose,
    normalize_title,
    renumber,
)


def _run(coro):
    return asyncio.run(coro)


ME = "ice"
OTHER = "somebody-else"


def _page(title="Rockwell", owner=ME) -> BobPage:
    now = datetime(2026, 9, 8, tzinfo=timezone.utc)
    return BobPage(id=uuid.uuid4(), owner=owner, title=title, purpose=None,
                      created_at=now, updated_at=now)


def _pin(title="Net sales", page: BobPage | None = None, position=0, owner=ME) -> BobPin:
    pin = BobPin(
        id=uuid.uuid4(), created_by=owner,
        created_at=datetime(2026, 9, 8, tzinfo=timezone.utc),
        title=title, question=None, conversation_id=None,
        page_id=page.id if page else None, position=position,
        tool_calls=[{"tool": "get_sales", "arguments": {"metric": "net_sales"}}],
    )
    pin.page_obj = page
    return pin


class _Result:
    def __init__(self, rows):
        self._rows = list(rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalar_one(self):
        return self._rows[0] if self._rows else 0

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class FakeSession:
    """
    Records every statement and answers selects from a small in-memory world,
    deciding which read is which from the statement's own entity — never from
    call order.
    """

    def __init__(self, pages=(), pins=()):
        self.pages, self.pins = list(pages), list(pins)
        self.statements: list = []
        self.added: list = []
        self.flushed = 0

    async def execute(self, stmt):
        self.statements.append(stmt)
        assert isinstance(stmt, Select), type(stmt)
        first = stmt.column_descriptions[0]
        entity, name = first.get("entity"), first["name"]
        if entity is BobPage and name == "BobPage":
            # Honour an exact-title WHERE, so a lookup by title behaves as the
            # database would rather than returning every page.
            params = stmt.compile(dialect=postgresql.dialect()).params
            wanted = params.get("title_1")
            return _Result([p for p in self.pages if wanted is None or p.title == wanted])
        if entity is BobPage and name == "title":
            return _Result([p.title for p in self.pages])
        if entity is BobPin and name == "BobPin":
            return _Result(self.pins)
        return _Result([len(self.pages)])

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        self.flushed += 1


def _sql(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


# ---------------------------------------------------------------------------
# 1. Every read is scoped in the statement
# ---------------------------------------------------------------------------

def test_a_page_by_id_is_read_with_the_owner_in_the_where():
    s = FakeSession(pages=[])
    with pytest.raises(PageNotFound):
        _run(page_writer.get_page(s, ME, uuid.uuid4()))
    [stmt] = s.statements
    sql = _sql(stmt)
    assert "george.pages.owner = " in sql and "george.pages.id = " in sql


def test_a_pin_by_id_is_read_with_the_owner_in_the_where():
    s = FakeSession(pins=[])
    with pytest.raises(PinNotFound):
        _run(page_writer.get_pin(s, ME, uuid.uuid4()))
    [stmt] = s.statements
    sql = _sql(stmt)
    assert "george.pins.created_by = " in sql and "george.pins.id = " in sql


def test_a_pages_pins_are_read_with_the_owner_and_the_page_and_ordered_by_position():
    s = FakeSession()
    _run(page_writer.page_pins(s, ME, uuid.uuid4()))
    sql = _sql(s.statements[0])
    assert "george.pins.created_by = " in sql
    assert "george.pins.page_id = " in sql
    assert "ORDER BY george.pins.position ASC" in sql


def test_the_ungrouped_scope_is_page_id_is_null_and_keeps_newest_first():
    s = FakeSession()
    _run(page_writer.page_pins(s, ME, None))
    sql = _sql(s.statements[0])
    assert "george.pins.page_id IS NULL" in sql
    assert "ORDER BY george.pins.created_at DESC" in sql
    assert "position" not in sql.split("ORDER BY")[1]


def test_the_callers_pages_are_listed_with_the_owner_in_the_where():
    s = FakeSession()
    _run(page_writer.list_pages(s, ME))
    assert "george.pages.owner = " in _sql(s.statements[0])


def test_a_foreign_page_and_a_missing_page_are_one_answer():
    theirs = _page(owner=OTHER)
    # The fake returns nothing for a scoped query, as the database would.
    s = FakeSession(pages=[])
    with pytest.raises(PageNotFound) as a:
        _run(page_writer.get_page(s, ME, theirs.id))
    with pytest.raises(PageNotFound) as b:
        _run(page_writer.get_page(s, ME, uuid.uuid4()))
    assert str(a.value) == str(b.value)


# ---------------------------------------------------------------------------
# 2. The rules
# ---------------------------------------------------------------------------

def test_a_title_is_normalised_like_a_page_name_always_was():
    assert normalize_title("  Rockwell   Weekly ") == "Rockwell Weekly"
    assert normalize_title("FFR Overview") == "FFR Overview"      # case kept


def test_a_blank_or_over_long_title_is_refused():
    with pytest.raises(PageValidationError):
        normalize_title("   ")
    with pytest.raises(PageValidationError):
        normalize_title(None)
    with pytest.raises(PageValidationError):
        normalize_title("x" * (MAX_TITLE_LEN + 1))
    assert len(normalize_title("x" * MAX_TITLE_LEN)) == MAX_TITLE_LEN


def test_a_purpose_is_one_line_or_nothing():
    assert normalize_purpose("Monitor Rockwell\nsales  performance") == "Monitor Rockwell sales performance"
    assert normalize_purpose("   ") is None
    assert normalize_purpose(None) is None
    with pytest.raises(PageValidationError):
        normalize_purpose("p" * (MAX_PURPOSE_LEN + 1))


def test_renumber_makes_positions_dense_in_the_order_given():
    page = _page()
    pins = [_pin(f"P{i}", page, position=i * 10) for i in range(4)]
    order = [pins[2], pins[0], pins[3], pins[1]]
    renumber(order)
    assert [p.position for p in order] == [0, 1, 2, 3]


def test_placement_is_relational_and_a_raw_integer_has_nowhere_to_go():
    page = _page()
    a, b, c, moving = (_pin(t, page) for t in "abc" + "m")
    order = [a, b, c]
    assert _placement_index(order, moving, None) == 3
    assert _placement_index(order, moving, {"at": "top"}) == 0
    assert _placement_index(order, moving, {"at": "bottom"}) == 3
    assert _placement_index(order, moving, {"before": str(b.id)}) == 1
    assert _placement_index(order, moving, {"after": str(b.id)}) == 2
    with pytest.raises(PageValidationError):
        _placement_index(order, moving, {"position": 2})
    with pytest.raises(PageValidationError):
        _placement_index(order, moving, {"at": "middle"})
    with pytest.raises(PageValidationError):
        _placement_index(order, moving, {"before": str(b.id), "after": str(c.id)})
    with pytest.raises(PageValidationError):
        _placement_index(order, moving, {"after": str(moving.id)})
    with pytest.raises(PinNotFound):
        _placement_index(order, moving, {"before": str(uuid.uuid4())})


def test_ungrouped_cannot_be_placed():
    loose = _pin("Loose", None)
    with pytest.raises(NotAPage):
        _run(page_writer.place_pin(FakeSession(pins=[loose]), owner=ME, pin=loose,
                                   place={"at": "top"}))


def test_ungrouped_cannot_be_edited_as_a_page():
    with pytest.raises(NotAPage):
        _run(page_operations.apply_edit(FakeSession(), owner=ME, page_id=None,
                                        operations=[{"op": "rename", "title": "X"}]))


def test_the_bounds_are_the_agreed_ones():
    assert MAX_PAGES_PER_OWNER == 50
    assert MAX_PINS_PER_PAGE == 50
    assert pin_writer.MAX_PINS_PER_USER == 500
    assert MAX_TITLE_LEN == 100
    assert MAX_PURPOSE_LEN == 200
    assert page_operations.MAX_ANALYSES_PER_BUILD == 6
    assert page_operations.MAX_OPERATIONS_PER_EDIT == 10
    assert page_operations.MAX_ADDS_PER_EDIT == 6


def test_the_operation_vocabulary_is_closed_and_shared():
    # Everything edit_page can do is an audited operation, or maps onto one.
    assert set(page_operations.EDIT_OPERATIONS) == {
        "rename", "set_purpose", "add", "add_existing", "remove", "move_to_page", "place",
        # P2S.3(g): "make that one a pie" — a pin's call redrawn as another shape.
        "draw",
        # W1.2: "use 30-day velocity" changes the analysis where it stands.
        "change",
    }
    for op in ("rename", "set_purpose", "add", "remove", "move", "place", "create", "delete",
               "draw", "change"):
        assert op in PAGE_OPERATIONS


def test_a_build_refuses_more_analyses_than_the_bound_before_touching_anything():
    s = FakeSession()
    too_many = [{"title": f"A{i}", "tool_calls": [{"tool": "get_sales", "arguments": {}}]}
                for i in range(page_operations.MAX_ANALYSES_PER_BUILD + 1)]
    with pytest.raises(PageValidationError):
        _run(page_operations.build_page(s, owner=ME, title="Big", analyses=too_many))
    assert s.added == [] and s.flushed == 0


def test_an_edit_refuses_more_operations_than_the_bound_before_touching_anything():
    s = FakeSession(pages=[_page()])
    ops = [{"op": "set_purpose", "purpose": "x"}] * (page_operations.MAX_OPERATIONS_PER_EDIT + 1)
    with pytest.raises(PageValidationError):
        _run(page_operations.plan_edit(s, owner=ME, page_id=s.pages[0].id, operations=ops))
    assert s.added == [] and s.flushed == 0


def test_an_unknown_operation_is_refused_by_name():
    page = _page()
    s = FakeSession(pages=[page])
    with pytest.raises(PageValidationError) as exc:
        _run(page_operations.plan_edit(s, owner=ME, page_id=page.id,
                                       operations=[{"op": "explode"}]))
    assert "explode" in str(exc.value)


def test_bad_placement_after_purpose_is_rejected_before_any_mutation():
    page = _page()
    pin = _pin(page=page)
    s = FakeSession(pages=[page], pins=[pin])
    with pytest.raises(PinNotFound):
        _run(page_operations.apply_edit(s, owner=ME, page_id=page.id, operations=[
            {"op": "set_purpose", "purpose": "Must not persist"},
            {"op": "place", "pin_id": str(pin.id), "place": {"before": str(uuid.uuid4())}},
        ]))
    assert page.purpose is None
    assert s.added == [] and s.flushed == 0


def test_foreign_ungrouped_pin_cannot_be_passed_directly_to_membership_writer():
    page = _page()
    pin = _pin(owner="someone-else")
    s = FakeSession(pages=[page], pins=[pin])
    with pytest.raises(PinNotFound, match="^Pin not found\\.$"):
        _run(page_writer.move_pin(s, owner=ME, pin=pin, to_page=page))
    assert pin.page_id is None and s.flushed == 0


def test_destination_title_is_refused_before_reading_or_mutating():
    s = FakeSession()
    with pytest.raises(PageValidationError, match="page_id"):
        _run(page_operations._resolve_destination(s, ME, {"page_title": "Overview"}))
    assert not s.statements


# ---------------------------------------------------------------------------
# 3. Ambiguity refuses
# ---------------------------------------------------------------------------

def test_two_pins_with_one_title_is_a_refusal_naming_both_with_ids():
    page = _page()
    a, b = _pin("ATP", page, 0), _pin("ATP", page, 1)
    s = FakeSession(pins=[a, b])
    with pytest.raises(AmbiguousTarget) as exc:
        _run(page_writer.resolve_pin(s, ME, title="ATP", within_page=page.id))
    ids = {c["pin_id"] for c in exc.value.candidates}
    assert ids == {str(a.id), str(b.id)}
    assert exc.value.kind == "pin"
    assert str(a.id) in str(exc.value) and "Rockwell" in str(exc.value)


def test_one_exact_title_resolves_and_a_unique_case_variant_resolves():
    page = _page()
    a = _pin("ATP", page, 0)
    s = FakeSession(pins=[a])
    assert _run(page_writer.resolve_pin(s, ME, title="ATP", within_page=page.id)) is a
    assert _run(page_writer.resolve_pin(s, ME, title="atp", within_page=ANY_PAGE)) is a


def test_an_exact_title_wins_over_case_variants():
    page = _page()
    exact, variant = _pin("ATP", page, 0), _pin("atp", page, 1)
    s = FakeSession(pins=[exact, variant])
    assert _run(page_writer.resolve_pin(s, ME, title="ATP", within_page=page.id)) is exact


def test_a_title_nobody_has_is_not_found_and_says_what_is_there():
    page = _page()
    s = FakeSession(pins=[_pin("Net sales", page)])
    with pytest.raises(PinNotFound) as exc:
        _run(page_writer.resolve_pin(s, ME, title="Units", within_page=page.id))
    assert "Net sales" in str(exc.value)


def test_a_page_title_that_is_ambiguous_by_case_is_refused_with_both_ids():
    a, b = _page("Aji Overview"), _page("AJI OVERVIEW")
    s = FakeSession(pages=[a, b])
    with pytest.raises(AmbiguousTarget) as exc:
        _run(page_writer.resolve_page_title(s, ME, "aji overview"))
    assert {c["page_id"] for c in exc.value.candidates} == {str(a.id), str(b.id)}


def test_a_pin_id_is_never_narrowed_by_page_but_always_by_owner():
    page = _page()
    a = _pin("ATP", page)
    s = FakeSession(pins=[a])
    got = _run(page_writer.resolve_pin(s, ME, pin_id=str(a.id), within_page=uuid.uuid4()))
    assert got is a
    where = _sql(s.statements[0]).split("WHERE")[1]
    assert "george.pins.created_by = " in where
    assert "page_id" not in where


def test_something_that_is_not_a_pin_id_is_not_found_not_a_crash():
    with pytest.raises(PinNotFound):
        _run(page_writer.resolve_pin(FakeSession(), ME, pin_id="not-a-uuid"))

"""
Pure tests for pin membership: moving a pin between pages, renaming a page.

NO DATABASE. What makes these two writes safe is decidable from the statements
they emit and the rules they apply before emitting them:

  1. Every statement is scoped to the caller. A move reads the pin WITH
     created_by in the WHERE; a rename updates WITH created_by in the WHERE.
     Another person's same-named page is untouched because the SQL cannot
     reach it, not because a check remembered to look.
  2. A move changes the label and nothing else. tool_calls, question,
     conversation_id and the run history are the same objects afterwards, and
     nothing was run.
  3. The page-name rule is the one create_pin applies — trim, collapse, keep
     case, refuse a case-only collision with ANOTHER page — so a page cannot be
     reached by rename that could not be reached by pinning.

test_pin_membership_live.py exercises the same functions against the real
database inside a rolled-back transaction.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import Select, Update
from sqlalchemy.dialects import postgresql

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from app.models.george_pin import GeorgePin                          # noqa: E402
from app.services.pin_runner import PinValidationError                # noqa: E402
from app.services.pin_writer import (                                 # noqa: E402
    UNSET,
    PageNotFound,
    PinNotFound,
    SimilarPageError,
    rename_page,
    update_pin,
)


def _run(coro):
    return asyncio.run(coro)


SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}
STOCK = {"tool": "get_stock", "arguments": {"location": "AJI BARN"}}

ME = "ice"


def _pin(page: str | None = "FFR Overview", calls=(SALES, STOCK)) -> GeorgePin:
    return GeorgePin(
        id=uuid.uuid4(),
        created_by=ME,
        created_at=datetime(2026, 9, 7, tzinfo=timezone.utc),
        title="Fame this week",
        question="How is Fame doing this week?",
        conversation_id=uuid.uuid4(),
        page=page,
        tool_calls=[dict(c) for c in calls],
        last_run_at=datetime(2026, 9, 7, 1, tzinfo=timezone.utc),
        last_ok_at=datetime(2026, 9, 7, 1, tzinfo=timezone.utc),
        last_status="ok",
    )


class _Scalar:
    def __init__(self, value): self._v = value
    def scalar_one_or_none(self): return self._v
    def scalar_one(self): return self._v
    def scalars(self): return self
    def all(self): return list(self._v)


class _Rows:
    def __init__(self, rowcount): self.rowcount = rowcount


class FakeSession:
    """
    Answers the three reads the writer makes and records every statement.

    Which read is which is decided from the statement's own column list, not
    from call order, so a reordering inside the writer does not silently make
    the fake answer the wrong question.
    """

    def __init__(self, pin: GeorgePin | None, pages: list[str], count: int = 1,
                 rowcount: int = 1) -> None:
        self.pin, self.pages, self.count, self.rowcount = pin, pages, count, rowcount
        self.statements: list = []
        self.flushed = 0

    async def execute(self, stmt):
        self.statements.append(stmt)
        if isinstance(stmt, Update):
            return _Rows(self.rowcount)
        assert isinstance(stmt, Select), type(stmt)
        first = stmt.column_descriptions[0]
        if first.get("entity") is GeorgePin and first["name"] == "GeorgePin":
            return _Scalar(self.pin)
        if first["name"] == "page":
            return _Scalar(self.pages)
        return _Scalar(self.count)

    async def flush(self):
        self.flushed += 1

    def updates(self) -> list[Update]:
        return [s for s in self.statements if isinstance(s, Update)]


def _compiled(stmt):
    return stmt.compile(dialect=postgresql.dialect())


# ---------------------------------------------------------------------------
# Moving a pin
# ---------------------------------------------------------------------------

def test_a_move_changes_the_page_and_nothing_else():
    pin = _pin()
    before = (pin.tool_calls, pin.question, pin.conversation_id,
              pin.last_run_at, pin.last_ok_at, pin.last_status, pin.title)
    s = FakeSession(pin, pages=["FFR Overview", "Purchasing"])

    moved = _run(update_pin(s, username=ME, pin_id=pin.id, page="Purchasing"))

    assert moved.row is pin
    assert pin.page == "Purchasing"
    after = (pin.tool_calls, pin.question, pin.conversation_id,
             pin.last_run_at, pin.last_ok_at, pin.last_status, pin.title)
    assert after == before
    # The calls are the same list, not a copy that happens to match.
    assert pin.tool_calls is before[0]
    assert pin.tool_calls == [SALES, STOCK]


def test_a_move_does_not_run_the_pin():
    """Membership is not a figure: nothing in the writer touches the runner."""
    pin = _pin()
    s = FakeSession(pin, pages=[])
    _run(update_pin(s, username=ME, pin_id=pin.id, page="Purchasing"))
    assert pin.last_run_at == datetime(2026, 9, 7, 1, tzinfo=timezone.utc)
    assert s.updates() == []          # an ORM attribute change, flushed once
    assert s.flushed == 1


def test_a_move_to_none_removes_the_pin_from_its_page_without_deleting_it():
    pin = _pin(page="FFR Overview")
    s = FakeSession(pin, pages=["FFR Overview"])
    moved = _run(update_pin(s, username=ME, pin_id=pin.id, page=None))
    assert moved.row.page is None
    assert moved.row.tool_calls == [SALES, STOCK]


def test_a_field_not_sent_is_left_alone():
    """None means ungrouped; UNSET means untouched. They must not be confused."""
    pin = _pin(page="FFR Overview")
    s = FakeSession(pin, pages=["FFR Overview"])
    _run(update_pin(s, username=ME, pin_id=pin.id, title="Fame, weekly"))
    assert pin.page == "FFR Overview"
    assert pin.title == "Fame, weekly"

    _run(update_pin(s, username=ME, pin_id=pin.id, page=UNSET, title=UNSET))
    assert pin.page == "FFR Overview"
    assert pin.title == "Fame, weekly"


def test_a_move_to_a_new_page_name_creates_that_page():
    """A page is its pins, so the first pin on a name is the page existing."""
    pin = _pin(page=None)
    s = FakeSession(pin, pages=["FFR Overview"])
    moved = _run(update_pin(s, username=ME, pin_id=pin.id, page="  Drink   Mix "))
    assert moved.row.page == "Drink Mix"      # normalised, case kept


def test_a_move_to_a_case_variant_of_another_page_is_refused():
    pin = _pin(page=None)
    s = FakeSession(pin, pages=["Purchasing"])
    with pytest.raises(SimilarPageError) as exc:
        _run(update_pin(s, username=ME, pin_id=pin.id, page="purchasing"))
    assert exc.value.existing_page == "Purchasing"
    assert exc.value.submitted_page == "purchasing"
    assert pin.page is None                   # nothing changed on refusal


def test_the_refusal_can_be_overridden_deliberately():
    pin = _pin(page=None)
    s = FakeSession(pin, pages=["Purchasing"])
    _run(update_pin(s, username=ME, pin_id=pin.id, page="purchasing",
                    allow_similar_page=True))
    assert pin.page == "purchasing"


def test_a_move_to_an_existing_page_joins_it():
    """An exact match is the same page, not a near-duplicate."""
    pin = _pin(page=None)
    s = FakeSession(pin, pages=["Purchasing"], count=4)
    moved = _run(update_pin(s, username=ME, pin_id=pin.id, page="Purchasing"))
    assert moved.row.page == "Purchasing"
    assert moved.pins_on_page == 4


def test_a_blank_title_is_refused():
    pin = _pin()
    s = FakeSession(pin, pages=[])
    with pytest.raises(PinValidationError):
        _run(update_pin(s, username=ME, pin_id=pin.id, title="   "))
    assert pin.title == "Fame this week"


def test_somebody_elses_pin_is_not_found():
    """The read is scoped; the fake returns nothing, exactly as the database would."""
    s = FakeSession(None, pages=[])
    with pytest.raises(PinNotFound):
        _run(update_pin(s, username="somebody-else", pin_id=uuid.uuid4(), page=None))


def test_the_pin_read_is_scoped_to_the_caller_in_sql():
    """
    Ownership is enforced in the QUERY, because george.pins has RLS off. The
    proof is the statement: created_by is in the WHERE, bound to the caller.
    """
    pin = _pin()
    s = FakeSession(pin, pages=[])
    _run(update_pin(s, username=ME, pin_id=pin.id, page="Purchasing"))
    read = s.statements[0]
    compiled = _compiled(read)
    assert "george.pins.created_by = " in str(compiled)
    assert ME in compiled.params.values()
    assert pin.id in compiled.params.values()


# ---------------------------------------------------------------------------
# Renaming a page
# ---------------------------------------------------------------------------

def test_a_rename_is_one_update_scoped_to_the_caller_and_the_exact_page():
    s = FakeSession(None, pages=["FFR Overview", "Purchasing"], rowcount=3)
    renamed = _run(rename_page(s, username=ME, old="FFR Overview", new="Fame"))

    assert renamed.page == "Fame"
    assert renamed.pins_moved == 3

    [stmt] = s.updates()
    compiled = _compiled(stmt)
    sql = str(compiled)
    assert sql.startswith("UPDATE george.pins SET page=")
    assert "george.pins.created_by = " in sql
    assert "george.pins.page = " in sql
    # Bound to THIS caller and THIS page; another person's "FFR Overview"
    # cannot match because their created_by is not in the parameters.
    assert compiled.params == {
        "page": "Fame", "created_by_1": ME, "page_1": "FFR Overview",
    }


def test_a_rename_updates_only_the_page_column():
    """The calls and history of every pin on the page ride along untouched."""
    s = FakeSession(None, pages=["FFR Overview"], rowcount=1)
    _run(rename_page(s, username=ME, old="FFR Overview", new="Fame"))
    [stmt] = s.updates()
    assert set(_compiled(stmt).params) == {"page", "created_by_1", "page_1"}


def test_a_rename_to_a_case_variant_of_another_page_is_refused():
    s = FakeSession(None, pages=["FFR Overview", "Purchasing"])
    with pytest.raises(SimilarPageError) as exc:
        _run(rename_page(s, username=ME, old="FFR Overview", new="PURCHASING"))
    assert exc.value.existing_page == "Purchasing"
    assert s.updates() == []


def test_a_rename_that_only_changes_this_pages_case_is_allowed():
    """The old name is about to stop existing, so it cannot be collided with."""
    s = FakeSession(None, pages=["FFR Overview", "Purchasing"], rowcount=2)
    renamed = _run(rename_page(s, username=ME, old="FFR Overview", new="FFR OVERVIEW"))
    assert renamed.page == "FFR OVERVIEW"
    assert renamed.pins_moved == 2


def test_a_rename_normalises_like_create_does():
    s = FakeSession(None, pages=["FFR Overview"], rowcount=1)
    renamed = _run(rename_page(s, username=ME, old=" FFR   Overview ", new="  Drink   Mix "))
    assert renamed.page == "Drink Mix"
    assert _compiled(s.updates()[0]).params["page_1"] == "FFR Overview"


def test_a_rename_of_a_page_the_caller_does_not_have_is_not_found():
    """
    rowcount 0 is what the database reports when the WHERE matched nothing —
    including when the page exists but belongs to somebody else.
    """
    s = FakeSession(None, pages=[], rowcount=0)
    with pytest.raises(PageNotFound):
        _run(rename_page(s, username=ME, old="Somebody Elses Page", new="Mine"))


def test_ungrouped_cannot_be_renamed_and_a_page_cannot_be_renamed_to_nothing():
    s = FakeSession(None, pages=["FFR Overview"])
    with pytest.raises(PageNotFound):
        _run(rename_page(s, username=ME, old="   ", new="Fame"))
    with pytest.raises(PinValidationError):
        _run(rename_page(s, username=ME, old="FFR Overview", new="   "))
    assert s.updates() == []


# ---------------------------------------------------------------------------
# The routes
# ---------------------------------------------------------------------------

def test_the_pages_routes_are_declared_before_the_pin_id_route():
    """
    FastAPI matches in declaration order. /pages/{page} declared after
    /{pin_id} would be tried as a pin id first and 422 on "pages".
    """
    from app.api.v1.routes.george_pins import router

    order = [(r.path, tuple(sorted(r.methods))) for r in router.routes]
    rename = order.index(("/pages/{page}", ("PATCH",)))
    patch_pin = order.index(("/{pin_id}", ("PATCH",)))
    list_pages = order.index(("/pages", ("GET",)))
    delete_pin = order.index(("/{pin_id}", ("DELETE",)))
    assert rename < patch_pin
    assert list_pages < delete_pin


def test_the_patch_body_tells_null_from_absent():
    """A page sent as null is ungrouped; a page not sent is left alone."""
    from app.api.v1.routes.george_pins import PinUpdate

    assert "page" in PinUpdate.model_validate({"page": None}).model_fields_set
    assert "page" not in PinUpdate.model_validate({"title": "x"}).model_fields_set

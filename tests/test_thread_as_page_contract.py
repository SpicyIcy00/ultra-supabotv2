"""
A thread is already a page (P2.a) — the two HTTP shapes that make it one.

NO DATABASE, NO MODEL. Both halves are decidable without either:

  1. KEEPING A THREAD IS ONE ACT. POST /george/pages goes through
     page_operations.build_page — the SAME service function George's
     `create_page` reaches through the injected writer — whether or not it
     carries sections. One path, so the page and its pins commit together or
     not at all, and the button cannot grow a second set of bounds. Every
     refusal the service raises has an HTTP code here and a sentence a person
     can act on.
  2. A THREAD CAN FIND ITS PAGE. GET /george/pins takes `thread_id` and joins
     on the conversations IN that thread, scoped to the caller — never on a
     title, never on a guess. Two scopes on one listing is refused rather than
     one of them silently winning.

AND THE BOUNDS ARE ONE SET, in three languages: what the client draws its plan
against (room/keeping.ts), what the service refuses on, and what metrics.yaml
tells the model. A number that disagrees is a 422 the person could have read
before they pressed anything.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.routes import george_pages, george_pins
from app.core.database import get_db
from app.services import page_operations, page_writer, pin_writer
from app.services.page_operations import PageResult
from app.services.page_writer import (
    AmbiguousTarget,
    PageQuotaError,
    PageValidationError,
    PinNotFound,
    SimilarPageError,
)
from app.services.pin_runner import PinValidationError
from app.services.pin_writer import PinQuotaError

ROOT = Path(__file__).resolve().parents[1]
KEEPING_TS = ROOT / "frontend" / "src" / "room" / "keeping.ts"

ME = SimpleNamespace(username="ice", role="admin")
THREAD = uuid.UUID("11111111-1111-1111-1111-111111111111")
PAGE_ID = uuid.UUID("aaaaaaaa-0000-0000-0000-00000000aa11")

SALES = {"tool": "get_sales", "arguments": {"metric": "net_sales", "date_range": "last_week"}}


def _summary(title: str = "how are we doing", n: int = 1) -> dict:
    return {
        "page_id": str(PAGE_ID), "title": title, "purpose": None,
        "created_at": "2026-09-15T09:02:00+00:00",
        "updated_at": "2026-09-15T09:02:00+00:00",
        "analyses": [], "analysis_count": n,
    }


class Session:
    """Enough of a session for a route whose every read is stubbed out."""

    async def execute(self, *a, **k):  # pragma: no cover - never reached here
        raise AssertionError("no route under test may read the database directly")


@pytest.fixture()
def pages_client(monkeypatch):
    """The pages router, with the service function recorded rather than run."""
    seen: list[dict] = []

    async def fake_build(db, **kwargs):
        seen.append(kwargs)
        return PageResult(page=_summary(kwargs["title"], len(kwargs.get("analyses") or [])),
                          operations=[])

    monkeypatch.setattr(page_operations, "build_page", fake_build)
    app = FastAPI()
    app.include_router(george_pages.router, prefix="/pages")
    app.dependency_overrides[get_db] = lambda: Session()
    app.dependency_overrides[george_pages._page_user] = lambda: ME
    with TestClient(app) as client:
        yield client, seen


@pytest.fixture()
def refusing_pages_client(monkeypatch):
    """The same router, with build_page raising whatever the test hands it."""
    box: dict = {}

    async def fake_build(db, **kwargs):
        raise box["raises"]

    monkeypatch.setattr(page_operations, "build_page", fake_build)
    app = FastAPI()
    app.include_router(george_pages.router, prefix="/pages")
    app.dependency_overrides[get_db] = lambda: Session()
    app.dependency_overrides[george_pages._page_user] = lambda: ME
    with TestClient(app) as client:
        yield client, box


# ---------------------------------------------------------------------------
# 1. Keeping a thread is ONE act
# ---------------------------------------------------------------------------

def test_a_create_with_sections_reaches_the_same_service_george_does(pages_client):
    client, seen = pages_client
    body = {
        "title": "how are we doing",
        "analyses": [{"title": "how are we doing", "tool_calls": [SALES]}],
        "question": "how are we doing",
        "conversation_id": str(THREAD),
    }
    r = client.post("/pages", json=body)
    assert r.status_code == 201, r.text
    assert len(seen) == 1
    got = seen[0]
    # The calls arrive exactly as they were sent. Nothing is rebuilt, reordered
    # or filled in on the way through the route.
    assert got["analyses"] == [{"title": "how are we doing", "tool_calls": [SALES]}]
    assert got["owner"] == "ice"
    assert got["question"] == "how are we doing"
    assert got["conversation_id"] == THREAD
    # The page the caller is told about is the page the service built.
    assert r.json()["id"] == str(PAGE_ID)
    assert r.json()["pins"] == 1


def test_an_empty_create_takes_the_same_path(pages_client):
    """One path, not two: the route has no branch a bound could hide behind."""
    client, seen = pages_client
    r = client.post("/pages", json={"title": "Empty", "purpose": "Hand it to George."})
    assert r.status_code == 201, r.text
    assert len(seen) == 1
    assert seen[0]["analyses"] is None
    assert seen[0]["purpose"] == "Hand it to George."
    assert r.json()["pins"] == 0


def test_the_route_never_writes_as_george(pages_client):
    """
    A person pressing a button is not George. `actor` is left at the service's
    default, USER, which is what the audit row records — and a page event that
    said `george` would answer "who moved this" with the wrong name.
    """
    client, seen = pages_client
    client.post("/pages", json={"title": "Mine"})
    assert "actor" not in seen[0]
    assert page_writer.USER.kind == "user"


def test_an_analysis_may_name_an_existing_pin_instead_of_calls(pages_client):
    client, seen = pages_client
    pin = uuid.uuid4()
    r = client.post("/pages", json={"title": "Both", "analyses": [{"pin_id": str(pin)}]})
    assert r.status_code == 201, r.text
    # exclude_none: a pin_id entry must not arrive carrying tool_calls=None,
    # which the service reads as "neither was given". The id itself arrives
    # parsed, which resolve_pin takes (`uuid.UUID(str(pin_id))`).
    assert seen[0]["analyses"] == [{"pin_id": pin}]


@pytest.mark.parametrize("raises,code", [
    (PageValidationError("You already have a page called 'Monday'."), 422),
    (PinValidationError("get_sales.metric: 'gross' is no longer a valid value."), 422),
    (PageQuotaError("You already have 50 pages, the maximum."), 409),
    (PinQuotaError("You have 200 pins and the maximum is 200."), 409),
    (PinNotFound("'x' is not a pin id."), 404),
    (AmbiguousTarget("analysis", "sales",
                     [{"title": "sales", "pin_id": "p1"}, {"title": "Sales", "pin_id": "p2"}]), 409),
])
def test_every_service_refusal_has_a_code_and_keeps_its_sentence(
    refusing_pages_client, raises, code,
):
    client, box = refusing_pages_client
    box["raises"] = raises
    r = client.post("/pages", json={"title": "x", "analyses": [{"tool_calls": [SALES]}]})
    assert r.status_code == code, r.text
    # The service's own words, not a paraphrase: the sentence is written to be
    # read by the person who tried.
    assert r.json()["detail"] == str(raises)


def test_the_near_duplicate_refusal_keeps_the_shape_the_client_recognises(
    refusing_pages_client,
):
    client, box = refusing_pages_client
    box["raises"] = SimilarPageError(existing_page="Monday Morning", submitted_page="monday morning")
    r = client.post("/pages", json={"title": "monday morning"})
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["existing_page"] == "Monday Morning"
    assert detail["submitted_page"] == "monday morning"
    assert detail["message"]


# ---------------------------------------------------------------------------
# 2. A thread can find its page
# ---------------------------------------------------------------------------

@pytest.fixture()
def pins_client(monkeypatch):
    """The pins router, with the thread resolution and the listing stubbed."""
    seen: dict = {}
    conversations = [uuid.uuid4(), uuid.uuid4()]

    async def fake_conversations(db, username, thread_id):
        seen["resolved"] = (username, thread_id)
        return list(conversations)

    class Result:
        def scalars(self):
            return self

        def all(self):
            return []

    class Recording(Session):
        async def execute(self, statement, *a, **k):
            seen["statement"] = str(statement)
            return Result()

    monkeypatch.setattr(george_pins, "conversations_in_thread", fake_conversations)
    app = FastAPI()
    app.include_router(george_pins.router, prefix="/pins")
    app.dependency_overrides[get_db] = lambda: Recording()
    app.dependency_overrides[george_pins._pin_user] = lambda: ME
    with TestClient(app) as client:
        yield client, seen, conversations


def test_a_thread_scope_joins_on_the_conversations_in_that_thread(pins_client):
    client, seen, conversations = pins_client
    r = client.get("/pins", params={"thread_id": str(THREAD)})
    assert r.status_code == 200, r.text
    # Resolved for the CALLER. A thread id is not a permission.
    assert seen["resolved"] == ("ice", THREAD)
    statement = seen["statement"]
    assert "created_by" in statement
    assert "conversation_id IN" in statement


def test_a_thread_nobody_has_a_turn_in_is_an_empty_list_and_not_a_404(monkeypatch):
    """
    An empty answer is a real one: this thread is kept nowhere. A 404 would say
    whether somebody else's thread exists, which the caller is not entitled to.
    """
    async def none(db, username, thread_id):
        return []

    monkeypatch.setattr(george_pins, "conversations_in_thread", none)
    app = FastAPI()
    app.include_router(george_pins.router, prefix="/pins")
    app.dependency_overrides[get_db] = lambda: Session()
    app.dependency_overrides[george_pins._pin_user] = lambda: ME
    with TestClient(app) as client:
        r = client.get("/pins", params={"thread_id": str(THREAD)})
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.parametrize("params", [
    {"thread_id": str(THREAD), "ungrouped": "true"},
    {"thread_id": str(THREAD), "page_id": str(PAGE_ID)},
    {"thread_id": str(THREAD), "page": "Monday"},
    {"page": "Monday", "ungrouped": "true"},
])
def test_two_scopes_on_one_listing_are_refused_rather_than_one_winning(pins_client, params):
    client, _, _ = pins_client
    r = client.get("/pins", params=params)
    assert r.status_code == 422
    # Both are named, so the caller can see which two they sent.
    for name in params:
        assert name in r.json()["detail"]


def test_the_thread_resolution_is_scoped_to_the_caller_and_hides_hidden_turns():
    """
    The SQL itself, because this is the only statement in the new path that
    decides whose data is read. Same clause as OWN_CONVERSATION_SQL, which is
    what `thread_continuable` already gates on.
    """
    from app.services.thread_access import OWN_CONVERSATION_SQL, THREAD_CONVERSATIONS_SQL

    for clause in ("COALESCE(c.thread_id, c.id) = :t", "c.user_id = :u", "c.hidden_at IS NULL"):
        assert clause in THREAD_CONVERSATIONS_SQL
        assert clause in OWN_CONVERSATION_SQL


# ---------------------------------------------------------------------------
# 3. The bounds are one set
# ---------------------------------------------------------------------------

def _ts_const(name: str) -> int:
    source = KEEPING_TS.read_text(encoding="utf-8")
    found = re.search(rf"export const {name} = (\d+);", source)
    assert found, f"{name} is not declared in {KEEPING_TS.name}"
    return int(found.group(1))


def test_the_client_plans_against_the_service_bounds_and_not_its_own():
    """
    room/keeping.ts draws what would be kept and what would be left off, with
    the reason, BEFORE the request. A bound it holds loosely is a refusal
    nobody could have predicted; one it holds tightly is a section silently
    dropped. Both are held here, by value.
    """
    assert _ts_const("MAX_SECTIONS") == page_operations.MAX_ANALYSES_PER_BUILD
    assert _ts_const("MAX_CALLS_PER_SECTION") == pin_writer.MAX_TOOL_CALLS_PER_PIN


def test_the_same_bounds_are_what_the_model_is_told():
    """The definitions are the third copy, and `create_page` reads them at runtime."""
    from tools._common import load_defs, req

    defs = load_defs()
    assert int(req(defs, "pages.workshop.max_analyses_per_build")) \
        == page_operations.MAX_ANALYSES_PER_BUILD

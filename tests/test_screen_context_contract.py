"""
W1.4 — Bob is alive on every page, and each page says what it is.

A BI screen used to send its access key and nothing else ("warehouse"), so a
question about what was on screen had no referent. The screen now registers
what it IS (key, name, tab) and what it SHOWS (subjects by name, a window) —
never a figure — and the route turns that into the one `page_context`
sentence the loop already reads out. A kept page still binds `page_scope`,
the identity that injects view_page and edit_page; this is not an identity.
"""

from __future__ import annotations

import inspect

import pytest
from pydantic import ValidationError

from app.api.v1.routes import bob as route
from app.api.v1.routes.bob import AskRequest, ScreenFrame, screen_context


def test_a_screen_is_named_with_its_tab_subjects_and_window():
    screen = ScreenFrame(key="warehouse", label="Warehouse", view="Replenishment Reports",
                         subjects=["Rockwell", "Greenhills"],
                         window={"start": "2026-09-01", "end": "2026-09-21"})
    assert screen_context(screen) == (
        "Warehouse (the Replenishment Reports tab, showing Rockwell and Greenhills, "
        "for 2026-09-01 to 2026-09-21)")
    # The loop's own sentence reads it whole: "[The user is on the ... page.]"
    assert screen_context(ScreenFrame(key="packing", label="Packing")) == "Packing"
    one_day = ScreenFrame(key="dashboard", label="Dashboard",
                          window={"start": "2026-09-22", "end": "2026-09-22"})
    assert screen_context(one_day) == "Dashboard (for 2026-09-22)"


def test_past_the_bound_the_rest_are_counted_not_named():
    names = ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"]
    said = screen_context(ScreenFrame(key="dashboard", label="Dashboard", subjects=names))
    assert said == "Dashboard (showing A1, B1, C1, D1, E1, F1 and 2 more)"


@pytest.mark.parametrize("figure", ["₱12,400", "12.5%", "1,234", "  42 ", "$9"])
def test_a_figure_is_refused_as_a_subject(figure):
    with pytest.raises(ValidationError):
        ScreenFrame(key="dashboard", label="Dashboard", subjects=[figure])


def test_the_request_bounds_the_screen():
    with pytest.raises(ValidationError):
        ScreenFrame(key="Ware House!", label="x")
    with pytest.raises(ValidationError):
        ScreenFrame(key="w", label="x", window={"start": "2026-09-21", "end": "2026-09-01"})
    too_many = [f"Store {chr(65 + i)}" for i in range(route._DESK_MAX_DRAWN + 1)]
    with pytest.raises(ValidationError):
        ScreenFrame(key="w", label="x", subjects=too_many)
    # A legacy caller is unaffected: a name alone, no screen.
    legacy = AskRequest(question="hi", page_context="warehouse")
    assert legacy.screen is None
    both = AskRequest(question="hi", screen={"key": "warehouse", "label": "Warehouse"})
    assert both.screen.label == "Warehouse"


def test_the_route_tells_the_loop_the_screen_in_place_of_the_name():
    src = inspect.getsource(route.ask)
    assert "screen_context(request.screen)" in src
    # And a kept page's identity still travels on its own field.
    assert "request.page_scope" in src


def test_the_client_bounds_the_subjects_by_the_same_number():
    import re
    from pathlib import Path

    here = (Path(__file__).resolve().parents[1] / "frontend/src/components/bob/here.ts").read_text(encoding="utf-8")
    m = re.search(r"export const MAX_SCREEN_SUBJECTS = (\d+);", here)
    assert m and int(m.group(1)) == route._DESK_MAX_DRAWN


def test_the_page_scope_route_is_what_it_was():
    """A kept page asked from binds the reader and the writer to its id — W1.4's
    'reads and edits that page without leaving it' rides on this path."""
    src = inspect.getsource(route.ask)
    assert "_resolve_scope(user.username, request.page_scope)" in src
    assert "_page_reader(user.username, page_scope[\"page_id\"])" in src
    assert "_PageWriter(" in src

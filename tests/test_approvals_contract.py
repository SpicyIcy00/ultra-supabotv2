"""
The approval queue's wire shape, held from both ends.

NO DATABASE, NO API. The Pydantic model is read from the route module and the
TypeScript interface is read as text, so this checks the one thing that has no
runtime guard anywhere: `types/workflows.ts` mirrors `ApprovalOut` field for
field. There is no validation on the client — drift shows up as an undefined
field in the UI rather than an error — which is exactly why it is worth a test.

WHY THIS QUEUE AND NOT ANOTHER. UI rule 5 reserves one colour for "needs you",
and metrics.yaml names its only occupant: a workflow version waiting to be
promoted past the backtest gate. A field silently lost between these two files
is a row that renders blank in the one place the app is allowed to shout.

`blocked_on` gets its own assertions. The server distinguishes "never
backtested" from "backtested and waiting for an administrator", and those have
different fixes — run a backtest, or go and promote it. The client prints the
string verbatim, so the distinction survives only if the field does.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytest.importorskip("pydantic", reason="the route module defines Pydantic models")

from app.api.v1.routes.george_workflows import ApprovalOut  # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_TS = _ROOT / "frontend" / "src" / "types" / "workflows.ts"


def _ts_interface_fields(source: str, name: str) -> set[str]:
    """
    The field names declared in one exported TS interface.

    Brace-counted rather than regex-matched to the closing brace, so a nested
    object type in a future field cannot silently end the block early.
    """
    start = re.search(rf"export interface {name} \{{", source)
    assert start, f"no `export interface {name}` in {_TS.name}"

    depth = 0
    body_start = start.end() - 1
    for i in range(body_start, len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                body = source[body_start + 1:i]
                break
    else:  # pragma: no cover - unbalanced braces would be a syntax error too
        pytest.fail(f"unbalanced braces in {name}")

    # Strip block comments before scanning: the doc comments in this file are
    # long and contain colons, and one of them would otherwise read as a field.
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    # Depth-1 declarations only.
    fields: set[str] = set()
    depth = 0
    for line in body.splitlines():
        stripped = line.strip()
        if depth == 0:
            m = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\??\s*:", stripped)
            if m:
                fields.add(m.group(1))
        depth += stripped.count("{") - stripped.count("}")
    return fields


@pytest.fixture(scope="module")
def ts_source() -> str:
    assert _TS.exists(), f"{_TS} is missing — the client types are part of the contract"
    return _TS.read_text(encoding="utf-8")


def test_typescript_mirrors_the_pydantic_model(ts_source: str) -> None:
    """Same fields, both directions. Neither file may grow or lose one alone."""
    assert _ts_interface_fields(ts_source, "Approval") == set(ApprovalOut.model_fields)


def test_blocked_on_is_carried(ts_source: str) -> None:
    """
    The reason a row is in the queue, in the words a person needs to act on.

    Without it the rail can say a version is waiting and not say what for, and
    the two blocking reasons have different fixes.
    """
    assert "blocked_on" in ApprovalOut.model_fields
    assert "blocked_on" in _ts_interface_fields(ts_source, "Approval")


def test_backtested_at_is_nullable_on_both_sides(ts_source: str) -> None:
    """
    A version with no backtest is IN the queue, not absent from it — so null is
    a real value here, and a client typing it as a plain string would render
    "null" as a date for exactly the rows that most need a person.
    """
    annotation = str(ApprovalOut.model_fields["backtested_at"].annotation)
    assert "None" in annotation or "Optional" in annotation, annotation
    assert re.search(r"backtested_at:\s*string\s*\|\s*null", ts_source)


def test_client_does_not_invent_fields(ts_source: str) -> None:
    """
    Every TS field exists on the server.

    The failure this catches is a UI built around a field somebody expected the
    endpoint to return — it renders undefined forever and nothing errors.
    """
    extra = _ts_interface_fields(ts_source, "Approval") - set(ApprovalOut.model_fields)
    assert not extra, f"types/workflows.ts declares fields ApprovalOut does not return: {sorted(extra)}"

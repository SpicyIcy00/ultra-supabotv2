"""
The `post` frame: the one key a live turn may be reconciled with the river by.

NO DATABASE, NO API. The loop emits `post` with the ids of the two posts it
wrote; the client keeps them on the turn and drops its live copy the moment a
fetched post carries the same id. Nothing else — not the question text, not
the answer text, not a timestamp — may be used to decide that two things are
one exchange. So the field names have to agree byte for byte between
agent/loop.py, which writes the frame, and types/george.ts, which reads it,
and a field on one side and not the other must fail here rather than render
as an undefined that quietly disables the reconciliation.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from tests.test_loop_correction_contract import drive, frames_of  # noqa: E402
from tests.test_river_contract import _ts_interface_fields        # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_TS = _ROOT / "frontend" / "src" / "types" / "george.ts"
_HOOK = _ROOT / "frontend" / "src" / "hooks" / "useGeorgeStream.ts"


@pytest.fixture(scope="module")
def ts() -> str:
    return _TS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def hook() -> str:
    return _HOOK.read_text(encoding="utf-8")


def test_the_post_frame_and_the_client_type_carry_the_same_fields(monkeypatch, ts):
    frames, _ = drive(monkeypatch, ["Net sales were up."], question="sales?")
    posts = frames_of(frames, "post")
    assert len(posts) == 1, "the loop emits exactly one post frame per turn"
    assert set(posts[0]) == _ts_interface_fields(ts, "PostFrame")


def test_the_saved_frame_and_the_client_type_carry_the_same_fields(ts):
    # The frame is built inline in the loop; read its keys from the source
    # rather than driving a save, which would need a workflow writer.
    source = (_ROOT / "agent" / "loop.py").read_text(encoding="utf-8")
    m = re.search(r'yield _sse\("saved", \{(.+?)\n\s*\}\)', source, re.S)
    assert m, "no `saved` frame in agent/loop.py"
    keys = set(re.findall(r'^\s*"([a-z_]+)":', m.group(1), re.M))
    assert keys == _ts_interface_fields(ts, "SavedFrame")


def test_the_client_handles_every_frame_the_loop_emits(hook):
    source = (_ROOT / "agent" / "loop.py").read_text(encoding="utf-8")
    emitted = set(re.findall(r'_sse\("([a-z_]+)"', source))
    # `answer_reset` is emitted through _reset_answer; the literal is there too.
    handled = set(re.findall(r"case '([a-z_]+)':", hook))
    missing = emitted - handled
    assert not missing, (
        f"the loop emits {sorted(missing)} and useGeorgeStream has no case for "
        f"them — a frame the client drops is a fact the UI cannot show"
    )

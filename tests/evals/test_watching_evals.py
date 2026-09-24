"""
W4.4 — the watches page, LIVE MODEL, OPT IN.

Two turns, in order, over one world:

  switch_on_the_morning   "Switch on the morning question." — the one thing the
                          owner asked for. Bob switches THAT question on
                          (`set_standing_question switch_on`) and writes
                          nothing else; the morning is on afterwards.
  what_is_watching        "What is watching?" — a read, no write, and the
                          answer AGREES WITH THE PAGE: every slot Bob says is
                          the slot `watching.page_for` puts on the row, and
                          the morning he just switched on reads as on in both.

WHY THE SECOND ONE MATTERS. The page and Bob read the same two tables through
different code — `watching.py` for the page, `self_reader.read_automations` for
him — so they can disagree about whether a thing is on or when it runs, and
nobody would find out. The page is the surface for what he can already do, and
"the answer matches what the page shows" is the card's own acceptance.

Every writer is a fake that records the request and answers as the committed
write would, so nothing reaches george.*.

    GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest \
        tests/evals/test_watching_evals.py -q -s
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services import watches, watching
from tests.evals.harness import required, run_turn, say, turn_usd
from tools._common import load_defs, req

DEFS = load_defs()
NOW = datetime(2026, 9, 23, 8, 0, tzinfo=timezone.utc)
MORNING = req(DEFS, "morning")["question"]
DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
WRITES = {"pin_answer", "save_workflow", "create_page", "edit_page", "record_belief",
          "set_standing_question", "set_watch"}


@pytest.fixture(autouse=True)
def _live():
    required()


# ---------------------------------------------------------------------------
# One world, held as the rows both readers read
# ---------------------------------------------------------------------------

class _Session:
    """No database: the page's three reads all come back empty here."""

    async def execute(self, stmt, params=None):
        class _R:
            def mappings(self):
                return self

            def first(self):
                return {"checks": 0, "spoke": 0, "newest": None}

        sql = " ".join(str(stmt).split())
        if "count(*) AS checks" in sql:
            return _R()

        class _None:
            def mappings(self):
                return self

            def first(self):
                return None

        return _None()


class World:
    """One standing question and one watch, as their tables hold them."""

    def __init__(self) -> None:
        #: Every automations read Bob made, kept so the case can hold his
        #: reading against the page's over the same rows.
        self.read: list[dict] = []
        self.question = SimpleNamespace(
            id=uuid.uuid4(), owner="bob-eval", question=MORNING,
            instructions=["Show more of Rockwell."], kind="daily", hour=8, minute=0,
            days_of_week=None, enabled=False, last_run_at=None, last_status=None,
            last_error=None, last_thread_id=None,
        )
        self.watch = SimpleNamespace(
            id=uuid.uuid4(), owner="bob-eval", condition=sorted(watches.conditions(DEFS))[0],
            direction="down", stores=None, kind="weekly", hour=8, minute=0,
            days_of_week=[0], enabled=False,
            backtest={"days_checked": 60, "days_fired": 9,
                      "definitions_version": str(req(DEFS, "version"))},
            last_state=None, last_checked_at=None, last_fired_at=None,
            last_status=None, last_error=None,
        )

    # -- the page's reading -------------------------------------------------
    def page(self) -> list[dict]:
        s = _Session()
        return [asyncio.run(watching.question_row(s, self.question)),
                asyncio.run(watching.watch_row(s, self.watch, DEFS))]

    # -- what Bob reads -----------------------------------------------------
    async def automations(self) -> dict:
        out = await self._automations()
        self.read.append(out)
        return out

    async def _automations(self) -> dict:
        """`view_automations`, off THESE rows — the shape self_reader builds."""
        q, w = self.question, self.watch
        when = f"{q.hour:02d}:{q.minute:02d}"
        when = (f"every day at {when}" if q.kind != "weekly" or not q.days_of_week
                else ", ".join(DAY_NAMES[d] for d in sorted(q.days_of_week)) + f" at {when}")
        at = f"{w.hour:02d}:{w.minute:02d}"
        schedule = (f"every day at {at}" if w.kind != "weekly" or not w.days_of_week
                    else ", ".join(DAY_NAMES[d] for d in sorted(w.days_of_week)) + f" at {at}")
        back = w.backtest or {}
        rows = [
            {"what": q.question, "id": str(q.id),
             "state": ("asked " + when) if q.enabled else "not being asked",
             "when": q.last_run_at,
             "by": "; ".join(q.instructions) if q.instructions else "never asked yet"},
            {"what": f"watching {w.direction}: {w.condition} — any shop", "id": str(w.id),
             "condition": w.condition, "where": "any shop", "schedule": schedule,
             "would_have_fired": f"{back.get('days_fired')} of the last {back.get('days_checked')} days",
             "state": ("watching, quiet" if w.enabled
                       else "ready — not switched on" if back else "not backtested yet"),
             "when": w.last_checked_at,
             "by": f"would have fired {back.get('days_fired')} of the last "
                   f"{back.get('days_checked')} days"},
        ]
        return {"rows": rows, "meta": {"source_table": "george.standing_questions",
                                       "filters_applied": ["owner = the signed-in user"],
                                       "snapshot_timestamp": NOW.isoformat()}}

    # -- the writers the web process would inject ---------------------------
    def standing_writer(self):
        world = self

        class _S:
            async def apply(self, action, fields):
                row = world.question
                if action in ("switch_on", "switch_off"):
                    which = fields.get("which")
                    if which and which != str(row.id):
                        raise ValueError("No standing question of yours has that id.")
                    row.enabled = action == "switch_on"
                elif action == "create":
                    raise ValueError("There is already a standing question for that.")
                out = {"id": str(row.id), "question": row.question,
                       "when": f"{row.hour:02d}:{row.minute:02d}",
                       "state": "asked on schedule" if row.enabled else "switched off"}
                return {"rows": [out], "meta": {
                    "source_table": "george.standing_questions",
                    "filters_applied": ["owner = the signed-in user"],
                    "snapshot_timestamp": None, "wrote": action,
                    "enabled": bool(row.enabled)}}
        return _S()

    def watch_writer(self):
        world = self

        class _W:
            async def apply(self, action, fields):
                row = world.watch
                if action in ("switch_on", "switch_off"):
                    refusal = watches.why_not_on(row, DEFS) if action == "switch_on" else None
                    if refusal:
                        raise ValueError(refusal)
                    row.enabled = action == "switch_on"
                return {"rows": [{"id": str(row.id), "condition": row.condition,
                                  "enabled": bool(row.enabled)}],
                        "meta": {"source_table": "george.watches",
                                 "filters_applied": ["owner = the signed-in user"],
                                 "snapshot_timestamp": None, "wrote": action}}
        return _W()

    def injected(self) -> dict:
        return {"standing_writer": self.standing_writer(),
                "watch_writer": self.watch_writer(),
                "automations_reader": self.automations}


def _calls(turn, tool):
    return [c for c in turn.calls if c.get("tool") == tool and not c.get("error")]


def _wrote(turn) -> set[str]:
    return {c["tool"] for c in turn.calls if c.get("tool") in WRITES and not c.get("error")}


def _say_turn(name: str, turn, seconds: float) -> None:
    say(f"\n== {name}: {seconds:.1f} s · {turn.done.get('iterations')} rounds · "
        f"${turn_usd(turn):.4f} · calls {[c.get('tool') for c in turn.calls]}")
    say(f"   -> {turn.answer[:400]!r}")
    for c in turn.calls:
        if c.get("error"):
            say(f"   refused {c['tool']}: {str(c['error'])[:200]}")


# ---------------------------------------------------------------------------
# The two turns
# ---------------------------------------------------------------------------

def test_watching(monkeypatch):
    world = World()
    history: list[dict] = []
    failures: list[str] = []

    # -- 1. the one thing the owner asked for -------------------------------
    t0 = time.monotonic()
    turn = run_turn(monkeypatch, "Switch on the morning question.",
                    history=history, **world.injected())
    _say_turn("switch_on_the_morning", turn, time.monotonic() - t0)
    on = [c for c in _calls(turn, "set_standing_question")
          if (c.get("arguments") or {}).get("action") == "switch_on"]
    if not on:
        failures.append(f"switch: no switch_on ({[c.get('tool') for c in turn.calls]})")
    if _wrote(turn) - {"set_standing_question"}:
        failures.append(f"switch: also wrote {_wrote(turn) - {'set_standing_question'}}")
    if not world.question.enabled:
        failures.append("switch: the morning is still off")
    # Rule 7 is not bypassed anywhere: the watch is untouched and still off.
    if world.watch.enabled:
        failures.append("switch: the watch was switched on too")
    say(f"   morning on: {world.question.enabled} · watch on: {world.watch.enabled}")

    history += [
        {"role": "user", "text": "Switch on the morning question.", "tool_calls": []},
        {"role": "bob", "text": turn.answer[:9000],
         "tool_calls": [{"tool": c["tool"], "arguments": c.get("arguments") or {}}
                        for c in turn.calls if not c.get("error") and c["tool"] != "compose"]},
    ]

    # -- 2. what is watching, against what the page shows -------------------
    t0 = time.monotonic()
    turn2 = run_turn(monkeypatch, "What is watching?", history=history, **world.injected())
    _say_turn("what_is_watching", turn2, time.monotonic() - t0)
    if not _calls(turn2, "view_automations"):
        failures.append(f"watching: not read ({[c.get('tool') for c in turn2.calls]})")
    if _wrote(turn2):
        failures.append(f"watching: wrote {_wrote(turn2)}")

    page = world.page()
    said = turn2.answer.lower()
    say("   the page shows:")
    for row in page:
        say(f"     {row['family']:<9} on={row['on']} when={row['when']!r} state={row['state']!r}")

    # 1. THE TWO READERS AGREE, which is the drift this case exists to catch:
    # the page reads `watching.py`, he reads the automations read, and nobody
    # would find out if they came apart on a slot or a switch.
    # The world records what the automations read handed him; the harness
    # captures only the READ dispatcher's tools, and this is an injected one.
    if not world.read:
        failures.append("watching: the automations read was never made")
    read = (world.read[-1]["rows"] if world.read else [])
    by_id = {r.get("id"): r for r in read}
    for row in page:
        his = by_id.get(row["id"])
        if his is None:
            failures.append(f"watching: {row['asks']!r} is on the page and not in what he read")
            continue
        state = str(his.get("state") or "")
        his_on = state.startswith("asked ") or state.startswith("watching")
        if his_on != row["on"]:
            failures.append(f"watching: the page says on={row['on']} and he read {state!r}")
        at = row["when"].split(" at ")[-1]
        if at not in state and at not in str(his.get("schedule") or ""):
            failures.append(f"watching: the page says {row['when']!r}, he read {state!r}")

    # 2. HE INVENTS NO SLOT. The answer is the size of the question and may
    # name one time or none — but any clock time in it is one of these.
    import re

    slots = {row["when"].split(" at ")[-1] for row in page}
    for clock in set(re.findall(r"\b\d{1,2}:\d{2}\b", said)):
        if clock not in slots:
            failures.append(f"watching: the answer says {clock!r}, which is nobody's slot {slots}")

    # 3. AND HE DOES NOT READ THE MORNING AS OFF after switching it on.
    if not page[0]["on"]:
        failures.append("watching: the page does not show the morning as on")
    for wrong in ("question is off", "question is switched off",
                  "question is not being asked", "question remains off"):
        if wrong in said:
            failures.append(f"watching: the answer says {wrong!r}")

    assert not failures, failures

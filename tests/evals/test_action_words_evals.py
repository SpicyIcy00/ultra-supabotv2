"""
W1.2 — your action words do what they say. LIVE MODEL, LIVE READS, OPT IN.

The capability test's `keep`, `build` and `remember` scenarios (ops/captest.py),
in the owner's own words and order, through the real loop. What is under test
is what Bob CHOOSES to write: every writer here is a fake that records the
request and answers as the committed write would, so nothing reaches george.*
— captest.py is the run against the live tables, and it is the lead's.

Each fake keeps the rule the real service would apply where that rule is the
point of the card: the workflow fake refuses a schedule exactly as
`workflow_writer.delivery_for` does and keeps the version on an identical
re-save (`same_rule`); the page fake refuses an add of the same subject
(`page_operations.same_subject`) and applies a `change` in place.

Run one at a time, as the card says:
  GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest \
      tests/evals/test_action_words_evals.py -k <keep|build|remember> -q -s
"""

from __future__ import annotations

import json
import time
import uuid

import pytest

from tests.evals.harness import required, run_turn, say, turn_usd

# The capability test's words, verbatim (ops/captest.py SCENARIOS).
KEEP = [
    "how did Rockwell do last week?",
    "Keep this.",
    "Make this a page.",
    "Watch this.",
    "I want this every Monday.",
    "Turn this into a workflow.",
]
# The build scenario without its opening complaint (an investigation the
# card does not change) and its last line (managers and approvals, W2.2).
BUILD = [
    "Build it — a weekly purchase plan for our top Seikyo products.",
    "Add supplier lead time.",
    "Include warehouse inventory.",
    "Use 30-day velocity.",
]
REMEMBER = [
    "Remember that Rockwell is under renovation until October.",
    "What do you remember about Rockwell?",
]

WRITES = {"pin_answer", "save_workflow", "create_page", "edit_page", "record_belief",
          "set_standing_question", "set_watch"}


@pytest.fixture(autouse=True)
def _live():
    required()


# ---------------------------------------------------------------------------
# The fakes — one small world per scenario
# ---------------------------------------------------------------------------

def _now() -> str:
    return "2026-09-22T00:00:00+00:00"


class World:
    """Everything the web process would inject, in memory."""

    def __init__(self) -> None:
        self.pins: list[dict] = []
        self.pages: dict[str, dict] = {}
        self.workflows: dict[str, list[dict]] = {}
        self.schedules: list[dict] = []
        self.standing: list[dict] = []
        self.watches: list[dict] = []
        self.beliefs: list[dict] = []

    # -- pins -------------------------------------------------------------
    async def pin(self, spec):
        row = {"pin_id": str(uuid.uuid4()), "title": spec.title, "page": spec.page,
               "tool_calls": spec.tool_calls}
        self.pins.append(row)
        return {**row, "created_by": "eval", "created_at": _now(), "pins_on_page": 0}

    # -- workflows --------------------------------------------------------
    def workflow_writer(self):
        world = self

        class _W:
            def default_calls(self, steps, parameters):
                from app.services.workflow_runner import default_calls
                return default_calls(steps, parameters)

            async def save(self, spec):
                from app.services import workflow_writer as ww
                from tools._common import load_defs
                versions = world.workflows.setdefault(spec.name, [])
                current = versions[-1] if versions else None
                steps = [dict(s) for s in spec.steps]
                same = current is not None and json.dumps(current["steps"], sort_keys=True) \
                    == json.dumps(steps, sort_keys=True)
                if not same:
                    versions.append({"version": len(versions) + 1, "steps": steps,
                                     "change_note": spec.change_note})
                described = None
                if spec.schedule:
                    delivery = ww.delivery_for(load_defs(), spec.schedule.get("telegram_chat_ids"))
                    described = {**spec.schedule, "enabled": False,
                                 "delivered_to": delivery["channels"]}
                    # the same slot asked again is the slot it has (create_schedule)
                    if not any(s["workflow"] == spec.name
                               and s.get("hour") == described.get("hour")
                               and s.get("days_of_week") == described.get("days_of_week")
                               for s in world.schedules):
                        world.schedules.append({"workflow": spec.name, **described})
                return {"workflow_id": spec.name, "name": spec.name,
                        "version": versions[-1]["version"], "created_by": "eval",
                        "created_at": _now(), "schedule": described,
                        "awaiting_promotion": True, "queue_name": "Approval queue",
                        "new_version": not same}
        return _W()

    # -- pages --------------------------------------------------------------
    def page_writer(self):
        world = self

        class _P:
            async def create(self, spec):
                pid = str(uuid.uuid4())
                analyses = [{"pin_id": str(uuid.uuid4()), "title": a.get("title"),
                             "position": i, "calls": a.get("tool_calls") or [],
                             "tools": [c["tool"] for c in a.get("tool_calls") or []]}
                            for i, a in enumerate(spec.analyses)]
                world.pages[pid] = {"page_id": pid, "title": spec.title,
                                    "purpose": spec.purpose, "analyses": analyses}
                return {"page": {**world.pages[pid], "updated_at": _now(),
                                 "analysis_count": len(analyses)}, "owner": "eval",
                        "operations": [{"op": "create"}]}

            async def edit(self, spec):
                from agent.write_tools import PageRefused
                from app.services.page_operations import change_instead, same_subject
                page = world.pages.get(spec.page_id or "") or (
                    list(world.pages.values())[-1] if world.pages else None)
                if page is None:
                    raise PageRefused("There is no page in scope; give a page_id.")
                ops = []
                for i, op in enumerate(spec.operations):
                    if op["op"] == "add":
                        if not op.get("beside"):
                            for a in page["analyses"]:
                                if same_subject(op["tool_calls"], a["calls"]):
                                    class Pin:
                                        id, title = a["pin_id"], a["title"]
                                    raise PageRefused(change_instead(i, Pin()))
                        a = {"pin_id": str(uuid.uuid4()), "title": op["title"],
                             "position": len(page["analyses"]), "calls": op["tool_calls"],
                             "tools": [c["tool"] for c in op["tool_calls"]]}
                        page["analyses"].append(a)
                        ops.append({"op": "add", "pin_id": a["pin_id"], "title": a["title"]})
                    elif op["op"] == "change":
                        match = [a for a in page["analyses"]
                                 if a["pin_id"] == op.get("pin_id") or a["title"] == op.get("title")]
                        if len(match) != 1:
                            raise PageRefused("Name the analysis by its pin_id.")
                        match[0]["calls"] = op["tool_calls"]
                        match[0]["tools"] = [c["tool"] for c in op["tool_calls"]]
                        ops.append({"op": "change", "pin_id": match[0]["pin_id"],
                                    "title": match[0]["title"]})
                    else:
                        ops.append({"op": op["op"]})
                return {"page": {**page, "updated_at": _now(),
                                 "analysis_count": len(page["analyses"])},
                        "owner": "eval", "operations": ops}
        return _P()

    # -- standing questions and watches --------------------------------------
    def standing_writer(self):
        world = self

        class _S:
            async def apply(self, action, fields):
                if action == "create":
                    row = {"id": str(uuid.uuid4()), "question": fields["question"],
                           "hour": fields["hour"], "minute": fields.get("minute") or 0,
                           "days": fields.get("days"), "state": "switched off"}
                    world.standing.append(row)
                else:
                    row = {"action": action, **fields}
                return {"rows": [row], "meta": {
                    "source_table": "george.standing_questions",
                    "filters_applied": ["owner = the signed-in user"],
                    "snapshot_timestamp": None, "wrote": action, "enabled": False,
                    "note": "A standing question is created switched OFF."}}
        return _S()

    def watch_writer(self):
        world = self

        class _Wa:
            async def apply(self, action, fields):
                if action == "create":
                    row = {"id": str(uuid.uuid4()), "condition": fields["condition"],
                           "stores": fields.get("stores"), "hour": fields.get("hour"),
                           "days": fields.get("days"), "state": "not backtested yet"}
                    world.watches.append(row)
                    extra = {}
                elif action == "backtest":
                    row = world.watches[-1] if world.watches else {}
                    extra = {"backtest": {"days_checked": 60, "days_fired": 9,
                                          "fired_on": ["2026-09-01", "2026-09-08"]}}
                else:
                    row = {**(world.watches[-1] if world.watches else {}), **fields,
                           "action": action}
                    extra = {}
                return {"rows": [row], "meta": {
                    "source_table": "george.watches",
                    "filters_applied": ["owner = the signed-in user"],
                    "snapshot_timestamp": None, "wrote": action, **extra}}
        return _Wa()

    # -- memory ---------------------------------------------------------------
    def belief_store(self):
        world = self

        class _B:
            async def record(self, accepted):
                out = []
                for b in accepted:
                    row = {"id": str(uuid.uuid4()), "outcome": "new", **b}
                    world.beliefs.append(row)
                    out.append(row)
                return out
        return _B()

    async def memory(self):
        return {"rows": [{"subject": b.get("subject"), "subject_kind": b.get("subject_kind"),
                          "stance": b.get("stance"), "claim": b.get("claim"),
                          "rests_on": ("told: " + b["told"]) if b.get("told") else "reads",
                          "held_since": _now()} for b in self.beliefs],
                "meta": {"source_table": "bob.beliefs", "filters_applied": ["current views"],
                         "snapshot_timestamp": _now(), "held": len(self.beliefs)}}

    async def automations(self):
        rows = ([{"state": "scheduled", "kind": "standing question", **s} for s in self.standing]
                + [{"state": "watch", **w} for w in self.watches]
                + [{"state": "scheduled", "kind": "workflow", **s} for s in self.schedules])
        return {"rows": rows, "meta": {"source_table": "george.workflow_schedules",
                                       "filters_applied": ["owner = the signed-in user"],
                                       "snapshot_timestamp": _now()}}

    def injected(self) -> dict:
        return {
            "pin_writer": self.pin,
            "workflow_writer": self.workflow_writer(),
            "page_writer": self.page_writer(),
            "standing_writer": self.standing_writer(),
            "watch_writer": self.watch_writer(),
            "belief_store": self.belief_store(),
            "memory_reader": self.memory,
            "automations_reader": self.automations,
        }


# ---------------------------------------------------------------------------
# A conversation, the way captest.py builds its history
# ---------------------------------------------------------------------------

def _converse(monkeypatch, questions: list[str], world: World) -> list[dict]:
    history: list[dict] = []
    out = []
    for q in questions:
        t0 = time.monotonic()
        turn = run_turn(monkeypatch, q, history=history, **world.injected())
        seconds = round(time.monotonic() - t0, 1)
        calls = [c for c in turn.calls if c.get("tool")]
        writes = [(c["tool"], (c.get("arguments") or {}).get("action"), bool(c.get("error")))
                  for c in calls if c["tool"] in WRITES]
        rec = {"q": q, "turn": turn, "calls": calls, "writes": writes, "seconds": seconds,
               "usd": round(turn_usd(turn), 4), "words": len(turn.answer.split())}
        out.append(rec)
        say(f"  [{seconds:>6.1f}s ${rec['usd']:.3f} {rec['words']:>3}w] {q!r}")
        say(f"      writes={writes}")
        for c in calls:
            if c.get("error") and c["tool"] in WRITES:
                say(f"      refused {c['tool']}: {str(c['error'])[:300]}")
        say(f"      reads={[c['tool'] for c in calls if c['tool'] not in WRITES and c['tool'] != 'compose']}")
        say(f"      -> {turn.answer[:220]!r}")
        history += [
            {"role": "user", "text": q, "tool_calls": []},
            {"role": "bob", "text": turn.answer[:19000],
             "tool_calls": [{"tool": c["tool"], "arguments": c.get("arguments") or {}}
                            for c in calls if not c.get("error") and c["tool"] != "compose"][-20:]},
        ]
    total = sum(r["seconds"] for r in out)
    say(f"  == {len(out)} turns, {total:.1f} s, ${sum(r['usd'] for r in out):.3f}")
    return out


def _ok(rec: dict, tool: str, action: str | None = None) -> list[dict]:
    return [c for c in rec["calls"] if c["tool"] == tool and not c.get("error")
            and (action is None or (c.get("arguments") or {}).get("action") == action)]


def _writes_ok(rec: dict) -> set[str]:
    return {c["tool"] for c in rec["calls"] if c["tool"] in WRITES and not c.get("error")}


# ---------------------------------------------------------------------------
# The scenarios
# ---------------------------------------------------------------------------

def test_keep(monkeypatch):
    """§12 — temporary work can become permanent, in his six sentences."""
    world = World()
    t = _converse(monkeypatch, KEEP, world)
    failures = []
    # "Keep this." — a pin, and nothing else written.
    if not _ok(t[1], "pin_answer"):
        failures.append("Keep this.: no pin")
    if _writes_ok(t[1]) - {"pin_answer"}:
        failures.append(f"Keep this.: also wrote {_writes_ok(t[1]) - {'pin_answer'}}")
    if not _ok(t[2], "create_page"):
        failures.append("Make this a page.: no page")
    if not _ok(t[3], "set_watch", "create"):
        failures.append("Watch this.: no watch")
    # "I want this every Monday." — the report, not the watch.
    monday = _ok(t[4], "set_standing_question", "create")
    if not monday or 0 not in ((monday[0].get("arguments") or {}).get("days") or []):
        failures.append(f"I want this every Monday.: no Monday standing question ({t[4]['writes']})")
    moved = [c for c in _ok(t[4], "set_watch")
             if (c.get("arguments") or {}).get("action") in ("reschedule", "create", "rescope")]
    if moved:
        failures.append("I want this every Monday.: the watch was changed")
    # "Turn this into a workflow." — saved, and a schedule, if carried, attaches.
    if not _ok(t[5], "save_workflow"):
        failures.append("Turn this into a workflow.: not saved")
    refused = [c for c in t[5]["calls"] if c["tool"] == "save_workflow" and c.get("error")
               and "deliver" in str(c.get("error"))]
    if refused:
        failures.append("Turn this into a workflow.: a schedule was refused for delivery")
    assert all(s["enabled"] is False for s in world.schedules)
    assert all(s["state"] == "switched off" for s in world.standing)
    assert not failures, failures


def test_build(monkeypatch):
    """§11 — build it, and every change after it changes it."""
    world = World()
    t = _converse(monkeypatch, BUILD, world)
    failures = []
    saved = _ok(t[0], "save_workflow")
    if not saved:
        failures.append(f"Build it: no system saved ({t[0]['writes']})")
    if _ok(t[0], "create_page"):
        failures.append("Build it: a page of tiles")
    name = (saved[-1].get("arguments") or {}).get("name") if saved else None
    for rec in t[1:]:
        if _ok(rec, "create_page") or _ok(rec, "pin_answer"):
            failures.append(f"{rec['q']}: a new page or tile")
        adds = [c for c in _ok(rec, "edit_page")
                if any(o.get("op") == "add" for o in (c.get("arguments") or {}).get("operations") or [])]
        if adds:
            failures.append(f"{rec['q']}: a tile added beside it")
        others = [c for c in _ok(rec, "save_workflow") if (c.get("arguments") or {}).get("name") != name]
        if others:
            failures.append(f"{rec['q']}: a second workflow {[o['arguments'].get('name') for o in others]}")
    # "Use 30-day velocity." changes the plan itself.
    v30 = [c for c in _ok(t[3], "save_workflow")
           if any((s.get("arguments") or {}).get("lookback_days") == 30
                  for s in (c.get("arguments") or {}).get("steps") or [])]
    ch = [c for c in _ok(t[3], "edit_page")
          if any(o.get("op") == "change" for o in (c.get("arguments") or {}).get("operations") or [])]
    if not (v30 or ch):
        failures.append(f"Use 30-day velocity.: the plan did not change ({t[3]['writes']})")
    if name and len(world.workflows.get(name, [])) < 2 and not ch:
        failures.append("Use 30-day velocity.: no new version of the system")
    assert all(s["enabled"] is False for s in world.schedules)
    assert not failures, failures


def test_remember(monkeypatch):
    """§9 — remember that…, and what do you remember: a read that writes nothing."""
    world = World()
    t = _converse(monkeypatch, REMEMBER, world)
    failures = []
    told = [b for b in world.beliefs if b.get("told")]
    if not told:
        failures.append("Remember that…: nothing told was kept")
    if not _ok(t[1], "view_memory"):
        failures.append("What do you remember: memory not read")
    if _writes_ok(t[1]):
        failures.append(f"What do you remember: wrote {_writes_ok(t[1])}")
    assert not failures, failures

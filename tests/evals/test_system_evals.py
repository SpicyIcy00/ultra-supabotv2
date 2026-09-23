"""
W4.3 — "how do i turn it on and what its telling me to do?" LIVE MODEL, OPT IN.

The owner asked that of a screen saying "Morning Runout is switched off and
not mine to switch on", where Bob answered: *"nothing here is waiting on me to
promote, so the seven-o'clock run stays off until an administrator backtests
version one and switches it on… Tell me who holds that and I will prepare it
for them."* He is the only administrator — `public.app_users` has two logins —
so Bob named the office and sent the man holding it away.

WHAT IS UNDER TEST IS WHAT BOB SAYS, so the automations reader is a fake
returning the shape the real one now returns (`meta.promotion`), with the
SENTENCES TAKEN FROM metrics.yaml rather than written here: a fixture that
hand-wrote them would pass while the definitions said something else.

Nothing reaches george.*; no write is injected at all.

Run it as the card says, one at a time:
  GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest \\
      tests/evals/test_system_evals.py -k turn_it_on -q -s
"""

from __future__ import annotations

import re
import time

import pytest

from tests.evals.harness import required, run_turn, say, turn_usd

QUESTION = "Morning Runout is switched off. How do I turn it on?"

ASKED_BY = "admin"
HIS_NAME = "Isaiah"


@pytest.fixture(autouse=True)
def _live():
    required()


def _automations(*, admin: bool):
    """
    The read as `self_reader.read_automations` builds it, for one system whose
    only version has never been backtested.

    The words are the file's, through the same lookup the service makes.
    """
    from tools._common import load_defs

    defs = load_defs()
    promotion = (defs.get("systems") or {}).get("promotion") or {}
    policy = ((defs.get("workflows") or {}).get("permissions") or {}).get("promote")

    async def read() -> dict:
        return {
            "rows": [
                {"what": "Morning Runout v1", "state": "never backtested",
                 "when": "2026-09-20T01:00:00+00:00",
                 "by": "backtest a closed window first, then it can be promoted",
                 "id": "w1"},
                {"what": "Morning Runout", "state": "switched off",
                 "when": None, "by": "daily at 07:00"},
            ],
            "meta": {
                "source_table": "george.workflow_runs + george.workflow_versions "
                                "+ george.workflow_schedules",
                "filters_applied": ["archived rules excluded"],
                "snapshot_timestamp": "2026-09-23T01:00:00+00:00",
                "metric_label": "Running and waiting",
                "ran": 0, "standing": 0, "watching": 0, "standing_on": 0,
                "waiting": 0, "never_backtested": 1, "scheduled": 0,
                "promotion": {
                    "act": promotion.get("act_is"),
                    "policy": policy,
                    "administrators": [HIS_NAME] if admin else ["Joy"],
                    "you_may_promote": admin,
                    "you_are": HIS_NAME if admin else "Daniel",
                    "how_to_say_it": (promotion.get("you_hold_it") if admin
                                      else promotion.get("someone_else_holds_it")),
                    "never_backtested_is": promotion.get("never_backtested_is"),
                },
                "where_a_system_is": (
                    "Each system has its own page, reached from Systems in the "
                    "sidebar; that is where a version is backtested and promoted "
                    "and a schedule is switched on."
                ),
                "note": (
                    "A schedule that is switched off fires nothing. A version that "
                    "has never been backtested cannot be promoted at all yet and is "
                    "in no queue — its first step is a backtest of a closed window. "
                    "Say WHO may promote by the names in meta.promotion, never 'an "
                    "administrator' with nobody attached."
                ),
            },
        }

    return read


def _spoken(turn) -> str:
    """
    EVERYTHING THE PERSON READS, not only the streamed text.

    Since W1.1 the answer is the size of the question and a short one puts its
    substance in `compose` — the lede, the claim, the caveat — so an assertion
    against `turn.answer` alone would be auditing a headline.
    """
    import json

    parts = [turn.answer]
    for c in turn.calls:
        if c.get("tool") == "compose" and not c.get("error"):
            parts.append(json.dumps(c.get("arguments") or {}, default=str))
    return "\n".join(p for p in parts if p)


def _ask(monkeypatch, *, admin: bool):
    t0 = time.monotonic()
    turn = run_turn(monkeypatch, QUESTION, automations_reader=_automations(admin=admin))
    seconds = round(time.monotonic() - t0, 1)
    say(f"  [{seconds:>6.1f}s ${turn_usd(turn):.3f} "
        f"{len(turn.answer.split()):>3}w] {QUESTION!r}")
    say(f"      reads={[c['tool'] for c in turn.calls if c.get('tool')]}")
    say(f"      -> {turn.answer[:700]!r}")
    say(f"      composed -> {_spoken(turn)[len(turn.answer):][:900]!r}")
    return turn


# THE SENTENCE THAT MUST NOT COME BACK. The office with nobody attached to it,
# and the request that the owner go and find the man he already is.
SENT_AWAY = re.compile(
    r"(tell me who holds|who holds that|find an administrator|ask an administrator"
    r"|an administrator (?:must|needs to|has to|will have to|backtests))",
    re.I,
)

# THE ACT, ATTACHED TO THE PERSON ASKING. Said to his face, "you" IS his name —
# "You can switch it on yourself" is the answer the old one should have been,
# and demanding the literal string "Isaiah" would demand a worse sentence.
YOU_HOLD_IT = re.compile(
    r"(you (?:can|may|are the one)|yourself|it is yours|you hold)", re.I)


def test_turn_it_on_names_him(monkeypatch):
    """Asked as the administrator: the act is HIS, and he is not sent away."""
    turn = _ask(monkeypatch, admin=True)
    answer = _spoken(turn)

    held = YOU_HOLD_IT.search(answer) or (HIS_NAME in answer)
    assert held, (
        "the answer must attach the act to the person asking, not to an office: "
        + answer[:400])
    sent = SENT_AWAY.search(answer)
    assert sent is None, f"it sent him to find himself: {sent.group(0)!r} in {answer[:400]}"

    # And it must say the first step, which is the backtest — not the switch.
    assert re.search(r"backtest", answer, re.I), answer[:400]


def test_someone_who_does_not_hold_it_is_given_the_name(monkeypatch):
    """Asked by somebody who may not promote: the OTHER person is named."""
    turn = _ask(monkeypatch, admin=False)
    answer = _spoken(turn)

    assert "Joy" in answer, (
        "when somebody else holds the act, the answer names them: " + answer[:400])
    assert not YOU_HOLD_IT.search(answer), (
        "it must not tell somebody they may promote when they may not: " + answer[:400])

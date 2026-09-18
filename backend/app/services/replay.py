"""
A stored read, run again with ONE argument changed. No model.

WHAT THIS IS FOR. A person looking at a figure for last week wants it for
August, or for one shop, or ranked the other way round. That is a change of
SCOPE over work Bob already did — not a new question — and until this
existed the only way to get it was to ask him, which costs a round trip, a
model turn, and the risk that he reads the request as something else.

THE CALL IS THE RECORD'S, NOT THE CLIENT'S. A replay names an answer post and
the `seq` of one call on it; every argument but the one being changed comes off
`payload.calls`, which the loop wrote from `dict(b.input)` — the arguments the
tool accepted and answered. A browser holding a stale, edited or invented copy
of a call therefore cannot put it back on screen under a receipts line, which
is what the endpoint's previous shape allowed: it took a whole call list from
the request body and ran it.

ONE ARGUMENT, AND IT IS SCOPE. The five are declared in metrics.yaml
(`surface.desk.replay.arguments`) with where each lands in the tool's own
argument list — `window` through the tool's own name for its window, `store`
into `filters.store`, the rest by their own names. None of them is a threshold:
a threshold is a definition and lives in the yaml where it was measured.

FOUR THINGS IT WILL NOT DO, each for a reason that is not convenience:

  - It will not run a call the post does not carry. Not found and not yours
    are the same answer, as everywhere else in this module's neighbours.
  - It will not run a write, a composite, or an argument the live tool surface
    no longer accepts — `pin_runner.validate_call` decides that, so a replay
    and a pin rot identically.
  - It will not translate a refusal. A tool declining to compare a window
    still in progress is a real answer in the tool's own words and travels
    whole (`refusal`), because the replacement would be this module's opinion
    of somebody else's rule.
  - It will not compose a reading. The board frame comes from
    `default_composition`, which chooses a NOUN for rows that exist and never
    a claim, an emphasis or a word about them: nobody looked at these rows, so
    nothing may characterise them.

AND IT IS RECORDED. The changed argument is appended to the answer post's
payload (`replays`), so a replayed figure has a receipt of its own and a reload
does not quietly draw the stored window under figures a person moved. Appended,
never rewritten, and never over a key the answer already carries. A turn whose
post was never written records nothing, and `recorded` says so rather than
claiming otherwise (UI rule 8).
"""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.pin_runner import PinValidationError, run_call, validate_call

# agent/ and tools/ live at the repo root, one level above backend/ — the same
# path insertion pin_runner and routes/bob.py already do.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from agent import default_composition  # noqa: E402
from tools._common import load_defs, req  # noqa: E402

# How many rows a replayed read may draw an object over. The same bound the
# loop applies before it composes a default: an object over rows the screen
# does not have draws nothing, and an object over a PREFIX draws a different
# chart. Read from the loop so there is one number.
from agent.loop import MAX_ROWS_TO_CLIENT  # noqa: E402


class ReplayRefused(ValueError):
    """A replay that cannot be run. Carries words a person can act on."""


class ReplayNotFound(LookupError):
    """No such post, no such call on it, or neither is the caller's."""


# ---------------------------------------------------------------------------
# The definitions
# ---------------------------------------------------------------------------

def _spec(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return req(defs, "surface.desk.replay")


def arguments(defs: Optional[Mapping[str, Any]] = None) -> list[str]:
    """The logical arguments a replay may change, in the order the yaml lists."""
    return list(req(defs or load_defs(), "surface.desk.replay.arguments"))


def canonical(argument: str, defs: Optional[Mapping[str, Any]] = None) -> str:
    """
    The replay argument a caller means, when they named a control's instead.

    A drawn control carries the TOOL'S argument — `date_range`, the vocabulary
    Bob composes a control in (`composition.control_arguments`) — and
    tapping one is a replay. The two names meet in the definitions
    (`surface.desk.replay.from_control`) rather than in a component holding its
    own copy of both lists.
    """
    defs = defs or load_defs()
    if argument in req(defs, "surface.desk.replay.arguments"):
        return argument
    return str(req(defs, "surface.desk.replay.from_control").get(argument, argument))


def target(tool: str, argument: str, defs: Optional[Mapping[str, Any]] = None) -> list[str]:
    """
    Where one logical argument LANDS in this tool's own argument list.

    A path, because `store` is `filters.store` and not a top-level argument.
    `window` is resolved per tool through the map the backtest keeps, so a tool
    whose window is called `lookback_days` is replayed through that rather than
    through a `date_range` it has never had.
    """
    defs = defs or load_defs()
    spec = req(defs, "surface.desk.replay.arguments")
    if argument not in spec:
        raise ReplayRefused(
            f"{argument!r} is not something a replay may change. A replay "
            f"changes scope: {', '.join(sorted(spec))}. Anything else is a new "
            f"question, and a threshold is a definition — ask Bob."
        )
    landing = spec[argument] or {}
    if "path" in landing:
        return [str(p) for p in landing["path"]]
    per_tool = req(defs, str(landing["per_tool"]))
    if tool not in per_tool:
        raise ReplayRefused(
            f"{tool} has no {argument} to change. The tools that do: "
            f"{', '.join(sorted(per_tool))}."
        )
    return [str(per_tool[tool])]


def check_value(value: Any, defs: Optional[Mapping[str, Any]] = None) -> None:
    """
    The SHAPE of a replayed value, and nothing about its meaning.

    The vocabularies are the tool schemas' and the values are the tools' own
    business (pin_runner: "value-level validation stays INSIDE the tools").
    This is the bound that stops a client posting something no argument of any
    tool could be.
    """
    spec = _spec(defs or load_defs())
    max_len = int(spec["max_value_length"])
    max_list = int(spec["max_list_values"])

    def _scalar(v: Any) -> None:
        if isinstance(v, bool) or not isinstance(v, (str, int)):
            raise ReplayRefused(
                f"A replayed value is a word, a number or a list of words; "
                f"got {type(v).__name__}."
            )
        if isinstance(v, str) and len(v) > max_len:
            raise ReplayRefused(f"A replayed value is at most {max_len} characters.")

    if value is None:
        return
    if isinstance(value, list):
        if len(value) > max_list:
            raise ReplayRefused(f"A replayed list holds at most {max_list} values.")
        for v in value:
            if not isinstance(v, str):
                raise ReplayRefused("A replayed list holds words, nothing else.")
            _scalar(v)
        return
    _scalar(value)


# ---------------------------------------------------------------------------
# The change itself — pure
# ---------------------------------------------------------------------------

def retarget(tool: str, stored: Mapping[str, Any], argument: str, value: Any,
             defs: Optional[Mapping[str, Any]] = None) -> tuple[dict, Any]:
    """
    The stored arguments with one of them changed, and what it was before.

    A copy. The stored call is the record of what ran and is never mutated —
    and `was` is returned because the change is what gets recorded on the post:
    "last_week -> last_month" is the receipt, and half of it is the old value.

    `None` REMOVES the argument rather than passing a null into a tool that
    never asked for one. That is what "all shops" is, said as a change to
    `filters.store`: the filter comes off, and `filters` goes with it when
    nothing else is in it.
    """
    defs = defs or load_defs()
    check_value(value, defs)
    path = target(tool, argument, defs)
    args = json.loads(json.dumps(dict(stored), default=str))

    node: Any = args
    for part in path[:-1]:
        nxt = node.get(part)
        if nxt is None:
            if value is None:
                return args, None
            nxt = {}
            node[part] = nxt
        if not isinstance(nxt, dict):
            raise ReplayRefused(
                f"{tool}.{'.'.join(path)} cannot be changed: {part!r} is not a "
                f"group of arguments on the stored call."
            )
        node = nxt

    leaf = path[-1]
    was = node.get(leaf)
    if value is None:
        node.pop(leaf, None)
        # An empty group left behind is an argument the tool never received.
        for depth in range(len(path) - 2, -1, -1):
            parent: Any = args
            for part in path[:depth]:
                parent = parent[part]
            if parent.get(path[depth]) == {}:
                parent.pop(path[depth])
    else:
        node[leaf] = value
    return args, was


def board_frame(tool: str, args: Mapping[str, Any], result: Mapping[str, Any],
                seq: int, defs: Optional[Mapping[str, Any]] = None) -> list[dict]:
    """
    What the board draws for the replayed read — or nothing, honestly.

    Through `default_composition`, which is the one place a board is composed
    without a model: it chooses the mark from the rows and carries no claim, no
    emphasis and no word of a reading. The key is `read-{seq}`, the same
    convention that module uses, so a client re-pointing the object it already
    has and a client putting a new one agree about what the object is.

    Empty for a refusal, for no rows, and for more rows than a screen is sent —
    each of which is something to say rather than something to draw.
    """
    if result.get("status") != "ok":
        return []
    rows = result.get("rows") or []
    if not rows or len(rows) > MAX_ROWS_TO_CLIENT:
        return []
    meta = result.get("meta") or {}
    calls = {
        seq: {
            "tool": tool,
            "arguments": dict(args),
            "error": None,
            "duplicate": False,
            "rows": rows,
            "meta": meta,
            "filters": meta.get("filters_applied") or args.get("filters") or {},
            "is_read": True,
        }
    }
    return default_composition.compose_default(
        calls, defs=defs or load_defs(), board=None, max_rows=MAX_ROWS_TO_CLIENT,
    )


# ---------------------------------------------------------------------------
# The stored call
# ---------------------------------------------------------------------------

async def stored_call(db: AsyncSession, *, username: str, post_id: uuid.UUID,
                      seq: int) -> tuple[str, dict]:
    """
    One call off an answer post the caller owns: its tool and its arguments.

    Ownership is the WHERE clause, and a post somebody else owns is not found
    rather than forbidden — the convention share_post and the chats routes
    already follow. `payload.calls` is the loop's own list of read calls that
    ran without error; a post written before it existed carries none, and the
    refusal says that rather than rebuilding a call from charted rows, which
    would be an invented call.
    """
    row = (
        await db.execute(
            text("SELECT kind, payload FROM george.posts "
                 " WHERE id = :id AND owner_user = :me AND hidden_at IS NULL"),
            {"id": post_id, "me": username},
        )
    ).mappings().first()
    if row is None:
        raise ReplayNotFound("No post of yours with that id.")

    calls = ((row["payload"] or {}).get("calls") or []) if row["payload"] else []
    if not calls:
        raise ReplayNotFound(
            "That answer kept no calls, so there is nothing to run again. "
            "Answers stored before 2026-09-07 carry none, and a call is never "
            "rebuilt from the rows it returned."
        )
    for call in calls:
        if isinstance(call, Mapping) and call.get("seq") == seq:
            tool = call.get("tool")
            args = call.get("arguments") or {}
            if not isinstance(tool, str) or not isinstance(args, Mapping):
                raise ReplayNotFound(f"Call {seq} on that answer is not readable.")
            return tool, dict(args)
    kept = ", ".join(str(c.get("seq")) for c in calls if isinstance(c, Mapping))
    raise ReplayNotFound(f"That answer has no call {seq}. It kept: {kept}.")


async def record(db: AsyncSession, *, username: str, post_id: uuid.UUID,
                 entry: Mapping[str, Any],
                 defs: Optional[Mapping[str, Any]] = None) -> bool:
    """
    Append one replay to the post's payload. Returns whether it was written.

    `jsonb_set` over `replays` alone, with the array trimmed to its last
    `max_recorded_per_post`: no key the answer already carries is read or
    written, so the record of what Bob said cannot be touched by somebody
    moving a window. Ownership is in the UPDATE, not checked first — a check
    and a write are two statements and the row can change between them.

    False is a real outcome and not an error: a turn logged with logging off
    has no post, and a replay that ran is still a replay that ran. The caller
    says which happened rather than assuming.
    """
    cap = int(_spec(defs or load_defs())["max_recorded_per_post"])
    result = await db.execute(text(_RECORD_SQL), {
        "id": post_id, "me": username, "cap": cap,
        "entry": json.dumps(dict(entry), default=str),
    })
    return (result.rowcount or 0) > 0


# The array as it stands, and '[]' for every other thing it could be — absent,
# null, or (impossibly, since nothing else writes this key) not an array. A
# `jsonb_array_length` over a non-array raises, and a replay that ran must not
# fail on the record of itself.
_KEPT = ("COALESCE(CASE WHEN jsonb_typeof(payload -> 'replays') = 'array' "
         "          THEN payload -> 'replays' END, '[]'::jsonb)")

# ORDER BY the ordinality rather than trusting the order rows come out of
# jsonb_array_elements in: appending to a list whose order is incidental would
# make the oldest replay the one that survives the trim.
_RECORD_SQL = (
    "UPDATE george.posts SET payload = jsonb_set("
    "  COALESCE(payload, '{}'::jsonb), '{replays}',"
    "  (SELECT COALESCE(jsonb_agg(e.v ORDER BY e.i), '[]'::jsonb)"
    f"     FROM jsonb_array_elements({_KEPT} || jsonb_build_array(CAST(:entry AS jsonb)))"
    "            WITH ORDINALITY AS e(v, i)"
    f"    WHERE e.i > GREATEST(0, jsonb_array_length({_KEPT}) + 1 - :cap)),"
    "  true)"
    " WHERE id = :id AND owner_user = :me AND hidden_at IS NULL"
)


# ---------------------------------------------------------------------------
# The whole of it
# ---------------------------------------------------------------------------

async def replay(db: AsyncSession, *, username: str, post_id: uuid.UUID, seq: int,
                 argument: str, value: Any) -> dict:
    """
    Run the stored call again with one argument changed, and record the change.

    Raises ReplayNotFound (404) and ReplayRefused (422) for things that cannot
    be run at all. Everything the TOOL says — a refusal, a rot, a timeout — is
    a 200 carrying that status and the tool's own words, because a tool
    declining to produce a misleading number is a real answer the screen has to
    draw.
    """
    defs = load_defs()
    # One vocabulary from here down, including on the record: a control's own
    # name for its argument is resolved before anything is run or written.
    argument = canonical(argument, defs)
    tool, stored = await stored_call(db, username=username, post_id=post_id, seq=seq)
    args, was = retarget(tool, stored, argument, value, defs)

    call = {"tool": tool, "arguments": args}
    try:
        validate_call(call)
    except PinValidationError as exc:
        raise ReplayRefused(str(exc)) from exc

    ran = await run_call(call)
    # ALL OF THE ROWS OR NONE, the rule the loop applies to every result it
    # sends (`MAX_ROWS_TO_CLIENT`) and this endpoint was not applying. A mark
    # over the first 120 of 365 is not a smaller mark, it is a different and
    # wrong one — so a result the loop would have withheld is withheld here
    # too, and `rows_complete` says which happened rather than leaving a
    # client to infer it from a length it cannot compare to anything.
    rows = ran["rows"] or []
    rows_complete = len(rows) <= MAX_ROWS_TO_CLIENT
    at = datetime.now(timezone.utc)
    recorded = await record(
        db, username=username, post_id=post_id, defs=defs,
        entry={"seq": seq, "tool": tool, "argument": argument,
               "was": was, "value": value, "status": ran["status"],
               "at": at.isoformat()},
    )
    return {
        "status": ran["status"],
        "tool": tool,
        "seq": seq,
        "argument": argument,
        "was": was,
        "value": value,
        "arguments": args,
        "rows": rows if rows_complete else [],
        "rows_complete": rows_complete,
        "meta": ran["meta"],
        "notices": ran["notices"],
        # THE TOOL'S OWN WORDS, never rephrased. A window still in progress is
        # refused by name and the name is in here.
        "refusal": ran.get("error"),
        "blocks": board_frame(tool, args, ran, seq, defs),
        "duration_ms": ran["duration_ms"],
        "recorded": recorded,
        "ran_at": at,
    }

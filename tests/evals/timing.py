"""
When the screen first has something on it, from the frames themselves.

P1.b's measure is "time to first visible object", and until now nothing
recorded it: the report kept `duration_ms` and a list of per-iteration times,
which say how long the turn took and not when the person stopped looking at an
empty room. So the harness now stamps every frame with the milliseconds since
the turn started, and this replays them through the client's own rule.

THE RULE IS room/board.ts `editsFor`, AND IT IS COPIED HERE ON PURPOSE. A
measurement that used a kinder rule than the screen uses would flatter the
card. What the room draws, in the order it prefers:

    his composition            → the board is what he composed
    else the loop's default    → the board is what the reads are (P1.b)
    else one quiet table per   → the fallback, for a turn stored before
    read, and the reading        compose existed, or one where every edit
    above it                     was refused

THE READING IS NO LONGER A TILE (P1.c): it is a region above the board, drawn
from the turn's own words. That does not change what is MEASURED here — prose
on screen is still something on screen — and the wiping still counts.
`answer_reset` empties the reading, so a screen whose only content was his
prose goes back to the greeting, which is what "stuff came out but it just
disappeared" looks like. So the number reported is the first moment after
which the screen is never empty again, not the first moment it flickers into
existence.

`with_default=False` replays the same frames under the rule as it stood before
P1.b, which is how one run yields both the before and the after without paying
for two.
"""

from __future__ import annotations

from typing import Any, Optional, Sequence

Frame = tuple[str, dict, float]


def board_timeline(frames: Sequence[Frame], *, with_default: bool) -> list[tuple[float, bool]]:
    """(elapsed_ms, whether the board has anything on it) after each frame."""
    text = ""
    drawn: set[int] = set()
    composition: Optional[list] = None
    default: Optional[list] = None
    out: list[tuple[float, bool]] = []

    for event, data, at in frames:
        if event == "text":
            text += str(data.get("delta", ""))
        elif event == "answer_reset":
            text = ""
        elif event == "tool_result":
            # The client charts a result only when the loop could send it
            # whole — `resultFromToolCall` returns null otherwise, and a call
            # with no rows contributes no object.
            if data.get("rows_complete") and (data.get("rows") or []):
                drawn.add(int(data["seq"]))
        elif event == "compose":
            if data.get("default"):
                if with_default and composition is None:
                    default = list(data.get("blocks") or [])
            else:
                composition = list(data.get("blocks") or [])

        if composition:
            has: Any = True
        elif default:
            has = True
        else:
            has = bool(text.strip()) or bool(drawn)
        out.append((at, bool(has)))
    return out


def first_object_ms(frames: Sequence[Frame], *, with_default: bool) -> Optional[float]:
    """
    When the board last became non-empty and stayed that way, or None if the
    turn ended with nothing on screen.
    """
    timeline = board_timeline(frames, with_default=with_default)
    found: Optional[float] = None
    for at, has in timeline:
        if has and found is None:
            found = at
        elif not has:
            found = None
    return found


def first_composed_object_ms(frames: Sequence[Frame], *, with_default: bool) -> Optional[float]:
    """
    When the board first held a COMPOSED object — one whose shape somebody
    chose, rather than the fallback's quiet table per read.

    This is the number P1.b actually moves. Before it, the first composed
    object was George's, a whole model round trip after the rows arrived;
    after it, it is the loop's default, in the same iteration as the reads.
    """
    for event, data, at in frames:
        if event != "compose" or not (data.get("blocks") or []):
            continue
        if data.get("default") and not with_default:
            continue
        return at
    return None


# ---------------------------------------------------------------------------
# A fragment, which has no frames at all (P1.j)
# ---------------------------------------------------------------------------
#
# Everything above replays MODEL frames, because everything above is about a
# turn. A fragment is the case where there is no turn: "last month" typed into
# the composer resolves against the tokens on screen and runs as a replay, and
# the model is never asked. So there is nothing to replay here and the rule is
# the one thing this module can still own — WHAT COUNTS AS THE CHANGE.
#
# THE CHANGE IS THE SLOWEST OF THE BATCH, NOT THE FIRST. A token moves every
# drawn read on that argument, and they run concurrently: a board that is half
# on August and half on last week has not changed, it has broken. So the
# number a person waits for is when the LAST of them lands.
#
# WHAT IS NOT IN IT. The resolve is a lookup in a served list and costs no
# request; the render is a React commit over rows already in memory. Both are
# under the resolution of anything that can be measured from a test, and
# neither opens a connection. The measured part is the reads, which is the
# part that costs anything — the same honesty `test_replay_live` states about
# the two application-database statements around one.

def fragment_change_ms(replays: Sequence[float]) -> Optional[float]:
    """
    When the board first changed after a fragment, in milliseconds.

    `replays` are the durations of the replays one fragment fired, in seconds
    — one per drawn read on that argument. None for a fragment that fired
    none, which is a fragment that did not resolve and went to George instead.
    """
    if not replays:
        return None
    return max(replays) * 1000.0


def analytical_figure_ms(replays: Sequence[float]) -> Optional[float]:
    """
    When the FIGURE landed for an analytical fragment — the same number.

    It is named separately because the card's two budgets are separate and one
    of them is easy to report dishonestly: an analytical fragment also costs a
    model turn, and the reading arrives whole turns later. That is not a
    failure of this measure, it is the point of `analytical_asks_anyway` — the
    figure is fast and the reading is never dropped to keep it that way. A
    report that quoted the turn here would be reporting the wrong thing.
    """
    return fragment_change_ms(replays)


# ---------------------------------------------------------------------------
# The board building while he works (P2S.7, 2026-09-18)
# ---------------------------------------------------------------------------
#
# The owner: "it should still display like the normal data first and then it
# goes deeper so theres something to see already and the more pop up so you
# can really see it building". Measured before this card on
# verification/p2s6-gate-2.json: the shops at 10.4 s, George's board at
# 59.6 s, the end at 105.7 s, and nothing new in between.

def _drawn_order(blocks: Sequence[dict]) -> list[str]:
    """The keys as the room draws them: the lead first, then in order."""
    puts = [b for b in blocks if (b.get("op") or "put") == "put" and b.get("key")]
    lead = [b["key"] for b in puts if b.get("weight") == "lead"][:1]
    return lead + [b["key"] for b in puts if b["key"] not in lead]


def board_growth(frames: Sequence[Frame], done: Optional[dict]) -> dict:
    """
    When the board gained blocks, whether one landed BEFORE the final round
    began, and whether anything already drawn MOVED.

      first_ms      the first compose frame that drew anything
      gains         (ms, how many new keys) for every later frame that added one
      final_round   when the last model round began: the turn's duration less
                    that round's own time, off the done frame's clock
      deeper_before_final   a gain after the first, before the final round
      moved         consecutive boards where a key both held changed its place
                    among them, or the board lost a place — his drop, or a
                    rearrangement; a default replaced WHERE IT STOOD is neither
    """
    his: Optional[list] = None
    default: Optional[list] = None
    seen: set[str] = set()
    prev: Optional[list[str]] = None
    first: Optional[float] = None
    gains: list[tuple[int, int]] = []
    moved: list[str] = []
    for event, data, at in frames:
        if event != "compose":
            continue
        blocks = list(data.get("blocks") or [])
        if data.get("default"):
            if his is not None:
                continue
            default = blocks
        else:
            his = blocks
        order = _drawn_order(his if his is not None else (default or []))
        if not order:
            continue
        new = [k for k in order if k not in seen]
        if first is None:
            first = at
        elif new:
            gains.append((int(round(at)), len(new)))
        if prev is not None:
            kept_before = [k for k in prev if k in order]
            kept_now = [k for k in order if k in prev]
            if kept_before != kept_now or len(order) < len(prev):
                moved.append(f"{int(round(at))} ms: {prev} -> {order}")
        seen |= set(order)
        prev = order
    final_round: Optional[float] = None
    duration = (done or {}).get("duration_ms")
    rounds = (done or {}).get("iteration_ms")
    if (isinstance(duration, (int, float)) and isinstance(rounds, list) and rounds
            and isinstance(rounds[-1], (int, float))):
        final_round = float(duration) - float(rounds[-1])
    return {
        "first_ms": None if first is None else int(round(first)),
        "gains": gains,
        "final_round_ms": None if final_round is None else int(round(final_round)),
        "deeper_before_final": bool(first is not None and final_round is not None
                                    and any(ms < final_round for ms, _n in gains)),
        "moved": moved,
    }

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

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
    else his prose, and one    → the fallback, for a turn stored before
    quiet table per read         compose existed, or one where every edit
                                 was refused

AND IT HAS TO STAY. `answer_reset` wipes the prose, so a board whose only
object was a text tile goes back to the greeting — which is what "stuff came
out but it just disappeared" looks like from the board's side. So the number
reported is the first moment after which the board is never empty again, not
the first moment it flickers into existence.

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

"""
The model's copy of a result's receipts (P2S.9(c), 2026-09-18).

WHY. Measured on verification/p2s7-gate-2.json: 59% of what George reads back
from a tool is `meta`, and most of that is the same explanatory note on every
read of a turn — what `full_row_count` means, why a missing day is absent and
not zero, why a reconciliation does not apply to this metric, where the
definitions file sits on disk. Every one of them is resent on every read and
then re-sent again, whole, on every later round of the turn as history.

WHAT THIS DOES. Builds the copy of one result that goes to the MODEL, and
nothing else. The first time a note reaches him in a turn it arrives whole;
after that, a value identical to one he has already been sent — same field,
same text — arrives as a pointer to the call that carried it ("same as call
3"), which is in front of him in the same conversation. Nothing is summarised
or reworded, so nothing can be said differently from how the tool said it.

WHAT IT NEVER TOUCHES:
  - the fields a figure is trusted by — source, filters, window, read time —
    and every notice, error and truncation, which are sent whole on every
    read however often they repeat (`rounds.model_receipts.whole`);
  - the rows;
  - the person's receipts. The frames, the stored tool call, the answer post
    and the receipts line are all built from the full result, before and
    apart from this copy.

PER TURN, BY CONSTRUCTION. One instance lives exactly as long as run(), the
same as the duplicate-read guard: a pointer can only name a call whose result
is already in the conversation the model is reading.
"""

from __future__ import annotations

import json
from typing import Any, Mapping

from tools._common import req


def _text(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str, ensure_ascii=False)


class ModelReceipts:
    """What one turn has already sent the model, and the copy that follows from it."""

    def __init__(self, defs: Mapping[str, Any]):
        spec = req(defs, "rounds.model_receipts")
        self.whole = frozenset(str(k) for k in req(spec, "whole"))
        self.dropped = frozenset(str(k) for k in req(spec, "dropped"))
        self.min_chars = int(req(spec, "repeat_min_chars"))
        self.says = str(req(spec, "repeat_says"))
        # (field path, exact text) -> the call that first carried it.
        self._sent: dict[tuple[tuple[str, ...], str], int] = {}

    def copy(self, result: Any, seq: int) -> Any:
        """The model's copy of `result`, which is left exactly as it was."""
        if not isinstance(result, Mapping) or not isinstance(result.get("meta"), Mapping):
            return result
        meta: dict[str, Any] = {}
        for key, value in result["meta"].items():
            if key in self.dropped:
                continue
            meta[key] = value if key in self.whole else self._once(value, (key,), seq)
        return {**result, "meta": meta}

    def _once(self, value: Any, path: tuple[str, ...], seq: int) -> Any:
        text = _text(value)
        if len(text) < self.min_chars:
            return value
        first = self._sent.get((path, text))
        if first is not None and first != seq:
            return self.says.format(seq=first)
        self._sent.setdefault((path, text), seq)
        # A block that differs somewhere still repeats its parts: a comparison
        # over the same two windows differs in its status counts and nothing
        # else, so its windows go once.
        if isinstance(value, Mapping):
            return {k: self._once(v, (*path, str(k)), seq) for k, v in value.items()}
        return value

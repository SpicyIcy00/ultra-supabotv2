"""
George's opening line.

The brief, reduced to one sentence he can actually say — plus the item it came
from, whole, with its own receipts.

WHY THIS IS WRITTEN IN PYTHON AND NOT BY THE MODEL. The same reason
brief_telegram renders server-side: "notices always surface" (CLAUDE.md UI rule
4) is a product guarantee, and the first thing a generated or hand-templated
opening loses is the caveats. A greeting also runs on every page load, so a
model call here would bill for a sentence and could get a figure wrong; every
number below is copied out of a brief row and formatted, never computed and
never inferred.

THREE SHAPES, NOT TWO — THIS IS THE WHOLE POINT OF THE FILE.

    item            something crossed a threshold; lead with it.
    quiet           every section ran and nothing crossed.
    could_not_look  a section COULD NOT RUN. Not a quiet morning.

The third exists because tools/brief.py already refuses to conflate "nothing
crossed the threshold" with "the data never arrived" (metrics.yaml
brief.empty_section_must_distinguish), and a greeting that collapsed them back
into "nothing moved beyond normal" would undo that guarantee at the last step —
telling someone the morning was calm when in fact nobody looked.

That rule holds inside the `item` shape too. A brief with one sales item and no
stock snapshots must never end "nothing else moved beyond normal", because
stock is exactly what was not checked. `_blind_clause` is preferred over that
sentence wherever both would apply, and the sentence is only ever emitted when
every section actually ran.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from typing import Any, Optional

# tools/ lives at the repo root, above backend/ — the same path insertion
# routes/george.py and routes/brief.py do.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools.brief import most_notable  # noqa: E402

# What a section is called when George says he could not check it. Deliberately
# a noun he would use out loud, not the section key and not the brief's own
# headings ("Went out of stock" cannot follow "I couldn't check").
SECTION_NOUN = {
    "sales_vs_same_weekday": "sales",
    "stock_crossed_out": "stock",
    "newly_dead": "dead stock",
}


def _money(v: float) -> str:
    """Sign outside the symbol: -₱12,132, not ₱-12,132. Matches brief_telegram."""
    return f"{'-' if v < 0 else ''}₱{abs(v):,.0f}"


def _day(iso: Optional[str]) -> str:
    """'Wed 2 Sep 2026'. Written out rather than %-d, which Windows rejects."""
    if not iso:
        return "an unknown day"
    try:
        d = date.fromisoformat(iso)
    except (TypeError, ValueError):
        return str(iso)
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b %Y')}"


def _weekday(iso: Optional[str]) -> str:
    try:
        return date.fromisoformat(iso).strftime("%A") if iso else "weekday"
    except (TypeError, ValueError):
        return "weekday"


def _notices_of(meta: dict) -> list[dict]:
    """Flatten meta.notice, expanding the `multiple` container into its items."""
    notice = (meta or {}).get("notice")
    if not notice:
        return []
    return list(notice["items"]) if notice.get("items") else [notice]


def _blind(meta: dict) -> list[str]:
    """Sections that could not run at all, in the brief's own order."""
    sections = (meta or {}).get("sections") or {}
    return [name for name, s in sections.items() if s.get("ran") is False]


def _join(parts: list[str], last: str = "and") -> str:
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return f"{', '.join(parts[:-1])} {last} {parts[-1]}"


def _blind_clause(meta: dict, blind: list[str]) -> str:
    """
    "I couldn't check stock this morning: there were no stock snapshots to
    compare." The reason comes from the section itself, never from parsing the
    notice's prose.
    """
    sections = (meta or {}).get("sections") or {}
    nouns = [SECTION_NOUN.get(n, n.replace("_", " ")) for n in blind]
    reasons = [str(sections.get(n, {}).get("reason") or "the section could not run")
               for n in blind]
    return (
        f"I couldn't check {_join(nouns, 'or')} this morning: "
        f"{_join(reasons)}."
    )


# --------------------------------------------------------------------------
# One item, in words
#
# Every figure below is a field of the row. Nothing is recomputed here: a
# percentage recalculated from value and baseline could disagree in the last
# digit with the one in the receipts underneath it, and two different numbers
# for the same thing on one screen is worse than either.
# --------------------------------------------------------------------------

def _sentence(row: dict, meta: dict) -> str:
    section = row.get("section")

    if section == "sales_vs_same_weekday":
        as_of = (meta or {}).get("as_of") or {}
        day = _day(as_of.get("yesterday"))
        weekday = _weekday(as_of.get("yesterday"))
        way = "above" if row.get("direction") == "up" else "under"
        return (
            f"{row['subject']} took {_money(row['value'])} on {day} — "
            f"{abs(float(row['change_pct'])):.0f}% {way} the same {weekday} last week, "
            f"when it took {_money(row['baseline'])}."
        )

    if section == "stock_crossed_out":
        compared = ((row.get("receipts") or {}).get("as_of") or {}).get("compared") or []
        old_day = _day(compared[0]) if len(compared) > 0 else "the earlier snapshot"
        new_day = _day(compared[1]) if len(compared) > 1 else "the latest snapshot"
        sku = f" ({row['sku']})" if row.get("sku") else ""
        return (
            f"{row['subject']}{sku} went out of stock at {row['store']} — "
            f"{row['was']:,.0f} on hand on {old_day}, {row['now']:,.0f} on {new_day}."
        )

    if section == "newly_dead":
        window = ((meta or {}).get("sections") or {}).get("newly_dead", {}).get("window_days")
        days = f"{window} days" if window else "the no-sale window"
        sku = f" ({row['sku']})" if row.get("sku") else ""
        return (
            f"{row['subject']}{sku} at {row['store']} has now gone {days} without a "
            f"sale, with {row['quantity_on_hand']:,.0f} still on hand — it last sold "
            f"on {_day(row.get('last_sold'))}."
        )

    # A section added to the brief without being added here. Say what is known
    # rather than inventing a shape for it.
    return f"{row.get('subject', 'Something')} is the most notable thing in this morning's brief."


def build_greeting(payload: dict, defs: Optional[dict] = None) -> dict[str, Any]:
    """
    George's opening line, built from a brief.

    Args:
        payload: a brief as tools.brief.get_brief() returns it.
        defs: the definitions, injected by tests; the notability ordering is
              read from metrics.yaml otherwise.

    Returns:
        {kind, headline, item, notices, meta, blind_sections}. `item` is the
        brief row itself, so it carries its own receipts and the display shows
        the same provenance the brief does. `notices` is every notice the brief
        raised, flattened — none is dropped on the way through here.
    """
    meta = payload.get("meta") or {}
    rows = payload.get("rows") or []
    blind = _blind(meta)
    item = most_notable(payload, defs=defs)

    if item is not None:
        parts = [_sentence(item, meta)]
        others = len(rows) - 1
        if blind:
            parts.append(_blind_clause(meta, blind))
        if others > 0:
            parts.append(
                f"{others} other item{'s' if others != 1 else ''} in this morning's "
                f"brief — ask and I'll run it."
            )
        elif not blind:
            # Only safe to say when every section actually ran.
            parts.append("Nothing else moved beyond normal.")
        return {
            "kind": "item",
            "headline": " ".join(parts),
            "item": item,
            "notices": _notices_of(meta),
            "meta": meta,
            "blind_sections": blind,
        }

    if blind:
        parts = [_blind_clause(meta, blind)]
        # The sections that DID run are empty — that much can be said, and only
        # about them.
        if any(s.get("ran") is not False for s in (meta.get("sections") or {}).values()):
            parts.append("Nothing else moved beyond normal.")
        return {
            "kind": "could_not_look",
            "headline": " ".join(parts),
            "item": None,
            "notices": _notices_of(meta),
            "meta": meta,
            "blind_sections": blind,
        }

    return {
        "kind": "quiet",
        "headline": "Nothing moved beyond normal today. What do you need?",
        "item": None,
        "notices": _notices_of(meta),
        "meta": meta,
        "blind_sections": [],
    }

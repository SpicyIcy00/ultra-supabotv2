"""
Rendering the morning brief for Telegram.

WHY THE BACKEND RENDERS THIS RATHER THAN n8n. "Notices always surface" (CLAUDE.md
UI rule 4) is a product guarantee, not a formatting preference. If the message
were templated in an n8n node, that guarantee would live in a workflow anyone can
edit, and the first person to tidy up the layout would quietly delete the
caveats. n8n is left a dumb pipe: fetch, post.

NOTICES GO AT THE TOP OF EACH SECTION. Telegram truncates, phones cut off, and
nobody scrolls a 6am message to the end — a caveat below the fold is a caveat
nobody reads. They sit above the figures they qualify, which is also where
GeorgeConversation puts them in chat.

SPLITTING, NOT TRUNCATING. telegram_sender.send_message() silently cuts at 4,096
characters and appends "(truncated)", which for a brief means losing whole items
with no indication of what went missing. This module splits BY SECTION instead,
and if one section alone is too long it splits between items — never mid-item —
repeating the section heading and ITS NOTICES on the continuation, so the second
half is never a caveat-free list of numbers.

HTML, NOT MarkdownV2. Telegram's MarkdownV2 requires escaping every one of
`_*[]()~`>#+-=|{}.!` — which in this content means every decimal point in
"8,069,394.16", every minus sign in "-33.2%" and every hyphen in a product name.
One missed escape and Telegram rejects the entire message with a 400. HTML needs
only &, < and >, and renders the same bold text.
"""

from __future__ import annotations

import html
from typing import Any, Iterable

# Telegram's hard per-message limit. Left a little room for the part counter.
MAX_MESSAGE_LEN = 4096
_SAFETY = 120

SECTION_TITLES = {
    "sales_vs_same_weekday": "Sales vs the same weekday last week",
    "stock_crossed_out": "Went out of stock",
    "newly_dead": "Crossed 30 days without a sale",
}

# Which notices belong above which section. A notice with no home goes in the
# header, which is above everything.
NOTICE_SECTION = {
    "snapshot_gaps": "stock_crossed_out",
    "low_stock_not_operational": "stock_crossed_out",
}


def _esc(text: Any) -> str:
    return html.escape(str(text), quote=False)


def _money(v: float) -> str:
    """Sign outside the symbol: -₱12,132, not ₱-12,132."""
    return f"{'-' if v < 0 else ''}₱{abs(v):,.0f}"


def _notices_of(meta: dict) -> list[dict]:
    notice = meta.get("notice")
    if not notice:
        return []
    return list(notice.get("items", [notice])) if notice.get("items") else [notice]


def _render_notice(n: dict) -> str:
    """One caveat. Marked, never hidden, never abbreviated away."""
    return f"⚠️ <i>{_esc(' '.join(str(n.get('message', '')).split()))}</i>"


def _render_item(row: dict) -> str:
    section = row.get("section")

    if section == "sales_vs_same_weekday":
        arrow = "▲" if row["direction"] == "up" else "▼"
        return (
            f"{arrow} <b>{_esc(row['subject'])}</b>  {_money(row['value'])}  "
            f"({row['change_pct']:+.1f}%, {_money(row['change'])} vs "
            f"{_money(row['baseline'])})"
        )

    if section == "stock_crossed_out":
        sku = f" <code>{_esc(row['sku'])}</code>" if row.get("sku") else ""
        return (
            f"• <b>{_esc(row['subject'])}</b>{sku} at {_esc(row['store'])} — "
            f"{row['was']:,.0f} → {row['now']:,.0f}"
        )

    if section == "newly_dead":
        sku = f" <code>{_esc(row['sku'])}</code>" if row.get("sku") else ""
        return (
            f"• <b>{_esc(row['subject'])}</b>{sku} at {_esc(row['store'])} — "
            f"{row['quantity_on_hand']:,.0f} held, last sold {_esc(row['last_sold'])}"
        )

    return f"• {_esc(row.get('subject', ''))}"


def _pack(blocks: Iterable[list[str]], header: str) -> list[str]:
    """
    Fit blocks into messages without ever splitting one.

    A block is a section: its heading, its notices, its items. Blocks are kept
    whole wherever possible; a block too large for one message is split by the
    caller before it gets here.
    """
    messages: list[str] = []
    current = [header]
    length = len(header)

    for block in blocks:
        text = "\n".join(block)
        # The guard is `current` being non-empty, NOT its length. An earlier
        # version tested len(current) > 1 to avoid emitting a header-only
        # message; after a flush current holds exactly one block, so the test
        # was false and the NEXT block was appended without any size check.
        # Two 3,900-character blocks merged into one 7,889-character message,
        # which Telegram would have rejected outright.
        if current and length + len(text) + 2 > MAX_MESSAGE_LEN - _SAFETY:
            messages.append("\n".join(current))
            current, length = [], 0
        current.append(text)
        length += len(text) + 2

    if current:
        messages.append("\n".join(current))
    return messages


def _quiet_line(section: str, info: dict) -> str:
    """
    What a section says when it has nothing to say.

    EMPTY IS NOT QUIET, and the two must never look alike. A quiet morning is a
    result — it means everything stayed inside its normal range, which is worth
    knowing and is the thing that makes a noisy morning mean something. A section
    that could not run is a failure wearing the same clothes.

    So each section states the positive finding in its own words rather than a
    shared "nothing to report", which reads as absence either way.
    """
    if section == "sales_vs_same_weekday":
        considered = info.get("stores_considered") or 0
        if not considered:
            return (
                "Could not compare sales — no store had figures for both days. "
                "That is missing data, not a quiet morning."
            )
        return (
            f"No store moved beyond its normal range "
            f"({considered} compared against the same weekday last week)."
        )

    if section == "stock_crossed_out":
        compared = info.get("compared") or []
        if not all(compared):
            return (
                "Could not compare stock — no snapshots were available. "
                "That is missing data, not a quiet morning."
            )
        return "Nothing went out of stock."

    if section == "newly_dead":
        days = info.get("window_days", 30)
        return f"Nothing crossed {days} days without a sale."

    return "Nothing to report."


def _section_blocks(section: str, rows: list[dict], notices: list[dict],
                    sections_meta: dict) -> list[list[str]]:
    """
    One section, possibly split across several blocks.

    The heading AND the section's notices are repeated on every continuation:
    a second message listing items with the caveats left behind in the first is
    exactly the failure this ordering exists to prevent.
    """
    title = SECTION_TITLES.get(section, section)
    head = [f"<b>{_esc(title)}</b>"]
    head += [_render_notice(n) for n in notices]

    if not rows:
        head.append(f"<i>{_quiet_line(section, sections_meta.get(section, {}))}</i>")
        return [head]

    blocks: list[list[str]] = []
    current = list(head)
    length = sum(len(x) + 1 for x in current)

    for row in rows:
        line = _render_item(row)
        if length + len(line) + 1 > MAX_MESSAGE_LEN - _SAFETY and len(current) > len(head):
            blocks.append(current)
            current = list(head) + [f"<i>(continued)</i>"]
            length = sum(len(x) + 1 for x in current)
        current.append(line)
        length += len(line) + 1

    blocks.append(current)
    return blocks


def render(brief: dict) -> list[str]:
    """
    Turn a get_brief() result into one or more Telegram messages.

    Returns a list because a brief that does not fit is split by section, never
    truncated. Each message is standalone HTML.
    """
    meta = brief.get("meta") or {}
    rows = brief.get("rows") or []
    as_of = meta.get("as_of") or {}
    sections_meta = meta.get("sections") or {}

    notices = _notices_of(meta)
    by_section: dict[str, list[dict]] = {}
    for n in notices:
        by_section.setdefault(NOTICE_SECTION.get(n.get("kind"), "__header__"), []).append(n)

    # ---- header ----------------------------------------------------------
    header = [
        f"<b>Morning brief — {_esc(as_of.get('yesterday'))}</b>",
        f"<i>Sales compared with {_esc(as_of.get('sales_baseline'))}, "
        f"the same weekday a week earlier.</i>",
    ]
    # Header notices first of all: these are the ones about the brief itself,
    # including which sources were too stale or frozen to contribute.
    header += [_render_notice(n) for n in by_section.get("__header__", [])]

    # Freshness is NOT restated here. The tool already attaches a stale_sources
    # notice naming every silent source with its age, and that notice is in the
    # header above. Printing the same facts twice trains the reader to skim past
    # the notices, which is the one thing they must not do.

    blocks: list[list[str]] = []
    for section in ("sales_vs_same_weekday", "stock_crossed_out", "newly_dead"):
        section_rows = [r for r in rows if r.get("section") == section]
        blocks += _section_blocks(section, section_rows,
                                  by_section.get(section, []), sections_meta)

    # ---- footer: the timestamps that make the numbers checkable ----------
    footer = [
        f"<i>Read {_esc(meta.get('snapshot_timestamp', ''))[:19]}Z · "
        f"newest transaction {_esc(meta.get('newest_transaction', '') or 'unknown')[:19]}</i>"
    ]
    blocks.append(footer)

    messages = _pack(blocks, "\n".join(header))
    if len(messages) > 1:
        messages = [f"{m}\n<i>({i + 1}/{len(messages)})</i>"
                    for i, m in enumerate(messages)]
    return messages

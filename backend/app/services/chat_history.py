"""
Rebuild a chat from the conversation log.

PURE. No database, no session: the routes fetch the rows and this module turns
them into the turn list the George UI already renders — the same shape
useGeorgeStream builds from a live stream, so a reopened chat and a live one
are one component.

WHAT A REOPENED CHAT CAN AND CANNOT SHOW. Per turn the log holds the question,
the final answer, status and usage, and every tool call with its arguments and
result summary. Since 2026-09-03 it also holds the full notice objects and the
last tool meta (receipts). It does NOT hold the model's thinking, the rows a
tool returned, or a turn that was cancelled or crashed before the answer was
logged — the conversation row is written last, so such a turn simply does not
exist here. Pins made in the chat are joined back by conversation id.

LEGACY NOTICES. Rows logged before 2026-09-03 hold notice KINDS, not objects.
They are rendered as a notice that says the caveat was raised and its text was
not kept, rather than being dropped — a missing caveat is the worst outcome
(UI rule 4), and a notice that admits it is incomplete is still a notice.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional

TITLE_MAX = 80

# Every field a chat turn carries, so the route's Pydantic model and this
# builder cannot disagree about which keys exist.
LEGACY_NOTICE_SOURCE = "george.conversations (logged before 2026-09-03)"


def title_of(first_question: Optional[str]) -> str:
    """The first question, trimmed to one line. A chat has no other name."""
    text = " ".join((first_question or "").split())
    if not text:
        return "Untitled chat"
    if len(text) <= TITLE_MAX:
        return text
    cut = text[:TITLE_MAX].rsplit(" ", 1)[0] or text[:TITLE_MAX]
    return cut.rstrip(" ,;:") + "…"


def normalise_notices(raw: Any) -> list[dict]:
    """
    Notice objects out of whatever the log row holds.

    A dict passes through with its three fields. A bare string is a legacy
    kind and becomes a notice that says so. Anything else is dropped.
    """
    out: list[dict] = []
    for n in raw or []:
        if isinstance(n, Mapping) and n.get("kind"):
            out.append({
                "kind": str(n["kind"]),
                "message": str(n.get("message") or n["kind"]),
                "source": str(n["source"]) if n.get("source") else None,
            })
        elif isinstance(n, str) and n:
            out.append({
                "kind": n,
                "message": (
                    f"A '{n}' notice qualified this answer. Its wording was not "
                    f"kept when this turn was logged, so the caveat is present "
                    f"but its text is not."
                ),
                "source": LEGACY_NOTICE_SOURCE,
            })
    return out


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def build_turns(
    rows: Iterable[Mapping[str, Any]],
    calls_by_conversation: Mapping[str, Iterable[Mapping[str, Any]]],
    pins_by_conversation: Mapping[str, Iterable[Mapping[str, Any]]],
    pins_per_page: Mapping[Optional[str], int],
    errors_by_conversation: Mapping[str, str],
) -> list[dict]:
    """
    Conversation rows (oldest first) into alternating user / george turns.

    Args:
        rows: george.conversations rows for one thread, ordered by asked_at.
        calls_by_conversation: george.tool_calls rows keyed by conversation id,
            each iterable ordered by seq.
        pins_by_conversation: george.pins rows keyed by conversation id.
        pins_per_page: pin count per page for this user, so a pinned note can
            say how many tiles the page holds — what the live `pinned` frame
            carries.
        errors_by_conversation: the api_error / unhandled gap detail per
            conversation id, for a turn that ended without an answer.
    """
    turns: list[dict] = []
    for row in rows:
        cid = str(row["id"])
        asked_at = _iso(row.get("asked_at"))

        turns.append({"role": "user", "text": row.get("question") or "", "at": asked_at})

        tool_calls = []
        for c in calls_by_conversation.get(cid, []):
            tool_calls.append({
                "seq": int(c["seq"]),
                "tool": c["tool"],
                "arguments": dict(c.get("arguments") or {}),
                "result": {
                    "row_count": c.get("row_count"),
                    "source_table": c.get("source_table"),
                    "truncated": bool(c.get("truncated")),
                    "duration_ms": int(c.get("duration_ms") or 0),
                    "error": c.get("error"),
                },
            })

        pinned = []
        for p in pins_by_conversation.get(cid, []):
            pinned.append({
                "pin_id": str(p["id"]),
                "title": p["title"],
                "page": p.get("page"),
                "pins_on_page": int(pins_per_page.get(p.get("page"), 0)),
                "tool_calls": list(p.get("tool_calls") or []),
            })

        status = row.get("status") or "ok"
        usage = {
            "input": int(row.get("input_tokens") or 0),
            "output": int(row.get("output_tokens") or 0),
            "cache_read": int(row.get("cache_read_tokens") or 0),
        }
        turns.append({
            "role": "george",
            "text": row.get("final_answer") or "",
            "thinking": "",
            "at": _iso(row.get("logged_at")) or asked_at,
            "tool_calls": tool_calls,
            "notices": normalise_notices(row.get("notices")),
            "pinned": pinned,
            "receipts": dict(row["receipts"]) if row.get("receipts") else None,
            "done": {
                "conversation_id": cid,
                "thread_id": str(row.get("thread_id") or row["id"]),
                "iterations": int(row.get("iterations") or 0),
                "tool_calls": len(tool_calls),
                "status": status,
                "notice_forced": bool(row.get("notice_forced")),
                "usage": usage,
                "cache_hit": usage["cache_read"] > 0,
            },
            "error": errors_by_conversation.get(cid) if status != "ok" else None,
        })
    return turns

"""
The river, read.

PURE. No database, no session: the route fetches the rows and this module turns
them into the post list the UI renders — the same discipline chat_history.py
follows, and for the same reason. The shaping is testable without a connection,
and the route stays transport.

WHAT A POST CARRIES, AND WHY IT IS NOT NEGOTIABLE PER KIND. Every George post
carries `receipts` and `notices`, because UI rules 3, 4 and 6 apply to all of
them without exception (CLAUDE.md vocabulary, "Post"). A card that cannot show
a caveat is the wrong shape for the post, not a reason to drop the caveat — so
this module never strips either field, and `notices` is normalised the same way
chat_history normalises a reopened turn's, legacy string kinds included.

VISIBILITY IS APPLIED IN SQL, NOT HERE. A filter written in Python is a filter
somebody can forget to call; the route's WHERE clause is
`visibility = 'org' OR author_user = :me` and this module never sees a row it
should not have. What it DOES do is tell the client which of the two reasons a
post is visible for, so the UI can mark a private post as unshared.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional

from app.services.chat_history import normalise_notices

# How many posts one page of the river holds. The river is read newest-first
# and paged backwards through `before`, so this is a screenful and a bit rather
# than a history limit — nothing is unreachable, it just takes another request.
DEFAULT_LIMIT = 40
MAX_LIMIT = 200


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def build_post(row: Mapping[str, Any], viewer: str) -> dict[str, Any]:
    """
    One database row as the client renders it.

    Args:
        row: a george.posts row.
        viewer: the authenticated username, for `mine` — which decides whether
            the UI offers a share action, and nothing else. It is never used to
            filter: that has already happened in SQL.
    """
    author = row.get("author") or "george"
    author_user = row.get("author_user")
    return {
        "id": str(row["id"]),
        "thread_id": str(row["thread_id"]),
        "parent_id": str(row["parent_id"]) if row.get("parent_id") else None,
        "kind": row.get("kind") or "system",
        "author": author,
        "author_user": author_user,
        "visibility": row.get("visibility") or "private",
        # True when the viewer wrote it. The share action is theirs alone, and
        # a post they cannot share must not offer them the button.
        "mine": bool(author_user) and author_user == viewer,
        "body": row.get("body") or "",
        "payload": dict(row["payload"]) if row.get("payload") else None,
        "receipts": dict(row["receipts"]) if row.get("receipts") else None,
        # Never dropped, and legacy string kinds become real notices rather
        # than disappearing — a missing caveat is the worst outcome (UI rule 4).
        "notices": normalise_notices(row.get("notices")),
        "conversation_id": (
            str(row["conversation_id"]) if row.get("conversation_id") else None
        ),
        "created_at": _iso(row.get("created_at")),
    }


def build_river(rows: Iterable[Mapping[str, Any]], viewer: str) -> list[dict[str, Any]]:
    """
    A page of the river, oldest-first for rendering.

    The QUERY reads newest-first so that `before` can page backwards through
    history without counting from the beginning; the UI reads top-to-bottom
    like any thread. Reversing here rather than in SQL keeps those two facts in
    one place instead of leaving a client to discover the order is upside down.
    """
    return [build_post(r, viewer) for r in reversed(list(rows))]


def next_cursor(rows: Iterable[Mapping[str, Any]], limit: int) -> Optional[str]:
    """
    What to send as `before` for the page above this one, or None at the top.

    None means the river has been read to its beginning — a real end, not a
    failure to load, and the UI says so rather than showing a spinner forever
    (UI rule 8: a claim about state comes from a loaded result).
    """
    rows = list(rows)
    if len(rows) < limit:
        return None
    return _iso(rows[-1].get("created_at"))


def thread_of(rows: Iterable[Mapping[str, Any]], viewer: str) -> list[dict[str, Any]]:
    """One thread, oldest first. Already ordered by the query."""
    return [build_post(r, viewer) for r in rows]

"""
Setting a thing aside with a reason, for the room (W2.3, 2026-09-22).

A watch post, a morning finding or a thing Bob noticed is set aside with ONE
tap for why — known, not important, wrong. The reason is kept as a belief a
person told him (belief_store.dismiss), so it is seen and undone on the memory
view with every other view. This file is the web process's half: what a
watch post or a stuck item IS as a key, read from the stored post and never
from what a client says it was, and what the "Bob noticed" list does with
the keys that stand.

A PERSON'S GESTURE. The route calls this on the signed-in person's authority;
Bob has no tool for it and the loop holds no writer for it.
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tools import dismissal


class NotAnItem(LookupError):
    """The thing named is not something that can be set aside."""


def stuck_key(post_id: str, defs: dict) -> dict:
    """A stuck item's key, from the id GET /bob/noticed gave it: stuck:<what>:<name>."""
    head, _, rest = str(post_id or "").partition(":")
    what, _, name = rest.partition(":")
    if head != "stuck" or what not in defs["dismissal"]["items"]["stuck"]["what"] or not name.strip():
        raise NotAnItem("That is not something Bob noticed stopping.")
    kind = dismissal.kind_of("stuck", {"what": what}, defs)
    return {"item": "stuck", "kind": kind, "subjects": [name.strip()]}


async def watch_key(session: AsyncSession, post_id: str, defs: dict, *, me: str) -> dict:
    """
    A watch post's key, READ FROM THE POST: the watch's condition is the kind,
    and each subject it named (what started, else what stopped) a subject.
    """
    try:
        pid = uuid.UUID(str(post_id))
    except ValueError as exc:
        raise NotAnItem("That is not a post.") from exc
    row = (await session.execute(text("""
        SELECT p.payload, w.condition
          FROM george.posts p
          LEFT JOIN george.watches w ON w.id::text = p.payload->>'watch_id'
         WHERE p.id = :id AND p.kind = 'watch' AND p.hidden_at IS NULL
           AND (p.visibility = 'org' OR p.owner_user = :me)
    """), {"id": pid, "me": me})).mappings().first()
    if row is None or not row["condition"]:
        raise NotAnItem("That is not a watch post that can be set aside.")
    return {"item": "watch", **key_from_watch_post(row["payload"] or {}, str(row["condition"]), defs)}


def key_from_watch_post(payload: dict, condition: str, defs: dict) -> dict:
    kind = dismissal.kind_of("watch", {"condition": condition}, defs)
    named = [e for e in (payload.get("added") or []) if isinstance(e, dict)] \
        or [e for e in (payload.get("cleared") or []) if isinstance(e, dict)]
    subjects = [s for s in (dismissal.subject_of("watch", e, defs) for e in named) if s]
    return {"kind": kind, "subjects": subjects}


def disputed_line(hit: dict, subject: str, defs: dict) -> str:
    """The doubt, in the notice's own words (dismissal.disputed_message)."""
    return str(defs["dismissal"]["disputed_message"]).format(
        who=hit.get("by") or "Someone", subject=subject,
        kind_said=dismissal.kind_said(str(hit.get("kind")), defs),
        date=hit.get("on") or "earlier")


def judge(kind: Optional[str], subjects: list[str], quieted: Any, defs: dict
          ) -> tuple[bool, Optional[str]]:
    """
    (hidden, disputed) for one noticed item.

    Hidden only when EVERY subject it names was set aside as known or not
    important for this kind — a post that names a new shop beside a quieted
    one is news about the new shop. Disputed when any subject was called
    wrong: it stays, and says so.
    """
    if not kind or not subjects:
        return False, None
    hits = [(s, dismissal.match({"kind": kind, "subject": s}, quieted)) for s in subjects]
    doubted = [(s, h) for s, h in hits if h and not dismissal.reason_quiets(str(h.get("reason")), defs)]
    if doubted:
        s, h = doubted[0]
        return False, disputed_line(h, s, defs)
    quiet = all(h and dismissal.reason_quiets(str(h.get("reason")), defs) for _s, h in hits)
    return quiet, None

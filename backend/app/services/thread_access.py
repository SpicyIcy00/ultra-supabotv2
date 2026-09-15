"""
Who may continue a thread, and reply to which post in it.

A SENSITIVE BOUNDARY, KEPT NARROW. Until 2026-09-07 a thread could be
continued only by the person whose conversation it was — one SELECT on
george.conversations. That made every thread George starts on his own (the
morning brief, a workflow run, an approval) a dead end: nobody could reply,
because no conversation row existed for anyone to own.

So there are now exactly TWO ways in, and the decision between them is a
pure function the suite holds:

  1. OWN CONVERSATION. The caller has a visible conversation row in the
     thread. This is the old rule, unchanged.
  2. ORG ROOT. The thread's ROOT post — the post whose id IS the thread id,
     which is how river_writer names George's own posts — was written by
     George and is org-visible. A company-level post is something anyone in
     the company may reply to.

What is deliberately NOT a way in: "the caller can see something in the
thread". A private answer somebody shared into an org thread, or a private
question of your own in a thread you did not start, must not open the whole
thread to continuation — the root decides, and only the root.

A REPLY STAYS PRIVATE. Continuing an org thread writes a question post owned
by the replier, private by default (george_post.default_visibility), and the
answer George gives is theirs too. Other people keep seeing the brief; they
do not see the reply unless it is shared. The thread emerges, and nothing is
published by replying.

The parent check is the same shape: a reply may name the post it replies to,
and that post has to be in the thread and visible to the caller. Visibility
is the river's own filter, expressed once in _POST_VISIBLE and copied here
verbatim so the two cannot drift.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# The caller owns a conversation in this thread. thread_id is nullable for
# rows that predate the column, and COALESCE keeps every such row its own
# thread, exactly as routes/george.py reads it.
OWN_CONVERSATION_SQL = (
    "SELECT 1 FROM george.conversations c "
    "WHERE COALESCE(c.thread_id, c.id) = :t AND c.user_id = :u "
    "AND c.hidden_at IS NULL LIMIT 1"
)

# The thread's root post is George's and org-level. `p.id = :t AND
# p.thread_id = :t` is the definition of a root: river_writer writes every
# George post as its own thread, so a post that is not its own thread is a
# reply, and a reply never decides anything here.
ORG_ROOT_SQL = (
    "SELECT 1 FROM george.posts p "
    "WHERE p.id = :t AND p.thread_id = :t "
    "AND p.author = 'george' AND p.visibility = 'org' "
    "AND p.hidden_at IS NULL LIMIT 1"
)

# EVERY TURN OF THE THREAD THAT IS THE CALLER'S. The same scope and the same
# visibility clause as OWN_CONVERSATION_SQL, returning the ids instead of
# answering yes — a thread is a list of conversation rows, and anything joined
# to a thread (its tool calls, its pins) is joined by them. routes/george.py's
# get_chat has resolved the thread this way since the column existed; this is
# that resolution given a name so a second route does not carry a second copy.
THREAD_CONVERSATIONS_SQL = (
    "SELECT c.id FROM george.conversations c "
    "WHERE COALESCE(c.thread_id, c.id) = :t AND c.user_id = :u "
    "AND c.hidden_at IS NULL ORDER BY c.asked_at"
)

# The post a reply names is in the thread and visible to the caller — the
# river's own visibility clause, on owner_user, not author_user.
PARENT_IN_THREAD_SQL = (
    "SELECT 1 FROM george.posts p "
    "WHERE p.id = :p AND p.thread_id = :t AND p.hidden_at IS NULL "
    "AND (p.visibility = 'org' OR p.owner_user = :me) LIMIT 1"
)


def continuable(owns_conversation: bool, org_root: bool) -> bool:
    """
    The decision, as a function of the two facts. Either is enough; nothing
    else is consulted.
    """
    return bool(owns_conversation) or bool(org_root)


async def _exists(session: AsyncSession, sql: str, params: dict) -> bool:
    row = (await session.execute(text(sql), params)).first()
    return row is not None


async def thread_continuable(
    session: AsyncSession, username: str, thread_id: uuid.UUID,
) -> bool:
    """Whether `username` may add a turn to `thread_id`. Reads, never writes."""
    owns = await _exists(session, OWN_CONVERSATION_SQL, {"t": thread_id, "u": username})
    if owns:
        return continuable(True, False)
    root = await _exists(session, ORG_ROOT_SQL, {"t": thread_id})
    return continuable(False, root)


async def conversations_in_thread(
    session: AsyncSession, username: str, thread_id: uuid.UUID,
) -> list[uuid.UUID]:
    """
    The caller's conversation ids in `thread_id`, oldest first. Reads, never writes.

    EMPTY IS A REAL ANSWER and is not an error: a thread George started on his
    own has no conversation row of the caller's, and neither does a thread id
    that belongs to nobody. A caller asking what of THEIRS is in a thread gets
    the truth either way, and whether some other person's thread exists is not
    information this leaks.
    """
    rows = (
        await session.execute(
            text(THREAD_CONVERSATIONS_SQL), {"t": thread_id, "u": username},
        )
    ).scalars().all()
    return list(rows)


async def parent_in_thread(
    session: AsyncSession, username: str, thread_id: uuid.UUID, parent_id: uuid.UUID,
) -> bool:
    """Whether `parent_id` is a post in `thread_id` that `username` may see."""
    return await _exists(
        session, PARENT_IN_THREAD_SQL,
        {"p": parent_id, "t": thread_id, "me": username},
    )

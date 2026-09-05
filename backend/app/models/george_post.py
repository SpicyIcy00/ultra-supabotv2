"""
SQLAlchemy model for george.posts — the river.

One append-only timeline of everything George does and says, and everything
anyone says to him. A post is one utterance; a thread is a post and its replies
(CLAUDE.md vocabulary, amended 2026-09-05 when Chat was retired).

TWO WRITERS, ONE TABLE, AND NEITHER IS GEORGE'S READ ROLE.
`george_log` inserts question and answer posts as the loop logs them — INSERT
without SELECT, so it can never read a post back. Everything else is written by
the APPLICATION role, which is also the only reader. george_ro is not involved
at all and cannot see this schema. See the migration (n8o9p0q1r2s3).

THREADS EMERGE, AND THEY ARE NOT CREATED. `thread_id` groups posts into one
exchange; for a post derived from a turn it is the CONVERSATION's thread_id, so
a six-turn chat becomes twelve posts sharing one thread without anything having
opened it. Nothing ever creates an empty thread, because there is nothing to
create.

VISIBILITY IS PER POST. George's own posts are 'org' because a brief that fires
into a group chat at 06:00 is not private. A person's question and its answer
are 'private' until shared. The read filter is
`visibility = 'org' OR author_user = :me`, so opening the default later is a
change to one query and not a migration.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Index, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# The eight kinds, mirrored by KINDS in the migration and by the CHECK
# constraint. A kind present in one place and not the others must fail loudly
# rather than render as a blank card.
#
#   brief             the morning brief, as a post
#   notice            "I noticed X", with the moves it offers
#   answer            George answering something
#   question          a person asking something
#   approval          a version waiting to be promoted past the backtest gate
#   workflow_run      a saved rule that fired
#   pin_confirmation  a pin George made because he was asked to
#   system            the app speaking about itself
POST_KINDS = (
    "brief", "notice", "answer", "question",
    "approval", "workflow_run", "pin_confirmation", "system",
)

POST_AUTHORS = ("george", "user")
POST_VISIBILITY = ("org", "private")

# Which kinds George writes. He authors all of these; who they BELONG to is a
# separate question, answered by default_visibility below.
GEORGE_KINDS = ("brief", "notice", "answer", "approval",
                "workflow_run", "pin_confirmation", "system")

# George's kinds that are nonetheless somebody's private business.
#
#   answer            the reply to a private question, owned by the asker.
#   pin_confirmation  "a pin is one person's tile" (CLAUDE.md). Corrected
#                     2026-09-05, BEFORE the writer was wired: this defaulted
#                     to 'org' with the rest of George's kinds, which would
#                     have announced "Ice pinned Rockwell net sales" to the
#                     whole company the first time anybody pinned anything.
PRIVATE_GEORGE_KINDS = ("answer", "pin_confirmation")


class GeorgePost(Base):
    __tablename__ = "posts"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('brief', 'notice', 'answer', 'question', 'approval', "
            "'workflow_run', 'pin_confirmation', 'system')",
            name="ck_posts_kind",
        ),
        CheckConstraint("author IN ('george', 'user')", name="ck_posts_author"),
        CheckConstraint("visibility IN ('org', 'private')", name="ck_posts_visibility"),
        CheckConstraint(
            "(author = 'user' AND author_user IS NOT NULL) OR author = 'george'",
            name="ck_posts_actor",
        ),
        CheckConstraint(
            "visibility = 'org' OR owner_user IS NOT NULL",
            name="ck_posts_private_has_owner",
        ),
        Index("ix_posts_thread", "thread_id", "created_at"),
        Index("ix_posts_conversation", "conversation_id"),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)

    #: The exchange this post belongs to. For a post derived from a turn it
    #: is the conversation's thread_id.
    thread_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    #: The post being replied to. None for a root.
    parent_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))

    kind: Mapped[str] = mapped_column(Text, nullable=False)

    #: 'george' or 'user' — which side of the thread this is drawn on. Not a
    #: user id: George has no account.
    author: Mapped[str] = mapped_column(Text, nullable=False)
    #: Who WROTE it, when a person did. Also the schedule's created_by for an
    #: unattended run — an identity captured from a token, never from a model.
    #: NULL for George's own posts, because George has no account.
    author_user: Mapped[Optional[str]] = mapped_column(Text)
    #: WHOSE IT IS while private: who may see it, and who may share it. For a
    #: question that is its author; for the answer to that question it is the
    #: person who asked, not George. Those two facts were one column until
    #: 2026-09-05, and every answer post was invisible to everybody as a
    #: result — see alembic p0q1r2s3t4u5. A CHECK now forbids a private post
    #: without one.
    owner_user: Mapped[Optional[str]] = mapped_column(Text)

    visibility: Mapped[str] = mapped_column(Text, nullable=False, default="private")

    #: The standalone prose. A voice layer speaks exactly this, so it must
    #: never depend on `payload` to make sense.
    body: Mapped[Optional[str]] = mapped_column(Text)
    #: Kind-specific structure: rows, chips, buttons, ids.
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    #: meta — source_table, filters_applied, snapshot_timestamp (UI rules 3, 6).
    receipts: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    #: [{kind, message, source}] — surfaced above the body (UI rule 4).
    notices: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(JSONB)

    #: Back-reference into george.conversations, so a post traces to its turn.
    conversation_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    #: Hidden, never deleted — the same treatment a deleted chat gets, and for
    #: the same reason: the log behind it is load-bearing elsewhere.
    hidden_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


def default_visibility(kind: str) -> str:
    """
    What a post of this kind is visible to, absent an explicit choice.

    George's own posts are org-level BECAUSE OF WHAT THEY ARE, not because he
    wrote them: a brief, a run, an approval are company-level facts. Two of the
    kinds he authors are not — an answer belongs to whoever asked, and a pin
    confirmation to whoever pinned, because a pin is one person's tile.

    One function so the loop, the scheduler, the brief route and pin_writer
    cannot each decide differently — the asymmetry is a product rule
    (CLAUDE.md, "The river"), not a per-caller preference.
    """
    if kind in PRIVATE_GEORGE_KINDS:
        return "private"
    return "org" if kind in GEORGE_KINDS else "private"

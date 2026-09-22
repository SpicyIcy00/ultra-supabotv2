"""authority_and_requests

WHAT REACHES THE APPROVER, AND WHO THAT IS (W2.2, 2026-09-22).

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-09-22 00:02:00.000000

The owner's ops/STANDARD.md §15 — "Bob should not interrupt me for every small
decision … You don't need my approval for this anymore unless it's above
₱20,000" — and §11's "Managers can request but I approve". Three tables:

    george.people              who approves and who requests
    george.authority_versions  the line, one IMMUTABLE row per change
    george.requests            drafts waiting on a person, and what was decided

PEOPLE ARE SEEDED, ACCOUNTS ARE NOT. The users table has a role column that
means page access ('admin', 'warehouse_staff') and no managers; authority is a
different question, so it is its own table rather than a new value squeezed
into app_users.role. The four people Isaiah named are inserted here with no
login: `username` is NULL until an administrator links one (PUT
/bob/authority/people/{key}). No account and no password is created. The
seed is held to metrics.yaml authority.people by
tests/test_authority_contract.py. Recorded assumption, for the owner to
correct: Joy approves; Isaiah builds and does not approve purchases.

THE LINE IS VERSIONED AND NEVER UPDATED. "Under ₱20,000, don't interrupt me"
is a new row with its words, who said it and when; the current line is the
newest version of a rule; the history is every row. The service only ever
INSERTs here, as workflow versions are only ever inserted.

A REQUEST RECORDS WHAT ROUTED IT: the version of the line, the line's value
at that moment, the draft's value as code computed it (quantity × the
catalogue cost, never a figure the model wrote), and a sentence saying why it
went where it went. A decision moves `status` off `waiting` exactly once; a
change is a NEW row that `replaces` the old one, so what was asked for and
what was approved are both kept.

NOTHING HERE SENDS ANYTHING. An approved draft is keyed into StoreHub by a
person; no column records a transfer or an order being placed, because none
is.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Held to metrics.yaml authority.people by tests/test_authority_contract.py.
PEOPLE = (
    ("joy", "Joy", "approver", ["aji_ichiban", "ffr"]),
    ("isaiah", "Isaiah", "builder", ["aji_ichiban", "ffr"]),
    ("daniel", "Daniel", "requester", ["aji_ichiban"]),
    ("elijah", "Elijah", "requester", ["ffr"]),
)


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("person_key", sa.Text(), primary_key=True),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("businesses", postgresql.ARRAY(sa.Text()), nullable=False),
        # Lowercased app_users.username, once an administrator links one.
        sa.Column("username", sa.Text(), nullable=True),
        sa.Column("linked_by", sa.Text(), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role IN ('approver', 'builder', 'requester')",
                           name="ck_people_role"),
        sa.CheckConstraint("username IS NULL OR username = lower(username)",
                           name="ck_people_username_lowercase"),
        sa.UniqueConstraint("username", name="uq_people_username"),
        schema="george",
    )
    people = sa.table(
        "people",
        sa.column("person_key", sa.Text()),
        sa.column("display_name", sa.Text()),
        sa.column("role", sa.Text()),
        sa.column("businesses", postgresql.ARRAY(sa.Text())),
        schema="george",
    )
    op.bulk_insert(people, [
        {"person_key": k, "display_name": n, "role": r, "businesses": b}
        for k, n, r, b in PEOPLE
    ])

    op.create_table(
        "authority_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rule", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("mode", sa.Text(), nullable=False),
        sa.Column("line_php", sa.Numeric(14, 2), nullable=True),
        # Their words, as they said them.
        sa.Column("said", sa.Text(), nullable=False),
        sa.Column("set_by", sa.Text(), nullable=False),
        sa.Column("set_by_person", sa.Text(), nullable=False),
        sa.Column("set_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("conversation_id", sa.Text(), nullable=True),
        sa.CheckConstraint("mode IN ('over_line', 'every_draft', 'never')",
                           name="ck_authority_versions_mode"),
        sa.CheckConstraint("(mode = 'over_line') = (line_php IS NOT NULL)",
                           name="ck_authority_versions_line_matches_mode"),
        sa.CheckConstraint("line_php IS NULL OR line_php > 0",
                           name="ck_authority_versions_line_positive"),
        sa.CheckConstraint("version >= 1", name="ck_authority_versions_version"),
        sa.CheckConstraint("length(btrim(said)) > 0", name="ck_authority_versions_said"),
        sa.ForeignKeyConstraint(["set_by_person"], ["george.people.person_key"],
                                name="fk_authority_versions_person"),
        sa.UniqueConstraint("rule", "version", name="uq_authority_versions_rule_version"),
        schema="george",
    )

    op.create_table(
        "requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        # The read that produced the draft: {tool, arguments}. Re-run by the
        # service to value it; never rows the model typed.
        sa.Column("source_call", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("lines", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("moves", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("value_php", sa.Numeric(14, 2), nullable=False),
        sa.Column("unpriced_lines", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("snapshot_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("routed", sa.Text(), nullable=False),
        sa.Column("routed_because", sa.Text(), nullable=False),
        sa.Column("authority_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("line_php", sa.Numeric(14, 2), nullable=True),
        sa.Column("requested_by", sa.Text(), nullable=False),
        sa.Column("requested_by_person", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'waiting'")),
        sa.Column("decided_by", sa.Text(), nullable=True),
        sa.Column("decided_by_person", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("replaces", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint("kind IN ('purchase_draft')", name="ck_requests_kind"),
        sa.CheckConstraint("routed IN ('list', 'decision')", name="ck_requests_routed"),
        sa.CheckConstraint("status IN ('waiting', 'approved', 'rejected', 'changed')",
                           name="ck_requests_status"),
        sa.CheckConstraint("(status = 'waiting') = (decided_at IS NULL)",
                           name="ck_requests_decided_when_not_waiting"),
        sa.CheckConstraint("value_php >= 0", name="ck_requests_value_not_negative"),
        sa.CheckConstraint("jsonb_typeof(lines) = 'array'", name="ck_requests_lines_array"),
        sa.ForeignKeyConstraint(["authority_version_id"], ["george.authority_versions.id"],
                                name="fk_requests_authority_version"),
        sa.ForeignKeyConstraint(["replaces"], ["george.requests.id"],
                                name="fk_requests_replaces"),
        schema="george",
    )
    op.create_index("ix_requests_status_created", "requests",
                    ["status", sa.text("created_at DESC")], schema="george")


def downgrade() -> None:
    op.drop_index("ix_requests_status_created", table_name="requests", schema="george")
    op.drop_table("requests", schema="george")
    op.drop_table("authority_versions", schema="george")
    op.drop_table("people", schema="george")

"""add_george_cache_creation_tokens

george.conversations recorded input_tokens, output_tokens and
cache_read_tokens — the two halves you pay for and the half you get cheaply —
but never cache_creation_input_tokens, the WRITE. That omission is why the
question "is our prompt cache actually saving money" could not be answered
from our own log on 2026-09-05: a read costs 0.1x base input and a write costs
1.25x, so reads alone say the cache is being used, not that it is paying for
itself.

The gap mattered as soon as there was a decision to make. Extending the
breakpoints to the message tail trades more writes for far fewer full-price
input tokens, and the 1-hour TTL trades a 2x write for fewer of them; neither
trade can be confirmed against a column that does not exist. Backfill is
impossible — the API returned the number on every one of those turns and we
discarded it — so this column starts at NULL for history and is the reason the
before/after has to be measured forward from here.

Nullable, like the other three usage columns: a turn that never reached the
API has no usage to record, and a zero there would be a claim that a request
was made and wrote nothing.

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-09-05 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'o9p0q1r2s3t4'
down_revision: Union[str, None] = 'n8o9p0q1r2s3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No GRANT needed: george_log holds table-level INSERT on
    # george.conversations (agent/sql/george_log_role.sql), which covers
    # columns added later.
    op.execute(
        "ALTER TABLE george.conversations "
        "ADD COLUMN IF NOT EXISTS cache_creation_tokens integer"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE george.conversations "
        "DROP COLUMN IF EXISTS cache_creation_tokens"
    )

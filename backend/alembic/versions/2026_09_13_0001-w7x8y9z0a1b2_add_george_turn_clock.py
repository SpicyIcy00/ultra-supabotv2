"""add_george_turn_clock

WHAT A TURN COST IN SECONDS, MEASURED RATHER THAN INFERRED.

george.conversations recorded everything about a turn except how long the
person waited for it: iterations, tokens, notices, status. Phase 1's three
targets are all times — first visible change under 2 s, median answer under
10 s — and none of them could be reported from our own log.

Turn time LOOKED derivable, and that is the trap this column closes.
`logged_at - asked_at` is the insert clock minus the start clock, and those
are two different machines: across the 193 turns logged to 2026-09-13, the 58
api_error turns — which die in under a second — show a median of MINUS 1.68
seconds. The web process's clock runs ~1.8 s ahead of the database's. A
derived figure is therefore a real measurement plus an unknown, drifting
offset, which is exactly the kind of number CLAUDE.md rule 9 says must not be
computed on the way to a screen.

So:

  duration_ms      one monotonic clock, started when the turn starts and read
                   when it ends. Not a subtraction of two timestamps.
  iteration_ms     the same clock per iteration, as a jsonb array in order.
                   An iteration is one sequential model round trip, and
                   ops/NOW.md's Phase 1 note says it is iterations and not
                   database reads that make a turn slow — this is the column
                   that lets that claim be checked instead of believed.
  corrective_turns the six gates that make George write the answer again
                   (unsurfaced notice, pin / save / page claimed but not made,
                   volunteering cap, restated figure). Each one is a whole
                   extra model round trip and each was counted in a local
                   variable that the log never saw.

All three nullable, like the usage columns and for the same reason: a turn
that died before the API has no duration to state, and a zero there would be
the claim that it took no time. No backfill is possible — the clocks were
never read — so history stays NULL and the measurement runs forward.

Revision ID: w7x8y9z0a1b2
Revises: v6w7x8y9z0a1
Create Date: 2026-09-13 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'w7x8y9z0a1b2'
down_revision: Union[str, None] = 'v6w7x8y9z0a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No GRANT needed: george_log holds table-level INSERT on
    # george.conversations (agent/sql/george_log_role.sql), which covers
    # columns added later.
    op.execute(
        "ALTER TABLE george.conversations "
        "ADD COLUMN IF NOT EXISTS duration_ms integer"
    )
    op.execute(
        "ALTER TABLE george.conversations "
        "ADD COLUMN IF NOT EXISTS iteration_ms jsonb"
    )
    op.execute(
        "ALTER TABLE george.conversations "
        "ADD COLUMN IF NOT EXISTS corrective_turns integer"
    )
    # The clock report reads one window of one table and orders by the start
    # of the turn. 193 rows does not need an index; 193 thousand will, and the
    # column it filters on is the one that was already there.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_george_conversations_asked_at "
        "ON george.conversations (asked_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS george.ix_george_conversations_asked_at")
    for column in ("corrective_turns", "iteration_ms", "duration_ms"):
        op.execute(
            f"ALTER TABLE george.conversations DROP COLUMN IF EXISTS {column}"
        )

"""
Shared setup for the live, ROLLED-BACK page tests.

THE MIGRATION IS APPLIED INSIDE THE TEST'S OWN TRANSACTION when the database
has not had it yet. q1r2s3t4u5v6 (george.pages) was written on a branch, and the
database behind DATABASE_URL is the shared one: applying the revision for real
from an unmerged branch is a deploy decision, not a test's. So each scenario
opens one session, checks whether george.pages exists, runs the revision's
`upgrade()` on that same connection if it does not — assertions and all, which
makes every run of this suite a dry run of the migration against the live rows
— exercises the services, and rolls everything back. DDL is transactional in
Postgres, so the database is left exactly as it was found.

Once the revision has been applied for real, the check finds the table and the
scenarios run against it directly. Both states are correct; neither is
special-cased anywhere else.

NEEDS DATABASE_URL — the application role's connection, the one the routes
use. Every module that imports this skips itself without it.
"""

from __future__ import annotations

import contextlib
import importlib.util
import os
from pathlib import Path
from typing import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "backend" / "alembic" / "versions" / (
    "2026_09_08_0001-q1r2s3t4u5v6_add_george_pages.py"
)


def available() -> bool:
    return bool(os.environ.get("DATABASE_URL"))


def _load_migration():
    spec = importlib.util.spec_from_file_location("george_pages_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _pages_table_exists(sync_conn) -> bool:
    return bool(sync_conn.execute(text(
        "SELECT 1 FROM information_schema.tables "
        " WHERE table_schema = 'george' AND table_name = 'pages'"
    )).scalar())


def apply_migration_if_needed(sync_conn) -> bool:
    """
    Run the revision's upgrade() on this connection unless it has already
    been applied. Returns True when it ran. Synchronous — call through
    `await conn.run_sync(...)`, exactly as alembic's own env.py does.
    """
    if _pages_table_exists(sync_conn):
        return False
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_migration()
    ctx = MigrationContext.configure(connection=sync_conn)
    with Operations.context(ctx):
        module.upgrade()
    return True


def downgrade_migration(sync_conn) -> None:
    """The revision's downgrade(), for the round-trip test. Same connection."""
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_migration()
    ctx = MigrationContext.configure(connection=sync_conn)
    with Operations.context(ctx):
        module.downgrade()


@contextlib.asynccontextmanager
async def migrated_session() -> AsyncIterator[AsyncSession]:
    """
    One session, the pages schema present, everything rolled back at the end.

    Disposes the engine before and after: a connection left by an earlier
    asyncio.run in the process belongs to a loop that is now closed, and the
    next asyncio.run would be handed it.
    """
    from app.core.database import AsyncSessionLocal, engine

    await engine.dispose()
    async with AsyncSessionLocal() as s:
        try:
            conn = await s.connection()
            await conn.run_sync(apply_migration_if_needed)
            yield s
        finally:
            await s.rollback()
    await engine.dispose()

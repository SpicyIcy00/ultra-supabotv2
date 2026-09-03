"""
Boot-time schema verification: the database must be at the alembic head this
code was written against, or the process refuses to serve.

WHY THIS EXISTS. On 2026-09-04 the chats feature deployed and production
returned 500 on GET /george/chats and POST /george/ask. The code expected
`george.conversations.thread_id`; the database was two migrations behind. The
start command reads `alembic upgrade head && uvicorn ...`, so either alembic
never ran or it ran against something else — and either way the app booted,
looked healthy, and served 500s until a person noticed. The workflows
migration had been missing the same way since the day before (George's saves
failed with ProgrammingError), which nobody caught because nothing checked.

An app that boots against a schema it cannot use is worse than one that does
not boot: a crash is visible at deploy time, a 500 is visible at the next
user. So the check runs FIRST in startup, before any ad-hoc DDL and before a
single request, and by default raises — uvicorn exits non-zero and the deploy
fails where the deploy log is.

WHAT "AT HEAD" MEANS. alembic_version must hold exactly the head revision(s)
of the migration scripts shipped with this code. Behind (a migration did not
run), ahead (the database has a revision this code has never heard of — an
older build), no table at all (migrations never ran here), or a branched
history (more than one head, an authoring error) all fail. The message names
which, because they have different fixes.

The ad-hoc `CREATE TABLE IF NOT EXISTS` block in main.py is deliberately not
covered: it is idempotent and self-healing by construction, which is the
opposite failure mode.

SCHEMA_CHECK env:
    fail   (default)  mismatch raises SchemaMismatch; the process does not serve
    warn              mismatch is printed and /health reports it; serving
                      continues. For an emergency only, and say why.
    off               not checked at all. Do not ship this.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

# backend/app/core/schema_check.py -> parents[2] == backend/, which holds
# alembic.ini and alembic/. Resolved from __file__ so the check does not depend
# on the process's cwd — the very thing that may differ between a local run
# and the deploy.
BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
SCRIPT_LOCATION = BACKEND_DIR / "alembic"


class SchemaMismatch(RuntimeError):
    """The database is not at the revision this code expects."""


@dataclass(frozen=True)
class SchemaStatus:
    ok: bool
    current: tuple[str, ...]      # what alembic_version holds; () if no table
    expected: tuple[str, ...]     # the script head(s)
    problem: Optional[str]        # None when ok

    def as_dict(self) -> dict:
        return {
            "ok": self.ok,
            "current": list(self.current),
            "expected": list(self.expected),
            "problem": self.problem,
        }


def expected_heads() -> tuple[str, ...]:
    """The head revision(s) of the migration scripts shipped with this code."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(SCRIPT_LOCATION))
    return tuple(sorted(ScriptDirectory.from_config(cfg).get_heads()))


def compare(current: Iterable[str], expected: Iterable[str]) -> SchemaStatus:
    """
    Pure comparison, so the decision is testable without a database.

    `current` is what alembic_version holds (empty when the table is absent);
    `expected` is the script head(s).
    """
    cur = tuple(sorted(set(current)))
    exp = tuple(sorted(set(expected)))

    if len(exp) != 1:
        problem = (
            f"the migration scripts have {len(exp)} heads {list(exp)}; the "
            f"history is branched and must be merged before this can deploy"
            if exp else "no migration scripts were found beside alembic.ini"
        )
        return SchemaStatus(False, cur, exp, problem)

    if not cur:
        return SchemaStatus(
            False, cur, exp,
            f"alembic_version is absent or empty — migrations have never run "
            f"against this database; expected head {exp[0]}",
        )
    if cur == exp:
        return SchemaStatus(True, cur, exp, None)
    if len(cur) > 1:
        return SchemaStatus(
            False, cur, exp,
            f"alembic_version holds {len(cur)} revisions {list(cur)}; expected "
            f"exactly {exp[0]}",
        )

    # One revision each, and they differ. Behind or ahead?
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(SCRIPT_LOCATION))
    script = ScriptDirectory.from_config(cfg)
    known = {rev.revision for rev in script.walk_revisions()}
    if cur[0] in known:
        problem = (
            f"database is at {cur[0]}, code expects {exp[0]} — the database is "
            f"BEHIND: `alembic upgrade head` did not run, or ran against a "
            f"different database"
        )
    else:
        problem = (
            f"database is at {cur[0]}, which these migration scripts do not "
            f"contain; code expects {exp[0]} — the database is AHEAD of this "
            f"build, or belongs to a different history"
        )
    return SchemaStatus(False, cur, exp, problem)


async def read_current(engine: AsyncEngine) -> tuple[str, ...]:
    """What alembic_version holds; () when the table does not exist."""
    async with engine.connect() as conn:
        exists = (
            await conn.execute(text("SELECT to_regclass('public.alembic_version')"))
        ).scalar_one()
        if exists is None:
            return ()
        rows = (await conn.execute(text("SELECT version_num FROM alembic_version"))).all()
        return tuple(sorted(r[0] for r in rows))


def mode() -> str:
    value = (os.environ.get("SCHEMA_CHECK") or "fail").strip().lower()
    return value if value in ("fail", "warn", "off") else "fail"


async def verify(engine: AsyncEngine) -> SchemaStatus:
    """
    Check the database against the shipped migrations.

    Raises SchemaMismatch in `fail` mode (the default). In `warn` mode the
    problem is printed and returned for /health to report. In `off` mode the
    database is not consulted and the status says so.
    """
    if mode() == "off":
        return SchemaStatus(True, (), expected_heads(), "SCHEMA_CHECK=off — not verified")

    status = compare(await read_current(engine), expected_heads())
    if status.ok:
        print(f"Schema check: database at {status.current[0]} == head. OK.")
        return status

    line = f"SCHEMA CHECK FAILED: {status.problem}"
    if mode() == "warn":
        print(f"{line} (SCHEMA_CHECK=warn — serving anyway; /health reports it)")
        return status
    print(f"{line}. Refusing to serve: an app that boots against a schema it "
          f"cannot use returns 500s until somebody notices. Run "
          f"`alembic upgrade head` with this build's migrations, or set "
          f"SCHEMA_CHECK=warn for an emergency and say why.")
    raise SchemaMismatch(status.problem)

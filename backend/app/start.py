"""One launch path for Railway, Procfile and Nixpacks — and it migrates.

WHY THIS WAS REWRITTEN (2026-09-13, card P0.4).

This file used to read:

    if settings.AUTO_MIGRATE_ON_START:
        alembic upgrade head
    else:
        print("Automatic migrations disabled: application will verify schema")

and the docstring said staging "migrates explicitly before launching this
app". Railway has the flag set false and **there is no explicit release step**
— so the else branch printed a sentence and launched a process that could not
serve. That is not a hypothetical: on 2026-09-12 a deploy booted four
migrations behind and refused every request, and on 09-13 the P0.3 migration
put `main` in the same state before this card ran.

The setting promised an external migration and nothing kept the promise. So
the promise is gone:

    THE DATABASE IS BROUGHT TO HEAD BEFORE THE APP IS LAUNCHED, ALWAYS,
    AND NOT BOOTING IS NEVER PREFERRED TO MIGRATING.

`AUTO_MIGRATE_ON_START=false` still means something — it means "somebody else
is supposed to have done this" — and it is now a CHECKED claim: when the
database is already at head the launcher does nothing and says the claim held,
and when it is behind the launcher migrates anyway and says the claim did not.
An operator reading the deploy log learns that their release step is missing,
which is the thing the old branch hid.

WHAT IT WILL NOT DO. `alembic upgrade head` fixes a database that is BEHIND.
It cannot fix one that is AHEAD of this build (an older image, or a rollback),
and it cannot fix a branched history. In both cases the launcher migrates
nothing, says which it is, and launches anyway — so the app's own schema check
refuses to serve and /health reports the mismatch to whoever is looking. A
launcher that "fixed" a rollback by upgrading the database would take the
outage from one process to the whole estate.

CONCURRENT BOOTS. The upgrade is taken under a postgres advisory lock held by
this process for as long as the subprocess runs, so two replicas starting
together serialise: the second waits, then finds head and does nothing.
Without it both would race the same DDL. The lock is advisory, so it costs
nothing and blocks nobody who is not also migrating.
"""
import os
import subprocess
import sys
from contextlib import contextmanager

from app.core.config import settings
from app.core.schema_check import (
    compare,
    expected_heads,
    read_current_sync,
    sync_database_url,
)

# One arbitrary, fixed 64-bit key, so every process that might migrate this
# database queues on the same lock. Nothing else in the estate takes an
# advisory lock; if something ever does, it must not reuse this number.
MIGRATION_LOCK_KEY = 8_090_413_001_300_413


def _say(line: str) -> None:
    # flush=True: a launcher's output is a deploy log, and a buffered line
    # that arrives after the crash is a line nobody reads.
    #
    # ASCII-only, and encoded defensively. A launcher that raises
    # UnicodeEncodeError writing its own status line has failed a deploy over
    # a dash, and stdout is not always UTF-8 — a Windows console is cp1252.
    try:
        print(line, flush=True)
    except UnicodeEncodeError:  # pragma: no cover - depends on the console
        print(line.encode("ascii", "replace").decode("ascii"), flush=True)


@contextmanager
def _lock():
    """
    Hold the migration advisory lock for the length of the block.

    The lock lives on THIS connection, held open across the alembic
    subprocess. Session-scoped, so it goes even if this process is killed
    mid-migration — a stranded lock would block every future boot, which is a
    worse outage than the one it prevents.
    """
    from sqlalchemy import create_engine, text

    engine = create_engine(sync_database_url(settings.DATABASE_URL),
                           pool_pre_ping=False,
                           connect_args={"connect_timeout": 15})
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT pg_advisory_lock(:key)"),
                         {"key": MIGRATION_LOCK_KEY})
            _say("Migration lock held")
            try:
                yield
            finally:
                conn.execute(text("SELECT pg_advisory_unlock(:key)"),
                             {"key": MIGRATION_LOCK_KEY})
    finally:
        engine.dispose()


def _upgrade() -> None:
    """`alembic upgrade head`, under the lock, failing the deploy if it fails."""
    with _lock():
        _say("Running alembic upgrade head")
        # check=True: a migration that fails must fail the DEPLOY, where the
        # deploy log is, rather than launching an app that cannot serve.
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                       check=True)


def migrate_if_needed() -> None:
    """
    Bring the database to the head this build ships, or say why it was not
    touched. Never raises for a database it cannot read — the app's own
    schema check is the gate, and it is a better place to fail than here.
    """
    expected = expected_heads()
    try:
        current = read_current_sync(settings.DATABASE_URL)
    except Exception as exc:  # noqa: BLE001 - never print a connection string
        # A database this cannot reach is not a migration decision. Launch,
        # and let startup's schema check produce the real error with the real
        # engine, where it is already handled and already redacted.
        _say(f"Schema state unreadable before launch ({type(exc).__name__}); "
             f"leaving it to the application's own schema check")
        return

    status = compare(current, expected)
    at = current[0] if len(current) == 1 else list(current)

    if status.ok:
        if settings.AUTO_MIGRATE_ON_START:
            _say(f"Database already at head {expected[0]}; nothing to migrate")
        else:
            # The claim the setting makes, and this time it held.
            _say(f"Database at head {expected[0]}; AUTO_MIGRATE_ON_START is off "
                 f"and the release step had already run")
        return

    # Behind — including "alembic_version is absent", which is a database that
    # has never been migrated and is behind by all of it.
    behind = not current or (len(current) == 1 and current[0] in _known_revisions())
    if not behind:
        _say(f"NOT MIGRATING: {status.problem}. `alembic upgrade head` cannot "
             f"move a database that is ahead of this build or on a branched "
             f"history. Launching anyway so the schema check reports it on "
             f"/health rather than this launcher guessing.")
        return

    if settings.AUTO_MIGRATE_ON_START:
        _say(f"Database at {at}, code expects {expected[0]} - migrating")
    else:
        _say(f"Database at {at}, code expects {expected[0]}. "
             f"AUTO_MIGRATE_ON_START is off, which claims an external release "
             f"step migrates this database - it did not. MIGRATING ANYWAY: "
             f"booting behind the schema serves nothing at all. Add the release "
             f"step, or clear the setting.")
    _upgrade()


def _known_revisions() -> set:
    """Every revision these scripts contain, for telling behind from ahead."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from app.core.schema_check import ALEMBIC_INI, SCRIPT_LOCATION

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(SCRIPT_LOCATION))
    return {rev.revision for rev in ScriptDirectory.from_config(cfg).walk_revisions()}


def main():
    from app.core.build import revision

    build = revision()
    _say(f"Starting build {build['short'] or 'unknown'} "
         f"(revision source: {build['source']})")
    migrate_if_needed()
    os.execv(sys.executable, [sys.executable, "-m", "uvicorn", "app.main:app",
                            "--host", "0.0.0.0", "--port", os.environ.get("PORT", "8000")])


if __name__ == "__main__":
    main()

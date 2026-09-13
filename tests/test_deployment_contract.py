"""Deployment boundaries exercised without a database or model."""
import asyncio
import ast
import contextlib
import importlib
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings, settings
from app.core.deployment import require_business_writes, require_workflow_writes

ROOT = Path(__file__).resolve().parents[1]


def test_production_compatibility_defaults():
    config = Settings(_env_file=None)
    for name in ('SCHEDULERS_ENABLED', 'STARTUP_BOOTSTRAP_ENABLED',
                 'AUTO_MIGRATE_ON_START', 'GEORGE_ENABLE_WORKFLOW_WRITES', 'BUSINESS_WRITES_ENABLED'):
        assert getattr(config, name) is True


def test_disabled_scheduler_never_constructs_or_registers_jobs(monkeypatch, capsys):
    from app.services import scheduler
    monkeypatch.setattr(settings, 'SCHEDULERS_ENABLED', False)
    constructor = Mock(side_effect=AssertionError('scheduler must not be constructed'))
    monkeypatch.setattr(scheduler, 'AsyncIOScheduler', constructor)
    scheduler.start_scheduler()
    constructor.assert_not_called()
    assert 'Schedulers disabled' in capsys.readouterr().out


def test_staging_startup_runs_no_bootstrap_and_logs_no_connection(monkeypatch, capsys):
    monkeypatch.setattr(settings, 'SECRET_KEY', 'x' * 64)
    monkeypatch.setattr(settings, 'STARTUP_BOOTSTRAP_ENABLED', False)
    monkeypatch.setattr(settings, 'SCHEDULERS_ENABLED', False)
    monkeypatch.setattr(settings, 'DATABASE_URL', 'postgresql://user:SENTINEL@host/db?token=SENTINEL')
    from app.core import schema_check
    async def verified(_):
        return SimpleNamespace(as_dict=lambda: {'ok': True})
    monkeypatch.setattr(schema_check, 'verify', verified)
    from app.services import startup_bootstrap
    bootstrap = Mock(side_effect=AssertionError('no boot writes'))
    monkeypatch.setattr(startup_bootstrap, 'bootstrap', bootstrap)
    main = importlib.import_module('app.main')
    monkeypatch.setattr(main.SchemaContext, 'initialize', Mock())
    asyncio.run(main.startup_event())
    bootstrap.assert_not_called()
    output = capsys.readouterr().out
    assert 'SENTINEL' not in output and 'postgresql://' not in output
    assert 'Startup bootstrap disabled' in output and 'Schedulers disabled' in output


def test_launcher_migrates_a_behind_database_even_when_the_setting_is_off(monkeypatch, capsys):
    """
    THIS TEST USED TO ASSERT THE OPPOSITE, and the opposite is what broke
    production twice.

    It held that AUTO_MIGRATE_ON_START=false means "run no migration", on the
    strength of a docstring saying staging migrates "as an explicit release
    step". Railway has the flag off and has no release step, so on 2026-09-12 a
    deploy booted four migrations behind and refused every request, and on
    09-13 the P0.3 migration put `main` in the same state.

    The rule now: the setting claims somebody else migrates, the launcher
    CHECKS the claim, and when the claim is false it migrates anyway — because
    not booting is never better than migrating. See app/start.py.
    """
    from app import start
    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', False)
    monkeypatch.setattr(start, 'expected_heads', lambda: ('head_rev',))
    monkeypatch.setattr(start, 'read_current_sync', lambda url: ('behind_rev',))
    monkeypatch.setattr(start, '_known_revisions', lambda: {'behind_rev', 'head_rev'})
    upgraded = Mock()
    monkeypatch.setattr(start, '_upgrade', upgraded)
    monkeypatch.setattr(start.os, 'execv', Mock())
    start.main()
    upgraded.assert_called_once()
    out = capsys.readouterr().out
    assert 'MIGRATING ANYWAY' in out
    # And it names the missing release step, so the operator learns the
    # setting is lying rather than just seeing a migration they did not expect.
    assert 'it did not' in out


def test_launcher_does_nothing_when_the_database_is_already_at_head(monkeypatch, capsys):
    from app import start
    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', False)
    monkeypatch.setattr(start, 'expected_heads', lambda: ('head_rev',))
    monkeypatch.setattr(start, 'read_current_sync', lambda url: ('head_rev',))
    upgraded = Mock(side_effect=AssertionError('nothing to migrate'))
    monkeypatch.setattr(start, '_upgrade', upgraded)
    launch = Mock()
    monkeypatch.setattr(start.os, 'execv', launch)
    start.main()
    upgraded.assert_not_called()
    assert 'the release step had already run' in capsys.readouterr().out
    assert 'app.main:app' in launch.call_args.args[1]


def test_launcher_refuses_to_migrate_a_database_ahead_of_this_build(monkeypatch, capsys):
    """
    `alembic upgrade head` moves a database FORWARD. A database already ahead
    of this build is a rollback or an older image, and upgrading is not the
    fix — it would take an outage from one process to the whole estate. The
    launcher says so and lets the app's schema check refuse to serve.
    """
    from app import start
    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', True)
    monkeypatch.setattr(start, 'expected_heads', lambda: ('old_head',))
    monkeypatch.setattr(start, 'read_current_sync', lambda url: ('a_future_rev',))
    monkeypatch.setattr(start, '_known_revisions', lambda: {'old_head'})
    upgraded = Mock(side_effect=AssertionError('must not migrate'))
    monkeypatch.setattr(start, '_upgrade', upgraded)
    launch = Mock()
    monkeypatch.setattr(start.os, 'execv', launch)
    start.main()
    upgraded.assert_not_called()
    assert 'NOT MIGRATING' in capsys.readouterr().out
    # Still launched: the schema check is the gate, and /health is where the
    # mismatch has to be readable.
    assert 'app.main:app' in launch.call_args.args[1]


def test_a_database_that_has_never_been_migrated_is_behind_not_ahead(monkeypatch):
    from app import start
    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', True)
    monkeypatch.setattr(start, 'expected_heads', lambda: ('head_rev',))
    monkeypatch.setattr(start, 'read_current_sync', lambda url: ())
    monkeypatch.setattr(start, '_known_revisions', lambda: {'head_rev'})
    upgraded = Mock()
    monkeypatch.setattr(start, '_upgrade', upgraded)
    monkeypatch.setattr(start.os, 'execv', Mock())
    start.main()
    upgraded.assert_called_once()


def test_an_unreadable_database_launches_rather_than_dying_in_the_launcher(monkeypatch, capsys):
    from app import start

    def boom(url):
        raise RuntimeError('SENTINEL postgresql://user:secret@host/db')

    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', True)
    monkeypatch.setattr(start, 'expected_heads', lambda: ('head_rev',))
    monkeypatch.setattr(start, 'read_current_sync', boom)
    upgraded = Mock(side_effect=AssertionError('cannot migrate what it cannot read'))
    monkeypatch.setattr(start, '_upgrade', upgraded)
    launch = Mock()
    monkeypatch.setattr(start.os, 'execv', launch)
    start.main()
    upgraded.assert_not_called()
    out = capsys.readouterr().out
    assert 'unreadable' in out
    # The launcher's output is a deploy log and the exception carries a URL.
    assert 'SENTINEL' not in out and 'secret' not in out and 'postgresql://' not in out
    assert 'app.main:app' in launch.call_args.args[1]


def test_the_migration_runs_under_an_advisory_lock(monkeypatch):
    """
    Two replicas booting together must not race the same DDL. The lock is held
    on the launcher's own connection for as long as alembic runs, so the
    second process waits and then finds head.
    """
    source = ROOT / 'backend' / 'app' / 'start.py'
    body = source.read_text(encoding='utf-8')
    lock = body.split('def _lock')[1].split('\ndef ')[0]
    assert 'pg_try_advisory_lock' in lock and 'pg_advisory_unlock' in lock
    # TRY, never the blocking acquire. A launcher that waits forever is a
    # container that never opens a port, and the platform reports that as a
    # boot timeout rather than as a lock somebody is holding.
    assert 'SELECT pg_advisory_lock' not in lock
    assert 'LOCK_WAIT_SECONDS' in lock, 'the wait must be bounded'
    # Unlocked in a finally, so a dead alembic does not strand the lock and
    # block every future boot.
    assert 'finally:' in lock
    upgrade = body.split('def _upgrade')[1].split('\ndef ')[0]
    assert 'with _lock() as mine:' in upgrade, 'the upgrade must run inside the lock'
    assert 'check=True' in upgrade, 'a failed migration must be raised, not swallowed'


def test_a_failed_migration_never_stops_the_server_starting(monkeypatch, capsys):
    """
    THE OUTAGE THIS FILE LEARNED FROM, 2026-09-13.

    The first deploy carrying the self-migrating launcher went to 502 and
    stayed there for over half an hour. Something in the migration path
    raised, main() died before execv, the container exited, and Railway
    crashlooped it. From outside all of that reads "Application failed to
    respond" — no revisions, no error, nothing. The database was not migrated
    either, so refusing to start bought nothing at all.

    A migration failure must be LOUD and NOT FATAL. The app starts, its own
    schema check refuses to serve, and /health answers 503 naming the
    revision the database is on and the one this build wants.
    """
    from app import start
    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', True)
    monkeypatch.setattr(start, 'expected_heads', lambda: ('head_rev',))
    monkeypatch.setattr(start, 'read_current_sync', lambda url: ('behind_rev',))
    monkeypatch.setattr(start, '_known_revisions', lambda: {'behind_rev', 'head_rev'})

    def explode():
        raise RuntimeError('SENTINEL postgresql://user:secret@host/db')

    monkeypatch.setattr(start, '_upgrade', explode)
    launch = Mock()
    monkeypatch.setattr(start.os, 'execv', launch)
    start.main()
    launch.assert_called_once()
    assert 'app.main:app' in launch.call_args.args[1], (
        'the server must start even when the migration failed'
    )
    out = capsys.readouterr().out
    assert 'MIGRATION FAILED' in out and 'RuntimeError' in out
    assert '/health' in out, 'the log must say where the reason will be readable'
    assert 'SENTINEL' not in out and 'secret' not in out and 'postgresql://' not in out


def test_nothing_in_the_launcher_can_stop_execv(monkeypatch):
    """
    The general form, so a future addition before execv cannot reintroduce the
    crashloop: whatever migrate_if_needed does, main() reaches the server.
    """
    from app import start
    # Exception, not BaseException: a KeyboardInterrupt or a SystemExit SHOULD
    # stop the process, and swallowing those would make the container
    # unkillable. Everything a migration can realistically raise is here.
    for boom in (RuntimeError, OSError, ValueError, subprocess.SubprocessError):
        monkeypatch.setattr(start, 'migrate_if_needed',
                            Mock(side_effect=boom('anything at all')))
        launch = Mock()
        monkeypatch.setattr(start.os, 'execv', launch)
        start.main()
        launch.assert_called_once()


def test_every_launch_path_is_the_one_that_migrates():
    """
    railway.json, nixpacks.toml, the Procfile and start.sh must all reach
    app.start. start.sh ran uvicorn directly until 2026-09-13, so a deploy
    falling back to it skipped the migration and nothing said so.
    """
    for name in ('railway.json', 'nixpacks.toml', 'Procfile', 'start.sh'):
        body = (ROOT / name).read_text(encoding='utf-8')
        assert 'app.start' in body, f'{name} does not launch through app.start'
    # Comments may say the word; the script may not run it.
    commands = [line for line in (ROOT / 'start.sh').read_text(encoding='utf-8').splitlines()
                if line.strip() and not line.strip().startswith('#')]
    assert not any('uvicorn' in line for line in commands), (
        'start.sh must not have a second launch path of its own'
    )


def test_bootstrap_failures_never_print_exception_credentials(monkeypatch, capsys):
    from app.core import database
    from app.services.startup_bootstrap import bootstrap
    begin = Mock(side_effect=RuntimeError('SENTINEL postgresql://user:secret@host/db?token=secret'))
    monkeypatch.setattr(database, 'engine', SimpleNamespace(begin=begin))
    asyncio.run(bootstrap())
    assert begin.call_count == 3
    output = capsys.readouterr().out
    assert 'RuntimeError' in output
    assert 'SENTINEL' not in output and 'secret' not in output and 'postgresql://' not in output


def test_production_launcher_migrates_before_start(monkeypatch):
    from app import start
    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', True)
    monkeypatch.setattr(start, 'expected_heads', lambda: ('head_rev',))
    monkeypatch.setattr(start, 'read_current_sync', lambda url: ('behind_rev',))
    monkeypatch.setattr(start, '_known_revisions', lambda: {'behind_rev', 'head_rev'})
    order = []
    # subprocess is patched, not _upgrade: this case holds the actual command
    # and that the migration finishes before the server is exec'd. The lock
    # needs a database, which this test does not have.
    monkeypatch.setattr(start, '_lock', lambda: contextlib.nullcontext(True))
    monkeypatch.setattr(start.subprocess, 'run',
                        lambda command, **kw: order.append(('migration', command, kw)))
    monkeypatch.setattr(start.os, 'execv', lambda *args: order.append(('server', args)))
    start.main()
    assert [call[0] for call in order] == ['migration', 'server']
    assert order[0][1][-3:] == ['alembic', 'upgrade', 'head']
    assert order[0][2]['check'] is True


@pytest.mark.parametrize('method,path,allowed', [
    ('POST', '/api/v1/george/pins', True), ('POST', '/api/v1/george/pages', True),
    ('PATCH', '/api/v1/george/pages/p', True), ('POST', '/api/v1/auth/login', True),
    ('POST', '/api/v1/packing', False), ('POST', '/api/v1/brief/send', False),
    ('POST', '/api/v1/sheets', False), ('POST', '/api/v1/storehub-imports', False),
    ('POST', '/api/v1/barcodes/push', False), ('GET', '/api/v1/analytics', True),
])
def test_business_mutations_closed_but_personal_work_remains(monkeypatch, method, path, allowed):
    monkeypatch.setattr(settings, 'BUSINESS_WRITES_ENABLED', False)
    app = FastAPI(dependencies=[Depends(require_business_writes)])
    app.add_api_route(path, lambda: {'ok': True}, methods=[method])
    with TestClient(app) as client:
        assert client.request(method, path).status_code == (200 if allowed else 403)


@pytest.mark.parametrize('path', ['', '/w/promote', '/w/schedules', '/w/schedules/s'])
def test_workflow_http_mutations_closed_even_without_ui(monkeypatch, path):
    monkeypatch.setattr(settings, 'GEORGE_ENABLE_WORKFLOW_WRITES', False)
    app = FastAPI(dependencies=[Depends(require_workflow_writes)])
    app.add_api_route('/workflows' + path, lambda: {}, methods=['POST', 'PATCH'])
    with TestClient(app) as client:
        assert client.post('/workflows' + path).status_code == 403
        assert client.patch('/workflows' + path).status_code == 403


def test_disabled_route_writer_is_absent_from_model_schema(monkeypatch):
    from agent import loop
    from agent.write_tools import WriteContext
    # Evaluate the actual writer expression passed by the route, then use the
    # loop's real capability registry and schema builder (no Anthropic client).
    tree = ast.parse((ROOT / 'backend/app/api/v1/routes/george.py').read_text(encoding='utf-8'))
    expressions = [kw.value for node in ast.walk(tree) if isinstance(node, ast.Call)
                   for kw in node.keywords if kw.arg == 'workflow_writer'
                   and isinstance(kw.value, ast.IfExp)]
    assert len(expressions) == 1
    monkeypatch.setattr(settings, 'GEORGE_ENABLE_WORKFLOW_WRITES', False)
    writer = eval(compile(ast.Expression(expressions[0]), '<route writer>', 'eval'), {
        'settings': settings, '_WorkflowWriter': Mock(side_effect=AssertionError('not constructed')),
    })
    ctx = WriteContext(writer=object(), page_writer=object(), workflow_writer=writer)
    names = set(loop.injected_surface(ctx))
    assert names == {'pin_answer', 'create_page', 'edit_page'}
    schemas = loop.build_tool_schemas(extra=loop.injected_surface(ctx))
    assert 'save_workflow' not in {s['name'] for s in schemas}


def test_workflow_gate_attached_to_real_router():
    from app.api.v1.routes.george_workflows import router
    assert any(d.dependency is require_workflow_writes for d in router.dependencies)

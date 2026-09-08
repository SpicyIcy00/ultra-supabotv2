"""Deployment boundaries exercised without a database or model."""
import asyncio
import ast
import importlib
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


def test_launcher_does_not_migrate_when_disabled(monkeypatch):
    from app import start
    monkeypatch.setattr(settings, 'AUTO_MIGRATE_ON_START', False)
    migrate = Mock(side_effect=AssertionError('no migration'))
    launch = Mock()
    monkeypatch.setattr(start.subprocess, 'run', migrate)
    monkeypatch.setattr(start.os, 'execv', launch)
    start.main()
    migrate.assert_not_called()
    assert 'app.main:app' in launch.call_args.args[1]


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
    order = []
    monkeypatch.setattr(start.subprocess, 'run', lambda command, **kw: order.append(('migration', command, kw)))
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

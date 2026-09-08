"""Launch the local dogfood backend with an explicitly constructed environment.

WHY A LAUNCHER AND NOT A DOTENV. backend/.env is read by pydantic Settings and
therefore reaches settings.*, but it is NOT loaded into os.environ -- and
os.environ is where tools/_common.connect() and agent/loop.py look for
GEORGE_DATABASE_URL and GEORGE_LOG_DATABASE_URL. A dotenv would configure half
the process and leave George's own connections unset, which fails at the first
question rather than at boot. So the environment is built here, in one place,
where each variable can be justified beside the value it gets.

It also means the dogfood run writes no new credential file: the local
passwords come from the ignored credentials.json the cluster helper already
generated, and the guarded Aji read URL is read out of the operator's existing
dotenv at launch and passed to the child process. Nothing is printed.

THE THREE TARGETS.

  DATABASE_URL             local  george_app @ 127.0.0.1/george_dogfood  WRITE
  GEORGE_LOG_DATABASE_URL  local  george_log @ 127.0.0.1/george_dogfood  INSERT
  GEORGE_DATABASE_URL      remote guarded read-only role, Aji business data

The first two are asserted to be loopback before the server starts. The third
is asserted NOT to be an administrative role here, and is checked again at
every connection by tools/_common.connect(), which additionally opens the
session read-only and refuses any fallback.

THE MODEL KEY IS OMITTED BY DEFAULT. Without ANTHROPIC_API_KEY in the
environment, agent/loop.py's anthropic.AsyncAnthropic() cannot be constructed,
so asking George a question fails loudly and locally instead of sending
business-derived evidence to a provider. Pass --allow-model only once that has
been approved. Every other outbound integration -- Telegram, the brief token,
StoreHub, Google Sheets, n8n -- is omitted unconditionally and has no flag.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ops.local_postgres import PORT, credentials  # noqa: E402
from ops.local_dogfood import DATABASE, url  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r'C:\ultra-supabotv2-main\backend\.env')

# Never run George's reads as one of these, whatever the dotenv says.
ADMIN_ROLES = {'postgres', 'supabase_admin', 'supabase_replication_admin', 'rds_superuser'}

# Permanent local safety state. Each of these has a gate in the application:
# see backend/app/core/config.py and backend/app/core/deployment.py.
SAFETY = {
    'ENVIRONMENT': 'staging',
    'SCHEDULERS_ENABLED': 'false',
    'GEORGE_ENABLE_WORKFLOW_WRITES': 'false',
    'BUSINESS_WRITES_ENABLED': 'false',
    'STARTUP_BOOTSTRAP_ENABLED': 'false',
    'AUTO_MIGRATE_ON_START': 'false',
    'REDIS_ENABLED': 'false',
    'SCHEMA_CHECK': 'fail',
    'GEORGE_EVALS': '0',
    'GEORGE_EVAL_JUDGE': '0',
    'GEORGE_MAX_CONNECTIONS': '4',
    'DATABASE_POOL_SIZE': '5',
    'DATABASE_MAX_OVERFLOW': '2',
    'LOG_LEVEL': 'INFO',
    'PYTHONUTF8': '1',
}

# Anything that could reach outside this machine is dropped from the inherited
# environment rather than merely left unset, so an exported shell variable
# cannot leak into the child.
FORBIDDEN_FRAGMENTS = ('DATABASE', 'POSTGRES', 'SUPABASE', 'PGHOST', 'PGPORT', 'PGUSER',
                       'PGPASSWORD', 'PGDATABASE', 'ANTHROPIC', 'STOREHUB', 'TELEGRAM',
                       'BRIEF', 'GOOGLE_SHEETS', 'N8N', 'VERCEL', 'RAILWAY')


def read_dotenv(path: Path) -> dict:
    values = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def describe(label: str, raw: str) -> dict:
    """Non-secret components of a connection string. The password is never read."""
    parsed = urlparse(raw)
    return {
        'label': label,
        'host': parsed.hostname,
        'port': parsed.port,
        'database': (parsed.path or '/').lstrip('/').split('?')[0],
        'role': (parsed.username or '').split('.')[0],
    }


def resolve(source: Path, allow_model: bool):
    if not source.exists():
        raise SystemExit(f'Guarded read source not found: {source}')
    values = read_dotenv(source)

    read_url = values.get('GEORGE_DATABASE_URL')
    if not read_url:
        raise SystemExit('GEORGE_DATABASE_URL is not defined in the source dotenv. George '
                         'will not fall back to an application connection string.')
    read = describe('GEORGE_DATABASE_URL', read_url)
    if read['role'] in ADMIN_ROLES:
        raise SystemExit(f"Refusing to launch: the George read role is {read['role']!r}, "
                         f'which is administrative. George requires its own read-only role.')

    app_url = url('george_app', DATABASE, async_driver=True)
    log_url = url('george_log', DATABASE)
    app, log = describe('DATABASE_URL', app_url), describe('GEORGE_LOG_DATABASE_URL', log_url)
    for target in (app, log):
        if target['host'] != '127.0.0.1' or target['port'] != PORT:
            raise SystemExit(f"Refusing to launch: {target['label']} is not the local cluster.")

    env = {k: v for k, v in os.environ.items()
           if not any(part in k.upper() for part in FORBIDDEN_FRAGMENTS)}
    env.update(SAFETY)
    env.update(DATABASE_URL=app_url, GEORGE_DATABASE_URL=read_url,
               GEORGE_LOG_DATABASE_URL=log_url, SECRET_KEY=credentials()['signing'])
    if allow_model:
        key = values.get('ANTHROPIC_API_KEY')
        if not key:
            raise SystemExit('--allow-model was passed but the source dotenv defines no '
                             'ANTHROPIC_API_KEY.')
        env['ANTHROPIC_API_KEY'] = key
    return env, (app, read, log)


def summarise(targets, allow_model: bool):
    print('Resolved database targets (components only; no credential is read or shown):')
    print(f"  {'variable':<26s} {'host':<42s} {'port':<7s} {'database':<16s} {'role':<12s} access")
    purpose = {
        'DATABASE_URL': ('read/write', 'local application persistence'),
        'GEORGE_DATABASE_URL': ('SELECT only', 'guarded Aji business reads'),
        'GEORGE_LOG_DATABASE_URL': ('INSERT only', 'George append-only log'),
    }
    for t in targets:
        access, note = purpose[t['label']]
        print(f"  {t['label']:<26s} {str(t['host']):<42s} {str(t['port']):<7s} "
              f"{t['database']:<16s} {t['role']:<12s} {access}  ({note})")
    print('\nSafety gates:')
    for key in ('ENVIRONMENT', 'SCHEDULERS_ENABLED', 'GEORGE_ENABLE_WORKFLOW_WRITES',
                'BUSINESS_WRITES_ENABLED', 'STARTUP_BOOTSTRAP_ENABLED',
                'AUTO_MIGRATE_ON_START', 'REDIS_ENABLED', 'SCHEMA_CHECK'):
        print(f'  {key:<32s} {SAFETY[key]}')
    print(f"  {'ANTHROPIC_API_KEY':<32s} "
          + ('PRESENT (model requests are possible)' if allow_model
             else 'omitted (no model request is possible)'))
    for name in ('TELEGRAM_BOT_TOKEN', 'BRIEF_TOKEN', 'STOREHUB', 'GOOGLE_SHEETS', 'N8N'):
        print(f'  {name:<32s} omitted')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE,
                        help='dotenv holding the guarded GEORGE_DATABASE_URL')
    parser.add_argument('--port', default='8000')
    parser.add_argument('--allow-model', action='store_true',
                        help='pass the model key through; requires explicit approval')
    parser.add_argument('--check', action='store_true', help='resolve and report, do not serve')
    args = parser.parse_args()

    env, targets = resolve(args.source, args.allow_model)
    summarise(targets, args.allow_model)
    if args.check:
        print('\n--check: resolved only; no server started.')
        return

    print(f'\nStarting uvicorn on 127.0.0.1:{args.port} ...')
    os.chdir(ROOT / 'backend')
    subprocess.run([sys.executable, '-m', 'uvicorn', 'app.main:app',
                    '--host', '127.0.0.1', '--port', args.port], env=env, check=False)


if __name__ == '__main__':
    main()

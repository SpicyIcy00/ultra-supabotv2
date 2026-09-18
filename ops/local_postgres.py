"""Local-only synthetic integration PostgreSQL. Never reads a dotenv file.

Runtime files/credentials live under ignored verification/postgres. No production
connection, restore, model call, provider operation, or destructive reset exists.
"""
from __future__ import annotations

import argparse
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'verification' / 'postgres'
BIN = RUNTIME / 'pgsql' / 'bin'
DATA = RUNTIME / 'data'
CONFIG = RUNTIME / 'credentials.json'
PORT = 55432
DATABASES = ('bob_integration', 'bob_upgrade_rehearsal', 'bob_downgrade_rehearsal')
BASE_REVISION = 'p0q1r2s3t4u5'
PAGE_REVISION = 'q1r2s3t4u5v6'


def assert_loopback(row):
    address, port = row
    assert ipaddress.ip_interface(address).ip.is_loopback and port == PORT


def credentials():
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def url(role: str, database: str, *, async_driver=False):
    assert role in {'local_admin', 'george_app', 'george_ro', 'george_log'}
    assert database in (*DATABASES, 'postgres')
    scheme = 'postgresql+asyncpg' if async_driver else 'postgresql'
    result = f'{scheme}://{role}:{credentials()[role]}@127.0.0.1:{PORT}/{database}'
    parsed = urlparse(result)
    assert parsed.hostname == '127.0.0.1' and parsed.port == PORT
    return result


def child_env(database=DATABASES[0]):
    # Copy system necessities, never inherit database/model/delivery credentials.
    env = {k: v for k, v in os.environ.items() if not any(part in k.upper() for part in
           ('DATABASE', 'POSTGRES', 'SUPABASE', 'PGHOST', 'PGPORT', 'PGUSER',
            'PGPASSWORD', 'PGDATABASE', 'ANTHROPIC', 'STOREHUB', 'TELEGRAM',
            'BRIEF', 'GOOGLE_SHEETS', 'N8N'))}
    env.update(DATABASE_URL=url('george_app', database, async_driver=True),
               GEORGE_DATABASE_URL=url('george_ro', database),
               GEORGE_LOG_DATABASE_URL='', ANTHROPIC_API_KEY='',
               ENVIRONMENT='staging', SECRET_KEY=credentials()['signing'],
               SCHEDULERS_ENABLED='false', GEORGE_ENABLE_WORKFLOW_WRITES='false',
               BUSINESS_WRITES_ENABLED='false', STARTUP_BOOTSTRAP_ENABLED='false',
               AUTO_MIGRATE_ON_START='false', SCHEMA_CHECK='fail', REDIS_ENABLED='false',
               GEORGE_EVALS='0', GEORGE_EVAL_JUDGE='0', STAGING_DATABASE_VERIFIED='1',
               GEORGE_LOCAL_SYNTHETIC='1', GEORGE_MAX_CONNECTIONS='4',
               DATABASE_POOL_SIZE='5', DATABASE_MAX_OVERFLOW='0', PYTHONUTF8='1')
    return env


def initialize():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if not CONFIG.exists():
        assert not DATA.exists(), 'Existing data without local credentials; refusing to reuse'
        CONFIG.write_text(json.dumps({r: secrets.token_hex(32) for r in
                          ('local_admin', 'george_app', 'george_ro', 'george_log', 'signing')}),
                          encoding='utf-8')
    if not (DATA / 'PG_VERSION').exists():
        password_file = RUNTIME / 'init-password.txt'
        password_file.write_text(credentials()['local_admin'], encoding='ascii')
        try:
            subprocess.run([str(BIN / 'initdb.exe'), '-D', str(DATA), '-U', 'local_admin',
                            '--pwfile=' + str(password_file), '--auth=scram-sha-256',
                            '--encoding=UTF8', '--locale=C'], check=True)
        finally:
            password_file.unlink(missing_ok=True)
        with (DATA / 'postgresql.conf').open('a', encoding='utf-8') as f:
            f.write("\n# Bob synthetic local integration only\nlisten_addresses = '127.0.0.1'\n"
                    f"port = {PORT}\ntimezone = 'Asia/Manila'\nmax_connections = 40\n"
                    "log_statement = 'none'\nlog_min_error_statement = 'panic'\n"
                    "log_error_verbosity = 'terse'\n")
        # No non-loopback clients, replication entries, or trust authentication.
        (DATA / 'pg_hba.conf').write_text(
            'host all all 127.0.0.1/32 scram-sha-256\n', encoding='ascii')
    print('Local cluster initialized; credentials stored without displaying values.')


def ready():
    return subprocess.run(
        [str(BIN / 'pg_isready.exe'), '-h', '127.0.0.1', '-p', str(PORT)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0


def start():
    if ready():
        print('Local PostgreSQL is already accepting loopback connections.')
        return
    stdout = (RUNTIME / 'server.log').open('ab')
    stderr = (RUNTIME / 'server-error.log').open('ab')
    try:
        subprocess.Popen(
            [str(BIN / 'postgres.exe'), '-D', str(DATA)],
            stdout=stdout, stderr=stderr, stdin=subprocess.DEVNULL,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
            close_fds=True,
        )
    finally:
        stdout.close()
        stderr.close()
    for _ in range(50):
        if ready():
            print(f'Local PostgreSQL is accepting connections on 127.0.0.1:{PORT}.')
            return
        time.sleep(0.1)
    raise RuntimeError('Local PostgreSQL did not become ready; inspect ignored server logs')


def status():
    initialized = (DATA / 'PG_VERSION').exists()
    print('Cluster initialized: ' + ('yes' if initialized else 'no'))
    print('Loopback listener ready: ' + ('yes' if initialized and ready() else 'no'))
    if initialized:
        assert "listen_addresses = '127.0.0.1'" in (DATA / 'postgresql.conf').read_text()
        assert (DATA / 'pg_hba.conf').read_text(encoding='ascii') == (
            'host all all 127.0.0.1/32 scram-sha-256\n')
        print('Listener/HBA configuration: localhost-only SCRAM')


def connection(role, database):
    import psycopg
    return psycopg.connect(url(role, database))


def provision():
    import psycopg
    from psycopg import sql
    print('Checking local listener and roles...')
    with connection('local_admin', 'postgres') as conn:
        conn.autocommit = True
        assert_loopback(conn.execute('SELECT inet_server_addr()::text, inet_server_port()').fetchone())
        for role in ('george_app', 'george_ro', 'george_log'):
            if not conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
                conn.execute(sql.SQL('CREATE ROLE {} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD {}')
                             .format(sql.Identifier(role), sql.Literal(credentials()[role])))
        conn.execute("ALTER ROLE george_ro SET default_transaction_read_only = on")
        conn.execute("ALTER ROLE george_ro SET statement_timeout = '30s'")
        conn.execute("ALTER ROLE george_log SET statement_timeout = '10s'")
        for database in DATABASES:
            if not conn.execute('SELECT 1 FROM pg_database WHERE datname=%s', (database,)).fetchone():
                conn.execute(sql.SQL('CREATE DATABASE {} OWNER george_app').format(sql.Identifier(database)))
            conn.execute(sql.SQL('REVOKE CONNECT, TEMPORARY ON DATABASE {} FROM PUBLIC').format(sql.Identifier(database)))
            conn.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO george_app, george_ro, george_log').format(sql.Identifier(database)))
    for database in DATABASES:
        print(database + ': building synthetic baseline...')
        baseline(database)
    print('Three isolated synthetic databases provisioned at baseline revision ' + BASE_REVISION)


def baseline(database):
    os.environ.update(child_env(database))
    sys.path.insert(0, str(ROOT / 'backend'))
    sys.path.insert(0, str(ROOT))
    from sqlalchemy import create_engine, text
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.core.database import Base
    import app.models  # noqa: F401
    from ops.local_synthetic_fixtures import seed

    engine = create_engine(url('george_app', database).replace('postgresql://', 'postgresql+psycopg://'),
                           hide_parameters=True)
    with engine.begin() as conn:
        if conn.execute(text("SELECT to_regclass('public.local_fixture_manifest')")).scalar():
            print(database + ': existing synthetic fixture manifest found; no reset performed')
            return
        # This is a synthetic starting schema, not a replay of the incomplete
        # original legacy Alembic history and not a copy of production.
        print(database + ': creating public tables...')
        required_public = {
            'stores', 'products', 'new_transactions', 'new_transaction_items',
            'inventory', 'inventory_snapshots', 'storehub_imports',
            'purchase_orders', 'purchase_order_lines', 'stock_transfers',
            'stock_transfer_lines',
        }
        for table in (t for t in Base.metadata.sorted_tables if t.name in required_public):
            print(database + ': creating public.' + table.name + '...')
            table.create(conn, checkfirst=True)
        source = (ROOT / 'agent/sql/george_log_role.sql').read_text(encoding='utf-8')
        start = source.index('CREATE SCHEMA IF NOT EXISTS bob;')
        end = source.index('-- NOTE: no FOREIGN KEY', start)
        print(database + ': creating Bob baseline tables...')
        conn.exec_driver_sql(source[start:end])
        for table in ('conversations', 'tool_calls', 'gaps'):
            conn.exec_driver_sql(f'ALTER TABLE bob.{table} ENABLE ROW LEVEL SECURITY')
            conn.exec_driver_sql(f'CREATE POLICY bob_log_write ON bob.{table} FOR INSERT TO george_log WITH CHECK (true)')
        revisions = ['j4k5l6m7n8o9', 'k5l6m7n8o9p0', 'l6m7n8o9p0q1',
                     'm7n8o9p0q1r2', 'n8o9p0q1r2s3', 'o9p0q1r2s3t4', BASE_REVISION]
        with Operations.context(MigrationContext.configure(conn)):
            for revision in revisions:
                print(database + ': applying synthetic baseline revision ' + revision + '...')
                path, = (ROOT / 'backend/alembic/versions').glob('*-' + revision + '_*.py')
                spec = importlib.util.spec_from_file_location('local_revision_' + revision, path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                module.upgrade()
        conn.exec_driver_sql('CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY)')
        conn.execute(text('INSERT INTO alembic_version VALUES (:v)'), {'v': BASE_REVISION})
        print(database + ': inserting synthetic fixtures...')
        seed(conn)
        conn.exec_driver_sql('GRANT USAGE ON SCHEMA public TO george_ro')
        conn.exec_driver_sql('GRANT SELECT ON stores, products, new_transactions, new_transaction_items, inventory, inventory_snapshots, purchase_orders, purchase_order_lines, stock_transfers, stock_transfer_lines, storehub_imports TO george_ro')
        conn.exec_driver_sql('REVOKE ALL ON SCHEMA bob FROM PUBLIC, george_ro')
        conn.exec_driver_sql('GRANT USAGE ON SCHEMA bob TO george_log')
        conn.exec_driver_sql('GRANT INSERT ON george.conversations, george.tool_calls, george.gaps, george.posts TO george_log')
        conn.exec_driver_sql("CREATE TABLE local_fixture_manifest (kind text NOT NULL CHECK (kind='synthetic'), baseline_revision text NOT NULL)")
        conn.execute(text("INSERT INTO local_fixture_manifest VALUES ('synthetic', :v)"), {'v': BASE_REVISION})
    engine.dispose()


def migrate(database, direction='upgrade'):
    assert database in DATABASES
    target = PAGE_REVISION if direction == 'upgrade' else BASE_REVISION
    with connection('george_app', database) as conn:
        assert_loopback(conn.execute('SELECT inet_server_addr()::text, inet_server_port()').fetchone())
        assert conn.execute('SELECT kind FROM local_fixture_manifest').fetchone() == ('synthetic',)
        before = conn.execute('SELECT version_num FROM alembic_version').fetchone()[0]
    subprocess.run([sys.executable, '-m', 'alembic', direction, target], cwd=ROOT / 'backend',
                   env=child_env(database), check=True)
    with connection('george_app', database) as conn:
        after = conn.execute('SELECT version_num FROM alembic_version').fetchone()[0]
    print(f'{database}: {before} -> {after} ({direction})')


def verify(database):
    import psycopg

    expected_revision = (PAGE_REVISION if database == DATABASES[1]
                         else BASE_REVISION)
    with connection('george_app', database) as conn:
        assert_loopback(conn.execute(
            'SELECT inet_server_addr()::text, inet_server_port()').fetchone())
        assert conn.execute(
            'SELECT kind, baseline_revision FROM local_fixture_manifest').fetchone() == (
                'synthetic', BASE_REVISION)
        assert conn.execute('SELECT version_num FROM alembic_version').fetchone() == (
            expected_revision,)
        assert conn.execute('SELECT count(*) FROM george.pins').fetchone() == (4,)
        assert conn.execute('SELECT count(*) FROM george.conversations').fetchone() == (2,)
        assert conn.execute('SELECT count(*) FROM george.tool_calls').fetchone() == (2,)
        assert [row[0] for row in conn.execute(
            'SELECT id::text FROM george.pins ORDER BY id').fetchall()] == [
                f'20000000-0000-0000-0000-00000000000{i}' for i in range(1, 5)]
        assert [row[0] for row in conn.execute(
            'SELECT id::text FROM george.conversations ORDER BY id').fetchall()] == [
                f'10000000-0000-0000-0000-00000000000{i}' for i in range(1, 3)]
        assert conn.execute(
            "SELECT count(*) FROM george.pins WHERE conversation_id IS NULL "
            "OR jsonb_array_length(tool_calls) <> 1").fetchone() == (0,)
        if expected_revision == PAGE_REVISION:
            assert conn.execute('SELECT count(*) FROM george.pages').fetchone() == (2,)
            assert conn.execute(
                "SELECT count(*) FROM george.pages WHERE title='Shared title' "
                "AND owner IN ('fixture-alice','fixture-bob')").fetchone() == (2,)
            assert conn.execute(
                'SELECT count(*) FROM george.pins WHERE page_id IS NULL').fetchone() == (1,)
            assert conn.execute(
                'SELECT count(*) FROM george.pins p JOIN george.pages g ON g.id=p.page_id '
                'WHERE p.created_by<>g.owner').fetchone() == (0,)
            assert conn.execute(
                'SELECT count(*) FROM (SELECT page_id,count(*) n,min(position) lo,'
                'max(position) hi,count(DISTINCT position) d FROM george.pins '
                'WHERE page_id IS NOT NULL GROUP BY page_id) x '
                'WHERE lo<>0 OR hi<>n-1 OR d<>n').fetchone() == (0,)
            assert conn.execute(
                'SELECT count(*) FROM george.pages WHERE purpose IS NOT NULL').fetchone() == (0,)
            assert conn.execute(
                "SELECT title,position FROM george.pins WHERE created_by='fixture-alice' "
                "AND page_id IS NOT NULL ORDER BY position").fetchall() == [
                    ('Alice newest', 0), ('Alice oldest', 1)]
        else:
            assert conn.execute(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema='george' "
                "AND table_name IN ('pages','page_events')").fetchone() == (0,)
            assert conn.execute(
                'SELECT count(*) FILTER (WHERE page IS NULL), '
                'count(*) FILTER (WHERE page IS NOT NULL) FROM george.pins').fetchone() == (1, 3)
            assert conn.execute(
                'SELECT title,page FROM george.pins ORDER BY id').fetchall() == [
                    ('Alice newest', 'Shared title'),
                    ('Alice oldest', 'Shared title'),
                    ('Bob page', 'Shared title'),
                    ('Alice ungrouped', None),
                ]

    with connection('local_admin', 'postgres') as conn:
        role_rows = conn.execute(
            "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls "
            "FROM pg_roles WHERE rolname IN ('george_app','george_ro','george_log') "
            "ORDER BY rolname").fetchall()
        assert len(role_rows) == 3
        assert all(not any(row[1:]) for row in role_rows)
        assert conn.execute(
            'SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=%s',
            (database,)).fetchone() == ('george_app',)

    with connection('george_ro', database) as conn:
        assert conn.execute('SHOW default_transaction_read_only').fetchone() == ('on',)
        assert conn.execute('SELECT count(*) FROM stores').fetchone()[0] == 8
        try:
            conn.execute('SELECT count(*) FROM george.pins')
            raise AssertionError('george_ro unexpectedly read the george schema')
        except psycopg.errors.InsufficientPrivilege:
            conn.rollback()
        try:
            conn.execute("INSERT INTO stores (id,name) VALUES ('forbidden','forbidden')")
            raise AssertionError('george_ro unexpectedly wrote a business table')
        except (psycopg.errors.ReadOnlySqlTransaction, psycopg.errors.InsufficientPrivilege):
            conn.rollback()

    with connection('george_log', database) as conn:
        try:
            conn.execute('SELECT count(*) FROM george.conversations')
            raise AssertionError('george_log unexpectedly read its write-only table')
        except psycopg.errors.InsufficientPrivilege:
            conn.rollback()
        with conn.transaction(force_rollback=True):
            conn.execute("INSERT INTO george.conversations "
                         "(id,thread_id,user_id,asked_at,question,status,notice_forced) "
                         "VALUES (gen_random_uuid(),gen_random_uuid(),'role-check',now(),"
                         "'Synthetic role check','complete',false)")
        try:
            conn.execute('SELECT count(*) FROM stores')
            raise AssertionError('george_log unexpectedly read a business table')
        except psycopg.errors.InsufficientPrivilege:
            conn.rollback()
    print(database + ': synthetic shape, revision, preservation and role isolation verified')


def verification_suite(database, suite):
    report_name = 'local-' + suite + '-' + database + '.xml'
    env = child_env(database)
    result = subprocess.run(
        [sys.executable, 'ops/verify_integration.py', suite], cwd=ROOT, env=env)
    # verify_integration owns its canonical report name; preserve a local-target
    # copy so multiple rehearsals do not overwrite one another.
    source = ROOT / 'verification' / (suite + '.xml')
    if source.exists():
        (ROOT / 'verification' / report_name).write_bytes(source.read_bytes())
    return result.returncode


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=[
        'init', 'start', 'status', 'provision', 'upgrade', 'downgrade', 'verify',
        'read-tests', 'app-tests', 'tests'])
    parser.add_argument('--database', choices=DATABASES, default=DATABASES[0])
    args = parser.parse_args()
    if args.action == 'init':
        initialize()
    elif args.action == 'start':
        start()
    elif args.action == 'status':
        status()
    elif args.action == 'provision':
        provision()
    elif args.action in {'upgrade', 'downgrade'}:
        if args.action == 'downgrade' and args.database != DATABASES[2]:
            parser.error('Downgrade is restricted to the dedicated disposable database')
        migrate(args.database, args.action)
    elif args.action == 'verify':
        verify(args.database)
    elif args.action in {'read-tests', 'app-tests'}:
        return verification_suite(args.database, args.action.removesuffix('-tests') + '-db')
    else:
        report = ROOT / 'verification' / ('local-live-' + args.database + '.xml')
        files = ['tests/test_page_workshop_live.py', 'tests/test_page_reader_live.py', 'tests/test_pins_live.py']
        result = subprocess.run([sys.executable, '-m', 'pytest', *files, '-q', '--tb=short',
                                 '--junitxml=' + str(report)], cwd=ROOT, env=child_env(args.database))
        return result.returncode
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        # SQL/provider exception strings can contain connection details.
        print('Local PostgreSQL operation failed: ' + type(exc).__name__)
        print('SQLSTATE: ' + str(getattr(exc, 'sqlstate', None) or getattr(getattr(exc, 'orig', None), 'sqlstate', None)))
        diagnostic = getattr(getattr(exc, 'orig', exc), 'diag', None)
        if diagnostic is not None:
            print('Database object: ' + str(getattr(diagnostic, 'schema_name', None)) + '.' +
                  str(getattr(diagnostic, 'table_name', None)))
        sys.exit(1)

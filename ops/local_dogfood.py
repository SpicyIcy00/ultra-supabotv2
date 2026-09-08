"""Local dogfood environment: a writable local application database for George.

The rehearsal databases in ops/local_postgres.py exist to prove a migration.
This one exists so a person can OPEN George and use it. It is a fourth,
separate database on the same loopback cluster, and it is deliberately not in
that helper's DATABASES tuple: a rehearsal is disposable and re-provisioned,
whereas a dogfood database accumulates the pins, pages and posts that are the
whole point of using the product.

WHAT THIS DOES AND DOES NOT TOUCH.

  local  (127.0.0.1:55432/george_dogfood)  application persistence, WRITABLE
         app_users, role_page_access, george.pages, george.pins,
         george.posts, george.conversations - everything George writes.

  remote (the guarded george_ro connection)  Aji business data, READ ONLY
         Not touched here at all. This script opens no connection to it,
         holds no credential for it, and copies nothing out of it. George's
         read tools reach it through tools/_common.connect(), which accepts
         GEORGE_DATABASE_URL and refuses to fall back to anything else.

The public schema is created from the application's own models rather than by
replaying Alembic, for the reason ops/LOCAL_POSTGRES.md already records: the
migration history is not a complete empty-database bootstrap. The george schema
IS built by replaying the real George migrations, so the part George depends on
is the migrated shape and alembic_version is stamped at the true head.

No dotenv file is read. No credential is printed. The generated dogfood
password is written to an ignored file under verification/postgres/ and named,
never echoed.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
from pathlib import Path
import secrets
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ops.local_postgres import (  # noqa: E402
    PORT, RUNTIME, assert_loopback, credentials, ready,
)

ROOT = Path(__file__).resolve().parents[1]
DATABASE = 'george_dogfood'
HEAD_REVISION = 'q1r2s3t4u5v6'
GEORGE_REVISIONS = ('j4k5l6m7n8o9', 'k5l6m7n8o9p0', 'l6m7n8o9p0q1', 'm7n8o9p0q1r2',
                    'n8o9p0q1r2s3', 'o9p0q1r2s3t4', 'p0q1r2s3t4u5', HEAD_REVISION)
LOGIN_FILE = RUNTIME / 'dogfood-login.txt'
DOGFOOD_USERNAME = 'dogfood'

# The George shell lives behind the 'george' page key; Operations lists the
# legacy pages. Granted for the dogfood role only, in the local database only.
DOGFOOD_PAGES = ('george', 'dashboard', 'analytics', 'settings', 'admin')


def url(role: str, database: str = DATABASE, *, async_driver: bool = False) -> str:
    assert role in {'local_admin', 'george_app', 'george_ro', 'george_log'}
    scheme = 'postgresql+asyncpg' if async_driver else 'postgresql'
    return f'{scheme}://{role}:{credentials()[role]}@127.0.0.1:{PORT}/{database}'


def _child_env() -> dict:
    """System necessities only. Never inherit a database or provider credential."""
    return {k: v for k, v in os.environ.items() if not any(part in k.upper() for part in (
        'DATABASE', 'POSTGRES', 'SUPABASE', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD',
        'PGDATABASE', 'ANTHROPIC', 'STOREHUB', 'TELEGRAM', 'BRIEF', 'GOOGLE_SHEETS', 'N8N'))}


def create_database():
    import psycopg
    from psycopg import sql
    if not ready():
        raise RuntimeError('Local PostgreSQL is not accepting loopback connections; run '
                           'ops/local_postgres.py start')
    with psycopg.connect(url('local_admin', 'postgres')) as conn:
        conn.autocommit = True
        assert_loopback(conn.execute('SELECT inet_server_addr()::text, inet_server_port()').fetchone())
        for role in ('george_app', 'george_ro', 'george_log'):
            if not conn.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (role,)).fetchone():
                raise RuntimeError(f'Local role {role} missing; run ops/local_postgres.py provision')
        fresh = not conn.execute('SELECT 1 FROM pg_database WHERE datname=%s', (DATABASE,)).fetchone()
        if fresh:
            conn.execute(sql.SQL('CREATE DATABASE {} OWNER george_app').format(sql.Identifier(DATABASE)))
        conn.execute(sql.SQL('REVOKE CONNECT, TEMPORARY ON DATABASE {} FROM PUBLIC')
                     .format(sql.Identifier(DATABASE)))
        conn.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO george_app, george_log')
                     .format(sql.Identifier(DATABASE)))
        # george_ro is NOT granted CONNECT here. Business reads go to the guarded
        # remote source; a local read role would only be a second way to be wrong.
        conn.execute(sql.SQL('REVOKE CONNECT ON DATABASE {} FROM george_ro')
                     .format(sql.Identifier(DATABASE)))
    return fresh


def build_schema():
    os.environ.clear()
    os.environ.update(_child_env())
    os.environ.update(DATABASE_URL=url('george_app', async_driver=True), ENVIRONMENT='staging',
                      SCHEMA_CHECK='fail', PYTHONUTF8='1')
    sys.path.insert(0, str(ROOT / 'backend'))
    from sqlalchemy import create_engine, text
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.core.database import Base
    import app.models  # noqa: F401

    engine = create_engine(url('george_app').replace('postgresql://', 'postgresql+psycopg://'),
                           hide_parameters=True)
    with engine.begin() as conn:
        already = conn.execute(text("SELECT to_regclass('public.app_users')")).scalar()
        if already:
            print(f'{DATABASE}: application schema already present; leaving it alone')
        else:
            # packing_lists.seq defaults to nextval() on a sequence the legacy
            # startup bootstrap owns. The bootstrap is disabled here (it also
            # seeds production accounts), so create just the sequence its table
            # depends on -- not the rest of it.
            conn.exec_driver_sql('CREATE SEQUENCE IF NOT EXISTS packing_lists_seq')

            # Every public table the application maps, from the models themselves.
            public_tables = [t for t in Base.metadata.sorted_tables if t.schema is None]
            print(f'{DATABASE}: creating {len(public_tables)} public tables from the models...')
            Base.metadata.create_all(conn, tables=public_tables, checkfirst=True)

            source = (ROOT / 'agent/sql/george_log_role.sql').read_text(encoding='utf-8')
            start = source.index('CREATE SCHEMA IF NOT EXISTS george;')
            end = source.index('-- NOTE: no FOREIGN KEY', start)
            print(f'{DATABASE}: creating the George baseline tables...')
            conn.exec_driver_sql(source[start:end])
            for table in ('conversations', 'tool_calls', 'gaps'):
                conn.exec_driver_sql(f'ALTER TABLE george.{table} ENABLE ROW LEVEL SECURITY')
                conn.exec_driver_sql(
                    f'CREATE POLICY george_log_write ON george.{table} '
                    f'FOR INSERT TO george_log WITH CHECK (true)')

            with Operations.context(MigrationContext.configure(conn)):
                for revision in GEORGE_REVISIONS:
                    print(f'{DATABASE}: applying George revision {revision}...')
                    path, = (ROOT / 'backend/alembic/versions').glob('*-' + revision + '_*.py')
                    spec = importlib.util.spec_from_file_location('dogfood_' + revision, path)
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)
                    module.upgrade()

            conn.exec_driver_sql('CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY)')
            conn.execute(text('INSERT INTO alembic_version VALUES (:v)'), {'v': HEAD_REVISION})
            print(f'{DATABASE}: stamped at the true head revision {HEAD_REVISION}')

        # george_log keeps INSERT without SELECT on george.*, and nothing else.
        conn.exec_driver_sql('GRANT USAGE ON SCHEMA george TO george_log')
        conn.exec_driver_sql('GRANT INSERT ON ALL TABLES IN SCHEMA george TO george_log')
        conn.exec_driver_sql('REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON ALL TABLES '
                             'IN SCHEMA george FROM george_log')
        conn.exec_driver_sql('REVOKE ALL ON SCHEMA george FROM george_ro')
        conn.exec_driver_sql('REVOKE ALL ON SCHEMA public FROM george_ro')
    engine.dispose()


def create_account():
    """Create the local dogfood login through the application's own hashing.

    Sign-in is PASSCODE-ONLY (backend/app/api/v1/routes/auth.py): the passcode
    identifies the account, and a row with no passcode_hash simply cannot sign
    in. So the account needs both -- password_hash because the column is NOT
    NULL, and passcode_hash because that is what login actually verifies. Both
    go through the application's own get_password_hash; no hashing, validation
    or authentication code is weakened, bypassed or duplicated here.

    The passcode is generated, written to an ignored file, and never printed.
    """
    from sqlalchemy import create_engine, text
    from app.core.security import get_password_hash

    engine = create_engine(url('george_app').replace('postgresql://', 'postgresql+psycopg://'),
                           hide_parameters=True)
    with engine.begin() as conn:
        exists = conn.execute(text('SELECT 1 FROM app_users WHERE username = :u'),
                              {'u': DOGFOOD_USERNAME}).scalar()
        if exists:
            print(f'Local account {DOGFOOD_USERNAME!r} already exists; passcode unchanged')
        else:
            # Digits only: this is typed on a phone, and login is the passcode.
            passcode = ''.join(secrets.choice('0123456789') for _ in range(10))
            conn.execute(text(
                'INSERT INTO app_users '
                '(id, username, password_hash, passcode_hash, role, display_name, active) '
                'VALUES (gen_random_uuid(), :u, :ph, :pc, :r, :d, true)'),
                {'u': DOGFOOD_USERNAME, 'ph': get_password_hash(secrets.token_urlsafe(24)),
                 'pc': get_password_hash(passcode), 'r': 'admin', 'd': 'Local dogfood'})
            LOGIN_FILE.write_text(
                f'Local George dogfood login (this file is gitignored)\n'
                f'\n'
                f'  URL       http://127.0.0.1:5173/\n'
                f'  passcode  {passcode}\n'
                f'\n'
                f'Sign-in is passcode-only; there is no username field.\n'
                f'This account exists only in the local george_dogfood database.\n',
                encoding='utf-8')
            print(f'Local account created; passcode written to {LOGIN_FILE} and not displayed')

        for page in DOGFOOD_PAGES:
            conn.execute(text(
                'INSERT INTO role_page_access (role, page_key, enabled) VALUES (:r, :p, true) '
                'ON CONFLICT (role, page_key) DO UPDATE SET enabled = true'),
                {'r': 'admin', 'p': page})
        granted = conn.execute(text(
            "SELECT count(*) FROM role_page_access WHERE role='admin' AND enabled")).scalar()
        print(f'Page access: {granted} page(s) enabled for the admin role in {DATABASE}')
    engine.dispose()


def report():
    """Print the resolved local target. Components only, never a credential."""
    from sqlalchemy import create_engine, text
    engine = create_engine(url('george_app').replace('postgresql://', 'postgresql+psycopg://'),
                           hide_parameters=True)
    with engine.connect() as conn:
        rev = conn.execute(text('SELECT version_num FROM alembic_version')).scalar()
        users = conn.execute(text('SELECT count(*) FROM app_users WHERE active')).scalar()
        pages = conn.execute(text('SELECT count(*) FROM george.pages')).scalar()
        pins = conn.execute(text('SELECT count(*) FROM george.pins')).scalar()
        posts = conn.execute(text('SELECT count(*) FROM george.posts')).scalar()
        addr, port = conn.execute(text('SELECT inet_server_addr()::text, inet_server_port()')).one()
    engine.dispose()
    assert_loopback((addr, port))
    print(f'host/port      127.0.0.1:{PORT} (loopback asserted)')
    print(f'database       {DATABASE}   owner george_app')
    print(f'alembic        {rev}   (head {HEAD_REVISION})')
    print(f'accounts       {users} active')
    print(f'george.pages   {pages} rows')
    print(f'george.pins    {pins} rows')
    print(f'george.posts   {posts} rows')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['provision', 'report'])
    action = parser.parse_args().action
    if action == 'provision':
        create_database()
        build_schema()
        create_account()
        report()
    else:
        os.environ.setdefault('PYTHONUTF8', '1')
        sys.path.insert(0, str(ROOT / 'backend'))
        report()


if __name__ == '__main__':
    main()

"""
Shared plumbing for George's tools.

Definition loading, the fail-closed read-only connection, and store resolution
live here so there is exactly ONE copy of each. The connection guard in
particular is a security control: duplicated into every tool, a fix to one would
silently miss the others.

No business definition lives in this module. It reads metrics.yaml; it never
supplies a value metrics.yaml is missing.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional, Sequence

import psycopg
import yaml
from psycopg.rows import dict_row

# Re-exported so the tool modules need only one database import. Pass it as
# `conn.cursor(row_factory=DICT_ROW)` — psycopg3's replacement for psycopg2's
# `cursor_factory=RealDictCursor`.
DICT_ROW = dict_row

DEFS_PATH = Path(__file__).resolve().parent.parent / "definitions" / "metrics.yaml"

# Operational cap on a single response. NOT a business definition — it bounds
# one result set so a large table cannot be returned whole. Always reported.
DEFAULT_MAX_ROWS = 1000

# Roles George must never run as, even if GEORGE_DATABASE_URL points at one.
FORBIDDEN_ROLES = {"postgres", "supabase_admin", "supabase_replication_admin"}

_DEFS: Optional[dict] = None


def load_defs() -> dict:
    """Load and cache definitions/metrics.yaml."""
    global _DEFS
    if _DEFS is None:
        if not DEFS_PATH.exists():
            raise FileNotFoundError(
                f"Business definitions not found at {DEFS_PATH}. George cannot "
                f"answer questions without them."
            )
        with DEFS_PATH.open(encoding="utf-8") as fh:
            _DEFS = yaml.safe_load(fh)
    return _DEFS


def req(node: Any, path: str) -> Any:
    """
    Strict dotted lookup into the definitions. Raises with the full key path.

    Deliberately has no default parameter: a helper that can fall back to a
    literal is how a tool ends up holding its own copy of a definition.
    """
    cur = node
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            raise KeyError(
                f"metrics.yaml is missing '{path}'. Add the definition there — "
                f"do not hardcode it in a tool."
            )
        cur = cur[part]
    return cur


def connect():
    """
    Open a read-only connection as George's own role.

    Three independent guards, because any one of them can be misconfigured:
      1. GEORGE_DATABASE_URL only. No fallback to DATABASE_URL and none to any
         connection string committed in this repo. Absent -> refuse.
      2. The session is opened read-only, so a write is rejected by the server
         even if the role were over-granted.
      3. The role is checked at connect time: never a superuser, never one of
         the admin logins.
    """
    url = os.environ.get("GEORGE_DATABASE_URL")
    if not url:
        raise RuntimeError(
            "GEORGE_DATABASE_URL is not set. George connects only through its "
            "own read-only role; it will not fall back to an application or "
            "admin connection string. See tools/george_ro_role.sql."
        )

    # psycopg3 (matching the rest of the backend, which uses psycopg 3.x).
    # Two behavioural differences from psycopg2 that matter here:
    #   - session flags are properties, not set_session(...)
    #   - `with conn:` CLOSES the connection on exit rather than only ending the
    #     transaction, so the `with _connect() as conn:` blocks in the tools now
    #     release their connection instead of leaking it back to the caller.
    conn = psycopg.connect(url, connect_timeout=15)
    conn.read_only = True
    conn.autocommit = False

    with conn.cursor() as cur:
        cur.execute(
            "SELECT current_user, "
            "       COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false), "
            "       current_setting('transaction_read_only')"
        )
        role, is_super, read_only = cur.fetchone()

    if is_super:
        conn.close()
        raise RuntimeError(
            f"Refusing to run: GEORGE_DATABASE_URL connects as superuser '{role}'. "
            f"George requires a non-superuser, SELECT-only role."
        )
    if role in FORBIDDEN_ROLES:
        conn.close()
        raise RuntimeError(
            f"Refusing to run: GEORGE_DATABASE_URL connects as '{role}', which is "
            f"an administrative role. George requires its own read-only role."
        )
    if read_only != "on":
        conn.close()
        raise RuntimeError("Refusing to run: the session is not read-only.")
    return conn


def store_catalog(defs: dict, scope_ids: Sequence[str]) -> dict[str, dict]:
    """
    id -> {id, name, display_name} for each id in scope_ids.

    Every id must appear in stores.active_retail or stores.warehouse, so a typo
    in a scope list fails loudly instead of silently narrowing the scope.
    """
    known: dict[str, dict] = {}
    for group in ("active_retail", "warehouse"):
        for entry in req(defs, f"stores.{group}"):
            known[entry["id"]] = entry
    catalog = {}
    for sid in scope_ids:
        if sid not in known:
            raise KeyError(
                f"metrics.yaml lists store id '{sid}' in a scope, but it is in "
                f"neither stores.active_retail nor stores.warehouse."
            )
        catalog[sid] = known[sid]
    return catalog


def resolve_store(store: Optional[str], catalog: dict[str, dict]) -> list[str]:
    """
    Resolve a store argument to ids using the catalog ONLY.

    Never looks the name up in the stores table. That lookup is exactly what
    broke the old resolver: stores.name was renamed to the "(N) ..." form, the
    name->id map came back empty, and the prompt rendered the literal SQL
    `t.store_id IN ()`. Resolving from definitions cannot fail that way, and an
    unknown name raises instead of quietly matching nothing.
    """
    if store is None:
        return list(catalog)

    wanted = str(store).strip().lower()
    for sid, entry in catalog.items():
        if wanted in (
            sid.lower(),
            str(entry.get("display_name", "")).lower(),
            str(entry.get("name", "")).lower(),
        ):
            return [sid]

    valid = sorted(e.get("display_name") or e["name"] for e in catalog.values())
    raise ValueError(
        f"Unknown store {store!r}. Valid stores: {', '.join(valid)}. "
        f"(Names are resolved from definitions/metrics.yaml, not from the "
        f"stores table.)"
    )


def label_store(catalog: dict[str, dict], store_id: str) -> str:
    entry = catalog.get(store_id, {})
    return entry.get("display_name") or entry.get("name") or store_id

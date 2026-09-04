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
import threading
import time
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


# --------------------------------------------------------------------------
# Connection gate — how many george_ro connections this process may hold
#
# George reads through the Supabase SESSION-mode pooler (port 5432), where
# every client connection is one server backend and the pool for a role is
# capped — 15 here. Every tool opens its own connection for the duration of
# one call, and every caller fans calls out with asyncio.gather: the chat loop
# runs a turn's reads together, a pin runs its calls together, and a workflow
# runs its steps together. On 2026-09-04 a 19-step workflow opened 19
# connections at once and the pooler refused the 16th with EMAXCONNSESSION.
#
# So the bound lives HERE, on the connection itself, and nowhere else:
#   - one gate per PROCESS, not per run. Two workflows overlapping, or a
#     workflow beside a chat turn beside the morning brief, all draw on the
#     same 15 backends, so a per-run cap of 8 would still let two runs open 16.
#     One BoundedSemaphore at module level is shared by every caller in the
#     process by construction.
#   - a threading semaphore, not an asyncio one. Tools run in worker threads
#     via asyncio.to_thread, the scheduler ticks on its own loop, and tests
#     call tools synchronously; a threading primitive serves all three.
#   - acquired BEFORE connecting and released when the connection CLOSES, so
#     the slot covers the connection's whole life, and `with _connect() as
#     conn:` releases it on the way out whatever happens inside.
#
# The cap is operational, not a business definition, so it is an environment
# variable rather than a metrics.yaml key. 8 leaves 7 of the 15 for a second
# process (a local run, a second replica) that this gate cannot see. A wait
# longer than GEORGE_CONNECTION_WAIT_S raises with the numbers rather than
# hanging a request forever — and it is kept BELOW the pin runner's 25s call
# timeout (pin_runner.CALL_TIMEOUT_S), so a queued call fails here, in words,
# before the caller gives up on it and its thread runs a query for nobody.
# --------------------------------------------------------------------------

GEORGE_MAX_CONNECTIONS_DEFAULT = 8
GEORGE_CONNECTION_WAIT_S = float(os.environ.get("GEORGE_CONNECTION_WAIT_S", "20"))


def _cap() -> int:
    raw = os.environ.get("GEORGE_MAX_CONNECTIONS", "")
    try:
        return max(1, int(raw)) if raw.strip() else GEORGE_MAX_CONNECTIONS_DEFAULT
    except ValueError:
        return GEORGE_MAX_CONNECTIONS_DEFAULT


_CAP = _cap()
_GATE = threading.BoundedSemaphore(_CAP)
_GATE_STATS_LOCK = threading.Lock()
_GATE_STATS = {"in_use": 0, "peak": 0, "waited": 0, "timed_out": 0}


def connection_gate_status() -> dict:
    """The gate's cap and live occupancy, for /health and for checking sharing."""
    with _GATE_STATS_LOCK:
        return {"cap": _CAP, **_GATE_STATS}


def _acquire_slot() -> None:
    started = time.perf_counter()
    if not _GATE.acquire(timeout=GEORGE_CONNECTION_WAIT_S):
        with _GATE_STATS_LOCK:
            _GATE_STATS["timed_out"] += 1
            in_use = _GATE_STATS["in_use"]
        raise RuntimeError(
            f"Waited {GEORGE_CONNECTION_WAIT_S:.0f}s for one of {_CAP} george_ro "
            f"connection slots ({in_use} in use) and none came free. The query "
            f"was not run. Something is holding connections open, or the cap "
            f"(GEORGE_MAX_CONNECTIONS) is too low for what runs together."
        )
    with _GATE_STATS_LOCK:
        _GATE_STATS["in_use"] += 1
        _GATE_STATS["peak"] = max(_GATE_STATS["peak"], _GATE_STATS["in_use"])
        if time.perf_counter() - started > 0.05:
            _GATE_STATS["waited"] += 1


def _release_slot() -> None:
    with _GATE_STATS_LOCK:
        _GATE_STATS["in_use"] -= 1
    _GATE.release()


def _release_if_held(conn) -> None:
    """Release exactly once, however many times close() is called."""
    if getattr(conn, "_slot_held", False):
        conn._slot_held = False
        _release_slot()


class GatedConnection(psycopg.Connection):
    """A psycopg connection that gives its gate slot back when it closes."""

    _slot_held = False

    def close(self) -> None:
        try:
            super().close()
        finally:
            _release_if_held(self)


def _open_checked(url: str):
    """
    Connect and verify the role. Separate from the gate so the two can be
    tested apart; every failure path here closes the connection, and closing
    is what releases the slot.
    """
    # psycopg3 (matching the rest of the backend, which uses psycopg 3.x).
    # Two behavioural differences from psycopg2 that matter here:
    #   - session flags are properties, not set_session(...)
    #   - `with conn:` CLOSES the connection on exit rather than only ending the
    #     transaction, so the `with _connect() as conn:` blocks in the tools now
    #     release their connection instead of leaking it back to the caller.
    conn = GatedConnection.connect(url, connect_timeout=15)
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


def connect():
    """
    Open a read-only connection as George's own role, through the gate.

    Three independent guards, because any one of them can be misconfigured:
      1. GEORGE_DATABASE_URL only. No fallback to DATABASE_URL and none to any
         connection string committed in this repo. Absent -> refuse.
      2. The session is opened read-only, so a write is rejected by the server
         even if the role were over-granted.
      3. The role is checked at connect time: never a superuser, never one of
         the admin logins.

    And one bound: at most GEORGE_MAX_CONNECTIONS of these open at once in this
    process — see the connection gate above. A caller past the cap waits for a
    slot rather than asking the pooler for a 16th backend.
    """
    url = os.environ.get("GEORGE_DATABASE_URL")
    if not url:
        raise RuntimeError(
            "GEORGE_DATABASE_URL is not set. George connects only through its "
            "own read-only role; it will not fall back to an application or "
            "admin connection string. See tools/george_ro_role.sql."
        )

    _acquire_slot()
    try:
        conn = _open_checked(url)
    except BaseException:
        # Nothing to close: either connect() itself failed, or _open_checked
        # closed the connection before raising — and the slot was not yet
        # marked held, so that close released nothing. Release here.
        _release_slot()
        raise
    conn._slot_held = True
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


def validate_top_n(defs: dict, top_n: Optional[int]) -> Optional[int]:
    """
    Bounds-check top_n against metrics.yaml. Returns None when unset.

    Raises rather than clamping: a silently reduced top_n would return fewer
    rows than asked for with nothing in meta to say so, which is the class of
    quiet wrongness these tools exist to avoid.
    """
    if top_n is None:
        return None
    lo, hi = req(defs, "ranking.min_top_n"), req(defs, "ranking.max_top_n")
    if not isinstance(top_n, int) or isinstance(top_n, bool):
        raise ValueError(f"top_n must be an integer, got {type(top_n).__name__}.")
    if not (lo <= top_n <= hi):
        raise ValueError(
            f"top_n must be between {lo} and {hi} (got {top_n}). {hi} is the "
            f"tools' own row limit — metrics.yaml: ranking.max_top_n."
        )
    return top_n


def label_store(catalog: dict[str, dict], store_id: str) -> str:
    entry = catalog.get(store_id, {})
    return entry.get("display_name") or entry.get("name") or store_id

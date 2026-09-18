"""
Shared plumbing for Bob's tools.

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
from typing import Any, Mapping, Optional, Sequence

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

# Roles Bob must never run as, even if GEORGE_DATABASE_URL points at one.
FORBIDDEN_ROLES = {"postgres", "supabase_admin", "supabase_replication_admin"}

_DEFS: Optional[dict] = None


def load_defs() -> dict:
    """Load and cache definitions/metrics.yaml."""
    global _DEFS
    if _DEFS is None:
        if not DEFS_PATH.exists():
            raise FileNotFoundError(
                f"Business definitions not found at {DEFS_PATH}. Bob cannot "
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
# Bob reads through the Supabase SESSION-mode pooler (port 5432), where
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
            f"Bob requires a non-superuser, SELECT-only role."
        )
    if role in FORBIDDEN_ROLES:
        conn.close()
        raise RuntimeError(
            f"Refusing to run: GEORGE_DATABASE_URL connects as '{role}', which is "
            f"an administrative role. Bob requires its own read-only role."
        )
    if read_only != "on":
        conn.close()
        raise RuntimeError("Refusing to run: the session is not read-only.")
    return conn


def connect():
    """
    Open a read-only connection as Bob's own role, through the gate.

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
            "GEORGE_DATABASE_URL is not set. Bob connects only through its "
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


def _store_groups(defs: dict) -> list[str]:
    """
    Every group in metrics.yaml that names real stores. Used only to tell "this
    store does not exist" from "this store exists and this reading excludes it"
    — never to widen a scope.

    READ FROM THE DEFINITIONS SINCE P2.g (2026-09-15).

    This was a tuple here and it had drifted: `vending_stock_location` was
    added to metrics.yaml and never to the tuple, so AJI CMG — a real row, with
    3,534 inventory rows behind it — resolved as "Unknown store". That is the
    sentence the warehouse fix exists to prevent, arriving through the one
    group nobody updated. The store list lives in metrics.yaml and nowhere
    else, and so does the list of its groups.
    """
    return [str(g) for g in req(defs, "stores.groups")]


def _match(wanted: str, entry: Mapping[str, Any], sid: str) -> bool:
    return wanted in (
        sid.lower(),
        str(entry.get("display_name", "")).lower(),
        str(entry.get("name", "")).lower(),
    )


def estate(defs: dict) -> dict[str, tuple[dict, str]]:
    """id -> (entry, which group it is in), across the whole estate."""
    found: dict[str, tuple[dict, str]] = {}
    for group in _store_groups(defs):
        for entry in defs.get("stores", {}).get(group) or []:
            if isinstance(entry, Mapping) and entry.get("id"):
                found.setdefault(entry["id"], (dict(entry), group))
    return found


def resolve_store(
    store: Optional[Any],
    catalog: dict[str, dict],
    defs: Optional[dict] = None,
    out_of_scope_reason: Optional[str] = None,
) -> list[str]:
    """
    Resolve a store argument to ids using the catalog ONLY.

    SEVERAL SHOPS ARE ONE SCOPE (P2.c, 2026-09-15). A list resolves to the
    union of what each name resolves to, in the order given and without
    repeats, because the predicate this feeds has always been `store_id IN
    (...)` — one shop was never a different shape of query, only a shorter
    list. Picking two shops on the surface and asking to compare them is
    therefore the ordinary scope change it looks like, and not a new question.
    Each name is resolved separately, so one unknown name in a list refuses by
    name rather than the whole list refusing as one unrecognisable string —
    which is what `str(["OPUS", "Rockwell"])` did before this.

    Never looks the name up in the stores table. That lookup is exactly what
    broke the old resolver: stores.name was renamed to the "(N) ..." form, the
    name->id map came back empty, and the prompt rendered the literal SQL
    `t.store_id IN ()`. Resolving from definitions cannot fail that way, and an
    unknown name raises instead of quietly matching nothing.

    A DELIBERATE EXCLUSION REFUSES IN ITS OWN WORDS. Ten tools scope their
    catalog to a subset of the estate, and until 2026-09-13 every one of them
    told a caller asking about an excluded store that it did not exist:
    "Unknown store 'AJI BARN'. Valid stores: Fairview, ...". AJI BARN is the
    warehouse. It was excluded on purpose, for a reason written down in
    metrics.yaml, and the refusal said the opposite of that — so Bob could
    not explain it and could only guess, three times, in the middle of the one
    workflow the owner was actually building.

    So when `defs` is given, a name that resolves anywhere in the estate is
    refused as OUT OF SCOPE rather than as unknown, naming the group it is in
    and the reason the caller declared. A name that resolves nowhere is still
    unknown, which is a different mistake with a different fix.
    """
    if store is None:
        return list(catalog)

    if isinstance(store, (list, tuple, set)):
        # An empty list is not "no filter": somebody asked for a scope and
        # named nothing in it, and answering with the whole estate would put
        # every shop's figures under a label saying two.
        names = [s for s in store]
        if not names:
            raise ValueError(
                "An empty list of stores is not a scope. Name at least one "
                "store, or omit the filter for all of them."
            )
        out: list[str] = []
        for name in names:
            for sid in resolve_store(name, catalog, defs, out_of_scope_reason):
                if sid not in out:
                    out.append(sid)
        return out

    wanted = str(store).strip().lower()
    for sid, entry in catalog.items():
        if _match(wanted, entry, sid):
            return [sid]

    in_scope = sorted(e.get("display_name") or e["name"] for e in catalog.values())
    if defs is not None:
        for sid, (entry, group) in estate(defs).items():
            if _match(wanted, entry, sid):
                name = entry.get("display_name") or entry.get("name") or sid
                where = group.replace("_", " ")
                # Collapse whitespace before the full stop: a YAML scalar
                # carries its trailing newline, and rstrip('.') alone left the
                # stop on a line of its own. A caller that declared no reason
                # gets no sentence — never the word "None".
                note = (" ".join(str(out_of_scope_reason).split()).rstrip(".")
                        if out_of_scope_reason else "")
                reason = f" {note}." if note else ""
                raise ValueError(
                    f"{name} is not in scope for this reading. It is a real "
                    f"store — it is in {where}.{reason} This reading covers: "
                    f"{', '.join(in_scope)}."
                )

    raise ValueError(
        f"Unknown store {store!r}. Valid stores: {', '.join(in_scope)}. "
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


# --------------------------------------------------------------------------
# A setting a person bound — the categories they said to leave out (P2S.11)
#
# The owner, 2026-09-18: "if i tell it some info like dont focus on [per gram]
# ... will it remeber it and actually use that info?" Until this, no read could
# leave a category out, so a told view changed Bob's words while every
# ranking still led with per-gram lines.
#
# ONE COPY, for the same reason the connection guard has one: each read that
# takes the setting builds its predicate and its receipt here, so "left out at
# your instruction" means the same thing on every read that says it. The value
# arrives as a keyword-only argument the loop supplies from what the person
# told Bob (metrics.yaml settings.declared.left_out_categories); the model
# can neither see it nor set it.
#
# LISTS, NEVER TOTALS. A read that is a total says in meta.settings that the
# setting was not applied and why, and its figures are untouched.
# --------------------------------------------------------------------------

LEFT_OUT = "left_out_categories"


def _left_out_entries(bound: Any, decl: Mapping[str, Any]) -> list[dict]:
    """The bound value as [{category, told, on}], bounded by its declaration."""
    if isinstance(bound, Mapping):
        bound = [bound]
    if not isinstance(bound, (list, tuple)):
        return []
    out: list[dict] = []
    for e in bound:
        if isinstance(e, str):
            e = {"category": e}
        if not isinstance(e, Mapping) or not str(e.get("category") or "").strip():
            continue
        out.append({"category": str(e["category"]).strip(),
                    "told": str(e.get("told") or "").strip() or None,
                    "on": str(e.get("on") or "").strip() or None})
    return out[: int(req(decl, "bounds.max_items"))]


def left_out(defs: dict, bound: Any, *, lists: bool, alias: str = "p",
             asked_category: Optional[str] = None, names_product: bool = False) -> dict:
    """
    What the categories a person said to leave out do to one read.

    Returns {"predicate", "params", "filters_applied", "setting"}:
      predicate        a clause to AND into the read's WHERE, or None
      params           its bound parameter
      filters_applied  one receipt line per category, for meta.filters_applied
      setting          for meta.settings — what was bound, what was left out,
                       and why not when it was not. None when nothing is bound,
                       so a read with no setting says nothing about one.

    `lists` is whether this read lists products or categories (the rankings
    the setting is for); a total passes False. `asked_category` is a category
    the read narrows to by name, and `names_product` a read of one product:
    neither is a list of rivals, so neither leaves anything out, and the
    receipt says so (settings.declared.left_out_categories.asked_for_by_name).
    `alias` is the products table's alias in the read's SQL.
    """
    none = {"predicate": None, "params": {}, "filters_applied": [], "setting": None}
    if not bound:
        return none
    decl = req(defs, f"settings.declared.{LEFT_OUT}")
    entries = _left_out_entries(bound, decl)
    if not entries:
        return none
    source = f"metrics.yaml: settings.declared.{LEFT_OUT}"
    setting: dict[str, Any] = {"name": LEFT_OUT, "bound": entries,
                               "left_out": [], "source": source}
    if not lists or names_product:
        setting["not_applied"] = (
            "this read names one product, which is not a list of its rivals"
            if names_product and lists else
            f"this read is a total, and the setting leaves categories out of "
            f"{req(decl, 'leaves_out_of')}, never out of {req(decl, 'never_out_of')}"
        )
        return {**none, "setting": setting}

    template = str(req(decl, "receipt"))
    asked = (asked_category or "").strip().lower()
    applied = [e for e in entries if e["category"].lower() != asked]
    lines = [f"{template.format(category=e['category'], date=e['on'] or 'date not recorded')}"
             f"   # {source}" for e in applied]
    lines += [f"{e['category']} asked for by name, so not left out of this read "
              f"(left out elsewhere at your instruction, {e['on'] or 'date not recorded'})"
              f"   # {source}" for e in entries if e not in applied]
    if not applied:
        setting["not_applied"] = "this read names the category it would leave out"
        return {**none, "filters_applied": lines, "setting": setting}

    # The normalized category, exactly as every other read spells it, with the
    # products table under whatever alias this read gave it.
    cat_sql = str(req(defs, "products.category_normalization.sql"))
    if alias != "p":
        import re as _re
        cat_sql = _re.sub(r"\bp\.", f"{alias}.", cat_sql)
    setting["left_out"] = [e["category"] for e in applied]
    return {
        "predicate": f"lower({cat_sql}) <> ALL(%(left_out_categories)s)",
        "params": {"left_out_categories": [e["category"].lower() for e in applied]},
        "filters_applied": lines,
        "setting": setting,
    }

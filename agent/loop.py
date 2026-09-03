"""
George — the agent loop.

Model -> tool call -> answer. No planner, no decomposition, no sub-agents
(CLAUDE.md rule 5). Depth lives in the tools, not here.

WHAT THIS FILE OWNS
  - Tool schemas generated from the real signatures in tools/, with enum values
    read from definitions/metrics.yaml so a schema can never drift from the
    definitions the tools validate against.
  - The iteration loop, capped, with prompt caching and adaptive thinking.
  - Tool-result truncation that keeps meta aggregates whole.
  - Notice enforcement: the loop will not emit an answer while a meta.notice
    from any tool result is still unsurfaced.
  - SSE events for the frontend.
  - Conversation and gap logging through a SEPARATE insert-only role.
  - The record of which calls actually RAN, which is what a write tool may pin.

TWO DATABASE IDENTITIES, DELIBERATELY
  george_ro  (GEORGE_DATABASE_URL)     read-only, SELECT on business tables
  george_log (GEORGE_LOG_DATABASE_URL) INSERT-only, george.* schema, no SELECT
Neither can do the other's job. See agent/sql/george_log_role.sql.

AND A WRITE SURFACE THAT IS NOT A THIRD CONNECTION
George can pin his own answer when asked (`pin_answer`). That is a write, and
neither role above can perform it: george_ro is read-only, and george_log has
INSERT without SELECT, so it could not read the pin count or the page list the
write needs. Granting either of them more would hand one identity both the
business data and a write.

Instead the caller INJECTS a writer — see run(pin_writer=...). This file opens
no connection for it, holds no credential for it, and never learns who the user
is; the web process builds the writer around the authenticated user and the
application role, and the write goes through the same service function POST
/pins uses. No writer injected means no write tool in the schema at all, so the
capability is carried by the injection rather than by a flag. Details and the
rules the next write tool must preserve: agent/write_tools.py.
"""

from __future__ import annotations

import asyncio
import collections
import inspect
import json
import os
import re
import time
import uuid
from datetime import date, datetime, timezone
from typing import Any, AsyncIterator, Callable, Optional

import anthropic

from agent import write_tools
from agent.write_tools import WriteContext, call_key
from tools import (
    brief,
    cost_history,
    dead_stock,
    inventory,
    movement,
    products,
    purchasing,
    sales,
    vending,
)
from tools._common import load_defs as _load_defs, req

# --------------------------------------------------------------------------
# Transient-error retry
#
# The SDK already retries at the REQUEST level (max_retries=2 by default) and
# 529 overloaded is in its retryable set. That was not enough: a coverage run
# lost a question to `overloaded_error` anyway, because the failure landed
# mid-stream where request-level retry cannot help. So the whole streaming turn
# is retried here.
#
# Only transient faults. A 400 is never retried — a credit-balance failure
# retried three times per question would have turned one wasted run into three.
# Tool failures and refusals are not retried either: a refusal is a correct
# answer, and repeating it would not change it.
# --------------------------------------------------------------------------
MAX_TURN_RETRIES = 3
RETRY_BASE_DELAY = 1.0
_TRANSIENT_STATUS = {408, 409, 429, 500, 502, 503, 504, 529}


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APITimeoutError)):
        return True
    if isinstance(exc, anthropic.APIStatusError):
        return getattr(exc, "status_code", None) in _TRANSIENT_STATUS
    return False

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

MODEL = "claude-opus-5"
MAX_ITERATIONS = 15
MAX_TOKENS = 64000
EFFORT = "high"

# Rows handed to the model per tool result. meta aggregates are NEVER truncated.
MAX_ROWS_TO_MODEL = 200

# Convergence cap. Past this many tool calls in one question, the loop stops
# asking for more and requires an answer. A 40-question run produced single
# questions costing 25, 23 and 20 calls — all of them enumerating something one
# grouped or ranked call would have returned. Beyond this point more calls have
# not been buying more answer, so the useful output is what was attempted and
# what would express it, not another slice of the same table.
MAX_TOOL_CALLS = 12

# The READ surface: the tools that produce figures.
#
# This dict is load-bearing beyond dispatch. pin_runner.validate_call treats it
# as the set of calls a pin may CONTAIN, so a write tool must never be added
# here — that would let a pin contain a pin, and let the pin runner write. The
# write surface lives in agent/write_tools.py and is merged in only for schema
# generation, only when a writer has been injected.
TOOL_FUNCTIONS: dict[str, Callable[..., dict]] = {
    "get_sales": sales.get_sales,
    "get_stock": inventory.get_stock,
    "get_product": products.get_product,
    "get_movement": movement.get_movement,
    "get_vending": vending.get_vending,
    "get_vending_stock": vending.get_vending_stock,
    "get_dead_stock": dead_stock.get_dead_stock,
    "get_purchasing": purchasing.get_purchasing,
    "get_cost_history": cost_history.get_cost_history,
    "get_brief": brief.get_brief,
}


# --------------------------------------------------------------------------
# Tool schema generation
# --------------------------------------------------------------------------

def _enum_sources(defs: dict) -> dict[tuple[str, str], list]:
    """
    Closed vocabularies, read from metrics.yaml rather than hardcoded.

    Pure signature introspection cannot produce these — `metric: str` and
    `group_by: Any` say nothing about which values are valid. Reading them from
    the definitions means a metric added to the yaml appears in the schema
    automatically, and one removed disappears.
    """
    sales_metrics = sorted(req(defs, "metrics"))
    sales_groups = sorted({
        g for m in req(defs, "metrics").values() for g in m.get("valid_group_by", [])
    })
    vend_metrics = sorted(req(defs, "vending.metrics"))
    vend_groups = sorted({
        g for m in req(defs, "vending.metrics").values() for g in m.get("valid_group_by", [])
    })
    presets = sorted(req(defs, "sales_day.presets"))
    states = [s["name"] for s in sorted(req(defs, "inventory.states"), key=lambda s: s["order"])]

    retail = [s["display_name"] for s in req(defs, "stores.active_retail")]
    warehouse = [s.get("display_name") or s["name"] for s in req(defs, "stores.warehouse")]

    # Closed locations answer HISTORICAL questions and not current-state ones
    # (metrics.yaml filters.closed_locations), so they belong in the movement and
    # purchasing vocabularies and NOT in the stock one. AJI MACOPA has 1,006
    # transfer documents behind it.
    closed = [s.get("display_name") or s["name"] for s in req(defs, "stores.closed")]
    pending = [s.get("display_name") or s["name"] for s in req(defs, "stores.pending_retail")]
    historical_locations = retail + warehouse + closed + pending

    purch_measures = sorted(req(defs, "purchasing.measures"))
    purch_groups = sorted({
        g for m in req(defs, "purchasing.measures").values()
        for g in m.get("valid_group_by", [])
    })
    movement_bases = sorted(list(req(defs, "movement.bases")) + ["both"])

    return {
        ("get_purchasing", "measure"): purch_measures,
        ("get_purchasing", "group_by"): purch_groups,
        ("get_purchasing", "date_range"): presets,
        ("get_purchasing", "store"): historical_locations,
        ("get_movement", "basis"): movement_bases,
        ("get_movement", "to_store"): historical_locations,
        ("get_sales", "metric"): sales_metrics,
        ("get_sales", "group_by"): sales_groups,
        ("get_sales", "date_range"): presets,
        ("get_stock", "state"): states,
        ("get_stock", "group_by"): list(req(defs, "ranking.stock_grouping.valid_group_by")),
        ("get_stock", "store"): retail + warehouse,
        # Wider than get_stock's: a closed warehouse has no current stock but a
        # thousand recorded transfers.
        ("get_movement", "store"): historical_locations,
        ("get_movement", "date_range"): presets,
        ("get_vending", "metric"): vend_metrics,
        ("get_vending", "group_by"): vend_groups,
        ("get_vending", "date_range"): presets,
    }


_DOC_ARG = re.compile(r"^\s{4,}(\w+):\s*(.+)$")


def _parse_docstring(fn: Callable) -> tuple[str, dict[str, str]]:
    """Summary plus the Google-style `Args:` descriptions."""
    doc = inspect.getdoc(fn) or ""
    head, _, rest = doc.partition("Args:")
    body, _, _ = rest.partition("Returns:")
    summary = " ".join(head.split())

    args: dict[str, str] = {}
    current = None
    for line in body.splitlines():
        m = _DOC_ARG.match(line)
        if m:
            current = m.group(1)
            args[current] = m.group(2).strip()
        elif current and line.strip():
            args[current] += " " + line.strip()
    return summary, {k: " ".join(v.split()) for k, v in args.items()}


def _param_schema(fn_name: str, pname: str, annotation: Any, enums: dict) -> dict:
    """Map one parameter to JSON Schema. Structure from Python, values from yaml."""
    enum = enums.get((fn_name, pname))
    text = str(annotation)

    if pname == "group_by":
        one = {"type": "string", "enum": enum} if enum else {"type": "string"}
        many = {"type": "array", "items": dict(one)}
        return {"oneOf": [one, many]}

    if pname == "date_range":
        return {"oneOf": [
            {"type": "string", "enum": enum or []},
            {
                "type": "array",
                "description": "Explicit [start, end) Manila dates, YYYY-MM-DD.",
                "items": {"type": "string"},
                "minItems": 2,
                "maxItems": 2,
            },
        ]}

    if pname == "tool_calls":
        # The calls a pin will hold. `tool` is enumerated from the READ surface,
        # so the schema itself cannot express a pin containing a write tool.
        return {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tool": {"type": "string", "enum": sorted(TOOL_FUNCTIONS)},
                    "arguments": {"type": "object"},
                },
                "required": ["tool", "arguments"],
            },
        }

    if pname == "filters":
        return {
            "type": "object",
            "properties": {
                "store": {"type": "string"},
                "sku": {"type": "string"},
                "product_id": {"type": "string"},
                "category": {"type": "string"},
                "tag": {"type": "string"},
            },
            "additionalProperties": False,
        }

    if "bool" in text:
        return {"type": "boolean"}

    # Integers must be declared as integers. Without this branch top_n fell
    # through to "string", the model dutifully sent "10", and validate_top_n
    # rejected it as a str — so the parameter was unusable and George brute-
    # forced instead (25 get_stock calls for one out-of-stock ranking). The
    # tool-level tests missed it because they call the functions directly with
    # real ints and never see the schema the model is given.
    if "int" in text:
        schema: dict = {"type": "integer"}
        if pname == "top_n":
            defs_ = _load_defs()
            schema["minimum"] = req(defs_, "ranking.min_top_n")
            schema["maximum"] = req(defs_, "ranking.max_top_n")
        return schema

    if enum:
        return {"type": "string", "enum": enum}
    return {"type": "string"}


def build_tool_schemas(defs: Optional[dict] = None,
                       include_write: bool = False) -> list[dict]:
    """
    Generate Anthropic tool definitions from the real signatures in tools/.

    Deterministic order (sorted) because tools render first in the cached
    prefix — a reordered tool list silently invalidates the whole cache. The
    write tools sort AFTER every read tool ("pin_answer" > "get_..."), so a
    session with a writer and one without share a byte-identical prefix up to
    the last block; only the tail differs.

    include_write is False by default, and that default is doing real work:
    pin_runner calls this to decide whether a STORED call is still valid, and a
    pin must never be able to contain a write.

    `strict` is deliberately NOT set: two parameters need `oneOf`, which the
    strict-mode schema subset does not accept. The tools validate their own
    inputs and raise on anything unknown, so validation is not lost — it just
    happens one layer in.
    """
    defs = defs or _load_defs()
    enums = _enum_sources(defs)
    schemas = []

    surface: dict[str, Callable[..., Any]] = dict(TOOL_FUNCTIONS)
    if include_write:
        surface.update(write_tools.WRITE_TOOL_FUNCTIONS)

    for name in sorted(surface):
        fn = surface[name]
        summary, argdocs = _parse_docstring(fn)
        sig = inspect.signature(fn)

        props, required = {}, []
        for pname, param in sig.parameters.items():
            # Keyword-only parameters belong to the loop, not to the model: they
            # carry the injected writer and the record of what has actually run.
            # No read tool has one.
            if param.kind is inspect.Parameter.KEYWORD_ONLY:
                continue
            schema = _param_schema(name, pname, param.annotation, enums)
            if pname in argdocs:
                schema["description"] = argdocs[pname]
            props[pname] = schema
            if param.default is inspect.Parameter.empty:
                required.append(pname)

        schemas.append({
            "name": name,
            "description": summary,
            "input_schema": {
                "type": "object",
                "properties": props,
                "required": required,
            },
        })
    return schemas


# --------------------------------------------------------------------------
# System prompt — must stay byte-stable or the cache breaks
# --------------------------------------------------------------------------

SYSTEM_PROMPT = """You are George, a business analyst for Aji Ichiban — 7 active retail candy stores in the Philippines, the AJI BARN warehouse, and the AJI CMG vending machines.

Your job is to be trustworthy about numbers, not clever about them.

RULES

1. Every number you state must come from a tool result in this conversation. Never estimate, never interpolate, never carry a number over from your own general knowledge. If no tool can answer, say so and name the tool that would be needed.

2. Read `meta` on every tool result before you read `rows`. It tells you the source table, every filter that was applied, and when the data was read. If two results used different filters, say so before comparing them.

3. If a result carries `meta.notice`, you MUST surface it in your answer, in plain language, before or alongside the number it qualifies. A notice means the result is not what it appears — an empty list that means "not configured", a figure that is overstated, a SKU that is three different products. Reporting the number without the notice is the single worst thing you can do here.

4. If `meta.truncated_for_model` is true you are seeing a sample of the rows. The aggregates in `meta` cover ALL rows — never infer a total by adding up the rows you can see.

5. A tool that raises is not a failure to work around. It is the tool refusing to produce a misleading number. Read the message, and either follow the route it suggests or explain to the user why the question cannot be answered as asked.

6. Prefer ONE ranked or grouped query to many. For "top N", "worst N", "biggest" or "most" questions, pass `top_n` and read `meta.full_row_count` for the size of the whole set — do not fetch everything and sort it yourself. For a figure per store, per category or per state, pass `group_by` — do not call the same tool once per store. Calling a tool repeatedly with only one argument changed means you are enumerating something a single call could group; stop and make that call instead. If no grouping or ranking expresses the question, say so rather than working around it with volume.

7. Money is Philippine pesos (₱). Vending data is a separate domain from store data and the two must never be added together.

8. When `pin_answer` is available and the user asks you to pin something, pin it — do not ask them to confirm. A pin stores the tool calls behind an answer and re-runs them, so the tile stays current. You may only pin calls you have actually run in this conversation: if the user asks for a variant ("pin that but daily", "just Rockwell"), run the adjusted call FIRST, read its result, and pin that call — never pin a call you have not run. Afterwards, say plainly what you pinned and which page it went to, naming the page or saying it is ungrouped, and that it re-runs. If pinning is refused, tell the user why in their words. NEVER write that you pinned something unless `pin_answer` has actually returned in this conversation — describing a pin you did not make sends the user looking for a tile that does not exist.

Answer in prose. Use a short table when comparing more than three rows. State the window and the scope you used."""


# --------------------------------------------------------------------------
# Tool execution
# --------------------------------------------------------------------------

def _json_safe(obj: Any) -> Any:
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    return obj


def _truncate(result: dict) -> dict:
    """
    Cap rows handed to the model. meta is never touched.

    The note is explicit because a silently shortened list invites the model to
    sum what it can see and call it a total.
    """
    rows = result.get("rows") or []
    if len(rows) <= MAX_ROWS_TO_MODEL:
        return result

    meta = dict(result.get("meta") or {})
    omitted = len(rows) - MAX_ROWS_TO_MODEL
    meta["truncated_for_model"] = True
    meta["rows_shown"] = MAX_ROWS_TO_MODEL
    meta["rows_omitted"] = omitted
    meta["truncation_note"] = (
        f"{MAX_ROWS_TO_MODEL} of {len(rows)} rows shown. Every figure in meta is "
        f"computed over ALL {len(rows)} rows — do not total the visible rows."
    )
    return {"rows": rows[:MAX_ROWS_TO_MODEL], "meta": meta}


def _notices_from(result: dict) -> list[dict]:
    """Flatten meta.notice, expanding the `multiple` container into its items."""
    notice = (result.get("meta") or {}).get("notice")
    if not notice:
        return []
    if notice.get("kind") == "multiple" and notice.get("items"):
        return list(notice["items"])
    return [notice]


async def _call_tool(name: str, args: dict) -> tuple[dict, Optional[str], int]:
    """
    Run a tool off the event loop. Returns (payload, error_message, duration_ms).

    The clock is read either side of the call HERE rather than around
    asyncio.gather, so each tool reports its own execution time. Timing it in
    the consuming loop instead measured "time until this frame was emitted":
    that loop yields SSE frames, so a slow client inflated every duration after
    the first, and two genuinely concurrent calls reported 678ms and 2524ms.
    """
    fn = TOOL_FUNCTIONS[name]
    started = time.perf_counter()
    try:
        result = await asyncio.to_thread(fn, **args)
        return result, None, int((time.perf_counter() - started) * 1000)
    except (ValueError, KeyError, RuntimeError) as exc:
        # A refusal is a real answer — the tool declining to mislead. It goes
        # back to the model as an error result, never swallowed.
        return ({"rows": [], "meta": {"error": str(exc)}}, str(exc),
                int((time.perf_counter() - started) * 1000))


async def _call_write_tool(name: str, args: dict,
                           ctx: WriteContext) -> tuple[dict, Optional[str], int]:
    """
    Run a write tool. Same (payload, error, duration) contract as _call_tool.

    Awaited rather than threaded, because the writer it calls is async all the
    way down to the application's own database session — and never gathered with
    the read calls, because a write in the same batch has to see what those
    reads did (see the ordering in run()).

    The same exception set is caught for the same reason: PinRefused is a
    ValueError, so a pin the loop declines to create reaches the model as a real
    answer with a route out, exactly like a tool refusing to mislead.
    """
    fn = write_tools.WRITE_TOOL_FUNCTIONS[name]
    started = time.perf_counter()
    try:
        result = await fn(**args, ctx=ctx)
        return result, None, int((time.perf_counter() - started) * 1000)
    except (ValueError, KeyError, RuntimeError) as exc:
        return ({"rows": [], "meta": {"error": str(exc)}}, str(exc),
                int((time.perf_counter() - started) * 1000))


# --------------------------------------------------------------------------
# Notice enforcement
# --------------------------------------------------------------------------

def _unsurfaced(pending: list[dict], answer: str, defs: dict) -> list[dict]:
    """
    Which pending notices the answer fails to convey.

    Fingerprints come from metrics.yaml (notices.<kind>.must_convey): a list of
    groups, all of which must match, any alternative within a group sufficing.
    A kind with no fingerprint is treated as unsurfaced — safer to over-report
    than to let an unknown notice through silently.
    """
    fingerprints = req(defs, "notices")
    low = answer.lower()
    missing = []
    for n in pending:
        spec = fingerprints.get(n.get("kind"))
        if not isinstance(spec, dict) or "must_convey" not in spec:
            missing.append(n)
            continue
        if not all(
            any(alt.lower() in low for alt in group)
            for group in spec["must_convey"]
        ):
            missing.append(n)
    return missing


def _pin_claim(answer: str, defs: dict) -> Optional[str]:
    """
    Whether an answer says a pin was made ("claimed") or will be ("promised").

    Used only when NO pin was made. A pin is the one thing George can say that
    changes something outside the conversation, so it is the one statement worth
    checking against what actually happened. Both failures were observed live on
    the same question a run apart: "then pinned it" with no tool call, and "I'll
    run the weekly version first, then pin that exact call" followed by neither.

    A phrase preceded by a negation inside the window is a DENIAL, not a
    statement: "I could not pin that" and "I won't pin it" are George behaving
    correctly and must not be corrected. Vocabulary from metrics.yaml
    (pins.claim_check); claims are reported ahead of intents, since an answer
    that does both has already asserted the stronger thing.
    """
    spec = req(defs, "pins.claim_check")
    window = spec["negation_window"]
    low = answer.lower()

    def says(phrases) -> bool:
        for phrase in phrases:
            start = 0
            while (at := low.find(phrase, start)) != -1:
                before = low[max(0, at - window):at]
                if not any(neg in before for neg in spec["negations"]):
                    return True
                start = at + len(phrase)
        return False

    if says(spec["claims"]):
        return "claimed"
    if says(spec["intents"]):
        return "promised"
    return None


def _forced_caveats(missing: list[dict]) -> str:
    lines = ["", "", "**Caveats** *(added automatically — these qualify the figures above)*", ""]
    for n in missing:
        lines.append(f"- {n.get('message', '').strip()}")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Logging — separate identity, insert-only
# --------------------------------------------------------------------------

class ConversationLog:
    """
    Writes to george.* through the insert-only role.

    Three consequences of INSERT-without-SELECT shape this class:
      - Ids are generated client-side. `INSERT ... RETURNING id` needs SELECT on
        the returned column, which this role does not have.
      - Nothing is ever read back. The loop cannot verify its own writes.
      - Every failure is swallowed and reported, never raised. A logging outage
        must not cost the user their answer.
    """

    def __init__(self) -> None:
        self.url = os.environ.get("GEORGE_LOG_DATABASE_URL")
        self.conversation_id = str(uuid.uuid4())
        self.errors: list[str] = []
        self._conn = None

    @property
    def enabled(self) -> bool:
        return bool(self.url)

    def _connect(self):
        if self._conn is None:
            import psycopg

            self._conn = psycopg.connect(self.url, connect_timeout=10)
            self._conn.autocommit = True
        return self._conn

    def _exec(self, sql: str, params: tuple) -> None:
        if not self.enabled:
            return
        try:
            with self._connect().cursor() as cur:
                cur.execute(sql, params)
        except Exception as exc:  # noqa: BLE001 - logging must never break the answer
            self.errors.append(f"{type(exc).__name__}: {exc}")
            self._conn = None

    def conversation(self, **kw) -> None:
        self._exec(
            "INSERT INTO george.conversations "
            "(id, user_id, asked_at, question, final_answer, model, iterations, "
            " input_tokens, output_tokens, cache_read_tokens, notices, "
            " notice_forced, status) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                self.conversation_id, kw.get("user_id"), kw["asked_at"],
                kw["question"], kw.get("final_answer"), MODEL, kw["iterations"],
                kw.get("input_tokens"), kw.get("output_tokens"),
                kw.get("cache_read_tokens"), json.dumps(kw.get("notices") or []),
                kw.get("notice_forced", False), kw["status"],
            ),
        )

    def tool_call(self, seq: int, name: str, args: dict, result: dict,
                  ms: int, error: Optional[str]) -> None:
        meta = result.get("meta") or {}
        self._exec(
            "INSERT INTO george.tool_calls "
            "(id, conversation_id, seq, tool, arguments, row_count, truncated, "
            " source_table, notice_kind, duration_ms, error) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                str(uuid.uuid4()), self.conversation_id, seq, name,
                json.dumps(_json_safe(args)), meta.get("row_count"),
                bool(meta.get("truncated_for_model")), meta.get("source_table"),
                (_notices_from(result)[0].get("kind") if _notices_from(result) else None),
                ms, error,
            ),
        )

    def gap(self, kind: str, detail: str, tool: Optional[str] = None) -> None:
        self._exec(
            "INSERT INTO george.gaps (id, conversation_id, kind, tool, detail, at) "
            "VALUES (%s,%s,%s,%s,%s,%s)",
            (str(uuid.uuid4()), self.conversation_id, kind, tool, detail,
             datetime.now(timezone.utc)),
        )


# --------------------------------------------------------------------------
# The loop
# --------------------------------------------------------------------------

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(_json_safe(data))}\n\n"


# --------------------------------------------------------------------------
# Conversation history
#
# The loop is stateless: one request, one question. That was invisible until
# chat-driven pinning arrived, because every question stood alone — but "pin
# that" has no meaning without the turn before it, and the calls it wants to pin
# ran in a REQUEST THAT HAS ALREADY FINISHED. So the client replays the prior
# turns, which is what it has been holding on screen all along.
#
# The replay carries the tool calls behind each earlier answer, and those seed
# the executed set. This does not weaken the provenance rule: its purpose is
# that a pin may only hold a call whose RESULT THE USER HAS SEEN, and a call the
# client is replaying is one it streamed to the screen. The trust boundary is
# unchanged either way — this same client can already POST any tool calls it
# likes to /pins, and both paths validate against the live tool surface before
# anything is stored.
#
# Bounded, because a client that can grow the prompt can grow the bill.
# --------------------------------------------------------------------------

MAX_HISTORY_TURNS = 20
MAX_HISTORY_TEXT = 20000


def _seed_history(history: Optional[list], executed: dict) -> list[dict]:
    """
    Prior turns as messages, and their calls recorded as already run.

    Mutates `executed`. Returns messages ready to precede the new question:
    consecutive same-role turns merged, blank turns dropped, and any leading
    assistant turn discarded — the API requires a user message first, and a
    client that starts its replay mid-answer must not take the request down.
    """
    messages: list[dict] = []
    for turn in (history or [])[-MAX_HISTORY_TURNS:]:
        role = "assistant" if turn.get("role") == "george" else "user"
        content = (turn.get("text") or "").strip()[:MAX_HISTORY_TEXT]

        calls = turn.get("tool_calls") or []
        if role == "assistant" and calls:
            # Rendered in call_key's canonical form (sorted keys) so that a
            # model copying an argument list out of this text produces a byte
            # for byte match against what actually ran.
            listed = ", ".join(
                f"{c.get('tool')}({json.dumps(c.get('arguments') or {}, sort_keys=True, default=str)})"
                for c in calls if c.get("tool")
            )
            content = (content + f"\n\n[Calls behind this answer: {listed}]").strip()
            for c in calls:
                if c.get("tool"):
                    args = c.get("arguments") or {}
                    executed[call_key(c["tool"], args)] = {
                        "tool": c["tool"], "arguments": args,
                    }

        if not content:
            continue
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n\n" + content
        elif not messages and role == "assistant":
            continue
        else:
            messages.append({"role": role, "content": content})

    return messages


async def run(
    question: str,
    user_id: Optional[str] = None,
    page_context: Optional[str] = None,
    pin_writer: Optional[write_tools.PinWriter] = None,
    history: Optional[list[dict]] = None,
) -> AsyncIterator[str]:
    """
    Answer one question, streaming SSE frames.

    Yields `event: <type>` frames — tool_call, tool_result, thinking, text,
    notice, pinned, warning, done, error. Tool results stream as SUMMARIES; raw
    rows never cross the wire.

    Args:
        question: what the user asked.
        user_id: who asked, for the conversation log. The caller takes this from
            a verified identity; nothing here or in the model can set it.
        page_context: the page the user is on. George is available on every page
            and receives that page as context (CLAUDE.md, UI rule 1), so it is
            given to the model as context on the question — NOT in the system
            prompt, which must stay byte-stable for the cache.
        pin_writer: if supplied, George can pin his own answers. This is the ONLY
            way a write reaches the loop; without it the write tool is not in the
            schema at all. See agent/write_tools.py.
        history: the conversation so far, replayed by the client as
            [{role: "user"|"george", text, tool_calls}]. Without it every
            question stands alone and "pin that" has no referent. The calls it
            carries seed the executed set — see _seed_history.
    """
    defs = _load_defs()
    tools_schema = build_tool_schemas(defs, include_write=pin_writer is not None)
    log = ConversationLog()
    asked_at = datetime.now(timezone.utc)

    # What the write tools are allowed to act on: the injected writer, the
    # question as asked, and (filled below, as calls run) the record of what has
    # actually executed. The model contributes nothing to this object.
    write_ctx = WriteContext(
        writer=pin_writer,
        question=question,
        conversation_id=log.conversation_id,
    )

    client = anthropic.AsyncAnthropic()
    opening = (
        f"[The user is on the {page_context} page.]\n\n{question}"
        if page_context else question
    )
    # Prior turns first, and the calls behind them recorded as already run —
    # "pin that" refers to something that happened in an earlier request.
    messages: list[dict] = _seed_history(history, write_ctx.executed)
    messages.append({"role": "user", "content": opening})
    pending: list[dict] = []
    seq = 0
    called_tools: list[str] = []
    conceded = False
    iterations = 0
    corrective_turns = 0
    max_corrective = req(defs, "notices.max_corrective_turns")
    # Writes actually made this run, and the budget for asking the model to
    # reconcile a claimed pin with reality.
    pins_made = 0
    pin_corrections = 0
    max_pin_corrections = req(defs, "pins.claim_check.max_corrective_turns")
    usage = {"input": 0, "output": 0, "cache_read": 0}
    answer = ""
    status = "ok"
    notice_forced = False

    # meta of the last tool result that actually produced one — the receipts
    # shown under the answer. See the `receipts` frame emitted before `done`.
    last_meta: Optional[dict] = None

    yield _sse("start", {"conversation_id": log.conversation_id,
                         "logging_enabled": log.enabled})

    try:
        while iterations < MAX_ITERATIONS:
            iterations += 1

            # Cache breakpoints: tools render first, then system, then messages.
            # One breakpoint at the end of each stable region covers both. The
            # system prompt carries no timestamp — a clock in there would
            # invalidate the prefix on every single request.
            cached_tools = [dict(t) for t in tools_schema]
            cached_tools[-1]["cache_control"] = {"type": "ephemeral"}

            # Retry the whole turn on a transient fault. A turn can only be
            # retried while nothing has been streamed: once deltas have reached
            # the client, replaying would duplicate them, so a mid-stream fault
            # surfaces instead of retrying.
            attempt = 0
            while True:
                text_parts: list[str] = []
                streamed = False
                try:
                    async with client.messages.stream(
                        model=MODEL,
                        max_tokens=MAX_TOKENS,
                        system=[{
                            "type": "text",
                            "text": SYSTEM_PROMPT,
                            "cache_control": {"type": "ephemeral"},
                        }],
                        tools=cached_tools,
                        thinking={"type": "adaptive", "display": "summarized"},
                        output_config={"effort": EFFORT},
                        messages=messages,
                    ) as stream:
                        async for event in stream:
                            if event.type == "content_block_delta":
                                d = event.delta
                                if d.type == "text_delta":
                                    text_parts.append(d.text)
                                    streamed = True
                                    yield _sse("text", {"delta": d.text})
                                elif d.type == "thinking_delta":
                                    streamed = True
                                    yield _sse("thinking", {"delta": d.thinking})
                        final = await stream.get_final_message()
                    break
                except Exception as exc:  # noqa: BLE001 - re-raised unless transient
                    if not _is_transient(exc) or streamed or attempt >= MAX_TURN_RETRIES - 1:
                        raise
                    attempt += 1
                    delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    log.gap("api_retry", f"attempt {attempt}: {type(exc).__name__}: {exc}"[:2000])
                    yield _sse("warning", {
                        "reason": "transient_api_error",
                        "attempt": attempt,
                        "max_attempts": MAX_TURN_RETRIES,
                        "retry_in_s": delay,
                        "detail": f"{type(exc).__name__}: {exc}"[:300],
                    })
                    await asyncio.sleep(delay)

            usage["input"] += final.usage.input_tokens or 0
            usage["output"] += final.usage.output_tokens or 0
            usage["cache_read"] += getattr(final.usage, "cache_read_input_tokens", 0) or 0

            messages.append({"role": "assistant", "content": final.content})
            tool_uses = [b for b in final.content if b.type == "tool_use"]

            # ---- no more tools: candidate answer -------------------------
            if not tool_uses:
                answer = "".join(text_parts).strip()

                # A pin claimed, or promised, but never made. Checked BEFORE the
                # notice enforcement below, because the remedy may be another
                # tool call, and because an answer that misreports a write is
                # wrong in a way no caveat fixes.
                claim = None if pins_made else _pin_claim(answer, defs)
                if claim and pin_corrections < max_pin_corrections:
                    pin_corrections += 1
                    log.gap(f"pin_{claim}_not_made", answer[:2000])
                    yield _sse("warning", {"reason": f"pin_{claim}_not_made"})
                    messages.append({
                        "role": "user",
                        "content": (
                            "Your answer says something WAS pinned, but you "
                            "never called pin_answer, so nothing was written "
                            "and no tile exists. The user would go looking for "
                            "a pin that is not there.\n\n"
                            "If you meant to pin it, call pin_answer now with "
                            "the calls you actually ran. If you cannot — or did "
                            "not mean to — rewrite the answer to say plainly "
                            "that nothing was pinned, and why."
                            if claim == "claimed" else
                            "Your answer says you are going to pin something, "
                            "but you never called pin_answer, so nothing was "
                            "written and no tile exists. Saying you will pin it "
                            "does not pin it.\n\n"
                            "If you were waiting on the user for something — "
                            "which page, which window — say so plainly and ask. "
                            "Otherwise call pin_answer now with the calls you "
                            "actually ran, then confirm what was pinned."
                        ),
                    })
                    continue

                missing = _unsurfaced(pending, answer, defs)

                if missing and corrective_turns < max_corrective:
                    corrective_turns += 1
                    names = ", ".join(n.get("kind", "?") for n in missing)
                    detail = " | ".join(n.get("message", "") for n in missing)
                    messages.append({
                        "role": "user",
                        "content": (
                            "Your answer does not surface these caveats, which "
                            f"the tool results require you to state: {names}.\n\n"
                            f"{detail}\n\n"
                            "Rewrite the full answer, stating each of them in "
                            "plain language alongside the figures they qualify."
                        ),
                    })
                    yield _sse("warning", {"reason": "unsurfaced_notice", "kinds": names})
                    continue

                if missing:
                    # The fingerprint may simply have misjudged the wording, so
                    # the backstop is deterministic: append the notices verbatim
                    # rather than withhold the answer or trust the check.
                    notice_forced = True
                    forced = _forced_caveats(missing)
                    answer += forced
                    yield _sse("text", {"delta": forced})
                    for n in missing:
                        log.gap("notice_forced", n.get("message", "")[:2000],
                                n.get("source"))
                    yield _sse("warning", {
                        "reason": "notice_forced",
                        "kinds": ", ".join(n.get("kind", "?") for n in missing),
                    })
                break

            # ---- convergence cap -----------------------------------------
            if seq >= MAX_TOOL_CALLS and not conceded:
                conceded = True
                attempted = ", ".join(
                    f"{name} x{n}" for name, n in
                    sorted(collections.Counter(called_tools).items(),
                           key=lambda kv: -kv[1])
                )
                log.gap("convergence_cap",
                        f"{seq} calls without converging: {attempted}"[:2000])
                yield _sse("warning", {
                    "reason": "convergence_cap",
                    "tool_calls": seq,
                    "limit": MAX_TOOL_CALLS,
                    "attempted": attempted,
                })
                messages.append({
                    "role": "user",
                    "content": (
                        f"STOP CALLING TOOLS. You have made {seq} calls on this "
                        f"question ({attempted}) without reaching an answer, "
                        f"which is past the limit of {MAX_TOOL_CALLS}.\n\n"
                        "Do not call another tool. Answer now with three things:\n"
                        "1. what you were attempting and why it needed so many "
                        "calls;\n"
                        "2. whatever partial finding the results you already have "
                        "will actually support, clearly labelled as partial;\n"
                        "3. the single grouped or ranked call — naming the tool "
                        "and arguments — that would answer this properly, or a "
                        "plain statement that no available tool expresses the "
                        "question."
                    ),
                })
                continue

            # ---- execute tools -------------------------------------------
            # Each tool_use gets a CONVERSATION-GLOBAL sequence number, assigned
            # before dispatch and reused by its tool_call frame, its tool_result
            # frame and its database row. Previously the result frame and the log
            # row used the index within the batch, so two tools called in
            # parallel both reported seq 0 — a client or a query keying on seq
            # would collide them.
            batch = []
            for b in tool_uses:
                batch.append((seq, b))
                called_tools.append(b.name)
                yield _sse("tool_call", {"seq": seq, "tool": b.name, "arguments": b.input})
                seq += 1

            # Reads run together; writes run after them, in order.
            #
            # A write may only pin calls that have RUN, so it has to see the
            # results of anything read in the same batch — otherwise a model that
            # re-ran a variant and pinned it in one turn would be refused for a
            # call it just made. Reads are the complement of the write set rather
            # than `name in TOOL_FUNCTIONS`, so a name in neither still reaches
            # _call_tool and fails there: a tool_use with no tool_result would
            # break the next request outright.
            writes = [(g, b) for g, b in batch
                      if b.name in write_tools.WRITE_TOOL_FUNCTIONS]
            reads = [(g, b) for g, b in batch
                     if b.name not in write_tools.WRITE_TOOL_FUNCTIONS]

            done_calls = list(zip(reads, await asyncio.gather(*[
                _call_tool(b.name, dict(b.input)) for _, b in reads
            ])))

            # The provenance record. A call that refused is deliberately absent:
            # a pin of a call that has never once succeeded is a tile born broken.
            for (_, b), (_, err, _ms) in done_calls:
                if err is None:
                    args = dict(b.input)
                    write_ctx.executed[call_key(b.name, args)] = {
                        "tool": b.name, "arguments": args,
                    }

            for gseq, b in writes:
                done_calls.append(
                    ((gseq, b), await _call_write_tool(b.name, dict(b.input), write_ctx))
                )

            tool_results = []
            for (gseq, b), (result, err, ms) in done_calls:
                capped = _truncate(result)
                meta = capped.get("meta") or {}
                found = _notices_from(capped)
                pending.extend(found)

                # Keep the last meta that describes real data. A refusal's meta
                # is {"error": ...} and carries no source_table, no filters and
                # no snapshot_timestamp — rendering that as receipts would be
                # worse than rendering none. A write's meta is excluded too: it
                # is real, but it describes the pin, and showing it as the
                # answer's receipts would replace the figures' provenance with
                # the pin's.
                if (not err and meta.get("source_table")
                        and b.name not in write_tools.WRITE_TOOL_FUNCTIONS):
                    last_meta = meta

                log.tool_call(gseq, b.name, dict(b.input), capped, ms, err)

                if err:
                    log.gap("tool_refused", err[:2000], b.name)
                elif not (capped.get("rows") or []):
                    log.gap("empty_result", json.dumps(_json_safe(b.input))[:2000], b.name)

                yield _sse("tool_result", {
                    "seq": gseq,
                    "tool": b.name,
                    "row_count": meta.get("row_count", len(capped.get("rows") or [])),
                    "source_table": meta.get("source_table"),
                    "truncated": bool(meta.get("truncated_for_model")),
                    "duration_ms": ms,
                    "error": err,
                })
                # A pin that now exists, announced as its own frame.
                #
                # The answer is also told to say what it pinned and where, but a
                # write that happened is a fact, not a matter of wording: the
                # frame lets the UI confirm it and refresh the page list without
                # depending on the model having phrased it. Same reasoning as
                # `notice` and `receipts`.
                if not err and b.name in write_tools.WRITE_TOOL_FUNCTIONS:
                    pins_made += 1
                    row = (capped.get("rows") or [{}])[0]
                    yield _sse("pinned", {
                        "pin_id": row.get("pin_id"),
                        "title": row.get("title"),
                        "page": row.get("page"),
                        "pins_on_page": row.get("pins_on_page"),
                        "tool_calls": row.get("tool_calls") or [],
                    })

                for n in found:
                    yield _sse("notice", {"kind": n.get("kind"), "message": n.get("message")})

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": b.id,
                    "content": json.dumps(_json_safe(capped)),
                    **({"is_error": True} if err else {}),
                })

            # All results go back in ONE user message — splitting them trains
            # the model out of parallel tool use.
            messages.append({"role": "user", "content": tool_results})
        else:
            status = "iteration_cap"
            log.gap("iteration_cap", f"hit {MAX_ITERATIONS} iterations without finishing")
            yield _sse("error", {"message":
                                 f"Stopped after {MAX_ITERATIONS} iterations without "
                                 f"reaching an answer."})

        if status == "ok" and seq == 0:
            # George answering with no tool call is itself a smell worth logging.
            log.gap("no_tool_call", question[:2000])

    except anthropic.APIError as exc:
        status = "api_error"
        log.gap("api_error", f"{type(exc).__name__}: {exc}"[:2000])
        yield _sse("error", {"message": f"{type(exc).__name__}: {exc}"})
    except Exception as exc:  # noqa: BLE001
        status = "error"
        log.gap("unhandled", f"{type(exc).__name__}: {exc}"[:2000])
        yield _sse("error", {"message": f"{type(exc).__name__}: {exc}"})

    log.conversation(
        user_id=user_id, asked_at=asked_at, question=question,
        final_answer=answer or None, iterations=iterations,
        input_tokens=usage["input"], output_tokens=usage["output"],
        cache_read_tokens=usage["cache_read"],
        notices=[n.get("kind") for n in pending],
        notice_forced=notice_forced, status=status,
    )

    if log.errors:
        # Surfaced, not raised — the answer already went out.
        yield _sse("warning", {"reason": "logging_failed", "detail": log.errors[0]})

    # ---- receipts --------------------------------------------------------
    # The full meta of the last tool result, so the answer can show where its
    # numbers came from, which filters were applied and when the data was read.
    #
    # THIS FRAME WAS MISSING. useGeorgeStream has handled `receipts` and
    # ReceiptsBlock has rendered snapshot_timestamp and filters_applied since
    # they were written, but nothing ever emitted it, so turn.receipts was
    # always undefined and the block never appeared. UI rules 3 and 6 ("every
    # number is inspectable", "no number displays without a timestamp") were
    # unmet in chat despite every tool already returning what they need.
    #
    # Emitted HERE rather than inside the answer branch so it fires on every
    # exit path — normal finish, convergence cap, iteration cap, and the error
    # handlers above. A run that answered from tools then failed late still
    # shows where its figures came from.
    #
    # Known limit: when an answer spans several tools this is the LAST one's
    # meta, which is what ToolMeta and ReceiptsBlock already assume. Per-call
    # receipts in chat is a larger frontend change; the pin runner returns meta
    # per call and does not depend on this.
    if last_meta is not None:
        yield _sse("receipts", last_meta)

    yield _sse("done", {
        "conversation_id": log.conversation_id,
        "iterations": iterations,
        "tool_calls": seq,
        "status": status,
        "notice_forced": notice_forced,
        "usage": usage,
        "cache_hit": usage["cache_read"] > 0,
    })

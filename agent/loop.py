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

TWO DATABASE IDENTITIES, DELIBERATELY
  george_ro  (GEORGE_DATABASE_URL)     read-only, SELECT on business tables
  george_log (GEORGE_LOG_DATABASE_URL) INSERT-only, george.* schema, no SELECT
Neither can do the other's job. See agent/sql/george_log_role.sql.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import os
import re
import time
import uuid
from datetime import date, datetime, timezone
from typing import Any, AsyncIterator, Callable, Optional

import anthropic

from tools import inventory, movement, products, sales, vending
from tools._common import load_defs, req

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

MODEL = "claude-opus-5"
MAX_ITERATIONS = 15
MAX_TOKENS = 64000
EFFORT = "high"

# Rows handed to the model per tool result. meta aggregates are NEVER truncated.
MAX_ROWS_TO_MODEL = 200

# The six callable surfaces George has.
TOOL_FUNCTIONS: dict[str, Callable[..., dict]] = {
    "get_sales": sales.get_sales,
    "get_stock": inventory.get_stock,
    "get_product": products.get_product,
    "get_movement": movement.get_movement,
    "get_vending": vending.get_vending,
    "get_vending_stock": vending.get_vending_stock,
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

    return {
        ("get_sales", "metric"): sales_metrics,
        ("get_sales", "group_by"): sales_groups,
        ("get_sales", "date_range"): presets,
        ("get_stock", "state"): states,
        ("get_stock", "store"): retail + warehouse,
        ("get_movement", "store"): retail + warehouse,
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
    if enum:
        return {"type": "string", "enum": enum}
    return {"type": "string"}


def build_tool_schemas(defs: Optional[dict] = None) -> list[dict]:
    """
    Generate Anthropic tool definitions from the real signatures in tools/.

    Deterministic order (sorted) because tools render first in the cached
    prefix — a reordered tool list silently invalidates the whole cache.

    `strict` is deliberately NOT set: two parameters need `oneOf`, which the
    strict-mode schema subset does not accept. The tools validate their own
    inputs and raise on anything unknown, so validation is not lost — it just
    happens one layer in.
    """
    defs = defs or load_defs()
    enums = _enum_sources(defs)
    schemas = []

    for name in sorted(TOOL_FUNCTIONS):
        fn = TOOL_FUNCTIONS[name]
        summary, argdocs = _parse_docstring(fn)
        sig = inspect.signature(fn)

        props, required = {}, []
        for pname, param in sig.parameters.items():
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

6. Money is Philippine pesos (₱). Vending data is a separate domain from store data and the two must never be added together.

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


async def run(question: str, user_id: Optional[str] = None) -> AsyncIterator[str]:
    """
    Answer one question, streaming SSE frames.

    Yields `event: <type>` frames — tool_call, tool_result, thinking, text,
    notice, warning, done, error. Tool results stream as SUMMARIES; raw rows
    never cross the wire.
    """
    defs = load_defs()
    tools_schema = build_tool_schemas(defs)
    log = ConversationLog()
    asked_at = datetime.now(timezone.utc)

    client = anthropic.AsyncAnthropic()
    messages: list[dict] = [{"role": "user", "content": question}]
    pending: list[dict] = []
    seq = 0
    iterations = 0
    corrective_turns = 0
    max_corrective = req(defs, "notices.max_corrective_turns")
    usage = {"input": 0, "output": 0, "cache_read": 0}
    answer = ""
    status = "ok"
    notice_forced = False

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

            text_parts: list[str] = []
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
                            yield _sse("text", {"delta": d.text})
                        elif d.type == "thinking_delta":
                            yield _sse("thinking", {"delta": d.thinking})
                final = await stream.get_final_message()

            usage["input"] += final.usage.input_tokens or 0
            usage["output"] += final.usage.output_tokens or 0
            usage["cache_read"] += getattr(final.usage, "cache_read_input_tokens", 0) or 0

            messages.append({"role": "assistant", "content": final.content})
            tool_uses = [b for b in final.content if b.type == "tool_use"]

            # ---- no more tools: candidate answer -------------------------
            if not tool_uses:
                answer = "".join(text_parts).strip()
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
                yield _sse("tool_call", {"seq": seq, "tool": b.name, "arguments": b.input})
                seq += 1

            results = await asyncio.gather(*[
                _call_tool(b.name, dict(b.input)) for _, b in batch
            ])

            tool_results = []
            for (gseq, b), (result, err, ms) in zip(batch, results):
                capped = _truncate(result)
                meta = capped.get("meta") or {}
                found = _notices_from(capped)
                pending.extend(found)

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

    yield _sse("done", {
        "conversation_id": log.conversation_id,
        "iterations": iterations,
        "tool_calls": seq,
        "status": status,
        "notice_forced": notice_forced,
        "usage": usage,
        "cache_hit": usage["cache_read"] > 0,
    })

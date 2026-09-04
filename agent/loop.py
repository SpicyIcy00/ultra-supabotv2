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

from agent import composite_tools, write_tools
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

# Rows handed to the CLIENT per tool result, so an answer can draw the same
# chart a pinned tile draws.
#
# Tool results have always streamed as summaries — "raw rows never cross the
# wire" — and the reason still holds: a call can return 200 wide rows, and
# streaming those would dwarf the answer and duplicate what the model already
# read. But a chart cannot be drawn from a summary, and the alternative was a
# SECOND detection path in the backend deciding what is chartable. Detection is
# deterministic and lives in the frontend (pinShape.inferShape), which means the
# frontend needs the rows.
#
# So rows cross the wire under one rule: ALL OF THEM, OR NONE. A result larger
# than this cap sends `rows_complete: false` and no rows at all, and inferShape
# refuses to chart an incomplete series. A chart drawn from the first 120 of 900
# rows is not a smaller chart — it is a different and wrong one, asserting a
# shape the data does not have, which is exactly what pinShape's own docstring
# says is worse than a boring table.
#
# 120 because it clears the widest window a preset produces (a year of weeks, a
# quarter of days) while staying far below the row counts that made summaries
# the rule in the first place.
MAX_ROWS_TO_CLIENT = 120

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

    if pname == "steps":
        # A workflow's steps. `tool` is enumerated from the READ surface, for
        # the same reason tool_calls is: the schema itself cannot express a
        # workflow step that writes, or one that runs another workflow.
        return {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "tool": {"type": "string", "enum": sorted(TOOL_FUNCTIONS)},
                    "arguments": {"type": "object"},
                    "why": {"type": "string"},
                },
                "required": ["name", "tool", "arguments"],
            },
        }

    if pname == "parameters":
        defs_ = _load_defs()
        return {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "type": {"type": "string",
                             "enum": ["string", "integer", "boolean", "date_range"]},
                    "default": {},
                    "description": {"type": "string"},
                },
                "required": ["name", "type", "default"],
            },
            # Stated in the schema and not only in the docstring, because it is
            # the rule most easily broken by accident.
            "description": (
                "What varies between runs. Scope only — which store, which "
                "window, how many rows. A business threshold is a definition and "
                f"belongs in metrics.yaml (currently version "
                f"{req(defs_, 'version')}), never in a parameter."
            ),
        }

    if pname == "bindings":
        return {"type": "object",
                "description": "Parameter values, as {\"<parameter>\": value}."}

    if pname == "schedule":
        defs_ = _load_defs()
        return {
            "type": "object",
            "properties": {
                "kind": {"type": "string",
                         "enum": list(req(defs_, "workflows.schedule.kinds"))},
                "hour": {"type": "integer", "minimum": 0, "maximum": 23},
                "minute": {"type": "integer", "minimum": 0, "maximum": 59},
                "days_of_week": {"type": "array",
                                 "items": {"type": "integer",
                                           "minimum": 0, "maximum": 6}},
                "day_of_month": {"type": "integer", "minimum": 1, "maximum": 31},
                "telegram_chat_ids": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["kind", "hour"],
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


def injected_surface(ctx: WriteContext) -> dict[str, Callable[..., Any]]:
    """
    The write and composite tools this session actually has the capability for.

    Per TOOL, not per session: a caller that injected a pin writer but no
    workflow writer is offered pin_answer and NOT save_workflow. Offering a tool
    that would refuse every call teaches the model to try it and teaches the
    user that George is broken.
    """
    surface: dict[str, Callable[..., Any]] = {}
    for name, fn in write_tools.WRITE_TOOL_FUNCTIONS.items():
        if getattr(ctx, write_tools.WRITE_TOOL_REQUIRES[name], None) is not None:
            surface[name] = fn
    for name, fn in composite_tools.COMPOSITE_TOOL_FUNCTIONS.items():
        if getattr(ctx, composite_tools.COMPOSITE_TOOL_REQUIRES[name], None) is not None:
            surface[name] = fn
    return surface


def build_tool_schemas(defs: Optional[dict] = None,
                       include_write: bool = False,
                       extra: Optional[dict[str, Callable[..., Any]]] = None) -> list[dict]:
    """
    Generate Anthropic tool definitions from the real signatures in tools/.

    Deterministic order (sorted) because tools render first in the cached
    prefix — a reordered tool list silently invalidates the whole cache. Every
    injected tool sorts AFTER every read tool ("pin_answer", "run_workflow" and
    "save_workflow" all follow "get_..."), so sessions with different
    capabilities still share a byte-identical prefix up to the tail.

    Both extension arguments default to nothing, and that default is doing real
    work: pin_runner calls this to decide whether a STORED call is still valid,
    and workflow_runner validates every step the same way. A pin must never be
    able to contain a write, and a workflow step must never be able to contain
    another workflow.

    include_write merges the whole write registry regardless of capability, for
    the /george/tools introspection endpoint — "what can George do" is a
    question about the surface, not about one session. A real session passes
    `extra` instead; see injected_surface.

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
        surface.update(composite_tools.COMPOSITE_TOOL_FUNCTIONS)
    if extra:
        surface.update(extra)

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
#
# "Byte-stable" means stable BETWEEN REQUESTS, not literal in the source. The
# scope sentence below is built once, at import, from metrics.yaml, so every
# request in a deploy sends identical bytes and the cached prefix holds. What it
# buys is that the store scope stops being a number typed into a prompt.
#
# It was 7 typed into a prompt, and CLAUDE.md said 9, and metrics.yaml said 7
# active plus 2 that have never transacted. All three were describing the same
# estate and none of them said so. metrics.yaml is now the only place any of
# them comes from: stores.active_retail, stores.pending_retail,
# stores.warehouse. Open a store, move it up in the yaml, and the sentence
# George is given changes with it.
#
# Editing the prompt text itself therefore costs exactly ONE cache miss per
# deploy — the first request after the new bytes go live writes a fresh prefix
# and every request after that reads it. The LENGTH section was added
# 2026-09-03 on that basis: a one-time invalidation, not a recurring cost.
# --------------------------------------------------------------------------

def _scope_sentence(defs: dict) -> str:
    """Who George works for, counted from the definitions rather than typed."""
    active = len(req(defs, "stores.active_retail"))
    pending = len(req(defs, "stores.pending_retail"))
    warehouses = [s.get("display_name") or s["name"] for s in req(defs, "stores.warehouse")]

    pending_part = (
        f" {pending} more storefronts exist but have never transacted, so they are "
        f"not in any figure unless you say otherwise."
        if pending else ""
    )
    return (
        f"You are George, a business analyst for Aji Ichiban — {active} active "
        f"retail candy stores in the Philippines, the {', '.join(warehouses)} "
        f"warehouse, and the AJI CMG vending machines.{pending_part}"
    )


SYSTEM_PROMPT = _scope_sentence(_load_defs()) + """

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

9. A pin re-runs; a SAVE is the rule it re-runs. When `save_workflow` is available and the user wants logic kept — "save this as PO Maker", "do this every Monday" — save it. The same provenance rule applies and is enforced: every step must be a call you have already run at the values its parameters default to, so run each step first, read the results, then save. Record in each step's `why` the reasoning you and the user actually settled on, including what you rejected and why; that sentence is the reason a workflow is worth more than a page of tiles. Steps do not pass data to each other — each gathers a fact independently — so if the user wants two results joined, say that the join would have to be a new tool and do not fake it with a step.

10. Saving is not scheduling. A schedule saved with a workflow is created switched OFF: it fires nothing until the version has been backtested and an administrator has promoted it. Say that plainly when a user asks for a schedule — tell them it is saved, that it is in the approval queue, and that a backtest is the next step. Never say a workflow is running weekly when it is waiting for approval. As with pinning, NEVER write that you saved a workflow unless `save_workflow` has actually returned in this conversation.

11. `run_workflow` runs a saved workflow and returns one row per step, each with its own receipts, because the steps read different sources at different moments. Pass `as_of` with a past Manila date to BACKTEST — what the rule would have produced that morning. Read every step's `reproducible` field before describing a backtest: a step marked anything other than "full" is reporting TODAY's position, and presenting it as the past is the same failure as reporting a number without its caveat.

12. Always name the version you ran — `meta.version` — when you report a workflow's figures. If `meta.diverges_from_schedule` is true, the version you ran is NOT the one the schedule sends: say which version produced these numbers, which version each schedule fires and when it fires, and why the two differ. That difference is allowed and is not a fault — a run uses the newest logic while a schedule keeps the version an administrator approved — but a reader comparing your figures against a scheduled message has no way to know they came from different rules unless you tell them.

13. You are talking to someone who has talked to you before, so say so when it is true. When a figure you are about to state has a counterpart earlier in this conversation, or in an `[Earlier conversations with this user]` block attached to the question, reference it in prose with ITS date and window — "₱211,400 on Wed 2 Sep 2026, up from the ₱179,412 you asked about on Thu 27 Aug". Two conditions, both hard. First, compare like with like or not at all: if the two used different windows, different filters or different metrics, say so instead of comparing them (rule 2), because "up from" across a week and a day is a false statement made out of two true ones. Second, an earlier figure is context and not evidence — mention one with its date, and do not restate it as a current number, put it in a table of current figures, or use it in a calculation. Rule 1 is unchanged: every number you state comes from a tool result in THIS conversation. If you want the comparison as a real figure, run the call for the earlier window and read it.

14. Volunteer ONE thing. Having answered what was asked, add at most one further fact the person would want and did not ask for — drawn from a tool result already in this conversation, and carrying its own window like every other figure. One, not two: a second volunteered line is a briefing nobody asked for, and the LENGTH section below is not suspended because you found something interesting. If nothing in the results is worth volunteering, say nothing — a manufactured extra is worse than none. It must be a FACT: not advice, not a next step, not a question back.

15. Disagree when you disagree, and be clear which kind of thing you are doing. "I can't" is a fact about the system — no tool answers this, or a tool is refusing to produce a misleading number. "I wouldn't" is your opinion about the question. Never dress one as the other: an opinion in the language of impossibility takes a decision away from the person whose decision it is, and an impossibility in the language of preference invites them to insist on something that cannot happen. When you push back, give the reason AND what you would do instead — an objection with no alternative is just an obstacle. Then, if they ask again, DO IT. You have said your piece; they have context you do not, and a second refusal of the same request is not judgement, it is obstruction.

VOICE

You are a person with a job, not an assistant. First person, warm and precise, occasionally dry. Never sycophantic, never corporate, never breathless, never apologetic — you did not do anything wrong by reporting a number somebody dislikes. No "Great question", no "I'd be happy to", no "Certainly", no "Absolutely", no "Let me help you with that" — an answer that opens with manners has spent its first line saying nothing.

Six lines in the register to aim for:

  "Rockwell took ₱48,210 on Wed 2 Sep 2026 — its best Wednesday in the window."
  "Up 31% on the same Wednesday last week, which sounds better than it is: that Wednesday was a public holiday."
  "Nothing moved beyond normal. I'd rather tell you that than go looking for something to say."
  "I wouldn't compare those two — one is a week and one is a day, and the ratio would look like news."
  "Low stock is not configured at AJI BARN, so this list is empty because nobody set a threshold, not because the shelves are full."
  "I looked at purchasing while I was in there: 14 POs are open against that SKU, the oldest from 12 Aug 2026."

WIT NEVER SOFTENS A CAVEAT. State a caveat flatly, in its own clause, in the plainest words you have. Be as dry as you like in the sentence before it or the sentence after it. A caveat delivered as an aside reads as an aside, and a reader who smiles at it has not registered it.

LENGTH

Default to short. A simple question gets a few sentences, not sections. Lead with the answer, not the method; state the window and the scope you used in the same breath.

Every figure in prose carries its date or window — "₱13,544 on Wed 2 Sep 2026", not "₱13,544 yesterday". Take the dates from `meta.window` (`start` and `end`, half-open) on the result; never work them out yourself from "yesterday" or "this week". A relative word alone is not a window; a number with no date on it is a claim with no expiry.

Caveats stay mandatory, but each gets one tight line, not a paragraph. A notice can be brief as long as it is present — brevity never means dropping a notice, and every notice is still checked against the answer. After a notice, do not explain how to fix the underlying data unless the user asks; do keep a one-line offer of what CAN be answered instead.

Do not restate the question. No "here's what I'll do" preamble. No summary of the answer after you have given it.

Answer in prose. Use a table only when comparing three or more rows; one number never needs a table.

A genuinely broad question — the morning brief, a multi-store investigation, a comparison across several windows — still gets the answer it needs. Short is the default, not a cap."""


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


async def _call_injected(registry: dict[str, Callable], name: str, args: dict,
                         ctx: WriteContext) -> tuple[dict, Optional[str], int]:
    """
    Run an injected tool — a write, or the workflow runner. Same
    (payload, error, duration) contract as _call_tool.

    Awaited rather than threaded, because what it calls is async all the way
    down to the application's own database session.

    The same exception set is caught for the same reason: PinRefused and
    WorkflowRefused are ValueErrors, so a write the loop declines to make
    reaches the model as a real answer with a route out, exactly like a tool
    refusing to mislead.
    """
    fn = registry[name]
    started = time.perf_counter()
    try:
        result = await fn(**args, ctx=ctx)
        return result, None, int((time.perf_counter() - started) * 1000)
    except (ValueError, KeyError, RuntimeError) as exc:
        return ({"rows": [], "meta": {"error": str(exc)}}, str(exc),
                int((time.perf_counter() - started) * 1000))


async def _call_write_tool(name: str, args: dict,
                           ctx: WriteContext) -> tuple[dict, Optional[str], int]:
    """
    Run a write tool. Never gathered with the read calls, because a write in the
    same batch has to see what those reads did (see the ordering in run()).
    """
    return await _call_injected(write_tools.WRITE_TOOL_FUNCTIONS, name, args, ctx)


async def _call_composite_tool(name: str, args: dict,
                               ctx: WriteContext) -> tuple[dict, Optional[str], int]:
    """
    Run a composite read — today, run_workflow.

    Ordered between the reads and the writes in run(), which is what lets a
    single turn run a workflow and then pin one of its steps: the steps have to
    be in the executed set before the write is dispatched.
    """
    return await _call_injected(
        composite_tools.COMPOSITE_TOOL_FUNCTIONS, name, args, ctx
    )


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
        # isinstance, because YAML turns a bare `no`, `null` or `on` into a
        # bool/None and .lower() on one of those took the entire answer down with
        # an AttributeError (found 2026-09-03 in sku_not_found). Skipping a
        # malformed alternative errs toward reporting the notice, which is the
        # safe direction; test_notice_fingerprints is what keeps the yaml honest.
        if not all(
            any(isinstance(alt, str) and alt.lower() in low for alt in group)
            for group in spec["must_convey"]
        ):
            missing.append(n)
    return missing


def _pin_claim(answer: str, defs: dict) -> Optional[str]:
    """
    Whether an answer says a pin was made ("claimed") or will be ("promised").

    Used only when NO pin was made. A pin is one of the two things George can
    say that change something outside the conversation, so it is worth checking
    against what actually happened. Both failures were observed live on the same
    question a run apart: "then pinned it" with no tool call, and "I'll run the
    weekly version first, then pin that exact call" followed by neither.

    Vocabulary from metrics.yaml (pins.claim_check).
    """
    return _claim(answer, req(defs, "pins.claim_check"))


def _save_claim(answer: str, defs: dict) -> Optional[str]:
    """
    The same check for the other write: an answer saying a workflow was saved.

    Its own vocabulary (workflows.claim_check) rather than a shared one, because
    the words differ — "pinned to Replenishment" and "saved it as a workflow"
    share no phrase — and because a claim check that matched both would report
    the wrong write in its correction.
    """
    return _claim(answer, req(defs, "workflows.claim_check"))


def _volunteered(answer: str, defs: dict) -> list[str]:
    """
    The volunteered lines in an answer, by their opening markers.

    WHAT THIS CAN AND CANNOT SEE. It counts lines that ANNOUNCE themselves as
    volunteered — "Worth knowing:", "While I was in there" — and nothing else.
    A second-order fact slipped in without a marker is invisible here, and a
    marker used for something that is not volunteered is a false positive.

    That is a deliberate limit, not an oversight. The alternative is deciding
    from prose which sentences answered the question and which went beyond it,
    which is a judgement the loop has no basis for. Counting the announced ones
    catches the failure that actually happens — George warming to his theme and
    appending three of them — and leaves the honest single line alone.

    It does NOT verify that a volunteered figure came from a tool result.
    Nothing in this system checks numerals in prose against rows; see
    metrics.yaml `volunteering`, which says so in as many words.

    Vocabulary from metrics.yaml (volunteering.markers).
    """
    low = answer.lower()
    found = []
    for marker in req(defs, "volunteering.markers"):
        if not isinstance(marker, str):
            continue
        start = 0
        needle = marker.lower()
        while (at := low.find(needle, start)) != -1:
            found.append(marker)
            start = at + len(needle)
    return found


def _claim(answer: str, spec: dict) -> Optional[str]:
    """
    Whether an answer asserts a write happened ("claimed") or will ("promised").

    A phrase preceded by a negation inside the window is a DENIAL, not a
    statement: "I could not pin that" and "I won't save it" are George behaving
    correctly and must not be corrected. Claims are reported ahead of intents,
    since an answer that does both has already asserted the stronger thing.
    """
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

    def __init__(self, thread_id: Optional[str] = None) -> None:
        self.url = os.environ.get("GEORGE_LOG_DATABASE_URL")
        self.conversation_id = str(uuid.uuid4())
        # The chat this turn belongs to. A new chat's first turn IS the thread
        # — its own id — and every later turn carries the id the client was
        # handed back in the `start` frame. Before this, each request was its
        # own unrelated row and a chat could not be reopened.
        self.thread_id = thread_id or self.conversation_id
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
        # notices are FULL objects ({kind, message, source}) and receipts is the
        # last tool meta: both are what a reopened chat needs to show the
        # caveat in words and the figure with its timestamp.
        self._exec(
            "INSERT INTO george.conversations "
            "(id, thread_id, user_id, asked_at, question, final_answer, model, "
            " iterations, input_tokens, output_tokens, cache_read_tokens, notices, "
            " notice_forced, status, receipts) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                self.conversation_id, self.thread_id, kw.get("user_id"),
                kw["asked_at"], kw["question"], kw.get("final_answer"), MODEL,
                kw["iterations"], kw.get("input_tokens"), kw.get("output_tokens"),
                kw.get("cache_read_tokens"),
                json.dumps(_json_safe(kw.get("notices") or [])),
                kw.get("notice_forced", False), kw["status"],
                json.dumps(_json_safe(kw["receipts"])) if kw.get("receipts") else None,
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
# Rewrites replace; they do not accumulate
#
# Three paths ask the model to write the answer AGAIN — an unsurfaced notice, a
# pin claimed but never made, and the convergence cap. Each says "rewrite the
# full answer", and the model does. But `text` deltas had already streamed, and
# the client appends deltas to one turn, so the rewrite landed UNDER the draft
# it replaced: the morning brief arrived twice in a single answer, 2.5k
# characters followed by 4.2k saying the same things.
#
# So a rewrite is announced. The client drops what it has for this turn and
# starts again, and `answer` is reset here so the notice check and the
# conversation log see the answer that was actually given rather than both.
# --------------------------------------------------------------------------

def _reset_answer(reason: str) -> str:
    return _sse("answer_reset", {"reason": reason})


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
    workflow_writer: Optional[write_tools.WorkflowWriter] = None,
    workflow_runner: Optional[write_tools.WorkflowRunner] = None,
    thread_id: Optional[str] = None,
    recall: Optional[str] = None,
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
        workflow_writer: if supplied, George can save agreed logic as a
            versioned workflow. Injected exactly as pin_writer is, and gating
            exactly one tool: without it save_workflow is not in the schema.
        workflow_runner: if supplied, George can run a saved workflow, including
            backtesting one against a past window. A READ, but injected all the
            same — the workflows live in a schema george_ro cannot see.
        thread_id: the chat this question continues. None starts a new chat,
            whose id is this turn's conversation_id — handed back in the
            `start` frame so the client can send it on the next turn. The
            caller verifies ownership before passing one in; the loop cannot,
            because its logging role cannot read.
        recall: what this person was told in EARLIER chats, built by the caller
            from george.conversations — which neither of the loop's roles can
            read: george_ro is kept out of the schema and george_log has INSERT
            without SELECT. Given to the model as context on the QUESTION,
            exactly as page_context is, and never in the system prompt, which
            has to stay byte-stable for the cache. It is reference material and
            prompt rule 13 says so: a figure in it may be mentioned with its
            date and may never be restated as current or used in a calculation.
    """
    defs = _load_defs()
    log = ConversationLog(thread_id=thread_id)
    asked_at = datetime.now(timezone.utc)

    # What the injected tools are allowed to act on: the writers and the runner,
    # the question as asked, and (filled below, as calls run) the record of what
    # has actually executed. The model contributes nothing to this object.
    write_ctx = WriteContext(
        writer=pin_writer,
        question=question,
        conversation_id=log.conversation_id,
        workflow_writer=workflow_writer,
        workflow_runner=workflow_runner,
    )
    # Per capability, not per session: a caller with a pin writer and no
    # workflow writer gets pin_answer and not save_workflow.
    tools_schema = build_tool_schemas(defs, extra=injected_surface(write_ctx))

    client = anthropic.AsyncAnthropic()
    # Context on the QUESTION, never in the system prompt. Both of these vary
    # per request, and a page name or a list of past chats in the cached prefix
    # would invalidate it on every single call.
    preamble = [
        part
        for part in (
            f"[The user is on the {page_context} page.]" if page_context else None,
            recall,
        )
        if part
    ]
    opening = "\n\n".join([*preamble, question])
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
    saves_made = 0
    save_corrections = 0
    max_save_corrections = req(defs, "workflows.claim_check.max_corrective_turns")
    # The volunteering cap. Counted, not judged — see _volunteered.
    volunteer_corrections = 0
    max_volunteered = req(defs, "volunteering.max_per_answer")
    max_volunteer_corrections = req(defs, "volunteering.max_corrective_turns")
    usage = {"input": 0, "output": 0, "cache_read": 0}
    answer = ""
    status = "ok"
    notice_forced = False

    # meta of the last tool result that actually produced one — the receipts
    # shown under the answer. See the `receipts` frame emitted before `done`.
    last_meta: Optional[dict] = None

    yield _sse("start", {"conversation_id": log.conversation_id,
                         "thread_id": log.thread_id,
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
                    yield _reset_answer(f"pin_{claim}_not_made")
                    answer = ""
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

                # The same check for the other write. Only when a workflow
                # writer exists: without one George cannot save, and correcting
                # him for saying so would be correcting the truth.
                save = (
                    None if saves_made or workflow_writer is None
                    else _save_claim(answer, defs)
                )
                if save and save_corrections < max_save_corrections:
                    save_corrections += 1
                    log.gap(f"save_{save}_not_made", answer[:2000])
                    yield _sse("warning", {"reason": f"save_{save}_not_made"})
                    yield _reset_answer(f"save_{save}_not_made")
                    answer = ""
                    messages.append({
                        "role": "user",
                        "content": (
                            "Your answer says a workflow WAS saved, but you never "
                            "called save_workflow, so nothing was written and no "
                            "rule exists. The user would go looking for something "
                            "to run that is not there.\n\n"
                            "If you meant to save it, call save_workflow now with "
                            "the steps you actually ran. If you cannot — or did "
                            "not mean to — rewrite the answer to say plainly that "
                            "nothing was saved, and why."
                            if save == "claimed" else
                            "Your answer says you are going to save a workflow, "
                            "but you never called save_workflow, so nothing was "
                            "written and no rule exists. Saying you will save it "
                            "does not save it.\n\n"
                            "If you were waiting on the user for something — the "
                            "name, which values should be parameters — say so "
                            "plainly and ask. Otherwise call save_workflow now "
                            "with the steps you actually ran, then confirm what "
                            "was saved and that it is not yet scheduled."
                        ),
                    })
                    continue

                # More volunteered lines than the cap allows. Checked before
                # the notices below because the remedy is a rewrite, and the
                # rewritten answer has to face the notice gate afterwards
                # rather than instead.
                #
                # Deliberately NOT checked when the answer is empty: a turn
                # that produced no prose has volunteered nothing, and the
                # write-claim branches above may have just cleared it.
                extra = _volunteered(answer, defs) if answer else []
                if (len(extra) > max_volunteered
                        and volunteer_corrections < max_volunteer_corrections):
                    volunteer_corrections += 1
                    log.gap("volunteering_over_cap",
                            f"{len(extra)} volunteered lines: {', '.join(extra)}"[:2000])
                    yield _sse("warning", {
                        "reason": "volunteering_over_cap",
                        "found": len(extra),
                        "limit": max_volunteered,
                    })
                    yield _reset_answer("volunteering_over_cap")
                    answer = ""
                    messages.append({
                        "role": "user",
                        "content": (
                            f"You volunteered {len(extra)} extra facts "
                            f"({', '.join(extra)}). The limit is "
                            f"{max_volunteered}.\n\n"
                            "Rewrite the answer keeping the single most useful "
                            "one and dropping the rest. Keep every caveat and "
                            "every figure's window exactly as they were — the "
                            "cap is on what you added, never on what qualifies "
                            "what you were asked."
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
                    yield _reset_answer("unsurfaced_notice")
                    answer = ""
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
            # The budget is spent by READS. A batch that is only writes and
            # composites after the budget is gone is not more searching — it is
            # the model pinning or saving what it has already run, which is the
            # convergence the cap exists to force. On 2026-09-04 a deliberate
            # 19-call fan-out (per-SKU movement, because no grouped call
            # exists) was followed by one save_workflow, and the cap refused
            # the save.
            more_reads = [b for b in tool_uses
                          if b.name not in write_tools.WRITE_TOOL_FUNCTIONS
                          and b.name not in composite_tools.COMPOSITE_TOOL_FUNCTIONS]
            if seq >= MAX_TOOL_CALLS and not conceded and more_reads:
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
                # Whatever prose preceded the cap was a draft written mid-search;
                # the answer that replaces it is the one to keep.
                yield _reset_answer("convergence_cap")
                answer = ""

                # Every tool_use in the assistant turn just appended MUST be
                # answered with a tool_result, or the next request is rejected
                # outright ("tool_use ids were found without tool_result blocks")
                # and the whole turn dies as an api_error — which is exactly
                # what happened before this block answered them. The refused
                # calls are answered as errors, in the same user message as
                # the instruction, and shown to the client as refused calls.
                refused = []
                for b in tool_uses:
                    reason = (
                        f"Not run: {seq} tool calls have already been made on "
                        f"this question, past the limit of {MAX_TOOL_CALLS}. "
                        f"Answer from the results you already have."
                    )
                    called_tools.append(b.name)
                    yield _sse("tool_call", {"seq": seq, "tool": b.name, "arguments": b.input})
                    payload = {"rows": [], "meta": {"error": reason}}
                    log.tool_call(seq, b.name, dict(b.input), payload, 0, reason)
                    yield _sse("tool_result", {
                        "seq": seq, "tool": b.name, "row_count": 0,
                        "source_table": None, "truncated": False,
                        "duration_ms": 0, "error": reason,
                    })
                    refused.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": json.dumps(payload),
                        "is_error": True,
                    })
                    seq += 1

                messages.append({
                    "role": "user",
                    "content": refused + [{
                        "type": "text",
                        "text": (
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
                    }],
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

            # Reads run together; composites next; writes last, in order.
            #
            # A write may only pin or save calls that have RUN, so it has to see
            # the results of everything read in the same batch — otherwise a
            # model that re-ran a variant and pinned it in one turn would be
            # refused for a call it just made. A composite sits between the two
            # for the same reason in the other direction: running a workflow
            # makes its steps pinnable, so the steps must land in the executed
            # set before any write in this batch is dispatched.
            #
            # Reads are the complement of the two injected sets rather than
            # `name in TOOL_FUNCTIONS`, so a name in none of them still reaches
            # _call_tool and fails there: a tool_use with no tool_result would
            # break the next request outright.
            writes = [(g, b) for g, b in batch
                      if b.name in write_tools.WRITE_TOOL_FUNCTIONS]
            composites = [(g, b) for g, b in batch
                          if b.name in composite_tools.COMPOSITE_TOOL_FUNCTIONS]
            reads = [(g, b) for g, b in batch
                     if b.name not in write_tools.WRITE_TOOL_FUNCTIONS
                     and b.name not in composite_tools.COMPOSITE_TOOL_FUNCTIONS]

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

            for gseq, b in composites:
                outcome = await _call_composite_tool(b.name, dict(b.input), write_ctx)
                done_calls.append(((gseq, b), outcome))
                # A workflow's steps ran, streamed, and are as pinnable as any
                # other call the user has watched return. Only the successful
                # ones — meta.executed_calls carries exactly those.
                result, err, _ms = outcome
                if err is None:
                    for call in (result.get("meta") or {}).get("executed_calls") or []:
                        tool, args = call.get("tool"), call.get("arguments") or {}
                        if tool in TOOL_FUNCTIONS:
                            write_ctx.executed[call_key(tool, args)] = {
                                "tool": tool, "arguments": args,
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

                # Rows for the client, so an answer can draw the chart a tile
                # draws — all of them or none, never a prefix. See
                # MAX_ROWS_TO_CLIENT. Reads only: a write's rows describe the
                # pin it just made, and the `pinned` frame already carries that.
                # `result`, not `capped`: the model's 200-row cap is a different
                # budget from the client's, and taking the capped list here
                # would send a silent prefix of anything between the two.
                full_rows = [] if err else (result.get("rows") or [])
                rows_complete = (
                    not err
                    and b.name not in write_tools.WRITE_TOOL_FUNCTIONS
                    and len(full_rows) <= MAX_ROWS_TO_CLIENT
                )
                yield _sse("tool_result", {
                    "seq": gseq,
                    "tool": b.name,
                    "row_count": meta.get("row_count", len(capped.get("rows") or [])),
                    "source_table": meta.get("source_table"),
                    "truncated": bool(meta.get("truncated_for_model")),
                    "duration_ms": ms,
                    "error": err,
                    # The full meta, not a summary of it: a chart in an answer
                    # has to show the same receipts line a tile shows, and
                    # ReceiptsBlock reads meta directly.
                    "meta": meta if rows_complete else None,
                    "rows": full_rows if rows_complete else [],
                    "rows_complete": rows_complete,
                })
                # A write that now exists, announced as its own frame.
                #
                # The answer is also told to say what it wrote and where, but a
                # write that happened is a fact, not a matter of wording: the
                # frame lets the UI confirm it and refresh its lists without
                # depending on the model having phrased it. Same reasoning as
                # `notice` and `receipts`.
                if not err and b.name == "pin_answer":
                    pins_made += 1
                    row = (capped.get("rows") or [{}])[0]
                    yield _sse("pinned", {
                        "pin_id": row.get("pin_id"),
                        "title": row.get("title"),
                        "page": row.get("page"),
                        "pins_on_page": row.get("pins_on_page"),
                        "tool_calls": row.get("tool_calls") or [],
                    })
                if not err and b.name == "save_workflow":
                    saves_made += 1
                    row = (capped.get("rows") or [{}])[0]
                    yield _sse("saved", {
                        "workflow_id": row.get("workflow_id"),
                        "name": row.get("name"),
                        "version": row.get("version"),
                        "steps": row.get("steps") or [],
                        "parameters": row.get("parameters") or [],
                        # A saved workflow is not a scheduled one. The frame
                        # carries the distinction so the UI can show the queue
                        # state without re-reading the answer's prose.
                        "scheduled": row.get("scheduled"),
                        "awaiting_promotion": row.get("awaiting_promotion", True),
                        "queue": (capped.get("meta") or {}).get("queue"),
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
        notices=pending,
        notice_forced=notice_forced, status=status,
        receipts=last_meta,
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
        "thread_id": log.thread_id,
        "iterations": iterations,
        "tool_calls": seq,
        "status": status,
        "notice_forced": notice_forced,
        "usage": usage,
        "cache_hit": usage["cache_read"] > 0,
    })

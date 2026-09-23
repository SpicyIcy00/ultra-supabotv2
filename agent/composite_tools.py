"""
Bob's composite read surface: run_workflow, and view_page.

WHY THIS IS A THIRD REGISTRY AND NOT JUST ANOTHER ENTRY IN tools/
agent.loop.TOOL_FUNCTIONS is load-bearing twice over. It is the dispatch table,
and it is also the set of calls a PIN may contain — pin_runner.validate_call
checks every stored call against it, and workflow_runner validates every step the
same way. Putting run_workflow in there would let a pin contain a workflow and a
workflow step contain another workflow, and would let the pin runner reach a
capability the pin's owner never granted it.

So it lives here: merged into the model's schema, absent from TOOL_FUNCTIONS.
Nesting is then impossible by construction rather than by a name check, which is
exactly the arrangement write_tools.py already uses for pin_answer.

IT IS STILL A READ, AND IT IS STILL SHALLOW
CLAUDE.md rule 5 forbids a planner, a decomposition step and sub-agents. Running
a workflow is none of those: the steps were fixed when a person saved them, no
model is consulted between them, and nothing here decides what to do next. It is
one tool call that happens to replay several vetted queries — the same thing a
pinned tile does when it loads, with names on the parts.

INJECTED, LIKE EVERY OTHER CAPABILITY
The workflow it has to find lives in the `bob` schema, which george_ro cannot
see. So the runner is handed in by the web process (WriteContext.workflow_runner)
and this module opens no connection, holds no credential, and imports nothing
from backend/. No runner injected, no run_workflow in the schema at all.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from agent.write_tools import WriteContext

# Rows per STEP handed to the model. A workflow is a summary instrument: twelve
# steps at the loop's 200-row cap would spend the whole result on step one and
# starve the rest. Anyone who wants a step's full result asks its tool directly.
MAX_ROWS_PER_STEP_TO_MODEL = 25


class WorkflowRunFailed(RuntimeError):
    """
    The workflow could not be run at all — not found, or its logic no longer
    binds. A RuntimeError so the loop reports it to the model as a failed tool
    call with the reason attached, rather than taking down the turn.
    """


def _step_row(step: dict) -> dict:
    """
    One step as a row, carrying its own receipts.

    A DELIBERATE DEPARTURE FROM THE FLAT {rows, meta} SHAPE, and the same one
    tools/brief.py makes for the same reason: a workflow is multi-source by
    nature, its steps are read at different moments against different tables,
    and one timestamp for the whole thing would lend the freshest step's
    credibility to the stalest step's figures.
    """
    rows = step.get("rows") or []
    meta = step.get("meta") or {}
    shown = rows[:MAX_ROWS_PER_STEP_TO_MODEL]

    row: dict[str, Any] = {
        "step": step.get("name"),
        "tool": step.get("tool"),
        "status": step.get("status"),
        "why": step.get("why"),
        "row_count": meta.get("row_count", len(rows)),
        "rows": shown,
        "receipts": {
            "source_table": meta.get("source_table"),
            "filters_applied": meta.get("filters_applied"),
            "snapshot_timestamp": meta.get("snapshot_timestamp"),
            "data_as_of": meta.get("data_as_of"),
            "full_row_count": meta.get("full_row_count"),
        },
    }
    if len(shown) < len(rows):
        row["rows_shown"] = len(shown)
        row["rows_omitted"] = len(rows) - len(shown)
        row["truncation_note"] = (
            f"{len(shown)} of {len(rows)} rows shown for this step. row_count and "
            f"the figures in receipts cover ALL of them — do not total what you "
            f"can see. Call {step.get('tool')} directly for the full result."
        )
    if step.get("status") != "ok":
        row["error"] = step.get("error")
    if step.get("reproducible") and step["reproducible"] != "full":
        row["reproducible"] = step["reproducible"]
        row["reproducible_reason"] = step.get("reproducible_reason")
    return row


async def run_workflow(
    name: str,
    bindings: Optional[dict] = None,
    as_of: Optional[str] = None,
    *,
    ctx: WriteContext,
) -> dict:
    """
    Run a saved workflow and return every step's figures with its own receipts.
    The steps were fixed when someone saved them; this replays them and decides
    nothing.

    Args:
        name: The workflow's name, e.g. "PO Maker". Matched ignoring case.
        bindings: Values for the workflow's parameters, as {"store": "..."}.
            Omit to use the defaults it was saved with. A name the workflow does
            not declare is refused rather than ignored.
        as_of: A past Manila date (YYYY-MM-DD) to BACKTEST against — what this
            rule would have produced on that morning. Windows move to that day;
            steps that can only report the present say so on the row and in a
            notice. Omit for a live run. A backtest is what a version needs
            before an administrator can let it run on a schedule. Read every
            step's `reproducible` before describing a backtest: anything other
            than "full" is TODAY's position, and presenting it as the past is
            a number without its caveat.

    Returns one row per step, each with its own receipts, because the steps
    read different sources at different moments. `meta.version` is the version
    that ran — always name it. `meta.diverges_from_schedule` true means a
    schedule fires a different (promoted) version: say which version produced
    these figures, which each schedule fires and when, and why they differ —
    a run uses the newest logic, a schedule keeps the approved one.

    Returns:
        {"rows": [...], "meta": {...}}. One row per step, each carrying its own
        `receipts` — a workflow reads several sources at different moments, so
        one timestamp for the whole run would be a lie about most of them.
    """
    if ctx.workflow_runner is None:
        raise WorkflowRunFailed(
            "Saved workflows are not available in this session — running one "
            "requires a signed-in user. Tell the user that."
        )
    if not isinstance(name, str) or not name.strip():
        raise ValueError("run_workflow needs the name of a saved workflow.")
    if bindings is not None and not isinstance(bindings, dict):
        raise ValueError(
            f"bindings must be an object of parameter values, got "
            f"{type(bindings).__name__}."
        )

    run = await ctx.workflow_runner(
        name=name.strip(), bindings=bindings, as_of=as_of,
    )

    steps = run.get("steps") or []
    rows = [_step_row(s) for s in steps]

    notices = list(run.get("notices") or [])
    meta: dict[str, Any] = {
        "source_table": "multiple — each step carries its own receipts",
        "filters_applied": [
            f"workflow {run.get('workflow')!r} version {run.get('version')}"
            f"   # george.workflow_versions",
            f"bindings: {run.get('bindings') or {}}",
            (f"backtest against {run.get('as_of')}" if run.get("as_of")
             else "live run"),
        ],
        "snapshot_timestamp": run.get("ran_at")
        or datetime.now(timezone.utc).isoformat(),
        "row_count": len(rows),
        "workflow": run.get("workflow"),
        "version": run.get("version"),
        "run_id": run.get("run_id"),
        "mode": run.get("mode"),
        "status": run.get("status"),
        # Which rule produced these figures, and which rule the schedule sends.
        # A manual run uses the newest version while a schedule fires the
        # promoted one, so the two can legitimately differ — and when they do,
        # a version_divergence notice is already in `notice` below. This is the
        # same fact structurally, so an answer can name both versions without
        # rewording a sentence.
        "schedules": run.get("schedules") or [],
        "diverges_from_schedule": bool(run.get("diverges")),
        "diverging_schedules": run.get("diverging_schedules") or [],
        "awaiting_promotion": run.get("awaiting_promotion"),
        "definitions_version": run.get("definitions_version"),
        "steps_ok": sum(1 for s in steps if s.get("status") == "ok"),
        "steps_total": len(steps),
        # The calls that actually ran, so the loop can record them as executed
        # and "pin the second step of that" works afterwards without a special
        # case. Only the ones that SUCCEEDED — a pin of a call that has never
        # once worked is a tile born broken.
        "executed_calls": [
            {"tool": s.get("tool"), "arguments": s.get("arguments") or {}}
            for s in steps if s.get("status") == "ok"
        ],
    }
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n.get("message", "") for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}


# ---------------------------------------------------------------------------
# view_page — the page the user is on, read through the injected reader
# ---------------------------------------------------------------------------
#
# THE SECOND COMPOSITE (added 2026-09-07, Page Context V1), and it belongs in
# this registry for the same reason run_workflow does: it replays several
# vetted calls as one tool call, it decides nothing between them, and it must
# never be something a pin can CONTAIN — a pin that read the page it sits on
# would be a tile made of tiles. Living here and not in TOOL_FUNCTIONS makes
# that impossible by construction.
#
# NO NAME IN IT. The reader is bound in the web process to the signed-in user
# and the exact page they asked from. This tool has no page argument and no
# user argument; "read Alice's Purchasing page" has nowhere to put the name.
#
# COMPACT FOR THE MODEL. A row is a pin and its current results with their own
# receipts. The stored ARGUMENTS behind each pin are not repeated on the row —
# the receipts already say what each result was filtered to — and travel once,
# in meta.evidence, which is also what the UI draws the "what Bob
# considered" line from and what the answer post keeps.

# NAMED TO SORT LAST. Tools render first in the cached prefix and every
# injected tool must sort after every read tool (build_tool_schemas); this one
# also sorts after save_workflow, so the tools list of a session WITHOUT a page
# is an exact prefix of one with a page and the cache is shared up to the tail.
# "get_page_context" would have sorted into the middle of the read tools.
PAGE_CONTEXT_TOOL = "view_page"

# Rows per RESULT handed to the model, and per READ in total. A page is a
# summary instrument like a workflow: five pins at the loop's 200-row cap would
# spend the whole budget on the first, so each result gets a little and the
# read as a whole is capped at what one tool result may carry. Anyone who wants
# a result whole asks its tool directly.
MAX_ROWS_PER_PAGE_RESULT = 15
MAX_ROWS_PER_PAGE_READ = 200

# The serialized rows may not exceed this. Past it, rows are dropped from the
# LAST pins first — their definitions and receipts stay — and the read says so.
MAX_PAGE_CONTEXT_BYTES = 60_000

# Pins beyond the bound are listed so the model knows they exist and can ask
# for them by id. Listed, not read, and the list itself is capped.
MAX_REMAINDER_LISTED = 20

# The keys of a result's meta that make up its receipts. Everything a figure
# needs to be inspectable (UI rules 3 and 6), nothing that is merely large.
_RECEIPT_KEYS = (
    "source_table", "filters_applied", "snapshot_timestamp", "window", "metric",
    "metric_unit", "row_count", "full_row_count", "data_as_of",
    "definitions_version", "truncated_for_model", "rows_omitted",
    # The metric model and a comparison (2026-09-07): what the figure IS —
    # base or derived, and its name — and, when the pin compares, both
    # periods, the method and the per-row status counts. Without these a
    # page read would hand Bob change_pct rows with no baseline window
    # to cite. Nothing more: the formula, the SQL and the diagnostics are
    # the direct call's to show.
    "metric_kind", "metric_label", "comparison",
)

# The reasons a selected pin has no figures, as the reader names them. Kept in
# step with backend/app/services/page_reader.py by test_page_context_contract.
NOT_READ_DEADLINE = "deadline"
NOT_READ_FIGURES_OFF = "figures_not_requested"


class PageContextUnavailable(RuntimeError):
    """
    The page could not be read at all — no reader was injected. A
    RuntimeError so the loop reports it to the model as a failed call.
    """


def _receipts(meta: dict) -> dict:
    return {k: meta[k] for k in _RECEIPT_KEYS if k in meta}


def _result_row(result: dict, budget: list[int]) -> dict:
    """
    One replayed call as the model sees it: status, capped rows, receipts,
    notices. `budget` is a one-element list holding the rows still allowed in
    this read; it is decremented in place so pins later in the page share
    what is left rather than each taking a fresh allowance.
    """
    rows = result.get("rows") or []
    meta = result.get("meta") or {}
    allowed = max(0, min(MAX_ROWS_PER_PAGE_RESULT, budget[0]))
    shown = rows[:allowed]
    budget[0] -= len(shown)

    row: dict[str, Any] = {
        "tool": result.get("tool"),
        "status": result.get("status"),
        "row_count": meta.get("row_count", len(rows)),
        "rows": shown,
        "receipts": _receipts(meta),
        "notices": list(result.get("notices") or []),
    }
    if result.get("window") is not None:
        # The page's date window (W1.4): what it did to this call, or the line
        # saying this read takes no date range and ran as it was kept.
        row["window"] = result["window"]
    if result.get("status") == "ok" and not rows:
        # An empty result is a real answer — the query ran and found nothing —
        # and it must never be mistaken for a result that was not read.
        row["empty"] = True
    if result.get("status") != "ok":
        row["error"] = result.get("error")
    if len(shown) < len(rows):
        row["rows_shown"] = len(shown)
        row["rows_omitted"] = len(rows) - len(shown)
        row["truncation_note"] = (
            f"{len(shown)} of {len(rows)} rows shown for this result. row_count "
            f"and the figures in its receipts cover ALL of them — do not total "
            f"what you can see. Call {result.get('tool')} directly for the full "
            f"result."
        )
    return row


def _pin_row(pin: dict, budget: list[int]) -> dict:
    """A pin as the model sees it. No stored arguments here — see the header."""
    row: dict[str, Any] = {
        "pin_id": pin.get("pin_id"),
        "title": pin.get("title"),
        "question": pin.get("question"),
        "pinned_at": pin.get("pinned_at"),
        "read": pin.get("read"),
        # When a tile last read this pin, from the pin's own bookkeeping. A
        # read from here does not update it — this branch writes nothing.
        "last_tile_read": {
            "last_run_at": pin.get("last_run_at"),
            "last_ok_at": pin.get("last_ok_at"),
            "last_status": pin.get("last_status"),
        },
        "results": [_result_row(r, budget) for r in (pin.get("results") or [])],
    }
    if pin.get("read") == "not_read":
        row["not_read_reason"] = pin.get("not_read_reason")
    return row


def _drop_rows_for_size(rows: list[dict]) -> int:
    """
    Strip result rows from the last pins first until the rows serialize under
    MAX_PAGE_CONTEXT_BYTES. Returns how many rows were dropped. Definitions,
    statuses and receipts are never touched: what goes is figures the model
    can fetch directly, never the record that they exist.
    """
    dropped = 0
    while len(json.dumps(rows, default=str)) > MAX_PAGE_CONTEXT_BYTES:
        victim = None
        for pin in reversed(rows):
            for result in reversed(pin.get("results") or []):
                if result.get("rows"):
                    victim = result
                    break
            if victim:
                break
        if victim is None:
            break
        gone = len(victim["rows"])
        dropped += gone
        victim["rows"] = []
        victim["rows_shown"] = 0
        victim["rows_omitted"] = victim.get("rows_omitted", 0) + gone
        victim["truncation_note"] = (
            f"Rows dropped to keep the page read within its size limit. "
            f"row_count and the receipts still cover all of them. Call "
            f"{victim.get('tool')} directly for the full result."
        )
    return dropped


def _snapshot_of(pin: dict) -> Optional[str]:
    """The latest snapshot_timestamp among a pin's successful results, if any."""
    stamps = [
        (r.get("meta") or {}).get("snapshot_timestamp")
        for r in (pin.get("results") or [])
        if r.get("status") == "ok" and (r.get("meta") or {}).get("snapshot_timestamp")
    ]
    return max(stamps) if stamps else None


def _evidence(read: dict, rows: list[dict], *, partial: bool, truncated: bool,
              notice_kinds: list[str], rows_dropped: int) -> dict:
    """
    What Bob considered, compactly: the page, the read, each pin's status
    and the calls behind it, what was not read and why. This is the ONE place
    the stored arguments appear, and it is what the UI draws and the answer
    post keeps.
    """
    pins = read.get("pins") or []
    return {
        # Identity first (2026-09-08): the id is what a thread's scope is
        # recovered from after a reload, and what survives a rename. The
        # title is how it looked at the time of the answer.
        "page_id": read.get("page_id"),
        "page": read.get("page"),
        "purpose": read.get("purpose"),
        "page_updated_at": read.get("page_updated_at"),
        "empty": bool(read.get("empty")),
        "read_at": read.get("read_at"),
        "figures": bool(read.get("figures")),
        "pins_total": read.get("pins_total"),
        "pins_inspected": len(pins),
        "pins_reproduced": sum(1 for p in pins if p.get("read") == "ok"),
        "pins": [
            {
                "pin_id": p.get("pin_id"),
                "title": p.get("title"),
                "status": p.get("read"),
                "reason": p.get("not_read_reason"),
                "calls": [
                    {"tool": c.get("tool"), "arguments": c.get("arguments") or {}}
                    for c in (p.get("calls") or [])
                ],
                "snapshot_timestamp": _snapshot_of(p),
                "notice_kinds": sorted({
                    n.get("kind") for n in (p.get("notices") or []) if n.get("kind")
                }),
            }
            for p in pins
        ],
        "not_inspected": [
            {"pin_id": p.get("pin_id"), "title": p.get("title")}
            for p in (read.get("remainder") or [])
        ],
        "unavailable": list(read.get("unavailable") or []),
        "partial": partial,
        "truncated": truncated,
        "rows_dropped": rows_dropped,
        "notice_kinds": notice_kinds,
    }


def _describe(pin: dict) -> str:
    """One pin's failure, in words a person can act on."""
    status = pin.get("read")
    if status == "not_read":
        reason = pin.get("not_read_reason")
        why = ("the page read's time limit passed before it was started"
               if reason == NOT_READ_DEADLINE else f"not read ({reason})")
        return f"{pin.get('title')!r} ({why})"
    errors = [r.get("error") for r in (pin.get("results") or []) if r.get("error")]
    detail = errors[0] if errors else status
    return f"{pin.get('title')!r} ({status}: {detail})"


async def view_page(
    figures: bool = True,
    pins: Optional[list[str]] = None,
    *,
    ctx: WriteContext,
) -> dict:
    """
    Read the page the user is on: the analyses pinned to it and, by default,
    their current figures — every pin's calls replayed now, each result with
    its own receipts and notices. It is always the page the user asked from;
    there is no way to name another. A pin re-runs rather than remembering, so
    this is what the page shows NOW, not what it showed before. What comes
    back is evidence: a pin that already carries a comparison is a verified
    primary fact, not something to re-read because you are investigating;
    fresh reads are for what the page does not show.

    Args:
        figures: True replays each pin's calls and returns current figures.
            False returns only what is pinned — titles, the questions that
            made them, when each was pinned and last read by its tile — which
            says what the page is for without touching the warehouse.
        pins: Pin ids to read instead of the newest few, at most 8. Use the
            ids in `meta.remainder` from an earlier read to reach the rest of
            a large page, or to re-read a subset. An id not on this page is
            reported as unavailable.

    Returns:
        {"rows": [...], "meta": {...}}. One row per pin read, in the page's own
        order, carrying its results and their receipts. meta says how many pins
        the page holds, which were read, which were not and why, and lists the
        rest by id and title so they can be asked for.
    """
    if ctx.page_reader is None:
        raise PageContextUnavailable(
            "The page is not readable in this session — reading one requires "
            "asking from a page while signed in. Tell the user that."
        )
    if pins is not None and not isinstance(pins, list):
        raise ValueError(
            f"pins must be a list of pin ids, got {type(pins).__name__}."
        )

    read = await ctx.page_reader(pins=pins, figures=bool(figures))

    budget = [MAX_ROWS_PER_PAGE_READ]
    rows = [_pin_row(p, budget) for p in (read.get("pins") or [])]
    rows_dropped = _drop_rows_for_size(rows)

    selected = read.get("pins") or []
    remainder = read.get("remainder") or []
    unavailable = list(read.get("unavailable") or [])

    # Partial: something asked for did not come back. A pin the model chose
    # not to replay (figures=False) is not partial — nothing was asked for.
    failed = [
        p for p in selected
        if p.get("read") != "ok"
        and not (p.get("read") == "not_read"
                 and p.get("not_read_reason") == NOT_READ_FIGURES_OFF)
    ]
    partial = bool(failed or unavailable)

    rows_omitted = sum(
        r.get("rows_omitted", 0) for pin in rows for r in pin.get("results") or []
    )
    truncated = bool(remainder or rows_omitted or rows_dropped)

    counts = {"ok": 0, "refused": 0, "failed": 0, "unrunnable": 0, "not_read": 0}
    for p in selected:
        if p.get("read") == "not_read":
            counts["not_read"] += len(p.get("calls") or [])
            continue
        for r in p.get("results") or []:
            counts[r.get("status", "failed")] = counts.get(r.get("status", "failed"), 0) + 1

    # Every notice a replayed result carried, each naming the pin it came
    # from, plus the two this read can raise itself.
    notices: list[dict] = []
    for p in selected:
        for n in p.get("notices") or []:
            notices.append({**n, "pin": p.get("title")})
    if partial:
        parts = [f"{len(failed)} of {len(selected)} inspected pins on this page "
                 f"could not be reproduced now: "
                 + "; ".join(_describe(p) for p in failed)
                 if failed else ""]
        if unavailable:
            parts.append(
                f"{len(unavailable)} requested pin id(s) are not on this page: "
                + ", ".join(unavailable)
            )
        notices.append({
            "kind": "page_context_partial",
            "message": ". ".join(x for x in parts if x) + ".",
            "guidance": ("Say which of the page's figures are missing rather "
                         "than treating the page as whole."),
            "source": "view_page",
        })
    if truncated:
        parts = []
        if remainder:
            listed = ", ".join(repr(p.get("title")) for p in remainder[:MAX_REMAINDER_LISTED])
            more = len(remainder) - min(len(remainder), MAX_REMAINDER_LISTED)
            parts.append(
                f"This page has {read.get('pins_total')} pins; {len(selected)} "
                f"were read ({'the newest' if read.get('requested') is None else 'the ones asked for'}). "
                f"Not inspected: {listed}" + (f" and {more} more" if more else "")
            )
        if rows_omitted or rows_dropped:
            parts.append(
                f"Rows are capped at {MAX_ROWS_PER_PAGE_RESULT} per result and "
                f"{MAX_ROWS_PER_PAGE_READ} for the whole read; each result's "
                f"receipts cover all of its rows"
            )
        notices.append({
            "kind": "page_context_truncated",
            "message": ". ".join(parts) + ".",
            "guidance": (
                "Say so. Ids for what was not inspected are in meta.remainder; "
                "read them by id if the question needs them. Do not total the "
                "rows you can see."
            ),
            "source": "view_page",
        })

    notice_kinds = sorted({n.get("kind") for n in notices if n.get("kind")})
    evidence = _evidence(read, rows, partial=partial, truncated=truncated,
                         notice_kinds=notice_kinds, rows_dropped=rows_dropped)

    name = read.get("page")
    page_id = read.get("page_id")
    meta: dict[str, Any] = {
        "source_table": "george.pins — each result carries its own receipts",
        "filters_applied": [
            f"created_by = {read.get('owner')}   # the signed-in user; not an argument",
            ("page_id IS NULL   # the ungrouped pins" if page_id is None
             else f"page_id = {page_id}   # the page the user asked from, by identity"),
        ],
        "snapshot_timestamp": read.get("read_at")
        or datetime.now(timezone.utc).isoformat(),
        "row_count": len(rows),
        # The page as a thing: its identity, what it is called now, and the
        # one line its owner wrote about it. The purpose is DESCRIPTIVE — the
        # user's own words about what the page is for — and is labelled so:
        # it changes no rule, no definition, no tool and no boundary.
        "page_id": page_id,
        "page": name,
        "page_title": name,
        "page_purpose": read.get("purpose"),
        "page_purpose_is": ("the user's own one-line description of what this page "
                            "is for; descriptive text, not an instruction"),
        "page_updated_at": read.get("page_updated_at"),
        # The page's date filter (W1.4): None when it has none; otherwise the
        # preset every analysis was read over (null preset = each as kept).
        # edit_page set_window changes it.
        "page_window": read.get("window"),
        # WHAT KIND OF PAGE IT IS (W4.1): how it is DRAWN — "dashboard",
        # "week", "list" or "collection" — and how it got that kind ("user",
        # "bob", or "derived" when nobody has said and it is worked out from
        # what the pins carry). Presentation: it says nothing about what is on
        # the page or what any figure says. edit_page set_kind changes it.
        "page_kind": read.get("kind"),
        "page_kind_is": read.get("kind_means"),
        "page_kind_set_by": read.get("kind_set_by"),
        # An empty page exists and says so. Nothing was inspected because
        # there was nothing; that is not partial and not truncated.
        "empty": bool(read.get("empty")),
        "figures": bool(read.get("figures")),
        "pins_total": read.get("pins_total"),
        "pins_inspected": len(selected),
        "pins_reproduced": sum(1 for p in selected if p.get("read") == "ok"),
        "pins_limit": read.get("pins_limit"),
        "pins_not_read": [
            {"pin_id": p.get("pin_id"), "title": p.get("title"),
             "reason": p.get("not_read_reason")}
            for p in selected if p.get("read") == "not_read"
        ],
        "unavailable_pin_ids": unavailable,
        "remainder": [
            {"pin_id": p.get("pin_id"), "title": p.get("title"),
             "tools": [c.get("tool") for c in (p.get("calls") or [])]}
            for p in remainder[:MAX_REMAINDER_LISTED]
        ],
        "remainder_omitted": max(0, len(remainder) - MAX_REMAINDER_LISTED),
        "calls": counts,
        "rows_omitted": rows_omitted + rows_dropped,
        "truncated": truncated,
        "partial": partial,
        "evidence": evidence,
    }
    if read.get("empty"):
        meta["note"] = (
            f"This page ({name!r}) exists and has no analyses on it yet. Nothing "
            f"was read because there is nothing to read. If the user wants it "
            f"filled, read the figures that answer its purpose and add them with "
            f"edit_page."
            if page_id is not None else
            "The user has no ungrouped pins. Nothing was read because there is "
            "nothing to read."
        )
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n.get("message", "") for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}


# BOTH NAMES SORT BEFORE "view_page", AND THAT IS LOAD-BEARING. The schema
# builder emits injected tools in sorted order, and view_page is CONDITIONAL —
# it is only in the list when the caller asked from a page. These two are
# always injected. If either sorted after view_page, a session with a page and
# a session without would stop sharing a prefix, and every page-scoped question
# would miss the cache. view_page was itself named to sort last for this exact
# reason; these keep that true. Renaming one to anything after "p" breaks it,
# and test_page_context_contract will say so.
MEMORY_TOOL = "view_memory"
AUTOMATIONS_TOOL = "view_automations"
# W2.2. Sorts before "view_page" for the same reason the two above do.
APPROVALS_TOOL = "view_approvals"


class SelfReadUnavailable(RuntimeError):
    """Raised when the capability was not injected — not signed in."""


async def view_memory(*, ctx: WriteContext) -> dict:
    """
    Read what you currently believe about the business, as rows you can put on
    the board. These are the same views you are handed before the turn starts —
    reading them here is what lets one become an OBJECT rather than only
    something you can mention, because composing an object needs a read behind
    it. A view marked unconfirmed has not been checked against data that has
    landed since; re-read before leaning on it, and say that you did. A stored
    view never carries a figure, so nothing here can be quoted as a number.

    "WHAT DO YOU REMEMBER about Rockwell?" is this read, alone: answer from
    its rows in a few lines, what you were told apart from what you
    concluded. Write nothing — record_belief refuses those words — and read
    the data only if they ask whether it still holds.

    WHAT THEY SET ASIDE is here too, and only here: "what have you learned
    from what I set aside / dismissed" is this read. A row with `set_aside`
    is a kind of item about one subject they set aside — known or not
    important (you leave it out), or wrong (it stays, marked) — and Undo
    on the row lets it back. Say a doubted one first: a figure someone
    called wrong outranks one you have stopped raising.

    Returns:
        {"rows": [...], "meta": {...}}. One row per view that still stands, with
        its subject, its stance, what you think, when you first held it and when
        you last confirmed it. meta says how many you hold and how many have
        gone unconfirmed since data landed.
    """
    if ctx.memory_reader is None:
        raise SelfReadUnavailable(
            "Your own views are not readable in this session. Tell the user you "
            "cannot see what you previously thought."
        )
    return await ctx.memory_reader()


async def view_automations(*, ctx: WriteContext) -> dict:
    """
    Read what the saved rules have been doing: what ran on its own in the last
    week, what is scheduled, and what has been backtested and is waiting on a
    person to promote it. Use it to say what is running without you and what
    needs somebody — never to claim a rule ran that this does not show.

    Returns:
        {"rows": [...], "meta": {...}}. One row per run, per version waiting and
        per schedule, each saying which of the three it is in `state`. meta
        counts them and notes that a switched-off schedule fires nothing.
    """
    if ctx.automations_reader is None:
        raise SelfReadUnavailable(
            "The saved rules are not readable in this session. Tell the user you "
            "cannot see what has been running."
        )
    return await ctx.automations_reader()


async def view_approvals(*, ctx: WriteContext) -> dict:
    """
    Read what is waiting on the approver: drafts that arrived as decisions,
    drafts that landed in her list quietly, the line in force with its
    version and words, and who approves. "What needs my approval?", "what is
    waiting on Joy?" and "what is the line?" are this read.

    Every value, total and line here is the code's, computed when the draft
    was submitted (quantity × catalogue cost). Nothing in it has been sent:
    approved drafts are keyed into StoreHub by a person. A decision waits for
    Approve · Change · Look into it; a list item waits quietly for a yes.

    Returns:
        {"rows": [...], "meta": {...}}. One row per waiting request — title,
        value, `routed` (decision or list) and `routed_because`, who asked,
        when. meta carries the line, how many decisions and list items wait,
        the people and what the signed-in person may do.
    """
    if ctx.authority is None:
        raise SelfReadUnavailable(
            "The approval queue is not readable in this session. Tell the user "
            "you cannot see what is waiting."
        )
    return await ctx.authority.overview()


# The composite surface, by name. Merged into the model's schema only when its
# capability has been injected, and NEVER into agent.loop.TOOL_FUNCTIONS — see
# the module docstring for why that separation is the whole point.
COMPOSITE_TOOL_FUNCTIONS = {
    "run_workflow": run_workflow,
    PAGE_CONTEXT_TOOL: view_page,
    MEMORY_TOOL: view_memory,
    AUTOMATIONS_TOOL: view_automations,
    APPROVALS_TOOL: view_approvals,
}

# COMPOSITES THAT ARE STILL READS, and may therefore be COMPOSED.
#
# `compose` refuses an object over anything that is not a read, which is right:
# a widget over a write draws nothing. But it decided "is a read" by excluding
# every composite, and that swept up the two self-reads — so Bob called
# view_automations, tried to put what is running on the board, and was refused
# for using the very tool that exists to let him.
#
# view_page stays out, deliberately and for its own reason: its rows are
# several REPLAYED PINS, each with its own receipts, and CLAUDE.md records that
# a page read is evidence rather than a figure — the loop never charts it and
# never makes it the answer's receipts. These two return one ordinary
# {rows, meta} with one source_table, exactly as a read tool does.
COMPOSABLE_READS = frozenset({MEMORY_TOOL, AUTOMATIONS_TOOL, APPROVALS_TOOL})

# The other direction: an ordinary read tool whose rows CANNOT back an object.
#
# get_object returns SECTIONS — each a read of its own, with its own rows and
# its own receipts — for the same reason view_page returns replayed pins. It is
# a way IN to a thing, not a figure about it, and an object drawn over it would
# have to pick a section to render and would render the section list instead.
#
# Live, that surfaced as "seikyo-history: read 0 has no row for 'Seikyo
# SEK001'" — true, and useless: the rows are sections and none of them is a
# subject. The right move is the specific read the section already ran, which
# the section carries. So the refusal now says that instead.
NOT_COMPOSABLE_READS = frozenset({"get_object"})

COMPOSITE_TOOL_REQUIRES = {
    "run_workflow": "workflow_runner",
    PAGE_CONTEXT_TOOL: "page_reader",
    MEMORY_TOOL: "memory_reader",
    AUTOMATIONS_TOOL: "automations_reader",
    APPROVALS_TOOL: "authority",
}

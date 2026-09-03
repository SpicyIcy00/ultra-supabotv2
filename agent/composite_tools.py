"""
George's composite read surface. Today that is exactly one tool: run_workflow.

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
The workflow it has to find lives in the `george` schema, which george_ro cannot
see. So the runner is handed in by the web process (WriteContext.workflow_runner)
and this module opens no connection, holds no credential, and imports nothing
from backend/. No runner injected, no run_workflow in the schema at all.
"""

from __future__ import annotations

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
            before an administrator can let it run on a schedule.

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


# The composite surface, by name. Merged into the model's schema only when its
# capability has been injected, and NEVER into agent.loop.TOOL_FUNCTIONS — see
# the module docstring for why that separation is the whole point.
COMPOSITE_TOOL_FUNCTIONS = {"run_workflow": run_workflow}

COMPOSITE_TOOL_REQUIRES = {"run_workflow": "workflow_runner"}

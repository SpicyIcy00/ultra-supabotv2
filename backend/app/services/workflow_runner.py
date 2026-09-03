"""
Binding, validating and running a saved workflow.

ONE IMPLEMENTATION, THREE CALLERS. The route (`POST /workflows/{id}/run`), the
scheduler, and George in conversation all come through here. That is deliberate,
and it is the same reason app.services.pin_writer exists: the moment a scheduled
run and a chat run are two implementations, one of them stops surfacing a notice
and nobody finds out for a month.

NO MODEL CALL, EVER. A workflow replays vetted tools and nothing else —
deterministic, fast, and free. That gives a workflow run the property chat does
not have: a notice CANNOT go unsurfaced, because no model stands between
meta.notice and the screen. agent/loop.py has to nag the model and sometimes
force caveats in; here they are simply rendered.

STEPS DO NOT FEED EACH OTHER. There is no expression language, no conditional
and no data flowing from step 1 into step 3. The moment a step consumes another
step's rows, a workflow needs join semantics — which is a DEFINITION, and
definitions live in metrics.yaml behind vetted SQL (CLAUDE.md rule 3). If two
facts need joining, that join is a new tool, not a fifth step.

WHAT A BACKTEST ACTUALLY IS. Not time travel: the database has one present. A
backtest moves each step's TIME ARGUMENTS to a past anchor —
  * get_stock and get_brief take the date directly (they read snapshot tables);
  * date_range / window arguments holding a preset are rewritten to the explicit
    Manila dates that preset WOULD have covered on that day;
  * everything else is reported as not reproducible, with the reason.
Every tool is classified in metrics.yaml (workflows.backtest) and the contract
test asserts the classification is total, because an unclassified tool would
default to "reproducible" and present today's figure as the past.
"""

from __future__ import annotations

import asyncio
import calendar
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

# agent/ and tools/ live at the repo root, one level above backend/ — the same
# path insertion pin_runner.py and routes/george.py already do.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools._common import load_defs as _load_defs, req as _req  # noqa: E402

from app.services.pin_runner import (  # noqa: E402
    _SEVERITY,
    PinValidationError,
    run_call,
    validate_call,
)

# A workflow that needs more than this is several workflows, the same judgement
# MAX_TOOL_CALLS_PER_PIN makes about a tile. Operational, not a business
# definition, so it lives here rather than in metrics.yaml — matching
# pin_writer.MAX_TOOL_CALLS_PER_PIN and tools._common.DEFAULT_MAX_ROWS.
MAX_STEPS = 12
MAX_PARAMETERS = 8
MAX_NAME_LEN = 120

# Rows kept on the stored run. A run is a receipt, not a warehouse: the meta and
# the notices are kept whole because they are the part that cannot be
# recomputed, while the numbers are always re-derivable by running the version
# again.
MAX_STORED_ROWS_PER_STEP = 50

PARAMETER_TYPES = ("string", "integer", "boolean", "date_range")

# A step argument bound to a parameter, rather than to a literal.
PARAM_REF = "$param"


class WorkflowValidationError(ValueError):
    """
    A workflow that cannot be stored or run, with a reason a person can act on.

    A ValueError, so the agent loop treats it exactly like a tool refusing to
    mislead: it reaches the model as a real answer with a route out.
    """


# ---------------------------------------------------------------------------
# Parameters
# ---------------------------------------------------------------------------

def validate_parameters(parameters: Any) -> list[dict]:
    """
    Check the signature. Every parameter needs a name, a type and a DEFAULT.

    The default is not a convenience. It is what the fully-bound call is
    validated against at save time, and what the provenance rule checks: George
    may only save a step at a binding he has actually watched run.
    """
    if parameters is None:
        return []
    if not isinstance(parameters, list):
        raise WorkflowValidationError(
            f"parameters must be a list of objects, got {type(parameters).__name__}."
        )
    if len(parameters) > MAX_PARAMETERS:
        raise WorkflowValidationError(
            f"A workflow may declare at most {MAX_PARAMETERS} parameters; "
            f"this one declares {len(parameters)}."
        )

    out: list[dict] = []
    seen: set[str] = set()
    for param in parameters:
        if not isinstance(param, dict):
            raise WorkflowValidationError(
                f"Each parameter must be an object, got {type(param).__name__}."
            )
        name = param.get("name")
        if not isinstance(name, str) or not name.strip():
            raise WorkflowValidationError("A parameter is missing its name.")
        name = name.strip()
        if name in seen:
            raise WorkflowValidationError(f"Parameter {name!r} is declared twice.")
        seen.add(name)

        ptype = param.get("type", "string")
        if ptype not in PARAMETER_TYPES:
            raise WorkflowValidationError(
                f"Parameter {name!r} has type {ptype!r}. Valid types: "
                f"{', '.join(PARAMETER_TYPES)}."
            )
        if "default" not in param:
            raise WorkflowValidationError(
                f"Parameter {name!r} has no default. Every parameter needs one — "
                f"the fully-defaulted binding is what gets validated when the "
                f"workflow is saved, and what proves the step has actually run."
            )

        out.append({
            "name": name,
            "type": ptype,
            "default": param["default"],
            "description": (param.get("description") or "").strip() or None,
        })
    return out


def resolve_bindings(parameters: list[dict], supplied: Optional[dict]) -> dict:
    """
    Defaults, overlaid with what the caller supplied. Unknown names are refused.

    Refused rather than ignored: a caller passing `stores` when the parameter is
    `store` would otherwise get the default silently, and a tile answering a
    different question than the one asked is the failure this whole system is
    built to avoid.
    """
    declared = {p["name"]: p for p in parameters}
    supplied = supplied or {}
    if not isinstance(supplied, dict):
        raise WorkflowValidationError(
            f"bindings must be an object, got {type(supplied).__name__}."
        )

    unknown = sorted(set(supplied) - set(declared))
    if unknown:
        raise WorkflowValidationError(
            f"This workflow has no parameter called {', '.join(repr(u) for u in unknown)}. "
            f"Declared: {', '.join(sorted(declared)) or 'none'}."
        )

    bound = {name: spec["default"] for name, spec in declared.items()}
    for name, value in supplied.items():
        _check_parameter_value(declared[name], value)
        bound[name] = value
    return bound


def _check_parameter_value(spec: dict, value: Any) -> None:
    """
    A light type check only. VALUES ARE THE TOOLS' BUSINESS.

    Whether "Rockwell" is a store George knows about is decided by the tool
    schema's enums, which are read from metrics.yaml, and enforced by
    validate_call on the fully-bound step. Duplicating that here would give the
    vocabulary a second home and let the two drift.
    """
    ptype, name = spec["type"], spec["name"]
    if ptype == "integer":
        # `isinstance(True, int)` is True in Python, so booleans have to be
        # excluded explicitly or top_n=True reaches the tool as top_n=1.
        if isinstance(value, bool) or not isinstance(value, int):
            raise WorkflowValidationError(f"Parameter {name!r} expects a whole number.")
    if ptype == "boolean" and not isinstance(value, bool):
        raise WorkflowValidationError(f"Parameter {name!r} expects true or false.")
    if ptype == "string" and not isinstance(value, str):
        raise WorkflowValidationError(f"Parameter {name!r} expects text.")
    if ptype == "date_range" and not isinstance(value, (str, list, tuple)):
        raise WorkflowValidationError(
            f"Parameter {name!r} expects a preset name or an explicit "
            f"[start, end] pair of Manila dates."
        )


def _substitute(value: Any, bindings: dict, step_name: str) -> Any:
    """
    Replace every {"$param": "name"} with its bound value, at any depth.

    Recursive because `filters` is itself an object: a workflow that parameterises
    the SKU inside it is doing an ordinary thing, and a top-level-only rule would
    refuse it for no reason a user could understand.
    """
    if isinstance(value, dict):
        if PARAM_REF in value and len(value) == 1:
            name = value[PARAM_REF]
            if name not in bindings:
                raise WorkflowValidationError(
                    f"Step {step_name!r} refers to a parameter {name!r} that this "
                    f"workflow does not declare. Declared: "
                    f"{', '.join(sorted(bindings)) or 'none'}."
                )
            return bindings[name]
        return {k: _substitute(v, bindings, step_name) for k, v in value.items()}
    if isinstance(value, list):
        return [_substitute(v, bindings, step_name) for v in value]
    return value


# ---------------------------------------------------------------------------
# Describing a slot in words
#
# Lives here, on plain fields rather than on the ORM row, because three modules
# need the same phrase and two of them cannot import each other:
# workflow_scheduler imports workflow_writer for record_run, so workflow_writer
# cannot import the scheduler back.
# ---------------------------------------------------------------------------

_WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
             "Saturday", "Sunday")


def _ordinal(n: int) -> str:
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }"


def describe_slot(kind: str, hour: int, minute: int = 0,
                  days_of_week: Optional[list] = None,
                  day_of_month: Optional[int] = None) -> str:
    """
    "Mondays at 06:00", for a message a person reads at 6am on a phone.

    Manila is not stated here; every caller is already inside a sentence that
    says so, and repeating it in each fragment reads like a warning.
    """
    at = f"{int(hour):02d}:{int(minute):02d}"

    if kind == "daily":
        return f"every day at {at}"

    if kind == "weekly":
        # Pluralised individually — "Mondays and Thursdays", not "Monday and
        # Thursdays", which is what putting the s only on the last one gives.
        days = [f"{_WEEKDAYS[int(d)]}s" for d in sorted(days_of_week or [])
                if 0 <= int(d) <= 6]
        if not days:
            return f"weekly at {at}"
        if len(days) == 1:
            return f"{days[0]} at {at}"
        return f"{', '.join(days[:-1])} and {days[-1]} at {at}"

    if kind == "monthly":
        dom = int(day_of_month or 1)
        # 31 means the last day, as scheduled_reports already uses, so saying
        # "the 31st" would be wrong in February and misleading in April.
        when = "the last day of the month" if dom == 31 else f"the {_ordinal(dom)}"
        return f"{when} at {at}"

    return f"{kind} at {at}"


# ---------------------------------------------------------------------------
# Windows, anchored on a day that is not today
# ---------------------------------------------------------------------------

def _truncate(anchor: date, unit: str) -> date:
    if unit == "day":
        return anchor
    if unit == "week":
        # Monday-based, matching metrics.yaml sales_day.week_start and Postgres
        # date_trunc('week').
        return anchor - timedelta(days=anchor.weekday())
    if unit == "month":
        return anchor.replace(day=1)
    if unit == "year":
        return anchor.replace(month=1, day=1)
    raise WorkflowValidationError(f"Unknown window unit {unit!r} in metrics.yaml.")


def _shift(anchor: date, unit: str, amount: int) -> date:
    if unit == "day":
        return anchor + timedelta(days=amount)
    if unit == "week":
        return anchor + timedelta(weeks=amount)
    if unit == "year":
        return anchor.replace(year=anchor.year + amount)
    if unit == "month":
        total = anchor.month - 1 + amount
        year = anchor.year + total // 12
        month = total % 12 + 1
        # Calendar arithmetic, like INTERVAL '1 month': the day is clamped to
        # the target month's length. Only ever reached from a truncated month
        # start (day 1) today, but the clamp keeps it correct if that changes.
        return date(year, month, min(anchor.day, calendar.monthrange(year, month)[1]))
    raise WorkflowValidationError(f"Unknown window unit {unit!r} in metrics.yaml.")


def resolve_preset(defs: dict, preset: str, anchor: date) -> list[str]:
    """
    The explicit half-open [start, end) a preset would have covered on `anchor`.

    Read from metrics.yaml (sales_day.presets.<name>.relative), never computed
    from a rule written here — the SQL form of the same window lives beside it
    in that file, and a private second copy is precisely what CLAUDE.md rule 3
    forbids.
    """
    presets = _req(defs, "sales_day.presets")
    if preset not in presets:
        raise WorkflowValidationError(
            f"Unknown window {preset!r}. Valid presets: {', '.join(sorted(presets))}."
        )
    spec = presets[preset].get("relative")
    if not isinstance(spec, dict):
        raise WorkflowValidationError(
            f"metrics.yaml preset {preset!r} has no `relative` block, so it "
            f"cannot be anchored on a past day. Add one beside its SQL."
        )

    unit = spec["unit"]
    start = _shift(_truncate(anchor, unit), unit, int(spec["offset"]))
    end = _shift(start, unit, int(spec["length"]))
    return [start.isoformat(), end.isoformat()]


# ---------------------------------------------------------------------------
# Binding a step, and saying honestly what a backtest did to it
# ---------------------------------------------------------------------------

def _backtest_defs(defs: dict) -> tuple[dict, dict, dict, set]:
    b = _req(defs, "workflows.backtest")
    return (
        b["as_of_arguments"],
        b["window_arguments"],
        b["partially_reproducible"],
        set(b["point_in_time_tools"]),
    )


def bind_step(step: dict, bindings: dict, defs: dict,
              as_of: Optional[date]) -> dict:
    """
    One stored step plus a set of bindings, resolved to a runnable call.

    Returns {name, tool, arguments, why, reproducible, reproducible_reason}.
    `reproducible` is "full", "partial" or "none", and it is only meaningful when
    as_of is set — a live run is reproducing nothing.
    """
    if not isinstance(step, dict):
        raise WorkflowValidationError(
            f"Each step must be an object, got {type(step).__name__}."
        )
    tool = step.get("tool")
    if not isinstance(tool, str) or not tool:
        raise WorkflowValidationError("A step is missing its tool name.")
    name = (step.get("name") or tool).strip()[:MAX_NAME_LEN]

    raw_args = step.get("arguments") or {}
    if not isinstance(raw_args, dict):
        raise WorkflowValidationError(
            f"Step {name!r}: arguments must be an object, got "
            f"{type(raw_args).__name__}."
        )
    args = _substitute(raw_args, bindings, name)

    reproducible, reason = "full", None
    if as_of is not None:
        args, reproducible, reason = _anchor(tool, dict(args), defs, as_of)

    return {
        "name": name,
        "tool": tool,
        "arguments": args,
        "why": (step.get("why") or "").strip() or None,
        "reproducible": reproducible,
        "reproducible_reason": reason,
    }


def _anchor(tool: str, args: dict, defs: dict,
            as_of: date) -> tuple[dict, str, Optional[str]]:
    """Move one step's time arguments to `as_of`, and say what could not move."""
    as_of_args, window_args, partial, point_in_time = _backtest_defs(defs)

    if tool in point_in_time:
        return args, "none", (
            f"{tool} has no date argument of any kind, so it can only report the "
            f"present. This figure is TODAY's, not {as_of.isoformat()}'s."
        )

    if tool in as_of_args:
        arg = as_of_args[tool]
        if args.get(arg) is None:
            args[arg] = as_of.isoformat()
        # An explicitly pinned date is the author's choice and is left alone.
        return args, "full", None

    if tool in window_args:
        arg = window_args[tool]
        value = args.get(arg)
        if isinstance(value, str):
            args[arg] = resolve_preset(defs, value, as_of)
        elif value is None:
            # get_purchasing's date_range defaults to None, meaning ALL TIME —
            # which in a backtest silently includes everything that happened
            # after as_of. Reported rather than quietly rebound: choosing a
            # window on the author's behalf would be inventing the rule.
            return args, "none", (
                f"{tool} was saved with no window, so it covers all time — "
                f"including everything after {as_of.isoformat()}. Bind "
                f"{arg} to make this step reproducible."
            )
        # An explicit [start, end) is the author's choice and is left alone.

        if tool in partial:
            return args, "partial", " ".join(str(partial[tool]).split())
        return args, "full", None

    # Unclassified. The contract test makes this unreachable; if it is ever
    # reached, the honest answer is that we do not know.
    return args, "none", (
        f"{tool} is not classified in metrics.yaml (workflows.backtest), so "
        f"whether this step reflects {as_of.isoformat()} is unknown."
    )


# ---------------------------------------------------------------------------
# Validation at save time
# ---------------------------------------------------------------------------

def validate_steps(steps: Any, parameters: list[dict]) -> list[dict]:
    """
    Check a whole version against the LIVE tool surface, at its DEFAULT bindings.

    Validation happens twice — here and again at run time — for the same reason
    pin_runner validates twice: storing a workflow that cannot run means a rule
    that breaks later for no visible reason, and running an unvalidated one
    means trusting a replayed argument list.
    """
    if not isinstance(steps, list) or not steps:
        raise WorkflowValidationError("A workflow needs at least one step.")
    if len(steps) > MAX_STEPS:
        raise WorkflowValidationError(
            f"A workflow may hold at most {MAX_STEPS} steps; this one has "
            f"{len(steps)}. A rule that needs more than that is probably "
            f"several rules."
        )

    defs = _load_defs()
    bindings = resolve_bindings(parameters, None)

    out: list[dict] = []
    seen: set[str] = set()
    for step in steps:
        bound = bind_step(step, bindings, defs, as_of=None)
        if bound["name"] in seen:
            raise WorkflowValidationError(
                f"Two steps are both called {bound['name']!r}. Step names are how "
                f"a person reads the run, so they have to differ."
            )
        seen.add(bound["name"])

        try:
            validate_call({"tool": bound["tool"], "arguments": bound["arguments"]})
        except PinValidationError as exc:
            raise WorkflowValidationError(f"Step {bound['name']!r}: {exc}") from exc

        # Stored in the ORIGINAL form, parameter references intact — the bound
        # form above exists only to prove the step runs.
        out.append({
            "name": bound["name"],
            "tool": bound["tool"],
            "arguments": step.get("arguments") or {},
            "why": bound["why"],
        })
    return out


def default_calls(steps: list[dict], parameters: list[dict]) -> list[dict]:
    """
    Every step as the concrete {tool, arguments} it is at its defaults.

    This is what the provenance check compares against: George may only save a
    step whose defaulted call he has actually run, successfully, in this
    conversation. See agent/write_tools.py.
    """
    defs = _load_defs()
    bindings = resolve_bindings(parameters, None)
    return [
        {"tool": b["tool"], "arguments": b["arguments"]}
        for b in (bind_step(s, bindings, defs, as_of=None) for s in steps)
    ]


# ---------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------

async def run_version(
    *,
    steps: list[dict],
    parameters: list[dict],
    bindings: Optional[dict] = None,
    as_of: Optional[date] = None,
    mode: str = "manual",
    saved_definitions_version: Optional[int] = None,
    version_context: Optional[dict] = None,
) -> dict:
    """
    Run one version's steps and roll up a status, notices and receipts.

    Steps run CONCURRENTLY and fail independently — one dead step must not hide
    the others, exactly as one rotted call must not blank a tile. Nothing here
    writes; recording the run is app.services.workflow_writer's job.

    Args:
        version_context: which version this is and what the schedules pin, as
            {"workflow": name, "version": n, "promoted": bool,
             "scheduled": [{"version": n, "slot": "Mondays at 06:00",
                            "schedule_id": ...}]}.
            Supplied by the caller because it is a database fact and this module
            reads nothing. Its only job is the version_divergence notice: a
            manual run uses the newest version while a schedule fires the
            promoted one, and the reader has to be told which of the two they
            are looking at.

    Returns {status, mode, as_of, bindings, steps, notices, run_notices,
    definitions_version, version, scheduled_versions, diverges}.
    """
    # A run of no steps would come back "ok" with nothing in it, which reads
    # exactly like a rule that found nothing — the empty-versus-quiet confusion
    # the brief exists to prevent, arriving through the back door. The stored
    # shape cannot be empty (validate_steps, and a CHECK constraint), so this is
    # depth: whatever handed us an empty list is wrong, and silence would hide it.
    if not steps:
        raise WorkflowValidationError(
            "This workflow has no steps to run, so there is nothing it could "
            "report. A workflow needs at least one step."
        )

    defs = _load_defs()
    bound = resolve_bindings(parameters, bindings)
    prepared = [bind_step(step, bound, defs, as_of) for step in steps]

    results = await asyncio.gather(*[
        run_call({"tool": s["tool"], "arguments": s["arguments"]}) for s in prepared
    ])

    step_results = []
    for spec, result in zip(prepared, results):
        step_results.append({
            **result,
            "name": spec["name"],
            "why": spec["why"],
            "reproducible": spec["reproducible"] if as_of else None,
            "reproducible_reason": spec["reproducible_reason"] if as_of else None,
        })

    status = max((r["status"] for r in step_results),
                 key=lambda s: _SEVERITY.get(s, 0), default="ok")

    live_version = _req(defs, "version")
    diverging = _diverging_schedules(version_context, mode)
    run_notices = _run_notices(
        step_results, mode=mode, as_of=as_of,
        saved_definitions_version=saved_definitions_version,
        live_definitions_version=live_version,
        version_context=version_context, diverging=diverging,
    )

    context = version_context or {}
    return {
        "status": status,
        "mode": mode,
        "as_of": as_of.isoformat() if as_of else None,
        "bindings": bound,
        "steps": step_results,
        # Stated structurally as well as in the notice, so a caller does not
        # have to read prose to know which rule produced these figures.
        # `schedules` is EVERY schedule, enabled or not, so a caller can say
        # "nothing is scheduled" as confidently as it names a version;
        # `diverging_schedules` is the subset the notice is about.
        "version": context.get("version"),
        "schedules": list(context.get("scheduled") or []),
        "diverging_schedules": diverging,
        "diverges": bool(diverging),
        # Kept apart, because they are surfaced in different places: a run-level
        # notice qualifies the WHOLE run and belongs above every figure, while a
        # step's own notice belongs beside the step it qualifies. `notices` is
        # the flat union — what the run record stores and what the agent loop
        # reads — and the run-level ones come first there, since a caveat about
        # the whole thing has to be read before any single number.
        "run_notices": run_notices,
        "notices": run_notices + [
            n for r in step_results for n in (r.get("notices") or [])
        ],
        "definitions_version": live_version,
        "ran_at": datetime.now(timezone.utc).isoformat(),
    }


def _diverging_schedules(version_context: Optional[dict],
                         mode: str) -> list[dict]:
    """
    Enabled schedules that fire a DIFFERENT version from the one being run.

    A scheduled run is excluded by definition — it IS the schedule, and telling
    Monday's message that it disagrees with itself would be noise. Disabled
    schedules are excluded too: they fire nothing, so there is no second answer
    for anyone to be confused by. What is left is the case that matters — a
    person reading figures in chat while a different rule sends figures on
    Monday.
    """
    if mode == "scheduled" or not version_context:
        return []
    running = version_context.get("version")
    if running is None:
        return []
    return [
        s for s in (version_context.get("scheduled") or [])
        if s.get("enabled") and s.get("version") != running
    ]


def _divergence_notice(version_context: dict, diverging: list[dict]) -> dict:
    """
    Which version ran, which the schedules fire, and why the two differ.

    DIVERGENCE IS ALLOWED AND SILENT DIVERGENCE IS NOT. A manual run uses the
    newest version so that editing a rule and trying it does not require an
    approval first; a schedule keeps the version it was promoted with so that
    editing a rule does not change what goes out unattended. Both halves are
    deliberate. What is not survivable is two people comparing a number from
    chat against a number from Monday's message with no way to know they came
    from different rules.

    The reason is derived rather than generic, because "these differ" sends the
    reader to guess and the two real causes have different fixes: promote the
    newer version, or repoint the schedule at it.
    """
    running = version_context.get("version")
    promoted = version_context.get("promoted")
    name = version_context.get("workflow") or "This workflow"

    fires = "; ".join(
        f"the {s.get('slot', 'schedule')} schedule runs version {s.get('version')}"
        for s in diverging
    )

    if not promoted:
        why = (
            f"version {running} has not been promoted, and a schedule keeps the "
            f"version it was approved with until an administrator promotes a "
            f"newer one against a backtest"
        )
    else:
        why = (
            f"version {running} has been promoted, but the schedule is still "
            f"pinned to the version it was created with — repointing it is a "
            f"separate act, so that promoting a version never silently changes "
            f"what goes out unattended"
        )

    return {
        "kind": "version_divergence",
        "message": (
            f"You are looking at version {running} of {name}, which is not what "
            f"the schedule sends: {fires}. The figures here may differ from the "
            f"ones that arrive on schedule, because {why}."
        ),
        "source": "metrics.yaml: workflows.promotion.divergence_must_be_stated",
        # Structured alongside the prose so the run record and any UI can state
        # it without parsing a sentence.
        "ran_version": running,
        "ran_version_promoted": promoted,
        "scheduled_versions": [
            {"version": s.get("version"), "slot": s.get("slot"),
             "schedule_id": s.get("schedule_id")}
            for s in diverging
        ],
    }


def _run_notices(step_results: list[dict], *, mode: str, as_of: Optional[date],
                 saved_definitions_version: Optional[int],
                 live_definitions_version: Optional[int],
                 version_context: Optional[dict] = None,
                 diverging: Optional[list[dict]] = None) -> list[dict]:
    """
    The caveats that belong to the RUN rather than to any one step.

    Every one is fingerprinted in metrics.yaml (notices.*), because a notice
    with no fingerprint can never be satisfied: the loop spends a corrective turn
    on it, fails the same check again, and appends it verbatim under prose that
    already said it.

    Ordered by how fundamental the doubt is. Which RULE produced these figures
    comes first — a reader who has the wrong version in mind has misread
    everything below it, including the other caveats.
    """
    notices: list[dict] = []

    if diverging:
        notices.append(_divergence_notice(version_context or {}, diverging))

    if (saved_definitions_version is not None
            and live_definitions_version is not None
            and saved_definitions_version != live_definitions_version):
        notices.append({
            "kind": "definitions_drift",
            "message": (
                f"This workflow was saved against metrics.yaml version "
                f"{saved_definitions_version} and has just run against version "
                f"{live_definitions_version}. The definitions have changed since "
                f"the reasoning recorded with it was written, so a figure here may "
                f"no longer mean what the step says it means."
            ),
            "source": "metrics.yaml: version",
        })

    if as_of is not None:
        unfaithful = [s for s in step_results if s.get("reproducible") != "full"]
        if unfaithful:
            detail = "; ".join(
                f"{s['name']} ({s['tool']}): {s['reproducible_reason']}"
                for s in unfaithful
            )
            notices.append({
                "kind": "backtest_not_reproducible",
                "message": (
                    f"This backtest cannot fully reproduce {as_of.isoformat()}. "
                    f"These steps report the current position instead: {detail}"
                ),
                "source": "metrics.yaml: workflows.backtest",
            })

    broken = [s for s in step_results if s["status"] != "ok"]
    if broken:
        detail = "; ".join(
            f"{s['name']} ({s['status']}): {s.get('error') or 'no reason given'}"
            for s in broken
        )
        notices.append({
            "kind": "workflow_step_failed",
            "message": (
                f"{len(broken)} of {len(step_results)} steps did not return data, "
                f"so this run is incomplete and the steps that did run are not the "
                f"whole rule: {detail}"
            ),
            "source": "app.services.workflow_runner",
        })

    return notices


def cap_for_storage(step_results: list[dict]) -> list[dict]:
    """
    What gets written to george.workflow_runs.

    meta and notices are kept WHOLE — they are the part that cannot be
    recomputed, and they are what makes the run inspectable a month later. Rows
    are a sample, and the sample says so.
    """
    stored = []
    for step in step_results:
        rows = step.get("rows") or []
        kept = rows[:MAX_STORED_ROWS_PER_STEP]
        entry = {k: v for k, v in step.items() if k != "rows"}
        entry["rows"] = kept
        entry["rows_stored"] = len(kept)
        entry["rows_returned"] = len(rows)
        if len(kept) < len(rows):
            entry["rows_note"] = (
                f"{len(kept)} of {len(rows)} rows kept on this record. Every "
                f"figure in meta covers all {len(rows)} — do not total the "
                f"stored rows. Re-run the workflow for the full result."
            )
        stored.append(entry)
    return stored

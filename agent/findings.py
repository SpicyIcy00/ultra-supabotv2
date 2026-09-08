"""
What each read MEANT in this piece of work — the one thing the model may say
about composition, and the whole of it.

WHY THIS EXISTS. George has a rigorous vocabulary for what a NUMBER is:
`inferShape` decides what a result may be drawn as, `resultShape` decides how
several results compose, and every figure carries the meta of the call behind
it. What he has had no vocabulary for is the ROLE a result plays. An
investigation verifies a premise, decomposes it into drivers and localizes it
to products — four `get_sales` calls — and the surface drew four blocks in a
row, indistinguishable from four unrelated figures. The ladder is declared in
metrics.yaml `investigation`, it is real, and it existed only inside the
model's prose. So George explained his own structure in paragraphs, which is
the root of "too much prose" and "not visual enough" at the same time.

WHAT THE MODEL SUPPLIES, EXACTLY. An integer and a word from a list of four:

    {"seq": 7, "role": "driver", "of": 4}

`seq` names a call that ALREADY RAN in this turn. `role` is one of `primary`,
`driver`, `breakdown`, `context`. Nothing else. No figure, no label, no colour,
no component name, no layout, no threshold, no ordering, no computed value —
the model cannot reach any of those through this channel because this channel
has no field for them. Architecture rule 9 is untouched: the model selects, and
assigning a role to work already done is selection.

Architecture rule 5 is untouched too. This is not a planner: it is a LABEL on
calls that have already returned, submitted after the fact, deciding nothing
about what happens next. The loop's shape is unchanged.

WHAT THE LOOP CHECKS, AND WHY EACH CHECK IS THERE. Every one of these is a way
the surface could be made to assert something the data does not support:

  the call exists           a seq for a call that never ran would put a role on
                            nothing, and the client would look for it
  the call succeeded        a refusal produced no result anyone saw
  the call is a READ        a pin, a save, a page read and a workflow run are
                            calls George made; none of them is a figure
  not a duplicate           its rows are the original's, already on screen
  one primary               two primaries is two investigations in one answer,
                            and the surface has no way to draw that
  `of` names the primary    a driver of nothing is not a driver
  the metric is a DRIVER    `metrics.<primary>.drivers.components` says which
                            metrics explain a change in that metric. The model
                            does not get to nominate one
  the grouping is VALID     `metrics.<metric>.valid_group_by` says which
                            subjects a metric may be broken down by. net_sales
                            and ATP are transaction grain and are refused by
                            product — the tool refuses it, and so does this
  the scope MATCHES         a driver read over a different window, different
                            filters or without the same comparison is not a
                            decomposition of the primary. metrics.yaml
                            `investigation.ladder.decompose` requires the SAME
                            date_range, filters and compare_to, and a section
                            heading that is untrue of its members is exactly
                            what resultShape's scopeKey exists to prevent

A finding that fails any check is DROPPED, with its reason recorded, and the
rest stand. If the primary itself is rejected, everything hanging off it is
dropped too — a driver with no primary has nothing to be a driver of. No
findings at all is a valid outcome and means the surface composes exactly as it
did before any of this existed.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional

# The closed set. Sourced from metrics.yaml `investigation.ladder` in
# `roles_for`, so the vocabulary cannot drift from the definitions; this is the
# order they are drawn in and the order a reader climbs.
ROLES = ("primary", "driver", "breakdown", "context")

# Roles that hang off a primary and are meaningless without one.
DEPENDENT_ROLES = ("driver", "breakdown")

# The dimensions a result may be BROKEN DOWN by. A time bucket is deliberately
# not here: metrics.yaml records a per-bucket lag series as not built, and a
# breakdown over time would be that series under another name.
SUBJECT_DIMENSIONS = ("store", "product", "category")

#: The tool whose arguments carry a metric and a grouping. Every check below
#: that reads `metric` or `group_by` applies to it; a finding on any other read
#: can only ever be `context`, because nothing else declares what it measured
#: in a form these definitions describe.
METRIC_TOOL = "get_sales"


class Rejected(Exception):
    """A finding that will not be accepted, carrying the reason it was not."""


def roles_for(defs: Mapping[str, Any]) -> tuple[str, ...]:
    """
    The role vocabulary, checked against the definitions that name the ladder.

    metrics.yaml `investigation.ladder` has rungs — verify, decompose, localize,
    explain, next — and these roles are what a rung produces, not the rungs
    themselves: `verify` produces the primary, `decompose` produces drivers,
    `localize` produces breakdowns. The mapping is asserted rather than derived
    so that a rung added to the yaml fails the contract test instead of silently
    meaning nothing here.
    """
    ladder = ((defs.get("investigation") or {}).get("ladder") or {})
    if not {"verify", "decompose", "localize"} <= set(ladder):
        raise ValueError(
            "metrics.yaml investigation.ladder no longer names verify, "
            "decompose and localize; the finding roles are built on them."
        )
    return ROLES


def _argument(call: Mapping[str, Any], name: str) -> Any:
    return (call.get("arguments") or {}).get(name)


def _metric(call: Mapping[str, Any]) -> str:
    """The metric a sales read measured. `get_sales` defaults to net_sales."""
    metric = _argument(call, "metric")
    return metric if isinstance(metric, str) and metric else "net_sales"


def _group_by(call: Mapping[str, Any]) -> list[str]:
    raw = _argument(call, "group_by")
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, list):
        return [str(g) for g in raw]
    return []


def scope_of(call: Mapping[str, Any]) -> tuple:
    """
    What a call was measured over, as a comparable value.

    Window, every filter, and whether a comparison was asked for. This is the
    server-side twin of resultShape.scopeKey, and it is deliberately strict for
    the same reason: a heading covers everything under it, so anything that
    could make it untrue of one member has to break the group.

    The GROUPING is NOT part of the scope. A breakdown differs from its primary
    by exactly its grouping — that is what makes it a breakdown — so folding
    the grouping in here would reject every localization there is.
    """
    args = call.get("arguments") or {}
    filters = args.get("filters") or {}
    return (
        repr(args.get("date_range")),
        repr(sorted(filters.items())) if isinstance(filters, dict) else repr(filters),
        repr(args.get("compare_to")),
    )


def _check_read(call: Optional[Mapping[str, Any]], seq: Any) -> Mapping[str, Any]:
    if call is None:
        raise Rejected(f"call {seq} did not run in this turn")
    if call.get("error"):
        raise Rejected(f"call {seq} did not succeed")
    if call.get("duplicate"):
        raise Rejected(f"call {seq} repeats an earlier call and drew nothing of its own")
    if not call.get("is_read"):
        raise Rejected(f"call {seq} is not a trusted read")
    return call


def _check_driver(call: Mapping[str, Any], primary: Mapping[str, Any],
                  defs: Mapping[str, Any], seq: Any) -> None:
    if call.get("tool") != METRIC_TOOL or primary.get("tool") != METRIC_TOOL:
        raise Rejected(f"call {seq} does not measure a metric that declares drivers")
    metrics = defs.get("metrics") or {}
    declared = (((metrics.get(_metric(primary)) or {}).get("drivers") or {})
                .get("components") or [])
    if _metric(call) not in declared:
        raise Rejected(
            f"{_metric(call)} is not a declared driver of {_metric(primary)}"
        )
    if scope_of(call) != scope_of(primary):
        raise Rejected(
            f"call {seq} was read over a different window, filter or comparison "
            f"than the fact it claims to explain"
        )


def _check_breakdown(call: Mapping[str, Any], primary: Mapping[str, Any],
                     defs: Mapping[str, Any], seq: Any) -> None:
    if call.get("tool") != METRIC_TOOL:
        raise Rejected(f"call {seq} is not a grouped metric read")
    dimensions = [g for g in _group_by(call) if g in SUBJECT_DIMENSIONS]
    if not dimensions:
        raise Rejected(f"call {seq} is not grouped by a subject")
    metrics = defs.get("metrics") or {}
    valid = (metrics.get(_metric(call)) or {}).get("valid_group_by") or []
    for dimension in dimensions:
        if dimension not in valid:
            raise Rejected(
                f"{_metric(call)} may not be broken down by {dimension}"
            )
    if scope_of(call) != scope_of(primary):
        raise Rejected(
            f"call {seq} was read over a different window, filter or comparison "
            f"than the fact it claims to localize"
        )


def validate(submitted: Iterable[Any], calls: Mapping[int, Mapping[str, Any]],
             defs: Mapping[str, Any]) -> tuple[list[dict], list[dict]]:
    """
    Which findings stand, and why the others do not.

    Args:
        submitted: what the model sent, unvalidated and untrusted.
        calls: seq -> a record of the call the loop actually dispatched:
            {tool, arguments, error, duplicate, is_read}.
        defs: metrics.yaml.

    Returns:
        (accepted, rejected). `accepted` is in submission order with the
        primary first; `rejected` carries a human reason per entry, which the
        loop surfaces as a warning rather than swallowing — a role that was
        refused is a thing the model tried to say and could not.
    """
    roles_for(defs)  # the vocabulary is the definitions', or nothing runs

    accepted: list[dict] = []
    rejected: list[dict] = []
    primary_seq: Optional[int] = None

    # Two passes: the primary has to be settled before anything can hang off
    # it, and the model is under no obligation to submit it first.
    entries: list[tuple[Any, Any, Any]] = []
    for entry in submitted or []:
        if not isinstance(entry, Mapping):
            rejected.append({"seq": None, "role": None, "reason": "not a finding"})
            continue
        entries.append((entry.get("seq"), entry.get("role"), entry.get("of")))

    for seq, role, _of in entries:
        if role != "primary":
            continue
        try:
            if primary_seq is not None:
                raise Rejected("a piece of work has one primary fact, not two")
            call = _check_read(calls.get(seq), seq)
            primary_seq = seq
            accepted.append({"seq": seq, "role": "primary", "of": None,
                             "tool": call.get("tool")})
        except Rejected as why:
            rejected.append({"seq": seq, "role": role, "reason": str(why)})

    for seq, role, of in entries:
        if role == "primary":
            continue
        try:
            if role not in ROLES:
                raise Rejected(f"{role!r} is not a role")
            call = _check_read(calls.get(seq), seq)
            if seq == primary_seq:
                raise Rejected(f"call {seq} is already the primary fact")
            if any(a["seq"] == seq for a in accepted):
                raise Rejected(f"call {seq} already has a role")
            if role in DEPENDENT_ROLES:
                if primary_seq is None:
                    raise Rejected(f"a {role} needs a primary fact to hang off")
                if of != primary_seq:
                    raise Rejected(f"a {role} must name the primary fact it explains")
                primary = calls[primary_seq]
                if role == "driver":
                    _check_driver(call, primary, defs, seq)
                else:
                    _check_breakdown(call, primary, defs, seq)
            accepted.append({"seq": seq, "role": role,
                             "of": of if role in DEPENDENT_ROLES else None,
                             "tool": call.get("tool")})
        except Rejected as why:
            rejected.append({"seq": seq, "role": role, "reason": str(why)})

    # A dependent whose primary was rejected has nothing to hang off. It cannot
    # happen through the loop above — a rejected primary leaves primary_seq
    # None and every dependent is refused — but it is asserted rather than
    # assumed, because the surface trusts this list absolutely.
    if primary_seq is None:
        for entry in [a for a in accepted if a["role"] in DEPENDENT_ROLES]:
            accepted.remove(entry)
            rejected.append({**entry, "reason": "no primary fact was established"})

    return accepted, rejected


def record_findings(findings: Any, *, calls: Mapping[int, Mapping[str, Any]],
                    defs: Mapping[str, Any]) -> dict:
    """
    The tool body. Returns {rows, meta} like every other tool.

    NO `source_table` IN meta, deliberately. The loop keeps the last meta that
    describes real data as the answer's receipts, and it decides that by asking
    whether a result names a source. This result names none, because it read
    nothing: it is a statement about calls that already happened, and letting it
    become the receipts would replace the figures' provenance with a label.
    """
    accepted, rejected = validate(findings, calls, defs)
    return {
        "rows": accepted,
        "meta": {
            "accepted": len(accepted),
            "rejected": rejected,
            "roles": list(ROLES),
            "note": (
                "Roles recorded against calls that already ran. Nothing was "
                "read. A rejected role was not applied and the answer must not "
                "describe it as though it were."
            ),
        },
    }

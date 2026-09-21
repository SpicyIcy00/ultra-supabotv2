"""
Every notice a tool can emit must have a fingerprint in metrics.yaml.

NO DATABASE. Source and definitions only.

WHY THIS EXISTS. _unsurfaced treats a notice kind with no fingerprint as
unsurfaced — deliberately, because over-reporting an unknown caveat is safer
than dropping it. The cost of that default is invisible until you look: such a
notice can NEVER be satisfied, whatever the answer says. So every answer
carrying one spends a corrective turn rewriting itself, fails the same check
again, and has the notice appended verbatim underneath prose that already said
it.

Found 2026-09-03 on the morning brief, which emits several at once: the whole
brief was written twice and then caveated with its own contents. Twelve kinds
were in that state — the fingerprints had simply not kept up with the tools.

Nothing about that is visible in a passing test suite or a working answer, which
is exactly why it needs a test of its own.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

pytest.importorskip("yaml", reason="metrics.yaml has to be read")

import yaml                                          # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"

# Notices are not only emitted by tools any more. A workflow run assembles its
# own — definitions drift, a backtest that cannot reproduce a step, a step that
# did not return — and those reach an ANSWER through run_workflow exactly as a
# tool's do, so they need fingerprints for exactly the same reason.
#
# An explicit list of files rather than a directory sweep, because
# backend/app/services also holds the StoreHub importer, which emits nine
# notice-shaped dicts into an IMPORT REPORT. Those never pass through
# _unsurfaced, and demanding fingerprints for them would be inventing a
# requirement to make a test tidy.
EXTRA_EMITTERS = [
    ROOT / "backend" / "app" / "services" / "workflow_runner.py",
    # The skipped-slot notice can only be raised where the slots are known —
    # which is now app/services/slots.py, shared by the workflow scheduler and
    # by standing questions rather than written out twice.
    ROOT / "backend" / "app" / "services" / "slots.py",
    # A watch's two: it has stopped, and it cannot see. Both are raised where
    # the check happens, because only there is it known which one is true.
    ROOT / "backend" / "app" / "services" / "watch_runner.py",
    # A page read raises its own two: something asked for did not come back,
    # and something on the page was not read at all.
    ROOT / "agent" / "composite_tools.py",
]

# The container kind, which carries `items` and is never fingerprinted itself —
# the loop checks each item's own kind. metrics.yaml names it in notices.container_kind.
CONTAINER = "multiple"


def emitted_kinds() -> dict[str, str]:
    """
    Every notice kind a tool constructs, found in the AST rather than by regex.

    A notice is a dict literal carrying BOTH "kind" and "message". That
    distinguishes it from meta["window"], which also has a "kind" ("preset",
    "explicit", "all_time") and is not a notice at all — a regex over `"kind":`
    reports those as missing fingerprints and sends you chasing three ghosts.
    """
    found: dict[str, str] = {}
    for path in sorted(TOOLS.glob("*.py")) + EXTRA_EMITTERS:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            keys = [k.value if isinstance(k, ast.Constant) else None for k in node.keys]
            if "kind" not in keys or "message" not in keys:
                continue
            for name in _kind_names(node.values[keys.index("kind")]):
                found.setdefault(name, path.name)

    # A BLIND SPOT THIS TEST HAD UNTIL 2026-09-09, and it hid fourteen kinds.
    #
    # A tool may pick its kind from the definitions rather than write it inline
    # — `{"kind": _req(hist, "coverage_notice_kind"), ...}` — and to the AST
    # that value is a Call, not a string. Both halves of this file were wrong
    # about such a notice at once: it looked unfingerprinted from one side and
    # its fingerprint looked dead from the other, so adding the fingerprint
    # broke the very test that asked for it.
    #
    # The declarations ARE the source of truth for those, so read them: any
    # string in metrics.yaml under a key named `notice_kind` or ending in
    # `_notice_kind` is a kind some tool emits.
    for key, name in _declared_kinds(yaml.safe_load(
            (ROOT / "definitions" / "metrics.yaml").read_text(encoding="utf-8"))):
        found.setdefault(name, f"metrics.yaml: {key}")
    return found


def _declared_kinds(node, path: str = "") -> list[tuple[str, str]]:
    """Every (yaml path, kind) declared under a `*notice_kind` key."""
    out: list[tuple[str, str]] = []
    if isinstance(node, dict):
        for k, v in node.items():
            here = f"{path}.{k}" if path else str(k)
            if isinstance(k, str) and isinstance(v, str) and (
                    k == "notice_kind" or k.endswith("_notice_kind")):
                out.append((here, v))
            else:
                out.extend(_declared_kinds(v, here))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out.extend(_declared_kinds(v, f"{path}[{i}]"))
    return out


def _kind_names(value: ast.expr) -> list[str]:
    """
    The kind(s) an expression can produce.

    Both branches of a conditional count: movement.py picks its kind with
    `"location_closed" if closed else "no_snapshot_coverage"`, and reading only
    the literal case would report one of those two as dead and miss the other
    entirely — which is how a real gap stayed hidden.
    """
    if isinstance(value, ast.Constant) and isinstance(value.value, str):
        return [value.value]
    if isinstance(value, ast.IfExp):
        return _kind_names(value.body) + _kind_names(value.orelse)
    return []


def fingerprints() -> dict:
    defs = yaml.safe_load((ROOT / "definitions" / "metrics.yaml").read_text(encoding="utf-8"))
    return defs["notices"]


def test_tools_emit_notices_at_all():
    """A guard on the guard: an AST walk that finds nothing would pass silently."""
    kinds = emitted_kinds()
    assert len(kinds) > 15, kinds
    assert "ambiguous_sku" in kinds


def test_every_emitted_notice_has_a_fingerprint():
    """
    Without one the notice is unsatisfiable: a corrective turn every time, then
    the caveat appended under prose that already carried it.
    """
    notices = fingerprints()
    missing = {
        kind: where for kind, where in emitted_kinds().items()
        if kind != CONTAINER
        and not (isinstance(notices.get(kind), dict) and "must_convey" in notices[kind])
    }
    assert not missing, (
        "These notice kinds are emitted by tools but have no "
        "notices.<kind>.must_convey in metrics.yaml, so no answer can ever "
        f"satisfy them: {missing}"
    )


def test_no_fingerprint_outlives_its_notice():
    """
    A fingerprint for a kind nothing emits means a notice was renamed and its
    guarantee quietly stopped applying — the same failure, pointing the other
    way.
    """
    emitted = set(emitted_kinds())
    declared = {
        k for k, v in fingerprints().items()
        if isinstance(v, dict) and "must_convey" in v
    }
    assert not (declared - emitted), (
        f"fingerprints with no emitter: {sorted(declared - emitted)}"
    )


# ---------------------------------------------------------------------------
# A fingerprint has to work in BOTH directions
#
# Too strict and it can never be satisfied — the failure this file was written
# for. Too loose and it passes an answer that dropped the caveat, which is worse:
# the duplication was ugly, but a caveat silently not required is the thing the
# whole notice mechanism exists to prevent.
#
# So each of the fingerprints added on 2026-09-03 is checked against prose that
# conveys it and prose that ignores it, in the register Bob actually writes.
# ---------------------------------------------------------------------------

PAIRS = {
    "ratio_undefined": (
        "Average transaction value is undefined for that window: there were no "
        "qualifying transactions at Shang before 5 Apr 2026, so there is nothing "
        "to average.",
        "Average transaction value at Shang was ₱0 that week.",
    ),
    "comparison_incomplete": (
        "Shang has no baseline: it was not trading in the week before, so its "
        "figure stands alone and has no change against the previous period.",
        "Shang took ₱185,298 in the week of 24 Aug 2026, down 16.7%.",
    ),
    "stale_sources": (
        "Three sources are too old to say what changed since yesterday: "
        "stock_transfers and purchase_orders are 64 days old and frozen.",
        "Sales were down at three stores yesterday against the same weekday.",
    ),
    "empty_section": (
        "Nothing to report for newly dead stock — nothing crossed the threshold.",
        "Here are the eight products that went out of stock.",
    ),
    "cost_not_entered": (
        "Nine lines record a unit cost of zero, which means the cost was never "
        "entered rather than that the item is free.",
        "Unit cost ranged from ₱18.50 to ₱24.00 across eleven purchase orders.",
    ),
    "dead_stock_share": (
        "412 of 2,180 products held in scope recorded no sale in this window; a "
        "longer window would shrink the list.",
        "The worst offender is Haw Flakes, unsold since June.",
    ),
    "two_bases_not_summed": (
        "These are recorded transfer documents and snapshot-inferred balance "
        "changes; they are not added together and must not be.",
        "Total movement into AJI BARN was 4,120 units.",
    ),
    "unmoved_transfer_value": (
        "₱327,000 sits in transfers whose status says the goods have not moved, "
        "and is excluded from the totals below.",
        "Transfers into Rockwell totalled ₱1.2M across 40 documents.",
    ),
    "open_is_not_unreceived": (
        "\"Open\" means the PO was never marked complete in StoreHub; it does not "
        "mean the goods have not arrived.",
        "There are 22 open purchase orders worth ₱1.4M.",
    ),
    "header_total_mismatch": (
        "Six purchase orders have a document total that disagrees with their own "
        "lines; this figure is summed from the itemised lines, and the header "
        "totals were not used.",
        "Ordered value last month was ₱2.1M across 60 purchase orders.",
    ),
    "quantity_not_additive": (
        "Quantities are not additive across products — Aji Mix moves in grams "
        "and Haw Flakes in packs, so this total adds grams to packs.",
        "The total quantity ordered was 18,400.",
    ),
    "received_quantity_coverage": (
        "142 of 380 lines record no received quantity at all — blank in the "
        "export, not zero — so this covers only the lines that recorded a figure.",
        "Received quantity came to 12,900 units.",
    ),
    "completion_not_delivery": (
        "This is system completion latency — the time until someone marked the PO "
        "complete — and is not delivery lead time.",
        "Average turnaround was 3.1 days from creation to completion.",
    ),
    "bases_not_comparable": (
        "This SKU has both supplier costs and internal transfer valuations. They "
        "are different measures, reported separately — do not compare them.",
        "Cost for MJ3 ranged from ₱14.00 to ₱31.50 over the year.",
    ),
    "no_snapshot_coverage": (
        "AJI PINA is not in the inventory snapshot scope, so no balance history "
        "exists for it; its recorded transfers are what this answer is based on.",
        "Movement into AJI PINA totalled 900 units across 12 documents.",
    ),
    "page_context_partial": (
        "Three of the five pins on this page reproduced; the low-stock pin could "
        "not be reproduced because thresholds are not set at AJI BARN.",
        "Everything on the page looks healthy: stock at AJI BARN is 4,120 units as "
        "of Mon 7 Sep 2026.",
    ),
    # HIS OWN SENTENCE, from the run that failed on 2026-09-13. It conveys the
    # caveat completely and in better English than the notice does, and the
    # fingerprint reported it unsurfaced because the word he reached for was
    # "warning level" and the group held only "threshold". Two corrective turns
    # and a forced caveat followed.
    "low_stock_not_operational": (
        "And I can't answer \"running low\" in the ordinary sense at all: the "
        "shop's low-stock warning level has never been set on a single product, "
        "so nothing can ever be flagged as low — that silence is missing "
        "configuration, not a shelf in good order.",
        "Nothing at Greenhills is running low right now.",
    ),
    "page_context_truncated": (
        "This page has 12 pins and I read the newest 5; the other 7 are not "
        "inspected here.",
        "The page shows sales of ₱48,210 on Wed 2 Sep 2026 and stock of 4,120 "
        "units.",
    ),
}


@pytest.mark.parametrize("kind", sorted(PAIRS))
def test_a_fingerprint_accepts_prose_that_conveys_it(kind):
    from agent import loop as bob_loop
    from tools._common import load_defs

    conveys, _ = PAIRS[kind]
    missing = bob_loop._unsurfaced(
        [{"kind": kind, "message": "..."}], conveys, load_defs()
    )
    assert not missing, (
        f"{kind}: an answer that states the caveat is still reported as "
        f"unsurfaced, so it can never be satisfied"
    )


def _explains_only() -> set:
    """The kinds UI rule 4 says not to draw: they explain, they do not warn."""
    from tools._common import load_defs, req

    return set(req(load_defs(), "surface.desk.notices").get("explains_only") or ())


@pytest.mark.parametrize("kind", sorted(PAIRS))
def test_a_fingerprint_rejects_prose_that_ignores_it(kind):
    """
    A notice that a figure may be WRONG is still required of the answer.

    NOT REQUIRED SINCE P14 (2026-09-21): a kind `surface.desk.notices`
    classifies as `explains_only`. Twenty-three kinds were on that list AND
    carried `must_convey`, so the loop required in his prose exactly what the
    surface is told never to draw — and appended it verbatim when he left it
    out. The owner, of a page carrying three of them: *"i dont like the
    disclaimers i dont want to see it"*, and on 2026-09-17: *"we dont need
    those disclaimers unless it has wrong data"*. The check now reads the
    classification, so the two halves cannot contradict again.
    """
    from agent import loop as bob_loop
    from tools._common import load_defs

    _, ignores = PAIRS[kind]
    missing = bob_loop._unsurfaced(
        [{"kind": kind, "message": "..."}], ignores, load_defs()
    )
    if kind in _explains_only():
        assert not missing, (
            f"{kind} only explains how a figure was measured, and is still being "
            f"forced into the answer"
        )
        return
    assert missing, (
        f"{kind}: an answer that drops the caveat passes the check, so the "
        f"caveat is no longer required of anyone"
    )


def test_a_disclaimer_is_never_forced_and_a_warning_always_is():
    """
    The one rule, from the one classification (P14).

    `surface.desk.notices` splits every kind into `data_may_be_wrong` (drawn,
    UI rule 4) and `explains_only` (not drawn). `_unsurfaced` reads that same
    split, so a kind cannot be undrawable and mandatory at once.
    """
    from agent import loop as bob_loop
    from tools._common import load_defs, req

    defs = load_defs()
    desk = req(defs, "surface.desk.notices")
    wrong = [k for k in (desk.get("data_may_be_wrong") or []) if k in fingerprints()]
    assert wrong, "no warning kind carries a fingerprint; the check would be vacuous"

    # Prose that says nothing at all.
    for kind in sorted(_explains_only()):
        assert not bob_loop._unsurfaced([{"kind": kind}], "It went up.", defs), (
            f"{kind} explains how a figure was measured and must not be required"
        )
    for kind in wrong:
        assert bob_loop._unsurfaced([{"kind": kind}], "It went up.", defs), (
            f"{kind} says a figure may be wrong and must still be required"
        )


def test_fingerprints_are_shaped_as_the_loop_reads_them():
    """
    must_convey is a list of GROUPS, all of which must match, any alternative
    within a group sufficing. A bare list of strings would look reasonable here
    and silently mean something else.
    """
    for kind, spec in fingerprints().items():
        if not isinstance(spec, dict) or "must_convey" not in spec:
            continue
        groups = spec["must_convey"]
        assert isinstance(groups, list) and groups, kind
        for group in groups:
            assert isinstance(group, list) and group, f"{kind}: {group!r}"
            assert all(isinstance(alt, str) and alt.strip() for alt in group), kind
            assert all(alt == alt.lower() for alt in group), (
                f"{kind}: fingerprints are matched against a lowercased answer, "
                f"so an alternative with capitals can never match: {group!r}"
            )


def test_a_notice_drawn_on_the_board_counts_as_surfaced():
    """
    UI rule 4 asks that a caveat be SURFACED, and its 2026-09-05 amendment says
    surfaced is not the same as spelled out. The room now draws every notice on
    the objects drawn from its read, above their figures and whole.

    Before this the loop required the ANSWER to convey every notice, so a
    caveat already on screen had to be reproduced in prose to pass the check.
    Measured over 51 real answers: one over data carrying four or more notices
    ran 386 words against 137 for one carrying none, almost all of it caveat.
    Bob was not being verbose — he was discharging a check.
    """
    from agent.loop import _drawn_on_the_board, _unsurfaced
    from tools._common import load_defs

    defs = load_defs()
    charted = [{
        "seq": 0, "tool": "get_purchase_plan",
        "meta": {"notice": {"kind": "multiple", "items": [
            {"kind": "supplier_coverage", "message": "..."},
            {"kind": "demand_suppressed_by_stockouts", "message": "..."},
        ]}},
    }]
    pending = [{"kind": "supplier_coverage", "message": "..."},
               {"kind": "demand_suppressed_by_stockouts", "message": "..."}]

    # An object draws read 0, so both notices are on screen.
    on_screen = _drawn_on_the_board([{"key": "draft", "seq": 0}], charted)
    assert on_screen == {"supplier_coverage", "demand_suppressed_by_stockouts"}
    assert _unsurfaced(pending, "Place the order.", defs, on_screen=on_screen) == []

    # NOTHING on the board draws it: still mandatory in prose, which is the
    # case the rule was written for.
    assert len(_unsurfaced(pending, "Place the order.", defs, on_screen=set())) == 2
    assert _drawn_on_the_board([], charted) == set()
    assert _drawn_on_the_board([{"key": "other", "seq": 9}], charted) == set()


def test_a_composed_shape_surfaces_the_notices_of_every_read_it_draws():
    """A spec names several reads through `seqs`; all of them count."""
    from agent.loop import _drawn_on_the_board

    charted = [
        {"seq": 0, "meta": {"notice": {"kind": "supplier_coverage", "message": "..."}}},
        {"seq": 3, "meta": {"notice": {"kind": "comparison_incomplete", "message": "..."}}},
    ]
    assert _drawn_on_the_board([{"key": "shape", "seqs": [0, 3]}], charted) == {
        "supplier_coverage", "comparison_incomplete"}


def test_a_fingerprint_is_never_satisfied_by_naming_the_column():
    """
    A fingerprint is a check on the ANSWER, and the answer is read by a person.
    Until 2026-09-13 `low_stock_not_operational` accepted the literal
    `warning_stock` as proof the caveat had been conveyed — so the one wording
    that breaks UI rule 4 was also the cheapest way to pass the gate.

    Held as a class rather than for that kind alone: no fingerprint anywhere
    may be satisfiable by a word only the schema uses.
    """
    from agent import loop as bob_loop
    from tools._common import load_defs

    internal = ("warning_stock", "is_cancelled", "change_pct", "baseline_status",
                "group_by", "rank_by", "top_n", "compare_to", "row_count",
                "source_table", "metrics.yaml")
    offenders = {}
    for kind, spec in fingerprints().items():
        if not isinstance(spec, dict) or "must_convey" not in spec:
            continue
        for group in spec["must_convey"]:
            hits = [alt for alt in group
                    if isinstance(alt, str) and alt.strip() in internal]
            if hits:
                offenders[kind] = hits
    assert not offenders, (
        "these fingerprints can be satisfied by naming something only the "
        f"schema knows about: {offenders}"
    )

    # And the answer that does it is still reported as unsurfaced.
    #
    # THE WORKED EXAMPLE MOVED, 2026-09-21. This was `low_stock_not_operational`,
    # which the owner reclassified `explains_only` that day — it says a section
    # is ABSENT, not that a figure is wrong — so `_unsurfaced` now skips it
    # before any fingerprint is consulted and it can no longer demonstrate
    # anything about fingerprints. The guarantee is unchanged and is the
    # `offenders` check above; what is shown here is that a notice still
    # REQUIRED in prose is not discharged by naming the schema.
    missing = bob_loop._unsurfaced(
        [{"kind": "negative_on_hand", "message": "..."}],
        "inventory.quantity_on_hand is below zero on 2,180 rows.",
        load_defs(),
    )
    assert missing

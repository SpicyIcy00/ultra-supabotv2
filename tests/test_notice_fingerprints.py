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
    for path in sorted(TOOLS.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            keys = [k.value if isinstance(k, ast.Constant) else None for k in node.keys]
            if "kind" not in keys or "message" not in keys:
                continue
            for name in _kind_names(node.values[keys.index("kind")]):
                found.setdefault(name, path.name)
    return found


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
# conveys it and prose that ignores it, in the register George actually writes.
# ---------------------------------------------------------------------------

PAIRS = {
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
}


@pytest.mark.parametrize("kind", sorted(PAIRS))
def test_a_fingerprint_accepts_prose_that_conveys_it(kind):
    from agent import loop as george_loop
    from tools._common import load_defs

    conveys, _ = PAIRS[kind]
    missing = george_loop._unsurfaced(
        [{"kind": kind, "message": "..."}], conveys, load_defs()
    )
    assert not missing, (
        f"{kind}: an answer that states the caveat is still reported as "
        f"unsurfaced, so it can never be satisfied"
    )


@pytest.mark.parametrize("kind", sorted(PAIRS))
def test_a_fingerprint_rejects_prose_that_ignores_it(kind):
    from agent import loop as george_loop
    from tools._common import load_defs

    _, ignores = PAIRS[kind]
    missing = george_loop._unsurfaced(
        [{"kind": kind, "message": "..."}], ignores, load_defs()
    )
    assert missing, (
        f"{kind}: an answer that drops the caveat passes the check, so the "
        f"caveat is no longer required of anyone"
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

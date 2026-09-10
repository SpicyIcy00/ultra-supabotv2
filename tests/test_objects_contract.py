"""
Pure tests for object views — a shop, a product, a supplier, an order, opened.

NO DATABASE. What makes an object view trustworthy is decidable from its
structure and its call construction:

  1. IT WRITES NO SQL. Every section is an existing vetted read, so a figure
     here means what it means everywhere else. A second implementation of "a
     shop's week" would be a second definition.
  2. NOTHING IS JOINED ACROSS SECTIONS, for the reason a workflow may not join
     its steps: a combination of two results is a definition, and definitions
     live in metrics.yaml.
  3. EVERY SECTION KEEPS ITS OWN RECEIPTS, and the view keeps none — an object
     mixes a week of sales with a stock snapshot, and one timestamp over both
     would be the freshest source vouching for the stalest.
  4. FOUR OUTCOMES PER SECTION, and they are distinct: available, empty,
     failed, unresolved. Collapsing them turns "I do not know which product you
     mean" into "this product has no sales".
  5. WHAT GEORGE THINKS IS NOT A SECTION, because the tool physically cannot
     reach it — and that boundary is the reason a replayed morning cannot show
     today's opinion.
"""

from __future__ import annotations

import ast
import inspect
import pathlib

import pytest

from agent import loop
from tools import objects
from tools._common import load_defs, req

DEFS = load_defs()
KINDS = req(DEFS, "objects.kinds")


# ---------------------------------------------------------------------------
# 1. No SQL, and every section is a real read
# ---------------------------------------------------------------------------

def test_the_object_tool_writes_no_sql():
    """
    Architecture rule 1, and here it is stronger than usual: there is no SQL at
    all, not even vetted SQL, because every figure already has a home.

    Read from the AST rather than by scanning the text, because the text
    explains itself — the module comments mention `connect()` to say why the
    parallelism is capped at four, and a regex over the source calls that a
    violation.
    """
    tree = ast.parse(pathlib.Path(objects.__file__).read_text(encoding="utf-8"))

    called: set[str] = set()
    literals: list[str] = []
    docstrings = {
        node.body[0].value
        for node in ast.walk(tree)
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef,
                             ast.ClassDef))
        and node.body and isinstance(node.body[0], ast.Expr)
        and isinstance(node.body[0].value, ast.Constant)
    }
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            fn = node.func
            called.add(fn.attr if isinstance(fn, ast.Attribute)
                       else getattr(fn, "id", ""))
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if node not in docstrings:
                literals.append(node.value)

    for forbidden in ("connect", "execute", "executemany", "cursor"):
        assert forbidden not in called, f"objects.py calls {forbidden}()"
    for text in literals:
        upper = text.upper()
        assert "SELECT " not in upper and " FROM " not in upper, (
            f"objects.py contains a SQL literal: {text[:60]!r}"
        )


def test_every_section_names_a_tool_that_exists_and_is_a_read():
    for kind, spec in KINDS.items():
        for section, decl in spec["sections"].items():
            tool = decl["reads"]
            assert tool in loop.TOOL_FUNCTIONS, (
                f"{kind}.{section} reads {tool}, which is not a read tool"
            )
            assert tool in objects.FUNCTIONS, (
                f"{kind}.{section} reads {tool}, which objects.py cannot call"
            )


def test_the_tool_is_the_one_george_gets():
    """
    One definition of what a shop is, not two. If the client called something
    else, a person tapping a shop and George reasoning about one would be
    looking at different numbers.
    """
    assert loop.TOOL_FUNCTIONS["get_object"] is objects.get_object


def test_the_kinds_the_model_is_offered_are_the_declared_ones():
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == "get_object")
    assert schema["input_schema"]["properties"]["kind"]["enum"] == sorted(KINDS)
    assert schema["input_schema"]["required"] == ["kind", "name"]


# ---------------------------------------------------------------------------
# 2 & 3. Nothing joined, and receipts stay per section
# ---------------------------------------------------------------------------

def test_the_view_carries_no_timestamp_of_its_own():
    """
    An object read has no single moment. A week of sales and a stock snapshot
    were read at different times against sources of different ages, so one
    timestamp over the whole view would lend the freshest source's credibility
    to the stalest — the mistake tools/brief.py already refuses.
    """
    source = inspect.getsource(objects.get_object)
    assert '"snapshot_timestamp": None' in source


def test_no_arithmetic_happens_across_sections():
    """
    The moment two results are combined the combination is a definition
    (architecture rule 6's reasoning). Sections are appended and never read
    from each other — with ONE deliberate exception, resolving which product
    was meant, which is identity and not arithmetic.
    """
    source = inspect.getsource(objects.get_object)
    for forbidden in ("sum(s[", "+ sections[", "sections[0][\"rows\"][0][\"value\"]"):
        assert forbidden not in source


def test_resolving_which_object_is_not_the_same_as_joining_figures():
    """The exception above, stated so it cannot quietly widen."""
    doc = objects._resolve_product.__doc__
    assert "NOT COMBINING FIGURES" in doc
    assert "identity" in doc.lower()


def test_each_section_keeps_the_call_behind_it():
    """
    A section that cannot say what produced it cannot be re-run, pinned or
    checked. The call travels with the rows.
    """
    source = inspect.getsource(objects._section)
    assert '"call": call' in source


# ---------------------------------------------------------------------------
# 4. The four outcomes
# ---------------------------------------------------------------------------

def test_a_failed_section_does_not_take_the_object_with_it():
    """Half a shop is worth more than an error page."""
    section = objects._section("shelf", "what is out of stock", {"tool": "x"},
                               lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    assert section["state"] == "failed"
    assert "boom" in section["reason"]
    assert section["rows"] == []


def test_empty_and_failed_are_different_states():
    empty = objects._section("shelf", "s", {}, lambda: {"rows": [], "meta": {}})
    full = objects._section("shelf", "s", {}, lambda: {"rows": [{"a": 1}], "meta": {}})
    assert empty["state"] == "empty"
    assert full["state"] == "available"


def test_an_unknown_shop_is_refused_rather_than_returned_empty():
    """
    An empty view for a typo reads as "this shop sold nothing", which is a
    false statement made out of a misspelling.
    """
    with pytest.raises(ValueError) as caught:
        objects._resolve_shop("Rockwel", DEFS)
    assert "Rockwell" in str(caught.value)


def test_an_unknown_kind_is_refused_with_the_real_ones_named():
    with pytest.raises(ValueError) as caught:
        objects.get_object("planet", "Mars")
    assert "shop" in str(caught.value)


def test_an_object_with_no_name_is_refused():
    with pytest.raises(ValueError):
        objects.get_object("shop", "  ")


def test_an_ambiguous_product_is_not_guessed_at():
    """
    SKUs are not unique and a name is a substring match, so several products
    can answer to one word. Picking one would show somebody another product's
    figures under the name they typed.
    """
    source = inspect.getsource(objects._resolve_product)
    assert "object_ambiguous" in source
    assert "AMBIGUITY IS NOT RESOLVED BY GUESSING" in source

    body = inspect.getsource(objects.get_object)
    # And the sections that depended on it say so rather than vanishing.
    assert '"state": "unresolved"' in body


# ---------------------------------------------------------------------------
# 5. What George thinks is composed on top, never a section
# ---------------------------------------------------------------------------

def test_a_belief_is_not_a_section_of_any_kind():
    for kind, spec in KINDS.items():
        assert "view" not in spec["sections"]
        assert "belief" not in spec["sections"]
    assert bool(req(DEFS, "objects.belief_is_composed_on_top"))


def test_the_tool_cannot_reach_the_george_schema():
    """
    Not a policy — a fact about the role the tools run on, and the reason a
    replay of a past morning can never show today's opinion.
    """
    source = inspect.getsource(objects)
    assert "george.beliefs" not in source
    assert "belief" not in source.lower().split("belief_is_composed")[0].replace(
        "belief_is_composed_on_top", "")


# ---------------------------------------------------------------------------
# Bounds, and the thin kinds
# ---------------------------------------------------------------------------

def test_sections_are_bounded_and_the_bound_is_declared():
    limit = int(req(DEFS, "objects.max_sections"))
    for kind, spec in KINDS.items():
        assert len(spec["sections"]) <= limit, f"{kind} declares too many sections"


def test_the_thin_kinds_say_why_and_what_would_change_it():
    """
    An absence reads as George being bad at something. Supplier and order sit
    on frozen imports, and that is recorded rather than left to look like an
    oversight.
    """
    thin = [k for k, spec in KINDS.items() if spec.get("thin_because")]
    assert set(thin) == {"supplier", "order"}
    for kind in thin:
        reason = req(DEFS, f"objects.thin_reasons.{KINDS[kind]['thin_because']}")
        assert "frozen" in reason or "stale" in reason
        assert "received" in reason


def test_a_thin_kind_carries_its_notice():
    source = inspect.getsource(objects.get_object)
    assert "object_view_thin" in source


# ---------------------------------------------------------------------------
# The regression this work uncovered
# ---------------------------------------------------------------------------

def test_a_compared_read_binds_its_filters_to_both_windows():
    """
    THE BUG THIS FEATURE FOUND, held so it cannot come back.

    get_sales built `base_params` — the baseline window's parameters — BEFORE
    the SKU resolution added `sku_product_ids` to `params`. So every
    get_sales(filters={'sku': ...}, compare_to=...) raised
    "query parameter missing: sku_product_ids" from psycopg, for a VALID sku as
    much as an unknown one. "How did Aji Mix do against last week" could not be
    answered at all, and nothing noticed until an object view made that exact
    call.

    The fix is positional: base_params is built where it is USED, after every
    filter has finished contributing. This asserts the ordering rather than the
    behaviour, because the behaviour needs a database and the ordering is the
    whole of the bug.
    """
    from tools import sales

    source = inspect.getsource(sales.get_sales)
    built = source.index("base_params = {**params, **base_win}")
    resolved = source.index('params["sku_product_ids"] = pids')
    assert built > resolved, (
        "base_params is built before the sku filter contributes to params; a "
        "compared read with a sku filter will bind the wrong window"
    )


def test_a_refusal_is_not_a_fault():
    """
    A tool raising ValueError is DECLINING to produce a misleading number —
    asking a warehouse for its net sales — and that is a real answer with a
    reason somebody can read. Anything else is a fault. One word for both would
    file "AJI BARN is a warehouse" beside "the database is down".
    """
    refused = objects._section("week", "s", {}, lambda: (_ for _ in ()).throw(
        ValueError("Unknown store 'AJI BARN'.")))
    broken = objects._section("week", "s", {}, lambda: (_ for _ in ()).throw(
        RuntimeError("connection reset")))
    assert refused["state"] == "refused"
    assert broken["state"] == "failed"
    # A refusal keeps the tool's own sentence, which already says what to do.
    assert refused["reason"] == "Unknown store 'AJI BARN'."


def test_a_warehouse_is_never_asked_for_its_sales():
    """
    AJI BARN holds stock and records no transactions. Asking anyway produced
    five refusals in a row, which reads as a broken screen rather than as a
    fact about a warehouse. The definitions already draw the line between
    trading and not, so the tool reads it instead of being told no five times.
    """
    source = inspect.getsource(objects.get_object)
    assert "if not trades:" in source
    assert "object_has_no_sales" in source

    doc = objects._resolve_shop.__doc__
    assert "warehouse" in doc and "refusal" in doc.lower()


def test_the_warehouse_notice_is_fingerprinted_like_every_other():
    fingerprints = req(DEFS, "notices")
    assert "object_has_no_sales" in fingerprints
    assert fingerprints["object_has_no_sales"]["must_convey"]


def test_the_object_view_does_not_overload_the_window_key():
    """
    meta.window is a STRUCTURED window everywhere else — {kind, name, start,
    end} — and both the result vocabulary and george_recall read it as one.
    An object view has no single window (each section carries its own), so
    putting a bare preset string there was a type collision on a conventional
    key, and it took down the ask endpoint for every conversation that had
    opened an object.
    """
    source = inspect.getsource(objects.get_object)
    assert '"window_preset": window' in source
    assert '"window": window,' not in source


def test_an_object_read_cannot_back_a_tile():
    """
    An object read returns SECTIONS — each a read of its own with its own
    receipts — for the same reason view_page returns replayed pins. It is a way
    IN to a thing, not a figure about it, so an object drawn over it would have
    to pick a section and would render the section list instead.

    Live, this surfaced as "seikyo-history: read 0 has no row for 'Seikyo
    SEK001'": true, and useless, because the rows are sections and none of them
    is a subject. The refusal now names the way round.
    """
    from agent import compose, composite_tools

    assert "get_object" in composite_tools.NOT_COMPOSABLE_READS

    # The loop marks it not-a-read, whatever else is true of it.
    source = inspect.getsource(loop.run)
    assert "NOT_COMPOSABLE_READS" in source

    # And the refusal explains rather than merely declining.
    call = {"tool": "get_object", "is_read": False, "rows": []}
    try:
        compose._read({0: call}, 0)
    except compose.Rejected as refused:
        assert "SECTIONS" in str(refused)
        assert "compose over that" in str(refused)
    else:  # pragma: no cover
        raise AssertionError("an object read was accepted as a tile's backing")

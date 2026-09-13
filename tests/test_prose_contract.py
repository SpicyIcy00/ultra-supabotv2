"""
What George says to a person, and what he says to himself.

UI System V2 Stage 2. Three boundaries, none of which existed before
2026-09-08, and all three had leaked the same way: text written for the MODEL
was being rendered to the READER.

  1. A NOTICE HAS TWO AUDIENCES. `message` is the caveat, for the reader;
     `guidance` is what to do about it, for the model, and is never rendered.
     The comparison notice used to end "Say which, and why, rather than
     reporting the comparison as whole; change_pct is null on those rows and
     must not be filled in" — inside `message`, which NoticeBanner draws above
     the figure. Somebody asking how a store did was shown instructions
     addressed to somebody else, naming a column they have never heard of.

  2. THE ANSWER IS IN BUSINESS LANGUAGE. Rules 6, 12 and 16 teach the model
     `top_n`, `group_by`, `compare_to`, `baseline_status` and `metrics.yaml`
     so it can choose the right call, and nothing told it not to answer in
     them. Rule 17 does.

  3. PROVENANCE DESCENDS. The caveat and the read time are always visible; the
     citation, the source table and the filters are one tap down.

NOTHING HERE WEAKENS `must_convey`. Those fingerprints are checked against the
ANSWER, never against the message, so moving text between notice fields cannot
affect them — and the last test in this file asserts every kind still has the
fingerprint it had.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

pytest.importorskip("yaml")

import yaml                                                            # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_LOOP = _ROOT / "agent" / "loop.py"
_DEFS = _ROOT / "definitions" / "metrics.yaml"
_NOTICE_BANNER = _ROOT / "frontend" / "src" / "components" / "george" / "NoticeBanner.tsx"
_RECEIPTS = _ROOT / "frontend" / "src" / "components" / "george" / "ReceiptsBlock.tsx"
# scopeLine lives apart from the component, as pinShape does: a decision the
# suite can hold without a DOM, and a component file that also exports helpers
# breaks fast refresh.
_RECEIPT_SHAPE = _ROOT / "frontend" / "src" / "components" / "george" / "receiptShape.ts"

# Every module that builds a notice dict.
_NOTICE_SOURCES = sorted((_ROOT / "tools").glob("*.py")) + [
    _ROOT / "agent" / "composite_tools.py",
]


def _defs() -> dict:
    return yaml.safe_load(_DEFS.read_text(encoding="utf-8"))


def _ts_source(path: Path) -> str:
    text = re.sub(r"/\*[\s\S]*?\*/", "", path.read_text(encoding="utf-8"))
    return re.sub(r"^\s*//.*$", "", text, flags=re.MULTILINE)


# ---------------------------------------------------------------------------
# 1. A notice message is for the reader
# ---------------------------------------------------------------------------

# Words that only ever address the model: an instruction about what to say or
# what not to compute, a tool argument, a result field, a column, or a file
# path.
#
# The column names joined this on 2026-09-13. `warning_stock` reached an answer
# whole, through the forced-caveat path — a person asking what was running low
# at Greenhills was handed "inventory.warning_stock is NULL on 100% of rows" in
# the caveat above the figures. A column is the same leak as a tool argument
# and belongs in the same list.
_MODEL_DIRECTED = re.compile(
    r"\b(say which|say so|say that|do not|don't|must not|"
    r"never (add|blend|compare|treat|report|fill|sum)|"
    r"change_pct|group_by|rank_by|top_n|compare_to|baseline_status|"
    r"warning_stock|is_cancelled|"
    r"meta\.|row_count|metrics\.yaml|definitions/)",
    re.I,
)


def _string_parts(node: ast.AST) -> str:
    """Every string literal reachable in an expression, joined."""
    return " ".join(
        n.value for n in ast.walk(node) if isinstance(n, ast.Constant) and isinstance(n.value, str)
    )


def _notice_dicts():
    """(path, lineno, kind, message, has_guidance) for every notice built."""
    for path in _NOTICE_SOURCES:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Dict):
                continue
            keys = [k.value for k in node.keys if isinstance(k, ast.Constant)]
            if "kind" not in keys or "message" not in keys:
                continue
            kind = message = None
            for k, v in zip(node.keys, node.values):
                if not isinstance(k, ast.Constant):
                    continue
                if k.value == "kind":
                    kind = _string_parts(v)
                elif k.value == "message":
                    message = _string_parts(v)
            yield path, node.lineno, kind, message or "", "guidance" in keys


def test_there_are_notices_to_check():
    # A scan that finds nothing passes vacuously, which is the one way this
    # file could stop meaning anything without failing.
    assert len(list(_notice_dicts())) >= 20


def test_no_notice_message_addresses_the_model():
    offenders = []
    for path, lineno, kind, message, _ in _notice_dicts():
        hits = sorted({m.group(0).lower() for m in _MODEL_DIRECTED.finditer(message)})
        if hits:
            offenders.append(f"{path.name}:{lineno} {kind!r} -> {hits}")
    assert not offenders, (
        "A notice `message` is rendered above the figure it qualifies. These "
        "carry text written for the model; move it to `guidance`, which "
        "reaches the model in the tool result and is never rendered "
        "(metrics.yaml notices.contract):\n  " + "\n  ".join(offenders)
    )


# Every metrics.yaml value that a notice `message` interpolates. The AST scan
# above reads string LITERALS, so none of these is visible to it — the text a
# person actually reads is assembled at runtime from a literal and one of
# these. Listed rather than discovered, because the interpolation goes through
# a local variable and following that in the AST would be a worse test than a
# list somebody has to extend when they add one.
#
# A `*` segment means every key at that level.
_READER_TEXT_PATHS = (
    "inventory.low_stock_blocked_reason",           # tools/inventory.py  low_stock_not_operational
    "objects.thin_reasons.*",                       # tools/objects.py    object_view_thin
    "metrics.*.redefinition_note",                  # tools/sales.py      metric_redefined
)

# Reader prose does not contain snake_case, and does not cite a file. Every
# identifier that leaked into a message this way — warning_stock,
# purchase_orders, stock_transfers, received_qty, transaction_count — is caught
# by that one property, where a list of known column names would have to be
# extended for each new leak.
#
# `_MODEL_DIRECTED` is deliberately NOT applied to these. It catches imperative
# instructions ("do not", "say which"), which is right for a message written in
# the file and wrong here: "these counts do not sum to the overall transaction
# count" is a fact about baskets, in the reader's own English.
_SNAKE_CASE = re.compile(r"\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b\w+\.(?:yaml|yml|py|sql)\b")


def _resolve(node, parts: tuple[str, ...], path: str = ""):
    """Every (path, value) a dotted path with `*` segments reaches."""
    if not parts:
        yield path, node
        return
    head, rest = parts[0], parts[1:]
    if not isinstance(node, dict):
        return
    for key in (node.keys() if head == "*" else [head]):
        if key in node:
            yield from _resolve(node[key], rest, f"{path}.{key}" if path else str(key))


def test_no_yaml_value_a_notice_message_interpolates_names_a_column():
    """
    THE CLASS BEHIND THE 2026-09-13 LEAK, held as a class.

    `_forced_caveats` appends a notice `message` to the answer VERBATIM, and
    the room draws every message above the figure it qualifies. So a value
    interpolated into a message is answer text whether or not George ever
    writes it himself — and three of them named tables and columns:

        inventory.low_stock_blocked_reason  "inventory.warning_stock is NULL…"
        objects.thin_reasons.*              "purchase_orders and stock_transfers…"
        metrics.*.redefinition_note         "…the overall transaction_count"

    The first reached a real answer, through the forced-caveat path, on a
    question about what was running low at Greenhills.
    """
    defs = _defs()
    offenders = {}
    for spec in _READER_TEXT_PATHS:
        for path, value in _resolve(defs, tuple(spec.split("."))):
            if not isinstance(value, str):
                continue
            hits = sorted(set(_SNAKE_CASE.findall(value)))
            if hits:
                offenders[path] = hits
    assert not offenders, (
        "These metrics.yaml values are interpolated into a notice `message`, "
        "which a person reads above the figure and which the loop can append "
        "to an answer whole. They name something only the schema knows "
        f"about:\n  {offenders}"
    )


def test_that_scan_would_have_caught_the_leak_it_was_written_for():
    # A guard on the guard: the property has to fire on the text that shipped.
    assert _SNAKE_CASE.findall("inventory.warning_stock is NULL on 100% of rows") \
        == ["warning_stock"]
    assert _SNAKE_CASE.findall("purchase_orders and stock_transfers were loaded") \
        == ["purchase_orders", "stock_transfers"]
    # ...and stay silent on the sentences that replaced it.
    assert not _SNAKE_CASE.findall(
        "the low-stock level has never been set on any product")


def test_a_value_a_notice_message_interpolates_is_reader_text_too():
    """
    THE HOLE THE SCAN ABOVE HAS, and the defect that found it (2026-09-13).

    `_string_parts` reads string LITERALS out of the AST. The low-stock notice
    does not write its reason; it interpolates one from metrics.yaml, so the
    scan saw `"Low-stock thresholds are not set…"` and never saw the value that
    lands in the middle of it. That value was
    `inventory.warning_stock is NULL on 100% of rows`, and it reached an answer
    verbatim: George's own wording missed the fingerprint, the caveat was
    FORCED, and `_forced_caveats` appends a notice `message` unchanged.

    So the yaml value is checked here directly. The schema's version of the
    same fact is still recorded — as `detail`, which reaches the model through
    `guidance` and is never rendered.
    """
    inventory = _defs()["inventory"]
    reason = inventory["low_stock_blocked_reason"]
    detail = inventory["low_stock_blocked_detail"]
    assert not _MODEL_DIRECTED.search(reason), (
        f"inventory.low_stock_blocked_reason is interpolated into a notice "
        f"message a person reads, and into any caveat forced into an answer: "
        f"{reason!r}"
    )
    assert _MODEL_DIRECTED.search(detail), (
        "the technical form of the reason must still be recorded somewhere — "
        "low_stock_blocked_detail is where it goes"
    )


def test_the_forced_caveat_carries_the_message_and_never_the_guidance():
    """
    The path that turned a notice into prose. It appends `message` — so a
    message is answer text whether or not George ever writes it himself.
    """
    from agent.loop import _forced_caveats

    out = _forced_caveats([{"kind": "k", "message": "The level was never set.",
                            "guidance": "Populate inventory.warning_stock."}])
    assert "The level was never set." in out
    assert "warning_stock" not in out


def test_the_notices_that_needed_guidance_have_it():
    # The eleven that were split on 2026-09-08. Named so that deleting the
    # guidance and leaving the message alone shows up as a failure rather than
    # as a silent loss of the instruction the model relies on.
    with_guidance = {kind for _, _, kind, _, has in _notice_dicts() if has}
    for kind in ("comparison_incomplete", "ambiguous_sku", "duplicate_skus_in_result",
                 "low_stock_not_operational", "two_bases_not_summed",
                 "bases_not_comparable", "page_context_partial",
                 "page_context_truncated"):
        assert kind in with_guidance, f"{kind} lost its model guidance"


def test_guidance_never_reaches_the_client():
    source = _LOOP.read_text(encoding="utf-8")
    frame = source.split('yield _sse("notice"', 1)[1].split("\n", 1)[0]
    assert "guidance" not in frame, "the notice frame must carry kind and message only"
    assert '"kind"' in frame and '"message"' in frame


def test_the_contract_is_recorded_in_the_definitions():
    contract = _defs()["notices"]["contract"]
    assert contract["message_audience"] == "reader"
    assert contract["guidance_audience"] == "model"
    assert contract["guidance_never_rendered"] is True
    assert contract["must_convey_checks_the_answer_not_the_message"] is True


# ---------------------------------------------------------------------------
# 2. The answer is in business language
# ---------------------------------------------------------------------------


def _rule_17() -> str:
    source = _LOOP.read_text(encoding="utf-8")
    start = source.index("The reader does not know your tools exist")  # rule 12 since 2026-09-12
    # The numbered rules end where the built sections are appended. Keyed on
    # the closing quotes rather than on which section comes first, so adding a
    # section in front of INVESTIGATING does not silently empty this slice.
    return source[start : source.index('""" + ', start)]


def test_the_prompt_forbids_internal_vocabulary_in_an_answer():
    rule = _rule_17()
    for word in ("get_sales", "group_by", "rank_by", "top_n", "compare_to",
                 "change_pct", "baseline_status", "metrics.yaml"):
        assert word in rule, f"rule 17 does not name {word}"


def test_rule_17_comes_after_the_rule_that_teaches_the_vocabulary():
    # Rule 16 is where `compare_to` and `baseline_status` are taught. The
    # prohibition has to read as a qualification of it, not as a contradiction
    # somebody meets first.
    source = _LOOP.read_text(encoding="utf-8")
    assert source.index("A figure made from figures comes from a tool") < source.index("The reader does not know your tools exist")


def test_rule_17_keeps_the_caveat_mandatory():
    # The failure mode of a rule like this is a model that drops a caveat
    # because the caveat sounded technical. Rule 3, rule 9 and the notice
    # fingerprints all still stand, and the rule says so in its own words.
    rule = _rule_17()
    assert "NOT A LICENCE TO BE VAGUE" in rule
    assert "caveat" in rule


def test_rule_17_allows_answering_a_question_about_method():
    rule = _rule_17()
    assert "EXCEPTION" in rule


# ---------------------------------------------------------------------------
# 3. Provenance descends
# ---------------------------------------------------------------------------


def test_the_caveat_itself_is_never_behind_a_disclosure():
    # UI rule 4, unchanged and non-negotiable. What moved is the CITATION.
    banner = _ts_source(_NOTICE_BANNER)
    body = banner.split("export function NoticeBanner(", 1)[1]
    assert "{n.message}" in body
    # The message is rendered directly in the banner, not inside the source
    # toggle's conditional.
    assert "n.source && <NoticeSource" in body


def test_the_citation_is_one_tap_down():
    banner = _ts_source(_NOTICE_BANNER)
    assert "function NoticeSource(" in banner
    source_block = banner.split("function NoticeSource(", 1)[1].split("\nexport function", 1)[0]
    assert "aria-expanded" in source_block
    assert "Where this comes from" in source_block


def test_the_receipts_line_leads_with_scope_and_not_a_table_name():
    receipts = _ts_source(_RECEIPTS)
    assert "export function scopeLine(" in _ts_source(_RECEIPT_SHAPE)
    collapsed = receipts.split("aria-expanded={open}", 1)[1].split("</button>", 1)[0]
    assert "scopeLine(meta)" in collapsed
    assert "source_table" not in collapsed, (
        "the always-visible receipts line named a database table under every "
        "figure in the app"
    )


def test_the_read_time_is_still_always_visible():
    # UI rule 6: no number displays without a timestamp. This one may never
    # move behind a disclosure, whatever else does.
    receipts = _ts_source(_RECEIPTS)
    collapsed = receipts.split("aria-expanded={open}", 1)[1].split("</button>", 1)[0]
    assert "ago(meta.snapshot_timestamp)" in collapsed


def test_the_scope_line_is_built_from_meta_and_never_from_prose():
    shape = _ts_source(_RECEIPT_SHAPE)
    for field in ("meta.metric_label", "meta.window", "meta.comparison"):
        assert field in shape, f"the scope line does not read {field}"
    # A result with no window gets no window, rather than a guessed one.
    assert "SCOPE_UNKNOWN" in shape and "Scope not recorded" in shape


# ---------------------------------------------------------------------------
# 4. Nothing above weakened the notice guarantee
# ---------------------------------------------------------------------------


def test_every_notice_kind_still_has_its_fingerprint():
    notices = _defs()["notices"]
    kinds = {kind for _, _, kind, _, _ in _notice_dicts() if kind}
    # `contract` is documentation, not a kind, and no tool emits it.
    assert "contract" not in kinds
    for kind in kinds:
        # Dynamic kinds (an f-string or a conditional) are not literals and are
        # covered by test_notice_fingerprints, which reads them differently.
        if not kind or " " in kind:
            continue
        spec = notices.get(kind)
        if spec is None:
            continue
        assert isinstance(spec, dict) and "must_convey" in spec, (
            f"{kind} lost its must_convey fingerprint"
        )

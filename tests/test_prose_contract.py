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
# what not to compute, a tool argument, a result field, or a file path.
_MODEL_DIRECTED = re.compile(
    r"\b(say which|say so|say that|do not|don't|must not|"
    r"never (add|blend|compare|treat|report|fill|sum)|"
    r"change_pct|group_by|rank_by|top_n|compare_to|baseline_status|"
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
    start = source.index("17. THE READER DOES NOT KNOW")
    return source[start : source.index('""" + INVESTIGATING_SECTION', start)]


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
    assert source.index("16. A figure made from other") < source.index("17. THE READER")


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

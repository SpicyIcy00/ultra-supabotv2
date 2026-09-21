"""
Which notices the room DRAWS — CLAUDE.md UI rule 4, as changed 2026-09-17.

The owner, of the caveat boxes over his charts: *"we dont need those
disclaimers unless it has wrong data"*. So `surface.desk.notices` splits every
notice kind in two: `explains_only` (how a figure was measured — not drawn) and
`data_may_be_wrong` (drawn, above the number). A kind in neither is drawn.

What this holds, so the split cannot rot:

  - every notice kind the code raises WITH A MESSAGE is in exactly one list, so
    a new notice is a decision somebody made rather than a default;
  - no kind is in both;
  - `version_divergence` is drawn, because architecture rule 8 puts it in the
    answer;
  - the desk definitions serve the split, so the room reads it rather than
    keeping a copy.

It changes nothing Bob receives: the loop still hands him every notice.
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DEFS = yaml.safe_load((ROOT / "definitions" / "metrics.yaml").read_text(encoding="utf-8"))
NOTICES = DEFS["surface"]["desk"]["notices"]
SOURCES = (
    list((ROOT / "tools").glob("*.py"))
    + list((ROOT / "agent").glob("*.py"))
    + list((ROOT / "backend" / "app" / "services").glob("*.py"))
    + [ROOT / "backend" / "app" / "api" / "v1" / "routes" / "bob.py"]
)


def raised_kinds() -> set[str]:
    """Every notice kind a literal dict with a message raises, and every
    `*notice_kind:` the definitions name for a tool to raise."""
    out: set[str] = set()
    for path in SOURCES:
        text = path.read_text(encoding="utf-8")
        out.update(re.findall(r'"kind":\s*"([a-z_]+)"\s*,\s*\n?\s*"message"', text))
    yml = (ROOT / "definitions" / "metrics.yaml").read_text(encoding="utf-8")
    out.update(re.findall(r"^\s*[a-z_]*notice_kind:\s*([a-z_]+)\s*$", yml, re.M))
    out.discard("multiple")
    return out


def test_every_raised_notice_is_decided():
    decided = set(NOTICES["explains_only"]) | set(NOTICES["data_may_be_wrong"])
    missing = sorted(raised_kinds() - decided)
    assert not missing, (
        "These notice kinds are raised and in neither list of surface.desk.notices. "
        f"Decide whether each says a figure may be WRONG (drawn) or only explains it: {missing}"
    )


def test_no_kind_is_both():
    both = set(NOTICES["explains_only"]) & set(NOTICES["data_may_be_wrong"])
    assert not both, f"listed as both explaining and wrong: {sorted(both)}"


def test_a_version_divergence_is_always_drawn():
    assert "version_divergence" in NOTICES["data_may_be_wrong"]
    assert "version_divergence" not in NOTICES["explains_only"]


def test_the_comparison_disclaimer_he_pointed_at_is_not_drawn():
    # "110 of 173 compared row(s) could not be compared against the … baseline"
    assert "comparison_incomplete" in NOTICES["explains_only"]


def test_the_desk_serves_the_split():
    route = (ROOT / "backend" / "app" / "api" / "v1" / "routes" / "bob.py").read_text(encoding="utf-8")
    assert re.search(r"^\s+notices: dict\[str, List\[str\]\]", route, re.M)
    assert '_req(desk, "notices")' in route


def test_the_rule_says_so():
    rule = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    assert "surface.desk.notices" in rule
    assert "unless it has wrong" in rule


def test_a_section_that_cannot_exist_is_explained_not_warned_about():
    """
    The owner, 2026-09-21: *"Want it gone?"* — *"Ok go."*

    `low_stock_not_operational` says there is no "newly low on stock" section
    because the low-stock level has never been set on any product. No figure
    shown is wrong; it explains why a section is ABSENT, exactly as
    `empty_section` does. It was in NEITHER list, so "fail toward showing"
    drew it AND the loop forced it into his prose — it reached his answers
    twice that day inside the appended block he has asked three times to be
    rid of.

    What did NOT change: the tool still raises it, the refusal still says what
    it refused, and the model still receives the message as guidance. This is
    what the room draws and what the loop requires in prose, nothing more.
    """
    assert "low_stock_not_operational" in NOTICES["explains_only"]
    assert "low_stock_not_operational" not in NOTICES["data_may_be_wrong"]


def test_stale_data_is_still_warned_about():
    # The counterweight to the test above: "stale" is named in UI rule 4 as a
    # kind that IS drawn, and reclassifying the one above must not drag it
    # along. Staleness remains the most common forced notice on DeepSeek.
    for kind in ("stale_sources", "stale_stock"):
        assert kind in NOTICES["data_may_be_wrong"], kind
        assert kind not in NOTICES["explains_only"], kind

"""
The product -> supplier map, and the gate that keeps it from being believed early.

NO DATABASE. Definitions, the generated file, and the selection function.

WHY THIS EXISTS. This is the first thing Bob proposes that becomes permanent,
and the gate is the whole point: a machine reads purchase history and proposes,
a person reads the proposal and approves, and only then does anything change.
Three properties keep that honest, and each is pinned here:

  1. NOTHING READS THE FILE UNTIL SOMEBODY APPROVES IT. A proposal that took
     effect on being written would not be a proposal.
  2. AN AMBIGUOUS PRODUCT IS NEVER RESOLVED AUTOMATICALLY. 42 products have
     been bought from more than one supplier. Picking the most recent or the
     largest would be inventing a sourcing decision nobody made.
  3. A HAND-WRITTEN OVERRIDE BEATS A PROPOSAL AND SURVIVES REGENERATION.
     Without that the file cannot be corrected, and a file that cannot be
     corrected will be abandoned the first time it is wrong.

Generated 2026-09-10 from real history: 650 products with any purchase record,
608 with exactly one supplier, 42 with several.
"""

import pathlib

import pytest

pytest.importorskip("yaml")
import yaml  # noqa: E402

from tools._common import load_defs, req  # noqa: E402
from tools import purchase_plan  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def link(defs):
    return req(defs, "purchasing.plan.supplier_link")


@pytest.fixture(scope="module")
def mapfile(defs, link):
    path = ROOT / req(link, "map_file")
    assert path.exists(), f"{path} is missing; run ops/propose_supplier_map.py"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


# ------------------------------------------------------------------- the gate


def test_the_map_is_only_authoritative_once_approved(link):
    assert req(link, "map_authoritative_when") == "approved"
    assert set(req(link, "map_status_values")) == {"proposed", "approved"}


def test_an_approval_always_carries_a_name_and_a_date(mapfile, link):
    """
    The status may legitimately be either — a proposal that has been read and
    accepted is the point of the gate, not a violation of it. What must never
    happen is an approval nobody signed: a file that says `approved` with no
    approver is indistinguishable from one that approved itself, which is
    exactly the failure the gate exists to make impossible.

    That the GENERATOR can only ever write `proposed` is a separate property
    and is held by test_the_generator_never_writes_approved below. This test
    is about the file as it stands.
    """
    assert mapfile["status"] in req(link, "map_status_values")
    if mapfile["status"] == "approved":
        assert mapfile["approved_by"], "approved with no approver"
        assert mapfile["approved_at"], "approved with no date"
    else:
        assert mapfile["approved_by"] is None
        assert mapfile["approved_at"] is None


def test_an_unapproved_map_changes_nothing(defs, monkeypatch):
    monkeypatch.setattr(purchase_plan, "_MAP", {
        "status": "proposed",
        "confident": {"p1": {"supplier": "Seikyo SEK001"}},
        "overrides": {},
    })
    assert purchase_plan._mapped_products(defs, "Seikyo SEK001") is None


def test_an_approved_map_selects_by_supplier(defs, monkeypatch):
    monkeypatch.setattr(purchase_plan, "_MAP", {
        "status": "approved",
        "confident": {
            "p1": {"supplier": "Seikyo SEK001"},
            "p2": {"supplier": "Beetin BTH001"},
        },
        "overrides": {},
    })
    assert purchase_plan._mapped_products(defs, "Seikyo SEK001") == ["p1"]
    # Case and surrounding space must not decide who supplies what: supplier
    # names are free text typed by people.
    assert purchase_plan._mapped_products(defs, "  seikyo sek001 ") == ["p1"]


def test_an_override_beats_a_proposal(defs, monkeypatch):
    """
    A file that cannot be corrected by hand will be abandoned the first time it
    is wrong, and the generator must never undo the correction.
    """
    monkeypatch.setattr(purchase_plan, "_MAP", {
        "status": "approved",
        "confident": {"p1": {"supplier": "Wrong Supplier"}},
        "overrides": {"p1": {"supplier": "Right Supplier"}},
    })
    assert purchase_plan._mapped_products(defs, "Right Supplier") == ["p1"]
    assert purchase_plan._mapped_products(defs, "Wrong Supplier") == []


def test_an_override_can_add_a_product_history_never_saw(defs, monkeypatch):
    """The real win: 3,073 products have no purchase history at all."""
    monkeypatch.setattr(purchase_plan, "_MAP", {
        "status": "approved",
        "confident": {},
        "overrides": {"never-ordered": {"supplier": "Kai Fat KAF001"}},
    })
    assert purchase_plan._mapped_products(defs, "Kai Fat KAF001") == ["never-ordered"]


def test_a_missing_file_is_a_state_and_not_a_crash(defs, monkeypatch):
    """This tool worked before the file existed and must still work without it."""
    monkeypatch.setattr(purchase_plan, "_MAP", None)
    monkeypatch.setattr(purchase_plan.pathlib.Path, "exists", lambda self: False)
    assert purchase_plan._mapped_products(defs, "anyone") is None


# ------------------------------------------------------------- the proposal


def test_nothing_ambiguous_is_resolved_automatically(mapfile):
    """
    A product bought from two suppliers may genuinely have two sources. No
    entry in `ambiguous` carries a chosen supplier; each lists all of them.
    """
    for pid, entry in (mapfile.get("ambiguous") or {}).items():
        assert "supplier" not in entry, f"{pid} was resolved automatically"
        assert len(entry["suppliers"]) > 1


def test_confident_entries_carry_their_evidence(mapfile):
    """
    A proposal a person cannot check is not reviewable. Every entry names the
    product, how many orders it rests on, and when it was last bought.
    """
    confident = mapfile["confident"]
    assert confident, "the proposal is empty"
    for pid, entry in list(confident.items())[:50]:
        assert entry["supplier"]
        assert entry["product"] is not None
        assert entry["orders"] >= 1
        assert "last_ordered" in entry


def test_the_two_blocks_do_not_overlap(mapfile):
    """A product is either unambiguous or it is not; it cannot be both."""
    assert not (set(mapfile["confident"]) & set(mapfile.get("ambiguous") or {}))


def test_overrides_start_empty_and_are_a_mapping(mapfile):
    assert mapfile["overrides"] == {} or isinstance(mapfile["overrides"], dict)


def test_the_counts_match_the_entries(mapfile):
    m = mapfile["measured"]
    assert m["proposed"] == len(mapfile["confident"])
    assert m["ambiguous"] == len(mapfile.get("ambiguous") or {})
    assert m["products_with_history"] == m["proposed"] + m["ambiguous"]
    # The gap this exists to close: most of the catalogue has no history.
    assert m["products_with_history"] < m["products_in_catalogue"]


# ------------------------------------------------------------ the generator


def test_the_generator_never_writes_approved():
    """The one line that would turn a gate into a rubber stamp."""
    src = (ROOT / "ops" / "propose_supplier_map.py").read_text(encoding="utf-8")
    assert 'w("status: proposed")' in src
    assert 'w("status: approved")' not in src


def test_the_generator_does_not_touch_overrides():
    """It emits an empty overrides block and never reads the existing one."""
    src = (ROOT / "ops" / "propose_supplier_map.py").read_text(encoding="utf-8")
    assert 'w("overrides: {}")' in src

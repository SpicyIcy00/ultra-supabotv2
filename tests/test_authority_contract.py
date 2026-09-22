"""
Pure tests for authority — what reaches the approver, and who that is (W2.2).

NO DATABASE. What decides is pure — which rows are orders, what they are
worth, where a draft goes and the sentence saying why, who may do what, and
whether a line is inside its bounds — so it is all held here:

  1. A DRAFT AT OR UNDER THE LINE LANDS IN THE LIST; OVER IT IS A DECISION.
     And every unknown is a decision: no line, or a line with no cost on file.
  2. THE LINE IS A PERSON'S SETTING (rule 6): declared in the yaml with all
     five fields, bounded, and bound only by an approver.
  3. THE FIGURES ARE CODE'S (rule 9): the tool takes no quantity and no total;
     a draft is a read that RAN, re-run and valued by the service.
  4. LEVEL FIVE: nothing in the surface sends anything, and the tool text
     tells Bob so in the words wave 1 caught him breaking.
  5. THE PEOPLE: the migration's seed is the yaml's declaration; Joy approves,
     Isaiah builds and does not approve purchases (the recorded assumption).
"""

from __future__ import annotations

import asyncio
import importlib.util
import inspect
from decimal import Decimal
from pathlib import Path

import pytest

from agent import composite_tools, loop, write_tools
from app.services import authority as svc
from tools._common import load_defs

DEFS = load_defs()
A = DEFS["authority"]
ROOT = Path(__file__).resolve().parent.parent
MIGRATION = ROOT / "backend/alembic/versions/2026_09_22_0002-b3c4d5e6f7a8_authority_and_requests.py"


def _migration():
    spec = importlib.util.spec_from_file_location("authority_migration", MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _v(mode="over_line", line=20000, version=2):
    return {"version": version, "mode": mode, "line_php": line}


# ---------------------------------------------------------------------------
# 1. The route
# ---------------------------------------------------------------------------

def test_a_draft_under_the_line_lands_in_the_list_quietly():
    routed, why = svc.route(Decimal("12400"), 0, 3, _v(), DEFS)
    assert routed == "list"
    assert "₱12,400" in why and "₱20,000" in why and "version 2" in why


def test_a_draft_over_the_line_arrives_as_a_decision():
    routed, why = svc.route(Decimal("20000.01"), 0, 3, _v(), DEFS)
    assert routed == "decision"
    assert "over the ₱20,000 line" in why


def test_a_draft_at_the_line_is_not_above_it():
    assert svc.route(Decimal("20000"), 0, 1, _v(), DEFS)[0] == "list"
    assert A["line"]["interrupts_when"] == "above"


def test_no_line_means_every_draft_is_a_decision():
    routed, why = svc.route(Decimal("5"), 0, 1, None, DEFS)
    assert routed == "decision" and "No line is set" in why
    assert A["line"]["default"] is None and A["line"]["default_mode"] == "every_draft"


def test_a_line_with_no_cost_makes_the_value_unknown_and_it_is_a_decision():
    routed, why = svc.route(Decimal("100"), 2, 3, _v(), DEFS)
    assert routed == "decision"
    assert "no cost on file" in why
    assert A["drafts"]["value"]["unpriced_routes_to"] == "decision"


def test_the_modes_that_carry_no_amount():
    assert svc.route(Decimal("999999"), 0, 1, _v("never", None), DEFS)[0] == "list"
    assert svc.route(Decimal("1"), 0, 1, _v("every_draft", None), DEFS)[0] == "decision"


# ---------------------------------------------------------------------------
# 2. The line is a declared, bounded setting a person binds
# ---------------------------------------------------------------------------

def test_the_line_is_declared_with_every_field_a_setting_needs():
    for field in DEFS["settings"]["declaration_requires"]:
        assert field in A["line"], field
    assert A["line"]["bound_by"] == "approver"
    assert A["line"]["versioned"] is True and A["line"]["immutable"] is True


def test_the_line_binds_inside_its_bounds_or_is_refused():
    assert svc.check_line(None, 20000, DEFS) == ("over_line", Decimal("20000"))
    assert svc.check_line(None, None, DEFS) == ("every_draft", None)
    assert svc.check_line("never", None, DEFS) == ("never", None)
    with pytest.raises(svc.AuthorityRefused, match="between"):
        svc.check_line("over_line", A["line"]["bounds"]["max"] + 1, DEFS)
    with pytest.raises(svc.AuthorityRefused, match="whole pesos"):
        svc.check_line("over_line", 20000.5, DEFS)
    with pytest.raises(svc.AuthorityRefused, match="takes no amount"):
        svc.check_line("never", 20000, DEFS)
    with pytest.raises(svc.AuthorityRefused):
        svc.check_line("sometimes", None, DEFS)


def test_the_migration_holds_the_line_to_its_mode():
    src = MIGRATION.read_text(encoding="utf-8")
    assert "(mode = 'over_line') = (line_php IS NOT NULL)" in src
    # Versions are rows, never updates: nothing in the service updates one.
    service = (ROOT / "backend/app/services/authority.py").read_text(encoding="utf-8")
    assert "update(BobAuthorityVersion" not in service
    assert "UPDATE george.authority_versions" not in service


def test_no_threshold_is_written_in_code():
    service = (ROOT / "backend/app/services/authority.py").read_text(encoding="utf-8")
    assert "20000" not in service and "20_000" not in service


# ---------------------------------------------------------------------------
# 3. The figures are code's
# ---------------------------------------------------------------------------

COVER_ROWS = [
    {"kind": "move", "product_id": "p1", "quantity": 4, "from": "AJI BARN", "to": "Rockwell"},
    {"kind": "order", "product_id": "p1", "sku": "A1", "product": "Aji Mix", "quantity": 10,
     "reason": "nothing left to move"},
    {"kind": "order", "product_id": "p2", "sku": "B2", "product": "Gummy", "quantity": 3},
]


def test_only_order_lines_are_valued_and_a_move_buys_nothing():
    dspec = svc.draft_spec("get_stock_cover", {"view": "draft"}, DEFS)
    lines = svc.order_lines(COVER_ROWS, dspec)
    assert [ln["product_id"] for ln in lines] == ["p1", "p2"]
    priced, total, unpriced = svc.value_lines(lines, {"p1": Decimal("12.50"), "p2": "100"})
    assert total == Decimal("425.00") and unpriced == 0
    assert priced[0]["line_value"] == 125.0
    assert svc.moves_in(COVER_ROWS) == 1


def test_a_zero_cost_is_no_cost_on_file():
    lines = [{"product_id": "p1", "quantity": 10}, {"product_id": "p2", "quantity": 1}]
    _priced, total, unpriced = svc.value_lines(lines, {"p1": 0, "p2": None})
    assert total == Decimal("0") and unpriced == 2


def test_a_purchase_plan_is_a_draft_only_with_a_cover_period():
    rows = [{"product_id": "p1", "suggested_order_qty": 0},
            {"product_id": "p2", "suggested_order_qty": 12}]
    dspec = svc.draft_spec("get_purchase_plan", {"supplier": "Seikyo", "cover_days": 14}, DEFS)
    assert [ln["product_id"] for ln in svc.order_lines(rows, dspec)] == ["p2"]
    with pytest.raises(svc.AuthorityRefused, match="cover_days"):
        svc.draft_spec("get_purchase_plan", {"supplier": "Seikyo"}, DEFS)
    with pytest.raises(svc.AuthorityRefused, match="view='draft'"):
        svc.draft_spec("get_stock_cover", {"view": "cover"}, DEFS)
    with pytest.raises(svc.AuthorityRefused, match="does not return a draft"):
        svc.draft_spec("get_sales", {}, DEFS)


def test_a_request_is_built_from_the_reads_rows_and_records_what_routed_it():
    req = svc.build_request(
        tool="get_stock_cover", arguments={"view": "draft", "store": "AJI BARN"},
        result={"rows": COVER_ROWS, "meta": {"snapshot_timestamp": "2026-09-22T08:00:00+08:00"}},
        costs={"p1": Decimal("12.50"), "p2": Decimal("100")},
        version=_v(), version_id=None, requested_by="daniel", person="daniel",
        note="for the weekend", conversation_id="c-1", defs=DEFS)
    assert req.routed == "list" and req.value_php == Decimal("425.00")
    assert req.title == "Reorder — AJI BARN"
    assert req.moves == 1 and req.status == "waiting" and req.line_php == Decimal("20000")
    assert req.source_call == {"tool": "get_stock_cover",
                               "arguments": {"view": "draft", "store": "AJI BARN"}}


def test_a_draft_with_nothing_in_it_is_refused():
    with pytest.raises(svc.AuthorityRefused, match="nothing in it"):
        svc.build_request(tool="get_stock_cover", arguments={"view": "draft"},
                          result={"rows": [], "meta": {}}, costs={}, version=_v(),
                          version_id=None, requested_by="x", person=None, note=None,
                          conversation_id=None, defs=DEFS)


def test_the_tool_takes_no_quantity_no_cost_and_no_total():
    params = set(inspect.signature(write_tools.submit_draft).parameters)
    assert params == {"tool_calls", "note", "ctx"}
    for word in ("user", "owner", "requested_by", "approver", "value", "total"):
        assert word not in params


class FakeAuthority:
    def __init__(self):
        self.calls = []

    async def submit(self, tool, arguments, note, conversation_id):
        self.calls.append(("submit", tool, arguments, note, conversation_id))
        return {"rows": [{"routed": "list"}], "meta": {"source_table": "george.requests"}}

    async def set_line(self, mode, line, said, conversation_id):
        self.calls.append(("set_line", mode, line, said))
        return {"rows": [{"version": 1}], "meta": {}}

    async def overview(self):
        return {"rows": [], "meta": {"source_table": "george.requests"}}


def _ctx(authority=None, executed=None):
    ctx = write_tools.WriteContext(authority=authority, conversation_id="c-9")
    ctx.executed.update(executed or {})
    return ctx


DRAFT = {"tool": "get_stock_cover", "arguments": {"view": "draft", "store": "AJI BARN"}}


def test_a_draft_that_never_ran_cannot_be_submitted():
    fake = FakeAuthority()
    with pytest.raises(write_tools.AuthorityRefused, match="has not run"):
        asyncio.run(write_tools.submit_draft([DRAFT], ctx=_ctx(fake)))
    assert fake.calls == []


def test_a_draft_that_ran_is_submitted_exactly_as_it_ran():
    fake = FakeAuthority()
    key = write_tools.call_key(DRAFT["tool"], DRAFT["arguments"])
    out = asyncio.run(write_tools.submit_draft([DRAFT], note="weekend",
                                               ctx=_ctx(fake, {key: DRAFT})))
    assert out["rows"][0]["routed"] == "list"
    assert fake.calls == [("submit", "get_stock_cover", DRAFT["arguments"], "weekend", "c-9")]


def test_one_draft_at_a_time():
    fake = FakeAuthority()
    with pytest.raises(write_tools.AuthorityRefused, match="exactly one"):
        asyncio.run(write_tools.submit_draft([DRAFT, DRAFT], ctx=_ctx(fake)))


def test_no_writer_means_the_three_tools_are_absent():
    names = {s["name"] for s in loop.build_tool_schemas(
        extra=loop.injected_surface(write_tools.WriteContext()))}
    assert not names & {"submit_draft", "set_authority", "view_approvals"}
    with_it = set(loop.injected_surface(write_tools.WriteContext(authority=FakeAuthority())))
    assert with_it == {"submit_draft", "set_authority", "view_approvals"}


def test_the_queue_is_a_read_that_may_be_composed():
    assert composite_tools.APPROVALS_TOOL in composite_tools.COMPOSABLE_READS
    assert composite_tools.APPROVALS_TOOL < composite_tools.PAGE_CONTEXT_TOOL


def test_set_authority_passes_their_words_through():
    fake = FakeAuthority()
    asyncio.run(write_tools.set_authority("You don't need my approval unless it's above ₱20,000.",
                                          line_php=20000, ctx=_ctx(fake)))
    assert fake.calls == [("set_line", None, 20000,
                           "You don't need my approval unless it's above ₱20,000.")]


# ---------------------------------------------------------------------------
# 4. Level five
# ---------------------------------------------------------------------------

def test_nothing_is_sent_and_the_tool_says_so():
    assert A["action_level"] == 5 and A["sends_anything"] is False
    doc = " ".join(write_tools.submit_draft.__doc__.split())
    assert "NOTHING IS SENT" in doc and "I key orders under the line myself" in doc
    assert "never say otherwise" in doc
    assert "never what you do" in write_tools.set_authority.__doc__.lower()


def test_the_approvals_colour_is_the_decision_and_never_the_list():
    assert A["routes"]["decision"]["accent"] is True
    assert A["routes"]["list"]["accent"] is False
    labels = [A["actions"][k]["label"] for k in A["decision_actions"]]
    assert labels == ["Approve", "Change", "Look into it"]
    assert A["actions"]["look_into"]["model_turn"] is True


# ---------------------------------------------------------------------------
# 5. The people
# ---------------------------------------------------------------------------

def test_the_seed_is_the_declaration():
    seed = {k: (n, r, b) for k, n, r, b in _migration().PEOPLE}
    declared = {k: (p["display_name"], p["role"], p["businesses"]) for k, p in A["people"].items()}
    assert seed == declared


def test_joy_approves_and_isaiah_does_not_approve_purchases():
    joy, isaiah = A["people"]["joy"]["role"], A["people"]["isaiah"]["role"]
    assert svc.may(joy, "approve", DEFS) and svc.may(joy, "set_line", DEFS)
    assert not svc.may(isaiah, "approve", DEFS) and not svc.may(isaiah, "set_line", DEFS)
    assert svc.may(isaiah, "submit", DEFS)
    for manager in ("daniel", "elijah"):
        role = A["people"][manager]["role"]
        assert svc.may(role, "submit", DEFS) and not svc.may(role, "approve", DEFS)


def test_an_account_linked_to_nobody_can_ask_and_never_decide():
    role = svc.role_of(None, DEFS)
    assert role == "requester"
    assert not svc.may(role, "approve", DEFS) and not svc.may(role, "set_line", DEFS)


def test_no_account_or_password_is_made_for_anyone():
    code = MIGRATION.read_text(encoding="utf-8").split('"""', 2)[2]
    assert 'sa.table(\n        "app_users"' not in code and "INSERT INTO app_users" not in code
    assert "password" not in code.lower()
    assert all(len(p) == 4 for p in _migration().PEOPLE)   # no login in the seed


def test_the_migration_is_the_one_the_card_names():
    mod = _migration()
    assert mod.revision == "b3c4d5e6f7a8" and mod.down_revision == "a2b3c4d5e6f7"


def test_the_room_draws_the_labels_the_definitions_declare():
    import re
    src = (ROOT / "frontend/src/components/bob/requestsState.ts").read_text(encoding="utf-8")
    block = src[src.index("export const DECISION_LABELS"):].split("\n", 1)[0]
    drawn = dict(re.findall(r"(\w+): '([^']+)'", block))
    assert list(drawn) == A["decision_actions"]
    assert drawn == {k: A["actions"][k]["label"] for k in A["decision_actions"]}


def test_money_is_written_by_code():
    assert svc.peso(Decimal("20000"), DEFS) == "₱20,000"
    assert svc.peso(Decimal("12400.5"), DEFS) == "₱12,400.50"
    assert svc.peso(None, DEFS) == "no value"

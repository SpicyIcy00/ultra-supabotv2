"""
Pure tests for the people page — who they are, and who can actually act (W4.5).

NO DATABASE. What the /people screen draws about authority is decided here,
not in a component: a person's role in the yaml's own words, the acts that
role is granted, the businesses they answer for, and the sentence saying
whether anybody can approve at all.

  1. THE ROOM NEVER SPELLS OUT A ROLE. Every phrase on the row comes from
     `metrics.yaml authority` through `person_row`, so changing what a builder
     may do changes the screen and never a string in TypeScript.
  2. AN APPROVER WITH NO LOGIN IS A QUEUE NOBODY CAN EMPTY. Until Joy's login
     is linked, nothing submitted can ever be decided, and the sentence says
     so — it is not a cheerful list of four names.
  3. LINKING STAYS AN ADMINISTRATOR'S ACT: `viewer.may_link_people` is the
     app's admin role and nothing else, and the route checks again.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from app.services import authority as svc
from tools._common import load_defs

DEFS = load_defs()
A = DEFS["authority"]
ROOT = Path(__file__).resolve().parent.parent
ROUTE = ROOT / "backend/app/api/v1/routes/bob_authority.py"
PAGE = ROOT / "frontend/src/pages/PeoplePage.tsx"
VIEW = ROOT / "frontend/src/components/bob/peopleView.ts"
RAIL = ROOT / "frontend/src/room/Rail.tsx"


class _P:
    """The columns of george.people that `person_row` reads."""

    def __init__(self, key, name, role, businesses, username=None):
        self.person_key, self.display_name, self.role = key, name, role
        self.businesses, self.username = businesses, username


def _declared(key: str, username=None) -> _P:
    p = A["people"][key]
    return _P(key, p["display_name"], p["role"], p["businesses"], username)


# ---------------------------------------------------------------------------
# 1. Every word about a role is the yaml's
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("key", sorted(A["people"]))
def test_the_row_carries_the_yamls_words_and_invents_none(key):
    row = svc.person_row(_declared(key), DEFS)
    declared = A["people"][key]
    assert row["name"] == declared["display_name"]
    assert row["role"] == declared["role"]
    assert row["says"] == declared["says"]
    # What the role may do, and the businesses, in the yaml's own sentences.
    assert row["role_says"] == " ".join(A["roles"][declared["role"]]["says"].split())
    assert row["may"] == list(A["roles"][declared["role"]]["may"])
    assert row["businesses_say"] == [
        " ".join(A["businesses"][b]["says"].split()) for b in declared["businesses"]
    ]


def test_the_page_spells_out_no_role_of_its_own():
    """A role's words live in the yaml; the component may not restate them."""
    source = PAGE.read_text(encoding="utf-8") + VIEW.read_text(encoding="utf-8")
    for role, dec in A["roles"].items():
        # The role KEY may appear (it is drawn beside its sentence); the
        # sentence itself may not be copied into the client.
        assert " ".join(str(dec["says"]).split()) not in source
    for key, person in A["people"].items():
        assert str(person["says"]) not in source


# ---------------------------------------------------------------------------
# 2. Nobody linked means nobody can approve, and the page says so
# ---------------------------------------------------------------------------

def test_an_approver_with_no_login_blocks_everything_and_the_sentence_says_so():
    rows = [svc.person_row(_declared(k), DEFS) for k in sorted(A["people"])]
    said = svc.describe_approval(rows, DEFS)
    assert "Nobody can approve anything yet" in said
    assert "Joy" in said and "administrator" in said
    # Never a claim that somebody signs in when nobody does.
    assert "signs in as" not in said


def test_a_linked_approver_is_named_with_the_login_that_is_hers():
    rows = [svc.person_row(_declared(k, "joy" if k == "joy" else None), DEFS)
            for k in sorted(A["people"])]
    said = svc.describe_approval(rows, DEFS)
    assert said == "Joy approves — Joy signs in as joy."


def test_a_linked_builder_still_does_not_unblock_approval():
    """Linking Isaiah's login changes nothing: he does not approve purchases."""
    rows = [svc.person_row(_declared(k, "isaiah" if k == "isaiah" else None), DEFS)
            for k in sorted(A["people"])]
    assert "Nobody can approve anything yet" in svc.describe_approval(rows, DEFS)


def test_an_estate_with_no_approver_says_that_instead():
    rows = [svc.person_row(_P("daniel", "Daniel", "requester", ["aji_ichiban"]), DEFS)]
    assert svc.describe_approval(rows, DEFS) == (
        "Nobody here may approve, so no draft can be decided."
    )
    assert svc.describe_approval([], DEFS).startswith("Nobody here may approve")


# ---------------------------------------------------------------------------
# 3. What the route hands out, and to whom
# ---------------------------------------------------------------------------

def _route_tree() -> ast.Module:
    return ast.parse(ROUTE.read_text(encoding="utf-8"))


def test_the_logins_go_only_to_an_administrator_and_never_carry_a_hash():
    source = ROUTE.read_text(encoding="utf-8")
    assert '"accounts": await _accounts(session) if who["may_link_people"] else None' in source
    accounts = next(n for n in ast.walk(_route_tree())
                    if isinstance(n, ast.AsyncFunctionDef) and n.name == "_accounts")
    keys = {k.value for n in ast.walk(accounts) if isinstance(n, ast.Dict)
            for k in n.keys if isinstance(k, ast.Constant)}
    assert keys == {"username", "display_name", "role", "active", "can_sign_in"}
    assert "passcode_hash" not in {k for k in keys}


def test_the_state_says_when_it_was_read():
    """UI rule 6: nothing on the page is dated by the browser's own clock."""
    assert '"read_at": datetime.now(timezone.utc).isoformat()' in ROUTE.read_text(encoding="utf-8")


def test_linking_is_refused_to_anybody_but_an_app_administrator():
    put = next(n for n in ast.walk(_route_tree())
               if isinstance(n, ast.AsyncFunctionDef) and n.name == "put_person")
    source = ast.get_source_segment(ROUTE.read_text(encoding="utf-8"), put)
    assert 'user.role != "admin"' in source and "HTTP_403_FORBIDDEN" in source


# ---------------------------------------------------------------------------
# 4. No rail row leads somewhere the person cannot go
# ---------------------------------------------------------------------------

def test_the_people_row_opens_the_people_and_not_the_settings_screen():
    rail = RAIL.read_text(encoding="utf-8")
    assert 'to="/people"' in rail
    assert 'to="/settings"' not in rail
    # Guarded like Sources: a link that bounces is worse than no link.
    assert "const mayBob =" in rail and "{mayBob && (" in rail
    assert "const mayDashboard =" in rail and "{mayDashboard && (" in rail

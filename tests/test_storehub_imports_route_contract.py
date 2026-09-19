"""
P3.h — the StoreHub upload, over HTTP and across the two halves of the app.

NO DATABASE. Two things are held here that nothing else holds:

1. A refused file is refused BEFORE the database is touched, as a 422 whose
   `detail` is the yaml's own sentence. The page renders that sentence verbatim
   (frontend/src/pages/storehubImports.dom.test.tsx), so this is the seam
   between "the parser said it" and "the person read it". The session handed to
   the route raises on any use: a refusal that reached for the database first
   would fail here, not at 3am.

2. The page a person clicks to exists wherever a page has to exist. The key
   `storehub_imports` was in PAGE_KEYS for seventeen days with no route behind
   it; `frontend/src/constants/pages.ts` said so in a comment. A key in one
   list and not the others is a link that lands on /no-access, or a page
   nobody can reach.
"""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.routes import storehub_imports
from app.core.database import get_db
from app.models.role_page_access import PAGE_KEYS
from app.services.storehub_parser import load_defs
from tests.test_storehub_parser import ST_DOCUMENT_ONLY, ST_HEADER

REPO = Path(__file__).resolve().parents[1]
ME = SimpleNamespace(username="ice", role="admin")


class _UntouchableSession:
    """Any use is a failure: a refusal must not read or write anything."""

    def __getattr__(self, name):
        raise AssertionError(f"a refused upload reached the database (session.{name})")


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(storehub_imports.router, prefix="/storehub-imports")
    app.dependency_overrides[get_db] = lambda: _UntouchableSession()
    app.dependency_overrides[storehub_imports._import_user] = lambda: ME
    return TestClient(app)


def _upload(client: TestClient, kind: str, name: str, data: bytes):
    return client.post(f"/storehub-imports/{kind}", files={"file": (name, data, "text/csv")})


def test_the_document_only_export_is_a_422_in_the_yamls_words_and_touches_nothing():
    declared = load_defs()["storehub"]["stock_transfers"]["refused_shapes"]["document_only"]
    with _client() as client:
        answer = _upload(client, "stock_transfers", "Stock_Transfer_09-03-2026.csv", ST_DOCUMENT_ONLY)
    assert answer.status_code == 422
    detail = answer.json()["detail"]
    assert isinstance(detail, str), "the page renders `detail` as a sentence"
    assert declared["reason"].strip() in detail


def test_an_unknown_header_is_still_a_422_and_still_touches_nothing():
    moved = (ST_HEADER.replace('"Ordered Qty"', '"Qty Ordered"') + "\n").encode("utf-8")
    with _client() as client:
        answer = _upload(client, "stock_transfers", "StockTransfers_FROM-x.csv", moved)
    assert answer.status_code == 422
    assert "does not match the expected" in answer.json()["detail"]


def test_an_empty_file_and_an_unknown_kind_are_not_refusals():
    """422 means "the parser declined this file" and the page says so; these are not that."""
    with _client() as client:
        assert _upload(client, "stock_transfers", "empty.csv", b"").status_code == 400
        assert _upload(client, "products", "products.csv", b"x").status_code == 404


def test_products_is_not_an_upload_kind():
    """
    P3.h(c). `products` already has a writer: a job outside this repository
    fills it nightly (new rows at 15:00-15:01 UTC, read 2026-09-19). A second
    writer here would be two sources for one table with no rule between them.
    """
    assert storehub_imports.KINDS == ("purchase_orders", "stock_transfers")


def test_the_page_exists_everywhere_a_page_has_to():
    assert "storehub_imports" in PAGE_KEYS

    pages = (REPO / "frontend/src/constants/pages.ts").read_text(encoding="utf-8")
    assert re.search(r"key:\s*'storehub_imports',\s*path:\s*'/storehub-imports'", pages)

    app = (REPO / "frontend/src/App.tsx").read_text(encoding="utf-8")
    route = re.search(r'path="/storehub-imports"\s*element=\{<RequirePage pageKey="(\w+)">', app)
    assert route, "no React route renders /storehub-imports"
    # Its OWN key: being allowed to talk to Bob does not grant writing orders.
    assert route.group(1) == "storehub_imports"

    # IT IS ONE OF BOB'S SCREENS, so it is reached from BOB'S rail — the owner,
    # 2026-09-19: "it should be a page in bob not supabot". It spent one session
    # in the Supabot sidebar; two doors to one room is how a surface stops being
    # anybody's, so the absence is held here rather than remembered.
    rail = (REPO / "frontend/src/room/Rail.tsx").read_text(encoding="utf-8")
    assert 'to="/storehub-imports"' in rail, \
        "the page is routed and reachable from nowhere a person stands"
    assert "storehub_imports" in rail, "the rail draws the link to a role that cannot open it"

    nav = (REPO / "frontend/src/components/Layout.tsx").read_text(encoding="utf-8")
    assert "/storehub-imports" not in nav, \
        "the upload page is back in the Supabot sidebar; it belongs in Bob's rail"


def test_every_frontend_page_key_is_a_backend_page_key():
    pages = (REPO / "frontend/src/constants/pages.ts").read_text(encoding="utf-8")
    keys = re.findall(r"\{\s*key:\s*'(\w+)'", pages)
    assert keys, "pages.ts changed shape; this test reads nothing"
    assert set(keys) <= set(PAGE_KEYS), sorted(set(keys) - set(PAGE_KEYS))

"""
`@` — a name typed into the composer, resolved to an id before it is sent.

WHY THIS EXISTS. A subject reached George as a WORD. "Rockwell" in a question
is a string the model has to decide the meaning of, and it has two meanings in
this estate — a shop, and every product sold in it. The surface already knew
which one the person meant, because they were looking at a row that carried
`store_id`, and it threw that away at the composer. This is the other door onto
the same mechanism: type `@`, pick a thing that EXISTS, and the id travels
(metrics.yaml surface.desk.selection.mentions).

NOTHING IS RESOLVED BY A MODEL AND NOTHING HERE IS A FIGURE. Each kind names
the read it comes out of, and every one of those reads is vetted somewhere
else: the shops are the store list in the definitions, a product is
`get_product`, a supplier is `get_purchasing` grouped by supplier — the same
reads `tools/objects.py` makes when somebody opens one of these things. A page
and a rule are rows of George's own schema, read through the models the pages
and workflows routers already use. There is no SQL in this file.

MATCHED, NEVER GUESSED. A prefix first, then a substring, both case-folded, and
a tie stays a tie — the list shows both and the person points. No stemmer, no
fuzzy match, no "did you mean", exactly as a typed fragment is matched against
the tokens on screen: the failure mode of this feature is a list you ignore,
which costs nothing.

WHAT EACH KIND BINDS IS THE DEFINITIONS' TO SAY. A shop, a product and a
supplier are SUBJECTS and travel in `desk.selection`. A page binds
`page_scope`, which is the field that injects a reader bound to the caller and
that page. A rule binds neither — there is no request field for a workflow —
so it is named to George on the question and what to do about it stays his
call.
"""

from __future__ import annotations

import asyncio
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Mapping, Optional

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_workflow import GeorgeWorkflow
from app.services import page_writer

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools._common import load_defs, req  # noqa: E402
from tools.products import get_product, get_product_categories  # noqa: E402
from tools.purchasing import get_purchasing  # noqa: E402

def _store_groups(defs: Mapping[str, Any]) -> dict[str, Any]:
    """
    The groups of the estate a person can mean by name, from the definitions.

    THIS WAS A TUPLE OF TWO HERE, and it was the second copy of the store
    groups in Python. Both had drifted the same way — neither knew about
    `vending_stock_location` — so `@AJI CMG` completed to nothing about a real
    place with 3,534 inventory rows behind it.

    It began to matter on 2026-09-15, when the estate switch stopped giving
    the warehouses their own pills at the owner's word: typing a name is the
    door to one place now, and a door that does not open is a place nobody can
    reach. See `surface.desk.selection.mentions.kinds.store.groups`, which also
    says which groups are deliberately NOT offered and why.
    """
    return dict(req(spec(defs), "kinds.store.groups"))


def spec(defs: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
    return req(defs or load_defs(), "surface.desk.selection.mentions")


def kinds(defs: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
    return dict(spec(defs)["kinds"])


# ---------------------------------------------------------------------------
# Matching — a prefix, then a substring, and nothing cleverer
# ---------------------------------------------------------------------------

def rank(label: str, query: str) -> Optional[int]:
    """
    How well a label answers to what was typed: 0 for a prefix, 1 for a
    substring anywhere in it, None for no match at all.

    An empty query matches everything at rank 1, which is what makes a bare
    `@` a menu of what exists rather than an empty list.
    """
    haystack = " ".join(str(label or "").split()).casefold()
    needle = " ".join(str(query or "").split()).casefold()
    if not needle:
        return 1
    if not haystack:
        return None
    if haystack.startswith(needle):
        return 0
    return 1 if needle in haystack else None


def _candidate(kind: str, ident: str, label: str, hint: Optional[str],
               defs: Mapping[str, Any]) -> dict[str, Any]:
    declared = kinds(defs)[kind]
    return {
        "kind": kind,
        "id": str(ident),
        "label": str(label),
        # ONE WORD SAYING WHAT IT IS, from the definitions. Three things called
        # Seikyo — a supplier, a page and a rule — are one list, and a list
        # that cannot tell them apart is worse than no list at all.
        "says": str(declared["says"]),
        "binds": str(declared["binds"]),
        "dimension": declared.get("dimension"),
        # What distinguishes two of the same kind: a SKU, a purpose, a status.
        # Never a figure.
        "hint": hint,
    }


def _take(rows: list[tuple[int, dict]], cap: int) -> list[dict]:
    """Best rank first, and within a rank the order the read returned."""
    ordered = sorted(range(len(rows)), key=lambda i: (rows[i][0], i))
    return [rows[i][1] for i in ordered[:cap]]


# ---------------------------------------------------------------------------
# The five kinds
# ---------------------------------------------------------------------------

def stores(query: str, defs: Mapping[str, Any], cap: int) -> list[dict]:
    """The estate, by name, from the store list and nowhere else."""
    found: list[tuple[int, dict]] = []
    for group, says in _store_groups(defs).items():
        for entry in req(defs, f"stores.{group}") or []:
            if not isinstance(entry, Mapping):
                continue
            label = str(entry.get("display_name") or entry.get("name") or "")
            at = rank(label, query)
            if at is None:
                continue
            found.append((at, _candidate(
                "store", str(entry["id"]), label,
                # THE WORD BESIDE THE NAME, from the definitions rather than
                # from a comparison against one group's name. AJI CMG is a
                # warehouse in a group called `vending_stock_location`, so
                # `group == "warehouse"` drew it as a bare name among seven
                # shops — which reads as an eighth shop.
                str(says) if says else None, defs)))
    return _take(found, cap)


def products(query: str, defs: Mapping[str, Any], cap: int) -> list[dict]:
    """
    The catalogue, through `get_product` — the read the object view's identity
    section makes, matched on name and nickname exactly as it always was.

    A blank query reads nothing. An unfiltered `get_product()` is the whole
    catalogue, and a completion list is not the place to pull it: the menu a
    bare `@` draws is the things a person could plausibly have in mind, and
    2,000 products is not that.
    """
    if not query.strip():
        return []
    result = get_product(name=query)
    found: list[tuple[int, dict]] = []
    for row in result.get("rows") or []:
        label = str(row.get("name") or row.get("sku") or "")
        at = rank(label, query)
        if at is None:
            # `get_product` matched the NICKNAME, which is a real answer this
            # module has no better word for than the name it returns.
            at = 1
        found.append((at, _candidate(
            "product", str(row.get("id")), label,
            str(row.get("sku")) if row.get("sku") else None, defs)))
    return _take(found, cap)


def categories(query: str, defs: Mapping[str, Any], cap: int) -> list[dict]:
    """
    The catalogue's categories, through the read that lists them.

    A CATEGORY'S NAME IS ITS IDENTITY — there is no category table and no id
    (`selection.identity.category` says `category`), so the label is what
    travels, exactly as a supplier's name does.

    Unlike the products above, a BLANK query returns the first few rather than
    nothing: there are 17 of these and the read is one grouped query, so a bare
    `@` can afford to show what the kinds are. 3,728 products cannot.
    """
    result = get_product_categories()
    found: list[tuple[int, dict]] = []
    for row in result.get("rows") or []:
        label = str(row.get("category") or "")
        if not label:
            continue
        at = rank(label, query) if query.strip() else 0
        if at is None:
            continue
        # NO COUNT BESIDE IT. `products` is a count of catalogue rows and the
        # read says so, but a figure on this surface carries the time it was
        # read and a completion list has nowhere to put one — the same refusal
        # the supplier kind makes about its order count.
        found.append((at, _candidate("category", label, label, None, defs)))
    return _take(found, cap)


# THE SUPPLIER LIST DOES NOT DEPEND ON WHAT WAS TYPED, and reading it is the
# slow half of this endpoint: it is a grouping over every purchase order ever
# written, measured at 811 ms, and the prefix is applied here afterwards. Read
# once per process per minute rather than once per keystroke — a completion
# menu a minute out of date over a list that changes when somebody raises a PO
# is not a claim about anything, and every FIGURE on this path still comes from
# its own read with its own timestamp.
#
# Deliberately not `functools.lru_cache`: a cache with no expiry would hold a
# supplier list for the life of the process, so a supplier added this morning
# would be un-mentionable until the next deploy.
_SUPPLIER_TTL_S = 60.0
_supplier_rows: tuple[float, list[dict]] = (0.0, [])
_supplier_lock = threading.Lock()


def supplier_rows(now: Optional[float] = None) -> list[dict]:
    """Every supplier the purchase orders name, at most a minute old."""
    global _supplier_rows
    at = time.monotonic() if now is None else now
    read_at, rows = _supplier_rows
    if rows and at - read_at < _SUPPLIER_TTL_S:
        return rows
    with _supplier_lock:
        read_at, rows = _supplier_rows
        if rows and at - read_at < _SUPPLIER_TTL_S:
            return rows
        fresh = list(get_purchasing(group_by="supplier").get("rows") or [])
        _supplier_rows = (at, fresh)
        return fresh


def suppliers(query: str, defs: Mapping[str, Any], cap: int) -> list[dict]:
    """
    Who we buy from, through `get_purchasing` grouped by supplier — the read
    the object view's orders section makes.

    THE NAME IS THE ID, and that is a fact about the data, not a shortcut:
    there is no supplier master and names are never deduplicated
    (metrics.yaml suppliers.purchase_orders.supplier_master_exists), so the
    exact string every purchasing read takes as `supplier` is the only key
    there is. The identity column declared for this dimension says the same.

    AND NOTHING IS DRAWN BESIDE THE NAME. The obvious hint is how many orders
    we have placed with them, and that is a figure: a figure on screen wears
    the time it was read (UI rule 6), and a completion menu has nowhere to put
    one. Two suppliers spelt almost alike are told apart by opening one, which
    is a read with receipts. So the hint is nothing, on purpose.
    """
    found: list[tuple[int, dict]] = []
    for row in supplier_rows():
        label = str(row.get("supplier") or "")
        if not label:
            continue
        at = rank(label, query)
        if at is None:
            continue
        found.append((at, _candidate("supplier", label, label, None, defs)))
    return _take(found, cap)


async def pages(db: AsyncSession, username: str, query: str,
                defs: Mapping[str, Any], cap: int) -> list[dict]:
    """The caller's own pages. Somebody else's page is not a thing they can scope to."""
    # Through the service the pages router already lists with, so "the
    # caller's pages" means one thing in both places.
    rows = await page_writer.list_pages(db, username)
    found: list[tuple[int, dict]] = []
    for page in rows:
        at = rank(page.title, query)
        if at is None:
            continue
        found.append((at, _candidate("page", str(page.id), page.title,
                                     page.purpose or None, defs)))
    return _take(found, cap)


async def rules(db: AsyncSession, query: str, defs: Mapping[str, Any],
                cap: int) -> list[dict]:
    """
    The company's saved workflows. ORG-LEVEL, like the listing route: a rule is
    the company's logic and not one person's, which is the whole reason `save`
    is a different word from `pin`.

    An archived one is not offered. It is not a thing anybody is working with,
    and the name it holds may since have been reused.
    """
    rows = (await db.execute(
        select(GeorgeWorkflow)
        .where(GeorgeWorkflow.status != "archived")
        .order_by(func.lower(GeorgeWorkflow.name))
    )).scalars().all()
    found: list[tuple[int, dict]] = []
    for flow in rows:
        at = rank(flow.name, query)
        if at is None:
            continue
        found.append((at, _candidate("rule", str(flow.id), flow.name,
                                     flow.status, defs)))
    return _take(found, cap)


# ---------------------------------------------------------------------------
# All five at once
# ---------------------------------------------------------------------------

async def resolve(db: AsyncSession, *, username: str, query: str,
                  defs: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
    """
    Everything that answers to what has been typed, across every kind.

    A KIND THAT FAILS DOES NOT TAKE THE LIST WITH IT — the same rule the object
    view is built on. The catalogue read can time out and the purchasing read
    can refuse; a completion list that 500s because one of five sources was
    slow is worse than one that offers four, and `unavailable` names which,
    because a kind that silently vanished would read as "there is no supplier
    by that name" (UI rule 8).

    The two tool reads are blocking psycopg and run in threads, together: they
    are independent, and doing them in turn would put a person's typing behind
    two round trips instead of one.
    """
    defs = defs or load_defs()
    bounds = spec(defs)
    per_kind = int(bounds["max_per_kind"])
    overall = int(bounds["max_results"])
    query = " ".join(str(query or "").split())

    unavailable: dict[str, str] = {}

    async def _tool(kind: str, fn, *args) -> list[dict]:
        try:
            return await asyncio.to_thread(fn, *args)
        except Exception as exc:  # a tool's own refusal, a timeout, a rot
            unavailable[kind] = " ".join(str(exc).split())[:200]
            return []

    async def _row(kind: str, coro) -> list[dict]:
        try:
            return await coro
        except SQLAlchemyError as exc:
            unavailable[kind] = " ".join(str(exc).split())[:200]
            return []

    got = await asyncio.gather(
        _tool("product", products, query, defs, per_kind),
        _tool("category", categories, query, defs, per_kind),
        _tool("supplier", suppliers, query, defs, per_kind),
        _row("page", pages(db, username, query, defs, per_kind)),
        _row("rule", rules(db, query, defs, per_kind)),
    )

    # The order kinds are declared in, which is the order they are offered in:
    # the estate first, because that is what most questions are about.
    by_kind: dict[str, list[dict]] = {
        "store": stores(query, defs, per_kind),
        "product": got[0],
        "category": got[1],
        "supplier": got[2],
        "page": got[3],
        "rule": got[4],
    }

    out: list[dict] = []
    for kind in kinds(defs):
        out.extend(by_kind.get(kind) or [])
    # Best match first ACROSS kinds, keeping the declared order inside a rank,
    # so typing a shop's whole name does not push it under a product that
    # merely contains it.
    ranked = sorted(range(len(out)),
                    key=lambda i: (0 if rank(out[i]["label"], query) == 0 else 1, i))
    return {
        "query": query,
        "candidates": [out[i] for i in ranked[:overall]],
        "unavailable": unavailable,
    }


def as_subject(candidate: Mapping[str, Any],
               defs: Optional[Mapping[str, Any]] = None) -> Optional[dict[str, Any]]:
    """
    One resolved mention as a selected subject, or None where it is not one.

    The translation is the definitions': `binds: selection` and the dimension
    beside it. A page and a rule return None here and travel their own way.
    """
    declared = kinds(defs).get(str(candidate.get("kind")))
    if not declared or declared.get("binds") != "selection":
        return None
    return {"dimension": declared["dimension"],
            "id": str(candidate["id"]), "label": str(candidate["label"])}


def page_id_of(candidate: Mapping[str, Any],
               defs: Optional[Mapping[str, Any]] = None) -> Optional[uuid.UUID]:
    """The page a mention scopes to, where it is one and the id is readable."""
    declared = kinds(defs).get(str(candidate.get("kind")))
    if not declared or declared.get("binds") != "page_scope":
        return None
    try:
        return uuid.UUID(str(candidate.get("id")))
    except (ValueError, TypeError):
        return None

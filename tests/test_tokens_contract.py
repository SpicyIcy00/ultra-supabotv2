"""
Read-as tokens, and fragments that skip the model. P1.j (2026-09-14).

WHAT THIS HOLDS.

  1. The definitions. `surface.desk.tokens` and `surface.desk.fragments` close
     their vocabularies, name a kind for every argument a replay may change,
     and carry no threshold — a token is SCOPE, and a threshold is a
     definition that lives where it was measured.

  2. The service. Every token's alternatives are resolved from the definitions
     this endpoint already serves — the date presets, the one store list, the
     dimensions some metric permits a grouping by — so a client can only offer
     a scope the definitions already bound, and never invents one.

  3. The spellings. What a typed fragment may resolve to is a LIST served from
     here, not a rule run on a client: no stemmer, no fuzzy match, no
     "did you mean". Every spelling resolves to exactly one alternative of one
     token, so a fragment is never ambiguous by construction.

  4. The client holds no copy. The room reads a token's value through the
     served `replay.arguments` map, and its words through `fragments`. A list
     of windows, shops or dimensions written into a component is the thing
     `from_control` was added to prevent, and it is grepped for here.

  5. The record is read back. `replaysToRestore` is the other half of P1.i,
     and the room calls it — the shortfall that card closed with.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

pytest.importorskip("yaml")

from tools._common import load_defs  # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_ROOM = _ROOT / "frontend" / "src" / "room"
_SHAPE_TS = _ROOM / "tokenShape.ts"
_TOKENS_TSX = _ROOM / "Tokens.tsx"
_ROOM_TSX = _ROOM / "Room.tsx"
_RESTORE_TS = _ROOM / "restore.ts"

DEFS = load_defs()
DESK = DEFS["surface"]["desk"]
TOKENS = DESK["tokens"]
FRAGMENTS = DESK["fragments"]
REPLAY = DESK["replay"]


def _served():
    """The desk definitions as the route builds them, with no database."""
    import sys

    sys.path.insert(0, str(_ROOT / "backend"))
    from app.api.v1.routes import george as route  # noqa: E402

    return asyncio.run(route.desk_definitions(user=None))


# ------------------------------------------------------------ 1. definitions --

def test_a_token_is_scope_and_every_one_of_them_is_a_replay_argument():
    assert TOKENS["from"] == "accepted_call_arguments"
    assert TOKENS["never_a_figure"] is True
    for argument in TOKENS["arguments"]:
        assert argument in REPLAY["arguments"], argument


def test_every_replay_argument_has_a_fragment_kind_and_the_kinds_are_closed():
    kinds = FRAGMENTS["kind_by_argument"]
    assert set(kinds) == set(REPLAY["arguments"]), (
        "an argument a replay may change with no kind declared would be a "
        "gesture nobody decided the cost of"
    )
    assert set(kinds.values()) <= set(FRAGMENTS["kinds"])


def test_the_reading_is_never_dropped_to_win_the_number():
    assert FRAGMENTS["analytical_asks_anyway"] is True
    assert [a for a, k in FRAGMENTS["kind_by_argument"].items() if k == "analytical"]


def test_a_fragment_resolves_against_what_is_on_screen_and_is_short():
    assert FRAGMENTS["resolves_against"] == "drawn_tokens"
    assert 0 < int(FRAGMENTS["max_words"]) <= 6


def test_no_token_and_no_fragment_names_a_threshold():
    # The same bound `composition.control_arguments` and a workflow parameter
    # carry: scope may be moved by a person, a threshold may not.
    words = repr(TOKENS) + repr(FRAGMENTS)
    for forbidden in ("threshold", "min_", "max_change", "cutoff", "target_"):
        assert forbidden not in words, forbidden


def test_the_one_token_that_costs_a_turn_asks_for_the_belief_by_name():
    correction = FRAGMENTS["correction"]
    assert correction["token"].strip()
    assert "belief" in correction["asks"].lower()
    # It is not a token that moves anything: no argument answers to it.
    assert correction["token"] not in REPLAY["arguments"]


def test_the_record_is_read_back_and_the_bound_is_declared():
    assert REPLAY["recorded"] == "answer_post_payload"
    assert REPLAY["restore_on_open"] == "newest_per_seq"
    assert 0 < int(REPLAY["max_restored_per_open"]) <= int(REPLAY["max_recorded_per_post"])
    assert set(REPLAY["changes_shape"]) <= set(REPLAY["arguments"])


# --------------------------------------------------------------- 2. served --

def test_every_token_is_served_with_alternatives_and_a_kind():
    served = _served()
    assert served.tokens, "a token with no alternatives is a label wearing a button"
    by_argument = {t.argument: t for t in served.tokens}
    assert set(by_argument) <= set(TOKENS["arguments"])
    for token in served.tokens:
        assert token.kind == FRAGMENTS["kind_by_argument"][token.argument]
        assert token.alternatives
        assert token.label.strip()


def test_the_alternatives_are_the_definitions_own_lists():
    served = _served()
    by_argument = {t.argument: t for t in served.tokens}
    windows = {w.name for w in served.windows}
    assert {a.value for a in by_argument["window"].alternatives} == windows
    # THE SHOP TOKEN LEFT ON 2026-09-15, at the owner's word: *"it just puts
    # it here which i dont need so remove it"*. It was the token "compare
    # these" wrote into; a shop is chosen by tapping it in the evidence or
    # typing `@`, both of which put it in the SELECTION where it is a chip he
    # can see and remove. The locations are still SERVED — the selection and
    # the estate switch read them — so what is asserted is that no TOKEN
    # offers a shop.
    assert "store" not in by_argument, "the shop token came back"
    assert served.locations, "the shops are still served; only the token went"
    # A grouping is a LIST on every tool that takes one — never a bare word,
    # and every one of them is a grouping some metric declares.
    grouping = by_argument["group_by"]
    everything = {g for allowed in grouping.permitted_by.permits.values() for g in allowed}
    assert [a.value for a in grouping.alternatives] == [[a.permit_key]
                                                        for a in grouping.alternatives]
    assert {a.permit_key for a in grouping.alternatives} == everything
    assert set(served.breakdown_dimensions) <= everything
    assert ([a.value for a in by_argument["top_n"].alternatives]
            == list(TOKENS["counts"]))


def test_the_replay_block_is_served_whole_so_no_client_keeps_a_copy():
    served = _served()
    assert served.replay["arguments"] == REPLAY["arguments"]
    assert served.replay["from_control"] == REPLAY["from_control"]
    assert served.replay["changes_shape"] == REPLAY["changes_shape"]
    assert served.fragments["max_words"] == FRAGMENTS["max_words"]
    assert served.fragments["correction"] == FRAGMENTS["correction"]


def test_read_it_to_me_is_served_and_means_nothing_else():
    """P2S.5(c): the words that ask for the claim aloud are the definitions',
    served whole, and none of them is also a steer or the correction — a
    phrase that could mean two things would be resolved by whichever the
    room happened to check first."""
    served = _served()
    spellings = served.fragments["read_aloud"]["spellings"]
    assert spellings and spellings == FRAGMENTS["read_aloud"]["spellings"]
    taken = {s.strip().lower() for t in served.tokens
             for a in t.alternatives for s in a.spellings}
    taken.add(FRAGMENTS["correction"]["token"].strip().lower())
    assert not {s.strip().lower() for s in spellings} & taken


# ------------------------------------------------------------ 3. spellings --

def test_every_spelling_resolves_to_exactly_one_alternative():
    served = _served()
    seen: dict[str, str] = {}
    for token in served.tokens:
        for alternative in token.alternatives:
            assert alternative.spellings, alternative.label
            assert len(set(alternative.spellings)) == len(alternative.spellings)
            for spelling in alternative.spellings:
                key = spelling.strip().lower()
                where = f"{token.argument}:{alternative.label}"
                assert key not in seen or seen[key] == where, (
                    f"{spelling!r} would resolve to both {seen.get(key)} and "
                    f"{where}; an ambiguous fragment must reach George, and "
                    f"a client cannot tell that from a resolved one"
                )
                seen[key] = where


def test_a_token_never_offers_a_cut_the_metric_refuses():
    """
    `net_sales` is transaction grain and declines a product grouping in its
    own sentence. A control that offers what will be refused is worse than no
    control, so what a call permits is the METRIC's own list — served, never
    worked out by a client.
    """
    served = _served()
    grouping = next(t for t in served.tokens if t.argument == "group_by")
    permits = grouping.permitted_by
    assert permits.argument == "metric"
    assert "product" not in permits.permits["net_sales"]
    assert "product" in permits.permits["product_revenue"]
    for metric, allowed in permits.permits.items():
        assert set(allowed) <= set(DEFS["metrics"][metric]["valid_group_by"]), metric


def test_the_word_a_person_types_for_a_dimension_is_declared_not_stemmed():
    spoken = TOKENS["spoken"]
    assert set(spoken) >= set(DESK["selection"]["dimensions"])
    served = _served()
    products = next(a for t in served.tokens if t.argument == "group_by"
                    for a in t.alternatives if a.value == ["product"])
    assert "products" in products.spellings


# ------------------------------------------------- 4. the client's own copy --

def test_the_room_holds_no_list_of_windows_shops_or_dimensions():
    source = _SHAPE_TS.read_text(encoding="utf-8") + _TOKENS_TSX.read_text(encoding="utf-8")
    for preset in DEFS["sales_day"]["presets"]:
        assert preset not in source, (
            f"{preset} is written into the room; the presets are served"
        )
    for store in DEFS["stores"]["active_retail"]:
        assert store["display_name"] not in source


def test_the_room_reads_the_served_map_rather_than_naming_a_path():
    shape = _SHAPE_TS.read_text(encoding="utf-8")
    assert "defs.replay?.arguments" in shape
    assert "defs.replay?.from_control" in shape
    # `filters.store` is where the store argument lands, and that fact is the
    # definitions' — a component spelling it out is a second copy of the map.
    assert not re.search(r"['\"]filters['\"]\s*,\s*['\"]store['\"]", shape)


def test_a_fragment_that_does_not_resolve_is_a_question():
    shape = _SHAPE_TS.read_text(encoding="utf-8")
    assert "hits.length === 1 ? hits[0] : null" in shape, (
        "two tokens answering to one word is an ambiguity, and an ambiguity "
        "goes to George"
    )
    room = _ROOM_TSX.read_text(encoding="utf-8")
    assert "if (!fragment) { askGeorge(q, subjects); return; }" in room


# ------------------------------------------------------- 5. the record back --

def test_the_room_reads_the_replay_record_back_on_opening():
    restore = _RESTORE_TS.read_text(encoding="utf-8")
    assert "export function replaysToRestore" in restore
    room = _ROOM_TSX.read_text(encoding="utf-8")
    assert "replaysToRestore(george.turns, thread.posts, max)" in room
    assert "max_restored_per_open" in room


def test_the_board_frame_a_replay_returns_is_used_when_the_shape_changed():
    room = _ROOM_TSX.read_text(encoding="utf-8")
    assert "changes_shape" in room
    assert "shapedByReplay" in room

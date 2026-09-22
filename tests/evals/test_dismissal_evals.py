"""
Set it aside with a reason, and he learns — live (W2.3, 2026-09-22).

The card's "Done when": a dismissed kind stops reappearing, and the memory
view shows why. Opt-in, like every eval:

    set -a; . backend/.env; set +a
    GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest \
        tests/evals/test_dismissal_evals.py -k <case> -q -s

NOTHING IS WRITTEN. The set-aside is handed to the loop exactly as the web
process hands it — `bound_settings`, from the views that stand — built here
from the real warning list's own row, read first with no model turn. The
memory read is a fake shaped as self_reader.read_memory's rows. george.beliefs
is never touched.
"""
from __future__ import annotations

import pytest

from tests.evals.harness import required, run_turn, say, turn_usd
from tests.evals.test_stock_cover_evals import _written
from tools import attention, dismissal
from tools._common import load_defs, req

DEFS = load_defs()
D = req(DEFS, "dismissal")
SETTING = D["setting"]["name"]
READS = set(D["setting"]["participates_in"])


@pytest.fixture(autouse=True)
def _live():
    required()


def _record(name: str, turn) -> None:
    say(f"\n== {name}: {turn.done.get('duration_ms')} ms · "
        f"{turn.done.get('iterations')} rounds · ${turn_usd(turn):.4f} · "
        f"calls {[(c.get('tool'), c.get('arguments')) for c in turn.calls]}")
    say(turn.answer)


def _a_row() -> dict:
    """
    One real item off today's warning list: a line rather than a shop where
    there is one, because a shop's name is said for other reasons and a line's
    is not. Read with no model turn; skipped when the morning is silent.
    """
    rows = [r for r in attention.get_attention()["rows"] if r.get("dismiss")]
    if not rows:
        pytest.skip("the warning list is silent today — nothing to set aside")
    lines = [r for r in rows if r.get("source") != "sales_vs_same_weekday"]
    return (lines or rows)[0]


def _bound(row: dict, reason: str) -> dict:
    key = row["dismiss"]
    return {SETTING: [{"kind": key["kind"], "subject": key["subject"], "reason": reason,
                       "on": "2026-09-22", "by": "isaiah", "id": "eval-belief"}]}


def _read_rows(turn) -> list[tuple[str, dict, dict]]:
    return [(r["tool"], row, r["result"].get("meta") or {}) for r in turn.results
            if r["tool"] in READS and not r["error"]
            for row in (r["result"].get("rows") or [])]


def _metas(turn) -> list[dict]:
    return [r["result"].get("meta") or {} for r in turn.results
            if r["tool"] in READS and not r["error"]]


def test_dismissed_kind_stays_quiet(monkeypatch):
    """Set aside as known: the next morning read leaves that kind and subject out, and says so."""
    row = _a_row()
    key = row["dismiss"]
    say(f"set aside as known: {key}")
    turn = run_turn(monkeypatch, "Anything I should know today?",
                    bound_settings=_bound(row, "known"))
    _record("dismissed_kind_stays_quiet", turn)
    metas = _metas(turn)
    assert metas, f"no read that applies it was made: {[c.get('tool') for c in turn.calls]}"
    # IT DID NOT REAPPEAR: no row of any read that applies it is that item.
    back = [row for _t, row, _m in _read_rows(turn)
            if (row.get("dismiss") or {}).get("kind") == key["kind"]
            and dismissal.norm((row.get("dismiss") or {}).get("subject")) == dismissal.norm(key["subject"])]
    assert not back, f"the set-aside item came back: {back[:1]}"
    # AND THE RECEIPTS SAY SO — quieter, not silent about being quieter.
    assert any(dismissal.norm(q.get("subject")) == dismissal.norm(key["subject"])
               for m in metas for q in (m.get("quieted") or [])), "meta.quieted does not name it"
    # He does not raise it in words either.
    assert str(row["subject"]).lower() not in turn.answer.lower(), (
        f"he named the set-aside line anyway: {turn.answer[:400]!r}")


def test_wrong_stays_marked(monkeypatch):
    """Called wrong: it stays, marked disputed, and the doubt reaches the answer."""
    row = _a_row()
    key = row["dismiss"]
    say(f"called wrong: {key}")
    turn = run_turn(monkeypatch, "Anything I should know today?",
                    bound_settings=_bound(row, "wrong"))
    _record("wrong_stays_marked", turn)
    kept = [r for _t, r, _m in _read_rows(turn)
            if (r.get("dismiss") or {}).get("kind") == key["kind"]
            and dismissal.norm((r.get("dismiss") or {}).get("subject")) == dismissal.norm(key["subject"])]
    assert kept, "the item called wrong was hidden — a doubt must never hide data"
    assert all(r.get("disputed") for r in kept), "the row is not marked disputed"
    # THE DOUBT REACHES HIM: said in his words, or placed by the loop as a
    # notice it always draws (surface.desk.notices.data_may_be_wrong).
    kind = D["disputed_notice_kind"]
    placed = any(n.get("kind") == kind or kind in str(n) for n in turn.notices)
    said = "wrong" in turn.answer.lower() or "doubt" in turn.answer.lower()
    assert placed or said, f"the doubt reached neither the answer nor a notice: {turn.answer[:400]!r}"


def test_memory_shows_why(monkeypatch):
    """What he has learned from what I set aside is read from memory, with the reason."""
    rows = [{
        "id": "s1", "subject": "Aji Mix at OPUS", "subject_kind": "attention.stock_crossed_out",
        "stance": D["reasons"]["known"]["stance"], "stance_said": D["reasons"]["known"]["stance_said"],
        "claim": D["reasons"]["known"]["claim"].format(kind_said=D["kind_words"]["attention.stock_crossed_out"]),
        "held_since": "2026-09-22T01:00:00+00:00", "last_checked": "2026-09-22T01:00:00+00:00",
        "rests_on": D["reasons"]["known"]["told"], "told": D["reasons"]["known"]["told"],
        "carried": True, "applied": 0, "unconfirmed": False, "set_aside": "known",
    }, {
        "id": "s2", "subject": "OPUS", "subject_kind": "attention.sales_vs_same_weekday",
        "stance": D["reasons"]["wrong"]["stance"], "stance_said": D["reasons"]["wrong"]["stance_said"],
        "claim": D["reasons"]["wrong"]["claim"].format(kind_said=D["kind_words"]["attention.sales_vs_same_weekday"]),
        "held_since": "2026-09-22T01:00:00+00:00", "last_checked": "2026-09-22T01:00:00+00:00",
        "rests_on": D["reasons"]["wrong"]["told"], "told": D["reasons"]["wrong"]["told"],
        "carried": True, "applied": 0, "unconfirmed": False, "set_aside": "wrong",
    }]

    async def memory():
        return {"rows": rows, "meta": {"source_table": "george.beliefs",
                                       "filters_applied": ["superseded_by IS NULL", "forgotten_at IS NULL"],
                                       "snapshot_timestamp": "2026-09-22T01:05:00+00:00", "held": 2}}

    # The block he is handed every turn, from the same views, as the web
    # process builds it (belief_store.as_block over current()).
    from datetime import datetime, timezone
    from app.services import belief_store
    at = datetime(2026, 9, 22, 1, 0, tzinfo=timezone.utc)
    block = belief_store.as_block([{**r, "confirmed_at": at, "held_since": at} for r in rows])

    turn = run_turn(monkeypatch, "What have you learned from the things I set aside?",
                    memory_reader=memory, beliefs=block)
    _record("memory_shows_why", turn)
    assert any(c.get("tool") == "view_memory" for c in turn.calls), (
        f"memory was not read: {[c.get('tool') for c in turn.calls]}")
    # His words and the page he wrote: a short answer's second line is often
    # on the page (W1.1's answer size), so both are what he said.
    low = _written(turn).lower()
    # WHAT was set aside: named in his words, or the memory view itself drawn
    # on the page — its rows name each subject with its reason, which is the
    # card's "the memory view shows why".
    seqs = {c.get("seq") for c in turn.calls if c.get("tool") == "view_memory"}
    drawn = any(b.get("seq") in seqs or b.get("kind") == "memory"
                for c in turn.calls if c.get("tool") == "compose"
                for b in (c.get("arguments") or {}).get("blocks") or [])
    assert ("aji mix" in low and "opus" in low) or drawn, turn.answer[:400]
    # WHY: said, or on the drawn rows (each carries its stance_said).
    assert "known" in low or "already know" in low or drawn, (
        f"the reason is neither said nor drawn: {turn.answer[:400]!r}")
    # The doubt, in any of the words a person uses for one ("stays marked as
    # questioned" was his, first run).
    assert any(w in low for w in ("wrong", "question", "doubt", "disput", "not right")) or drawn, (
        f"the doubt is neither said nor drawn: {turn.answer[:400]!r}")

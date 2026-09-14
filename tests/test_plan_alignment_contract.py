"""
`ops/NOW.md` §3 and `ops/plan/plan.html` must say the same thing.

WHY THIS IS A TEST AND NOT A HABIT. The two drifted four times on 2026-09-13,
in both directions, and every one was found by a person reading rather than by
anything checking:

  - the page said 33 sessions, then 31, against 28 open cards;
  - a card was described as pending on the page hours after being built;
  - the page still showed P1.g open while NOW.md had it closed, because a
    concurrent session finished it;
  - the two quoted different eval totals, $9.10 against $11.04.

The page is what the owner reads. NOW.md is what a session reads. **A plan
those two disagree about is worse than no plan**, because each reader is
confident and they are working from different documents.

THE RULE THIS ENFORCES, also written in NOW.md §1: a session that finishes a
card, adds one, or changes what one costs updates **both files in the same
commit**. This test fails if it did not.

The page source lives in the repo (`ops/plan/plan.html`) for exactly this
reason — it used to live in a session's scratchpad, which is deleted when that
session ends, so no later session *could* update it. Republish it with the
Artifact tool, passing the URL in NOW.md §6, so the owner's link keeps working.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NOW = ROOT / "ops" / "NOW.md"
PLAN = ROOT / "ops" / "plan" / "plan.html"

GATE_USD = 0.64      # measured at P1.g, 2026-09-13
FULL_USD = 1.51      # MEASURED at P1.e, 2026-09-14 — verification/p1e-v2.json,
                     # 11 turns, nothing unscored. Was 1.84, an estimate.

WORDS = {1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
         8: "Eight", 9: "Nine", 10: "Ten", 11: "Eleven", 12: "Twelve",
         13: "Thirteen", 14: "Fourteen", 15: "Fifteen", 16: "Sixteen",
         17: "Seventeen", 18: "Eighteen", 19: "Nineteen",
         20: "Twenty", 21: "Twenty-one", 22: "Twenty-two", 23: "Twenty-three",
         24: "Twenty-four", 25: "Twenty-five", 26: "Twenty-six",
         27: "Twenty-seven", 28: "Twenty-eight", 29: "Twenty-nine", 30: "Thirty"}


def _now() -> str:
    return NOW.read_text(encoding="utf-8")


def _plan() -> str:
    return PLAN.read_text(encoding="utf-8")


def now_cards() -> dict[str, str]:
    """Open cards in §3, and what each spends: full | gate | none."""
    out: dict[str, str] = {}
    for block in re.split(r"\n- \[ \] \*\*", _now())[1:]:
        cid = block.split("*")[0].split()[0]
        if not cid.startswith("P"):
            continue
        body = block[: block.index("\n- ")] if "\n- " in block else block
        low = body.lower()
        if "eval: full" in low or "one full run" in low:
            out[cid] = "full"
        elif "eval: subset" in low:
            out[cid] = "gate"
        else:
            out[cid] = "none"
    return out


def plan_cards() -> dict[str, str]:
    """The same, read off the page's pills. Cards marked done are skipped."""
    out: dict[str, str] = {}
    for m in re.finditer(r'<div class="card([^"]*)".*?<span class="id">([^<]+)</span>'
                         r'.*?<span class="tags">(.*?)</span></div>', _plan(), re.S):
        classes, cid, tags = m.group(1), m.group(2), m.group(3)
        if "done" in classes or "·" in cid:
            continue
        t = " ".join(re.findall(r'tag (?:eval|free)">([^<]+)', tags))
        out[cid] = "full" if "full" in t else ("gate" if "subset" in t else "none")
    return out


def test_the_same_cards_are_open_in_both():
    a, b = set(now_cards()), set(plan_cards())
    assert a == b, (
        "ops/NOW.md and ops/plan/plan.html disagree about which cards are open.\n"
        f"  only in NOW.md: {sorted(a - b)}\n"
        f"  only on the page: {sorted(b - a)}\n"
        "A session that closes or adds a card updates BOTH, in the same commit."
    )


def test_they_agree_on_what_each_card_spends():
    now, plan = now_cards(), plan_cards()
    differ = {c: (now[c], plan[c]) for c in set(now) & set(plan) if now[c] != plan[c]}
    assert not differ, (
        "The two documents disagree about what a card costs to verify "
        f"(NOW.md, page): {differ}"
    )


def test_the_quoted_total_matches_the_cards():
    cards = now_cards()
    total = sum(FULL_USD if v == "full" else GATE_USD if v == "gate" else 0.0
                for v in cards.values())
    quoted = "$%.2f" % total
    assert quoted in _now(), (
        f"NOW.md's cards imply {quoted} of eval spend and it does not say so. "
        "Every figure stated in prose in this project has been wrong at least "
        "once; derive it or check it."
    )
    assert quoted in _plan(), f"ops/plan/plan.html does not quote {quoted} either."


@pytest.mark.parametrize("phase", ["P1", "P2", "P3"])
def test_each_phase_states_its_own_size(phase):
    n = len([c for c in now_cards() if c.startswith(phase + ".")])
    heading = {"P1": "Phase 1", "P2": "Phase 2", "P3": "Phase 3"}[phase]
    m = re.search(re.escape(heading) + r"[^<]*</h2>\s*<p class=\"ph\">([^<.]*)", _plan())
    assert m, f"no '{heading}' heading with a summary line on the page"
    assert m.group(1).strip().lower().startswith(WORDS[n].lower() + " session"), (
        f"{heading} has {n} open cards; the page says {m.group(1).strip()!r}"
    )


def test_the_headline_session_count_matches():
    n = len(now_cards())
    assert f"{WORDS[n]} sessions in four phases" in _plan(), (
        f"{n} cards are open; the page's headline does not say "
        f"'{WORDS[n]} sessions in four phases'"
    )


def test_no_two_cards_share_a_prompt():
    """
    Three cards once carried `Fix the top item in the dogfood log.` — which
    cannot choose between them, and by then pointed at a report none of them
    covered. A prompt is an address; two cards cannot have one.
    """
    seen: dict[str, list[str]] = {}
    for m in re.finditer(r'<span class="id">([^<]+)</span>.{0,6000}?<div class="cmd">([^<]+)</div>',
                         _plan(), re.S):
        seen.setdefault(m.group(2).strip(), []).append(m.group(1))
    shared = {p: c for p, c in seen.items() if len(c) > 1}
    assert not shared, f"one prompt, more than one card: {shared}"


def test_the_page_is_publishable():
    """Cheap structural guards, so a broken page is not discovered by the owner."""
    page = _plan()
    for tag in ("div", "section", "span", "p"):
        assert page.count(f"<{tag}") == page.count(f"</{tag}>"), f"<{tag}> is unbalanced"
    assert "<!doctype" not in page.lower() and "<html" not in page.lower(), (
        "the platform adds the skeleton; the file must not"
    )
    assert page.count("<title>") == 1, "exactly one <title>"
    assert not re.search(r'<span class="tag feat">[^<]*#\D', page), (
        "a feature pill reads '#' followed by a word — the numbers are "
        "references to ops/STANDARD.md and a word is not one"
    )

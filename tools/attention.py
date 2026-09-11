"""
What deserves attention today — the judgement layer, as one read.

WHY THIS EXISTS. The morning used to be a fixed read at a fixed time: the
brief ran at 06:00 whether or not anything moved, and the room opened on it
either way. That is a dashboard with an alarm clock. A colleague who has read
everything walks in and says the one thing that matters — or says nothing,
which is the normal state (Weiser: calm technology; management by exception:
only variances come to the manager).

WHAT IT IS. One read that composes the sources which can NOTICE — those that
carry a definition of "normal" to notice against — ranks every survivor by
size against its own floor, and says plainly which senses are blind today and
why. Nothing here invents a threshold: every floor is a reference to one that
already exists in the definitions, and a source with no floor is listed as
unable to notice, with the reason, rather than left silent.

WHAT IT IS NOT. It is not a score, a rating or a composite (SCOPE forbids
inventing a number). It does not decide what George SAYS — the opening turn
still reads this, composes the board and writes the line — and it holds no
figure the brief's own rows do not carry: each row is a brief row, whole, with
its own receipts.

The ranking generalises `tools/brief.py:most_notable` — which picks ONE row
for a one-sentence opening — to every survivor, in the order and by the
measure `metrics.yaml attention` declares.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from tools._common import load_defs, req
from tools.brief import get_brief

SOURCE_TABLE = "multiple — each row carries its own receipts"


def _size(row: dict, measure: str) -> float:
    try:
        return abs(float(row.get(measure) or 0))
    except (TypeError, ValueError):
        return 0.0


def rank(rows: list[dict], adefs: dict) -> list[dict]:
    """
    Every row that crossed its floor, in the order it deserves attention.

    Pure. Sources in the declared order (money first, for the reason
    brief.notability records); within a source, largest |measure| first,
    absolute money rather than percentage so the smallest shop does not lead
    every morning; ties broken by subject name so two mornings with the same
    figures rank the same.
    """
    sources: dict = req(adefs, "sources")
    out: list[dict] = []
    for source in req(adefs, "order"):
        spec = sources[source]
        measure = str(req(spec, "measure"))
        picked = [r for r in rows if r.get("section") == spec["section"]]
        picked.sort(key=lambda r: (-_size(r, measure), str(r.get("subject") or "")))
        for r in picked:
            out.append({
                "source": source,
                "measure": measure,
                "size": r.get(measure),
                # The definition this row was judged against — a reference,
                # never a number typed here.
                "floor": str(req(spec, "floor")),
                **r,
            })
    for n, r in enumerate(out, 1):
        r["rank"] = n
    return out


def senses(brief_meta: dict, adefs: dict) -> list[dict]:
    """
    Every sense, dated — the ones that can notice and the ones that cannot.

    A frozen or stale source is a fact about perception, not an absence of
    news: "purchasing last moved 13 Jul" is what a blind sense says, so the
    reader knows what the morning could not have seen.
    """
    out: list[dict] = []
    sections: dict = brief_meta.get("sections") or {}
    for s in brief_meta.get("sources") or []:
        blind = (not s.get("fresh")) or bool(s.get("frozen"))
        why = None
        if s.get("frozen"):
            why = "frozen — loaded once from an export; it cannot change until someone imports again"
        elif not s.get("fresh"):
            age = s.get("age_days")
            why = f"stale — last moved {s.get('latest') or 'never'}" + (f", {age} days ago" if age is not None else "")
        out.append({
            "source": s.get("source"),
            "last_moved": s.get("latest"),
            "age_days": s.get("age_days"),
            "can_notice": not blind,
            "why_not": why,
        })
    # A section that could not run today is a blind sense for today only.
    for name, s in sections.items():
        if s.get("ran") is False:
            out.append({"source": name, "last_moved": None, "age_days": None,
                        "can_notice": False, "why_not": f"could not run — {s.get('reason')}"})
    # And the senses that have no definition of normal at all, from the yaml.
    for name, spec in (req(adefs, "cannot_notice") or {}).items():
        out.append({"source": name, "last_moved": None, "age_days": None,
                    "can_notice": False, "why_not": str(req(spec, "says")),
                    "defined_in": str(req(spec, "why"))})
    return out


def get_attention(as_of: Optional[date | str] = None) -> dict:
    """
    What deserves attention today, ranked — and silent when nothing does.

    The read for "what should I look at", "what changed", "anything I should
    know", and the morning. One call. Every row is a thing that crossed the
    definition of normal its source carries — a shop against its same-weekday
    noise floor, a product that crossed to zero, one that went thirty days
    without a sale — ranked by size against that floor, money first. Each row
    is whole and carries its own receipts. meta.silent is true when nothing
    crossed: say so in one line and stop. meta.senses lists every source with
    whether it could notice today and why not: name a blind sense rather than
    letting its silence read as calm.

    Args:
        as_of: the Manila calendar day to write the morning for. Defaults to
               today; a past date reproduces that morning.

    Returns:
        {"rows": [...], "meta": {...}}. `meta.silent` is true when nothing
        crossed — say so in one line and stop; do not go looking for
        something to say. `meta.senses` lists every source with whether it
        could notice today and why not: name a blind sense rather than
        letting its silence read as calm. A non-empty `meta.notice` MUST be
        surfaced.
    """
    defs = load_defs()
    adefs = req(defs, "attention")
    brief = get_brief(as_of)
    bmeta = dict(brief.get("meta") or {})

    rows = rank(list(brief.get("rows") or []), adefs)
    order = list(req(adefs, "order"))
    meta: dict[str, Any] = {
        "source_table": SOURCE_TABLE,
        "filters_applied": list(bmeta.get("filters_applied") or []) + [
            f"ranked: sources in the order {', '.join(order)}, then by |measure| "
            f"desc, then by subject   # metrics.yaml: attention.order, attention.sources.*.measure",
        ],
        "snapshot_timestamp": bmeta.get("snapshot_timestamp"),
        "as_of": bmeta.get("as_of"),
        "silent": len(rows) == 0,
        "ranked_by": order,
        "senses": senses(bmeta, adefs),
        "sections": bmeta.get("sections"),
        "row_count": len(rows),
        "definitions_version": bmeta.get("definitions_version"),
    }
    if bmeta.get("notice"):
        meta["notice"] = bmeta["notice"]
    return {"rows": rows, "meta": meta}

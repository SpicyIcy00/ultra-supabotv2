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
inventing a number). It does not decide what Bob SAYS — the opening turn
still reads this, composes the board and writes the line — and it holds no
figure the brief's own rows do not carry: each row is a brief row, whole, with
its own receipts.

The ranking generalises `tools/brief.py:most_notable` — which picks ONE row
for a one-sentence opening — to every survivor, in the order and by the
measure `metrics.yaml attention` declares.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from tools import dismissal
from tools._common import load_defs, req
from tools.brief import get_brief

SOURCE_TABLE = "multiple — each row carries its own receipts"


def _size(row: dict, measure: str) -> float:
    try:
        return abs(float(row.get(measure) or 0))
    except (TypeError, ValueError):
        return 0.0


def identity(source: str, row: dict) -> str:
    """
    What a decision is ABOUT: the source, the subject and (for a shelf) the
    shop. Stable across mornings — a gesture on Tuesday finds the same thing
    on Thursday whatever its figures are that day — and written on every row
    so the room never has to invent one.
    """
    return f"{source}|{row.get('subject') or ''}|{row.get('store') or ''}"


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
                "identity": identity(source, r),
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


def _when(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            v = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return None


def _ago(at: datetime, now: datetime) -> str:
    days = (now.date() - at.date()).days
    return "today" if days <= 0 else "yesterday" if days == 1 else f"{days} days ago"


def learn(rows: list[dict], decisions: Any, ldefs: dict, order: list[str],
          now: Optional[datetime] = None) -> tuple[list[dict], dict]:
    """
    The ranking, adjusted by what people did with these things before.

    Pure. Three rules, each a definition (metrics.yaml attention.learning.rules)
    and each written on the row it moved as `learning.reason`:
      - set aside `times` or more in the window -> below everything not so
        dismissed, whatever its size;
      - kept, opened or asked about within `days` days -> first within its
        source, so the money-first order still holds;
      - kept, ever in the window -> the row says so (`kept`).
    Every row carries its recent decisions, newest first, so "raised Tuesday,
    left" is on the row. Nothing is inferred from silence: a row with no
    decisions is ranked exactly as before.

    `decisions` is the injected reader's answer: a list, or None when no log
    was available in this session, or {"error": ...} when reading it failed —
    both leave the ranking alone and say so in the meta.
    """
    if decisions is None:
        return rows, {"read": False, "why": "no decision log in this session — nothing learned, nothing inferred"}
    if isinstance(decisions, dict) and decisions.get("error"):
        return rows, {"read": False, "why": f"the decision log could not be read: {decisions['error']}"}
    now = now or datetime.now(timezone.utc)
    rules = req(ldefs, "rules")
    times = int(req(rules, "dismissed_ranks_last.times"))
    days = int(req(rules, "attended_ranks_first.days"))
    on_row = int(req(ldefs, "decisions_on_row"))
    window = int(req(ldefs, "window_days"))
    since = now - timedelta(days=window)
    recent_since = now - timedelta(days=days)

    by_what: dict[str, list[dict]] = {}
    in_window = 0
    for d in decisions or []:
        at = _when(d.get("decided_at"))
        if at is None or at < since:
            continue
        in_window += 1
        by_what.setdefault(str(d.get("what")), []).append({**d, "_at": at})

    src_idx = {s: i for i, s in enumerate(order)}
    keyed: list[tuple[tuple, dict]] = []
    adjusted = 0
    for r in rows:
        mine = sorted(by_what.get(r["identity"], []), key=lambda d: d["_at"], reverse=True)
        r["decisions"] = [
            {"outcome": d.get("outcome"), "decided_at": d["_at"].isoformat(),
             "by": d.get("decided_by")} for d in mine[:on_row]
        ]
        dismissed = sum(1 for d in mine if d.get("outcome") == "dismissed")
        attended = [d for d in mine if d.get("outcome") in ("kept", "opened", "asked")
                    and d["_at"] >= recent_since]
        kept = any(d.get("outcome") == "kept" for d in mine)
        r["kept"] = kept
        tier, first = 0, False
        learning: Optional[dict] = None
        if dismissed >= times:
            tier = 1
            learning = {"rule": "dismissed_ranks_last",
                        "effect": str(req(rules, "dismissed_ranks_last.effect")),
                        "reason": str(req(rules, "dismissed_ranks_last.reason")).format(n=dismissed)}
        elif attended:
            first = True
            d = attended[0]
            learning = {"rule": "attended_ranks_first",
                        "effect": str(req(rules, "attended_ranks_first.effect")),
                        "reason": str(req(rules, "attended_ranks_first.reason")).format(
                            outcome=d.get("outcome"), ago=_ago(d["_at"], now))}
        elif kept:
            learning = {"rule": "kept_is_marked",
                        "effect": str(req(rules, "kept_is_marked.effect")),
                        "reason": str(req(rules, "kept_is_marked.reason"))}
        if learning:
            r["learning"] = learning
            adjusted += 1
        keyed.append(((tier, src_idx.get(r["source"], len(order)), not first), r))
    # Stable: within (tier, source, first) the size order rank() gave holds.
    out = [r for _, r in sorted(keyed, key=lambda kr: kr[0])]
    for n, r in enumerate(out, 1):
        r["rank"] = n
    return out, {"read": True, "decisions_read": len(decisions or []), "in_window": in_window,
                 "window_days": window, "adjusted": adjusted, "rules": list(rules)}


def get_attention(as_of: Optional[date | str] = None, *, decisions: Any = None,
                  quieted: Any = None) -> dict:
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
    letting its silence read as calm. Each row carries `decisions` — what was
    done with it before (kept, set aside, opened, asked, left, and when) — and
    `learning.reason` when that moved it in the ranking; say "raised Tuesday,
    left" from the row, never from memory.

    Args:
        as_of: the Manila calendar day to write the morning for. Defaults to
               today; a past date reproduces that morning.

    Returns:
        {"rows": [...], "meta": {...}}. `meta.silent` is true when nothing
        crossed — say so in one line and stop; do not go looking for
        something to say. `meta.senses` lists every source with whether it
        could notice today and why not: name a blind sense rather than
        letting its silence read as calm. A non-empty `meta.notice` MUST be
        surfaced. A row a person set aside as known or not important is left
        out and counted in `meta.quieted` — do not raise it; a row they called
        wrong stays, marked `disputed`: say it was doubted beside it.

    `quieted` is supplied by the loop, never the model: what a person set aside
    with a reason (metrics.yaml dismissal.setting), bound from the views that
    stand.
    """
    defs = load_defs()
    adefs = req(defs, "attention")
    brief = get_brief(as_of)
    bmeta = dict(brief.get("meta") or {})

    rows = rank(list(brief.get("rows") or []), adefs)
    order = list(req(adefs, "order"))
    # What people did with these things before — kept, set aside, opened,
    # asked about, left — handed in by the loop, never by the model
    # (agent/loop.py INJECTED_READS). Adjusts the order by the declared rules
    # and writes the reason on every row it moved.
    rows, learning_meta = learn(rows, decisions, req(adefs, "learning"), order)
    # What a person set aside with a reason (W2.3): known or not important is
    # left out and counted; wrong stays, marked. Every item row carries its
    # own key as `dismiss`, so the room sends back what the row said.
    rows, left_out, disputed = dismissal.apply(rows, "attention", quieted, defs)
    for n, r in enumerate(rows, 1):
        r["rank"] = n
    meta: dict[str, Any] = {
        "source_table": SOURCE_TABLE,
        "filters_applied": list(bmeta.get("filters_applied") or []) + [
            f"ranked: sources in the order {', '.join(order)}, then by |measure| "
            f"desc, then by subject   # metrics.yaml: attention.order, attention.sources.*.measure",
            "adjusted by recorded decisions only — kept, set aside, opened, asked, left; "
            "nothing inferred from silence   # metrics.yaml: attention.learning",
        ] + [line for line in [dismissal.filters_line(left_out, defs)] if line],
        "snapshot_timestamp": bmeta.get("snapshot_timestamp"),
        "as_of": bmeta.get("as_of"),
        "silent": len(rows) == 0,
        "ranked_by": order,
        "senses": senses(bmeta, adefs),
        "learning": learning_meta,
        **dismissal.meta_for(left_out, disputed),
        "sections": bmeta.get("sections"),
        "row_count": len(rows),
        "definitions_version": bmeta.get("definitions_version"),
    }
    if bmeta.get("notice"):
        meta["notice"] = bmeta["notice"]
    dismissal.merge_notice(meta, dismissal.notice(disputed, defs))
    return {"rows": rows, "meta": meta}

"""
What a person set aside, applied to a read (W2.3, 2026-09-22).

WHY THIS EXISTS. A watch post, a morning finding or a thing Bob noticed can be
set aside with one tap for why — known, not important, wrong — and the reason
is kept as a belief (backend/app/services/belief_store.dismiss). This module
is the half a READ needs: how an item's kind and subject are read off its row,
and what a read does with the ones a person set aside.

EVERYTHING HERE IS A DEFINITION'S. metrics.yaml `dismissal` says which rows
are items, which fields make the key, which reasons quiet and which only mark.
Nothing here invents a threshold: an item is quieted only when its exact kind
and subject were set aside, never because it looks like one that was.

QUIETER, NOT SILENT ABOUT IT. A row left out is counted in meta.quieted and
named in filters_applied, as a left-out category is (settings.declared); a row
called wrong keeps its place and carries `disputed` and a notice that is always
drawn. Pure: no connection, no clock except the one handed in.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from tools._common import req


def spec(defs: Mapping[str, Any]) -> dict:
    return req(defs, "dismissal")


def _fill(pattern: str, row: Mapping[str, Any]) -> Optional[str]:
    """A kind pattern filled from the row's own fields, or None when one is missing."""
    try:
        out = str(pattern).format_map(_Strict(row))
    except KeyError:
        return None
    return out


class _Strict(dict):
    """format_map over a row: a missing or empty field is a KeyError, never 'None'."""

    def __init__(self, row: Mapping[str, Any]):
        super().__init__({k: v for k, v in row.items()
                          if v is not None and str(v).strip() != ""})

    def __missing__(self, key: str) -> Any:
        raise KeyError(key)


def norm(text: Any) -> str:
    """How two keys are compared: trimmed and case-folded, as every subject match is."""
    return " ".join(str(text or "").split()).casefold()


def subject_of(item: str, row: Mapping[str, Any], defs: Mapping[str, Any]) -> Optional[str]:
    """The subject an item is about, joined from the fields `items.<item>.subject` names."""
    d = spec(defs)
    fields = req(d, f"items.{item}.subject")
    parts: list[str] = []
    for f in fields:
        v = str(row.get(f) if row.get(f) is not None else "").strip()
        # A shop's own row names the shop twice (subject and store): once is
        # the subject, never "Rockwell at Rockwell".
        if v and norm(v) not in {norm(p) for p in parts}:
            parts.append(v)
    return str(d["subject_joiner"]).join(parts) if parts else None


def valid_kind(kind: str, defs: Mapping[str, Any]) -> bool:
    """
    Whether a kind the room sent is one the definitions can produce.

    The room sends back the `dismiss` key a row carried; this refuses a kind
    no row could have carried, so a typed label cannot become a quieting.
    """
    d = spec(defs)
    head, _, tail = str(kind or "").partition(".")
    if not tail or head not in ("attention", "overview", "watch", "stuck"):
        return False
    if head == "attention":
        return tail in (req(defs, "attention.sources") or {})
    if head == "overview":
        return tail in d["items"]["finding"]["kinds"] and tail != "attention"
    if head == "watch":
        return tail in (req(defs, "watches.conditions") or {})
    return tail in d["items"]["stuck"]["what"]


def kind_of(item: str, row: Mapping[str, Any], defs: Mapping[str, Any]) -> Optional[str]:
    """
    The kind of item a row is, from its own fields — or None when it is not one.

    A finding is an item only when its kind is in items.finding.kinds; a
    warning-list finding takes the warning list's kind, so the same shelf set
    aside in one place is set aside in the other.
    """
    d = spec(defs)
    entry = req(d, f"items.{item}")
    if item == "finding":
        if str(row.get("finding") or "") not in entry["kinds"]:
            return None
        if row.get("finding") == "attention":
            return _fill(entry["kind_when_attention"], row)
    return _fill(entry["kind"], row)


def key_of(item: str, row: Mapping[str, Any], defs: Mapping[str, Any]) -> Optional[dict]:
    """{item, kind, subject} for a row that may be set aside, or None."""
    kind = kind_of(item, row, defs)
    subject = subject_of(item, row, defs)
    if not kind or not subject:
        return None
    return {"item": item, "kind": kind, "subject": subject}


def kind_said(kind: str, defs: Mapping[str, Any]) -> str:
    words = spec(defs)["kind_words"]
    return str(words.get(kind) or words["default"])


def reason_quiets(reason: str, defs: Mapping[str, Any]) -> bool:
    return bool((spec(defs)["reasons"].get(reason) or {}).get("quiets"))


def _entries(quieted: Any) -> list[dict]:
    """The bound value, tolerated in the shapes it can arrive in; junk is dropped."""
    if not isinstance(quieted, (list, tuple)):
        return []
    return [q for q in quieted if isinstance(q, Mapping) and q.get("kind") and q.get("subject")]


def match(key: Optional[dict], quieted: Any) -> Optional[dict]:
    """The newest dismissal of exactly this kind and subject, or None."""
    if not key:
        return None
    kind, subject = norm(key["kind"]), norm(key["subject"])
    for q in _entries(quieted):
        if norm(q["kind"]) == kind and norm(q["subject"]) == subject:
            return dict(q)
    return None


def apply(rows: list[dict], item: str, quieted: Any, defs: Mapping[str, Any]
          ) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Split a read's rows by what a person set aside.

    Returns (kept, left_out, disputed). Every row that may be set aside carries
    `dismiss` — its key, from its own fields — so the room sends back exactly
    what the row said. A row set aside as known or not important is left out;
    one called wrong is kept and carries `disputed`. A row that is not an item
    is kept untouched.
    """
    kept: list[dict] = []
    left: list[dict] = []
    disputed: list[dict] = []
    for r in rows:
        key = key_of(item, r, defs)
        if key is None:
            kept.append(r)
            continue
        r["dismiss"] = key
        hit = match(key, quieted)
        if hit is None:
            kept.append(r)
        elif reason_quiets(str(hit.get("reason")), defs):
            left.append({**key, "reason": hit.get("reason"), "on": hit.get("on"),
                         "by": hit.get("by"), "belief_id": hit.get("id")})
        else:
            r["disputed"] = {"reason": hit.get("reason"), "on": hit.get("on"),
                             "by": hit.get("by"), "belief_id": hit.get("id")}
            disputed.append({**key, **r["disputed"]})
            kept.append(r)
    return kept, left, disputed


def filters_line(left: list[dict], defs: Mapping[str, Any]) -> Optional[str]:
    """The receipt for what was left out, or None when nothing was."""
    if not left:
        return None
    d = spec(defs)
    said = {r: str(v["said"]) for r, v in d["reasons"].items()}
    reasons = sorted({said.get(str(x.get("reason")), str(x.get("reason"))) for x in left})
    return (str(d["setting"]["receipt"]).format(n=len(left), reasons=", ".join(reasons))
            + "   # metrics.yaml: dismissal.setting")


def notice(disputed: list[dict], defs: Mapping[str, Any]) -> Optional[dict]:
    """One notice for every row a person called wrong, always drawn above the rows."""
    if not disputed:
        return None
    d = spec(defs)
    lines = [
        str(d["disputed_message"]).format(
            who=x.get("by") or "Someone", subject=x.get("subject"),
            kind_said=kind_said(str(x.get("kind")), defs), date=x.get("on") or "earlier")
        for x in disputed
    ]
    return {"kind": d["disputed_notice_kind"], "message": " ".join(lines),
            "source": "metrics.yaml: dismissal"}


def merge_notice(meta: dict, extra: Optional[dict]) -> None:
    """Add a notice to meta beside any already there, in the `multiple` container."""
    if not extra:
        return
    have = meta.get("notice")
    if not have:
        meta["notice"] = extra
        return
    items = list(have.get("items") or []) if have.get("kind") == "multiple" else [have]
    # The same doubt arriving twice — the warning list's own and the
    # findings' — is one notice, as overview._notices keeps it.
    if any(n.get("kind") == extra.get("kind") and n.get("message") == extra.get("message")
           for n in items):
        return
    items.append(extra)
    meta["notice"] = {"kind": "multiple",
                      "message": " | ".join(str(n.get("message") or "") for n in items),
                      "items": items}


def meta_for(left: list[dict], disputed: list[dict]) -> dict:
    """What the receipts carry about it: every row left out, every row doubted."""
    return {"quieted": left, "disputed": disputed}

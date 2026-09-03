"""
Rendering a workflow run for Telegram.

WHY THE BACKEND RENDERS THIS. "Notices always surface" is a product guarantee
(CLAUDE.md UI rule 4), and templating a message in the delivery layer is how a
guarantee becomes a suggestion — the first person to tidy the layout deletes the
caveats. Same argument ops/n8n/README.md makes about the morning brief, and the
reason a workflow's schedule is George's rather than n8n's.

THREE THINGS EVERY BLOCK CARRIES, because a scheduled message is read in a hurry
on a phone and is the only place these figures appear:
  1. every run-level notice, at the top, before any number qualifies as read;
  2. per step, where the numbers came from and WHEN they were read (UI rule 6 —
     a number with no time on it is a claim with no expiry);
  3. what a step did NOT do. A step that refused, rotted or failed gets a line
     saying so. A shorter list with nothing said about the missing part reads as
     "there was less to report", which is the lie this file exists to prevent.

Rendering is deliberately generic — a step's rows can be any shape a tool
returns — so it shows the row's own fields rather than a layout that only suits
sales. A tool-specific renderer would look better and would silently mis-render
the first tool nobody thought about.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

# Reused rather than reimplemented. _pack in particular carries a fix for a real
# bug — two large blocks merged into one 7,889-character message Telegram would
# have rejected — and a second copy would not carry it.
from app.services.brief_telegram import (
    MAX_MESSAGE_LEN,
    _esc,
    _pack,
    _render_notice,
)

# Per step. Enough to see what the run found, not so much that the message
# becomes the data.
MAX_ROWS_PER_STEP = 6
MAX_FIELDS_PER_ROW = 5

# Fields that are structure rather than figures, and would crowd out the ones
# a reader is actually there for.
_SKIP_FIELDS = {"receipts", "notice", "notices", "product_id", "store_id"}

_STATUS_WORDS = {
    "ok": "",
    "refused": "declined to answer",
    "unrunnable": "no longer runnable",
    "failed": "failed",
}


def _num(value: Any) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, int):
        return f"{value:,}"
    if isinstance(value, float):
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    return str(value)


def _render_row(row: dict) -> str:
    fields = [(k, v) for k, v in row.items() if k not in _SKIP_FIELDS and v is not None]
    shown = fields[:MAX_FIELDS_PER_ROW]
    body = " · ".join(f"{_esc(k)}: <b>{_esc(_num(v))}</b>" for k, v in shown)
    if len(fields) > len(shown):
        body += f" · <i>+{len(fields) - len(shown)} more</i>"
    return f"• {body}"


def _receipts_line(meta: dict) -> str:
    """
    Where the figures came from and when they were read.

    UI rule 6 has no exception for a message: a number with no time on it is a
    claim with no expiry, and a Telegram message is exactly where one would go
    unnoticed.
    """
    source = meta.get("source_table") or "unknown source"
    read = str(meta.get("snapshot_timestamp") or "")[:19]
    data_as_of = meta.get("data_as_of")
    parts = [f"{_esc(source)}", f"read {_esc(read)}"]
    if data_as_of:
        parts.append(f"data as of {_esc(str(data_as_of))}")
    return f"<i>{' · '.join(parts)}</i>"


def _step_block(step: dict) -> list[str]:
    name = step.get("name") or step.get("tool") or "step"
    status = step.get("status", "ok")
    meta = step.get("meta") or {}
    rows = step.get("rows") or []

    lines = [f"<b>{_esc(name)}</b>"]

    if status != "ok":
        # The step is reported, never dropped. What it would have answered is
        # unknown, and saying nothing would present the remaining steps as the
        # whole rule.
        word = _STATUS_WORDS.get(status, status)
        lines.append(
            f"⚠️ <i>This step {_esc(word)}: "
            f"{_esc(step.get('error') or 'no reason given')}</i>"
        )
        return lines

    if step.get("reproducible") and step["reproducible"] != "full":
        lines.append(f"⚠️ <i>{_esc(step.get('reproducible_reason') or '')}</i>")

    # The step's own caveats, above its figures. A tool that says a SKU is three
    # different products has answered the question; printing the number without
    # that is the single worst thing this file can do.
    lines += [_render_notice(n) for n in (step.get("notices") or [])]

    count = meta.get("row_count", len(rows))
    full = meta.get("full_row_count")
    if not rows:
        # Empty is not quiet, and the two must never look alike — the same rule
        # the brief applies section by section.
        lines.append("<i>No rows matched. The step ran; there was nothing in it.</i>")
    else:
        for row in rows[:MAX_ROWS_PER_STEP]:
            if isinstance(row, dict):
                lines.append(_render_row(row))
        remaining = (full if isinstance(full, int) and full > count else count) - min(
            len(rows), MAX_ROWS_PER_STEP
        )
        if remaining > 0:
            lines.append(f"<i>… and {remaining:,} more rows not shown here.</i>")

    lines.append(_receipts_line(meta))
    return lines


def render(run: dict, *, workflow_name: str, version: int,
           slot: Optional[datetime] = None) -> list[str]:
    """
    Turn a workflow_runner.run_version() result into Telegram messages.

    Returns a list because a run that does not fit is split by step, never
    truncated. Each message is standalone HTML.
    """
    mode = run.get("mode", "manual")
    when = slot.strftime("%Y-%m-%d %H:%M") if slot else str(run.get("ran_at") or "")[:16]

    header = [
        f"<b>{_esc(workflow_name)}</b> — v{version}"
        + (f" · <i>{_esc(mode)}</i>" if mode != "scheduled" else ""),
        f"<i>{_esc(when)} Manila</i>",
    ]
    if run.get("as_of"):
        header.append(f"<i>Written against {_esc(run['as_of'])}.</i>")

    # Run-level notices go above everything. They qualify the whole run, and a
    # caveat below the number it qualifies has already been skipped past. Each
    # step's own notices are rendered inside its block instead, so nothing is
    # printed twice and nothing is dropped.
    header += [_render_notice(n) for n in (run.get("run_notices") or [])]

    blocks = [_step_block(step) for step in (run.get("steps") or [])]

    footer = [
        f"<i>Ran {_esc(str(run.get('ran_at') or ''))[:19]} · "
        f"definitions v{_esc(run.get('definitions_version'))} · "
        f"status {_esc(run.get('status', 'ok'))}</i>"
    ]
    return _pack(blocks + [footer], "\n".join(header))


def render_failure(*, workflow_name: str, version: Optional[int],
                   slot: Optional[datetime], reason: str) -> list[str]:
    """
    The message for a run that could not happen at all.

    A job that fails silently is indistinguishable from a quiet morning — nobody
    notices a message that did not arrive, and they notice one that says it
    broke. So a failed slot still sends, and it says which slot it was.
    """
    when = slot.strftime("%Y-%m-%d %H:%M") if slot else "an unscheduled run"
    version_part = f" v{version}" if version else ""
    text = (
        f"<b>{_esc(workflow_name)}</b>{_esc(version_part)} — <b>did not run</b>\n"
        f"<i>{_esc(when)} Manila</i>\n"
        f"⚠️ <i>{_esc(' '.join(str(reason).split()))}</i>\n"
        f"<i>No figures were produced for this slot. This is not a quiet "
        f"morning — nothing ran.</i>"
    )
    return [text[:MAX_MESSAGE_LEN]]

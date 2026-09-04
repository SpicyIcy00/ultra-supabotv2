"""
The morning brief — read it, or have it sent.

AUTH IS A SCOPED SHARED SECRET, NOT A LOGIN. A scheduler cannot type a passcode,
and the alternative — storing the admin passcode in n8n — would hand a scheduled
job full UI access as an administrator to send one read-only message. BRIEF_TOKEN
is accepted ONLY here, so a leak costs the morning brief and nothing else.

The comparison is constant-time. A token checked with `==` leaks its length and
prefix to anyone who can time the response.

Two routes, deliberately separate:
  GET  /brief        read it (JSON, or the Telegram messages)
  POST /brief/send   deliver it

The split matters for the n8n flow. If sending were a side effect of reading,
there would be no way to inspect tomorrow's brief without also broadcasting it.
"""

from __future__ import annotations

import hmac
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, List, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services import telegram_sender
from app.services.brief_telegram import render
from app.services.george_greeting import build_greeting
from app.services.river_writer import post_brief

MANILA = ZoneInfo("Asia/Manila")


def _manila_today() -> date:
    """The Manila day the brief is written ON — the river's key for it."""
    return datetime.now(MANILA).date()

# agent/ and tools/ live at the repo root, one level above backend/ — the same
# path insertion routes/george.py does.
_ROOT = Path(__file__).resolve().parents[5]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools import brief as brief_tool  # noqa: E402

router = APIRouter(tags=["brief"])


def require_brief_token(authorization: Optional[str] = Header(None)) -> None:
    """
    Accept `Authorization: Bearer <BRIEF_TOKEN>` and nothing else.

    Refuses outright when the token is unset rather than defaulting to open —
    an unconfigured secret must not mean "no secret required".
    """
    expected = getattr(settings, "BRIEF_TOKEN", "") or ""
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BRIEF_TOKEN is not configured, so the brief endpoint is closed.",
        )
    supplied = ""
    if authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid brief token.",
        )


class BriefResponse(BaseModel):
    rows: List[dict]
    meta: dict
    # The rendered Telegram messages, always present so a caller cannot
    # accidentally build its own and drop the notices.
    messages: List[str]


class SendRequest(BaseModel):
    chat_ids: List[str] = Field(..., min_length=1, max_length=20)


class SendResult(BaseModel):
    chat_id: str
    sent: int
    failed: int
    errors: List[str] = Field(default_factory=list)


class SendResponse(BaseModel):
    messages: int
    results: List[SendResult]
    ok: bool
    #: The river post's id, or None when this morning already had one — or
    #: when the post failed, which never fails the send.
    posted: Optional[str] = None


def _build(as_of: Optional[str]) -> tuple[dict, List[str]]:
    payload = brief_tool.get_brief(as_of=as_of) if as_of else brief_tool.get_brief()
    return payload, render(payload)


@router.get("", response_model=BriefResponse, dependencies=[])
async def read_brief(
    as_of: Optional[str] = Query(None, description="Manila date the brief is written ON."),
    authorization: Optional[str] = Header(None),
) -> BriefResponse:
    """
    What changed since yesterday.

    Returns the structured rows AND the rendered messages. Both, always: a
    consumer that only got JSON would have to lay the brief out itself, and the
    first thing a hand-rolled layout loses is the caveats.
    """
    require_brief_token(authorization)
    try:
        payload, messages = _build(as_of)
    except (ValueError, KeyError, RuntimeError) as exc:
        # A refusal from the tool is a real answer, but a scheduler needs a
        # non-200 to route to its error branch.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    return BriefResponse(rows=payload["rows"], meta=payload["meta"], messages=messages)


@router.post("/send", response_model=SendResponse)
async def send_brief(
    body: SendRequest,
    as_of: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
) -> SendResponse:
    """
    Build the brief and deliver it to Telegram.

    Messages go out IN ORDER and delivery stops for a chat on the first failure.
    A brief split across three messages that lost the middle one would read as a
    complete brief with items silently missing — worse than not arriving.
    """
    require_brief_token(authorization)

    if not telegram_sender.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TELEGRAM_BOT_TOKEN is not configured.",
        )

    try:
        payload, messages = _build(as_of)
    except (ValueError, KeyError, RuntimeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    results: List[SendResult] = []
    for chat_id in body.chat_ids:
        sent = failed = 0
        errors: List[str] = []
        for text in messages:
            outcome = await telegram_sender.send_message(chat_id, text, parse_mode="HTML")
            if outcome.get("success"):
                sent += 1
            else:
                failed += 1
                errors.append(str(outcome.get("error")))
                break  # see the docstring: a partial brief is worse than none
        results.append(SendResult(chat_id=chat_id, sent=sent, failed=failed, errors=errors))

    # The same brief in the river, once per Manila morning. Idempotent by a
    # date-derived id, which matters because this endpoint has NO claim
    # mechanism: an n8n retry after a timeout would otherwise post twice.
    #
    # After the Telegram send and never instead of it, and its failure is
    # swallowed: a brief that reached the group chat has been delivered, and
    # losing the river copy must not turn a successful send into a 500 that
    # invites a retry — which would send it to Telegram twice.
    posted = None
    try:
        async with AsyncSessionLocal() as session:
            posted = await post_brief(
                session,
                greeting=build_greeting(payload),
                as_of=date.fromisoformat(as_of) if as_of else _manila_today(),
            )
            await session.commit()
    except (SQLAlchemyError, ValueError, KeyError) as exc:   # noqa: BLE001
        print(f"[brief] river post failed: {type(exc).__name__}: {exc}")

    return SendResponse(
        messages=len(messages),
        results=results,
        ok=all(r.failed == 0 for r in results),
        posted=str(posted) if posted else None,
    )

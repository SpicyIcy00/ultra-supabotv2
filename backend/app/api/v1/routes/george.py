"""
George — SSE endpoint.

Thin transport over agent.loop.run(). No business logic here: the loop owns the
agent behaviour and the tools own the numbers. This module's only jobs are to
accept a question, stream the loop's frames, never let an exception escape as a
half-written stream — and hand the loop the one capability it cannot give
itself.

Deliberately separate from routes/chatbot.py, which serves the older NL->SQL
system. The two do not share code paths (CLAUDE.md: do not extend the freehand
SQL generator when building George).

THE WRITER — GEORGE'S ONLY ROUTE TO A WRITE
George can pin his own answers, and a pin is a write. Neither of George's
database identities can perform it: george_ro is read-only, and george_log has
INSERT without SELECT so it cannot read the pin count, the page list or the row
it just wrote. Rather than granting either of them more, this module builds a
writer around the AUTHENTICATED user and the application's own session, and
passes it into the loop. Consequences worth keeping:

  - The identity is the token's. `created_by` is user.username, taken here, and
    nothing in the request body or in the model's output can influence it.
  - The write goes through app.services.pin_writer.create_pin — the same
    function POST /pins calls — so the button and the conversation share every
    guarantee, including validation against the live tool surface.
  - Its own session, committed immediately. This route streams for as long as an
    answer takes; a pin written at second 20 must not depend on a stream that
    dies at second 40, or on that stream's transaction.
  - No writer, no write tool. Anything else that runs the loop without one gets
    the ten read tools and nothing more.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import AsyncSessionLocal
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.services.pin_writer import (
    PinQuotaError,
    SimilarPageError,
    create_pin,
)
from app.services.pin_runner import PinValidationError

# agent/ and tools/ live at the repo root, one level above backend/.
_ROOT = Path(__file__).resolve().parents[5]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from agent import loop as george_loop  # noqa: E402
from agent import write_tools  # noqa: E402
from agent.write_tools import PinRefused, PinSpec, PinWriter  # noqa: E402

# The prefix is supplied by main.py, matching every other router in this app.
router = APIRouter(tags=["george"])

# The same gate the pins routes use. George reads the business data and can now
# write a pin on the caller's behalf; both belong behind George's page.
_george_user = require_page("george")


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    # The page the user is asking from, e.g. "replenishment". George is present
    # wherever the user already is and receives that page as context.
    #
    # This used to be sent in a field called `user_id`, which meant
    # george.conversations.user_id held the page name and no record of who
    # asked. Who asked now comes from the token, below, and cannot be set by a
    # caller at all.
    page_context: Optional[str] = Field(None, max_length=100)


def _pin_writer(username: str) -> PinWriter:
    """
    Build the writer for one caller. The username is captured HERE, from the
    verified token, so no later argument can change whose pin this becomes.
    """

    async def write(spec: PinSpec) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                created = await create_pin(
                    session,
                    username=username,
                    tool_calls=spec.tool_calls,
                    title=spec.title,
                    question=spec.question,
                    conversation_id=(
                        uuid.UUID(spec.conversation_id) if spec.conversation_id else None
                    ),
                    page=spec.page,
                    allow_similar_page=spec.allow_similar_page,
                )
                await session.commit()
            except (PinValidationError, PinQuotaError, SimilarPageError) as exc:
                # Expected refusals, in the words the button already uses. They
                # reach the model as a tool refusal — a real answer with a route
                # out — rather than as a failure of the whole turn.
                await session.rollback()
                raise PinRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                # A fault, not a refusal, and it must not cost the user the
                # answer they already have. RuntimeError so the loop reports it
                # to the model as a failed tool call and the turn continues.
                await session.rollback()
                raise RuntimeError(
                    f"The pin could not be saved: {type(exc).__name__}. The answer "
                    f"above is unaffected; tell the user the pin did not save."
                ) from exc

            row = created.row
            return {
                "pin_id": str(row.id),
                "title": row.title,
                "page": row.page,
                "created_by": username,
                "created_at": row.created_at.isoformat(),
                "pins_on_page": created.pins_on_page,
            }

    return write


async def _safe_stream(question: str, user_id: Optional[str],
                       page_context: Optional[str],
                       pin_writer: PinWriter) -> AsyncIterator[str]:
    """
    Wrap the loop so a crash still closes the stream cleanly.

    Once the response has started, an exception cannot become an HTTP error —
    the client has already had a 200. It has to arrive as an SSE `error` frame,
    or the frontend hangs waiting for `done`.
    """
    try:
        async for frame in george_loop.run(
            question,
            user_id=user_id,
            page_context=page_context,
            pin_writer=pin_writer,
        ):
            yield frame
    except Exception as exc:  # noqa: BLE001
        payload = json.dumps({"message": f"{type(exc).__name__}: {exc}"})
        yield f"event: error\ndata: {payload}\n\n"
        yield f"event: done\ndata: {json.dumps({'status': 'error'})}\n\n"


@router.post("/ask")
async def ask(
    request: AskRequest,
    user: AppUser = Depends(_george_user),
) -> StreamingResponse:
    """
    Ask George a question. Streams Server-Sent Events.

    Frames, in the order a client will normally see them:
        start        conversation_id, whether logging is active
        thinking     summarized reasoning deltas
        tool_call    {seq, tool, arguments}
        tool_result  {seq, tool, row_count, source_table, truncated, duration_ms}
        notice       {kind, message}   — a caveat the answer must carry
        pinned       {pin_id, title, page, pins_on_page, tool_calls}
        text         answer deltas
        warning      {reason}          — unsurfaced_notice | notice_forced | logging_failed
        error        {message}
        done         {conversation_id, iterations, tool_calls, status, usage}

    tool_result carries a SUMMARY, never the rows. A single call can return 200
    wide rows; streaming those would dwarf the answer and duplicate data the
    model has already read.

    Authenticated, behind George's own page — the same gate as /george/pins.
    That is what lets an answer be pinned from the conversation: the pin is
    written as the caller, and there is no anonymous route to a write.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")

    return StreamingResponse(
        _safe_stream(
            request.question,
            user_id=user.username,
            page_context=request.page_context,
            pin_writer=_pin_writer(user.username),
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Without this, nginx buffers the whole response and the stream
            # arrives as one lump when the answer is already finished.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
async def list_tools() -> dict:
    """
    The tool schemas the loop hands the model, generated from the live
    signatures and definitions. Useful for confirming what George can actually
    do without reading the source, and for spotting a definitions change that
    silently altered the tool surface.

    The write surface is included and flagged. It is listed here because this is
    the answer to "what can George do", and a tool that writes is the part of
    that answer worth being able to see. A real session only receives it when a
    writer was injected — see the module docstring.
    """
    schemas = george_loop.build_tool_schemas(include_write=True)
    return {
        "count": len(schemas),
        "tools": [
            {
                "name": s["name"],
                "description": s["description"],
                "parameters": sorted(s["input_schema"]["properties"]),
                "required": s["input_schema"]["required"],
                "writes": s["name"] in write_tools.WRITE_TOOL_FUNCTIONS,
            }
            for s in schemas
        ],
    }

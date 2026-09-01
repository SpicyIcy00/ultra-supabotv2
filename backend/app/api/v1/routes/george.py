"""
George — SSE endpoint.

Thin transport over agent.loop.run(). No business logic here: the loop owns the
agent behaviour and the tools own the numbers. This module's only jobs are to
accept a question, stream the loop's frames, and never let an exception escape
as a half-written stream.

Deliberately separate from routes/chatbot.py, which serves the older NL->SQL
system. The two do not share code paths (CLAUDE.md: do not extend the freehand
SQL generator when building George).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# agent/ and tools/ live at the repo root, one level above backend/.
_ROOT = Path(__file__).resolve().parents[5]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from agent import loop as george_loop  # noqa: E402

# The prefix is supplied by main.py, matching every other router in this app.
router = APIRouter(tags=["george"])


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    user_id: Optional[str] = None


async def _safe_stream(question: str, user_id: Optional[str]) -> AsyncIterator[str]:
    """
    Wrap the loop so a crash still closes the stream cleanly.

    Once the response has started, an exception cannot become an HTTP error —
    the client has already had a 200. It has to arrive as an SSE `error` frame,
    or the frontend hangs waiting for `done`.
    """
    try:
        async for frame in george_loop.run(question, user_id=user_id):
            yield frame
    except Exception as exc:  # noqa: BLE001
        payload = json.dumps({"message": f"{type(exc).__name__}: {exc}"})
        yield f"event: error\ndata: {payload}\n\n"
        yield f"event: done\ndata: {json.dumps({'status': 'error'})}\n\n"


@router.post("/ask")
async def ask(request: AskRequest) -> StreamingResponse:
    """
    Ask George a question. Streams Server-Sent Events.

    Frames, in the order a client will normally see them:
        start        conversation_id, whether logging is active
        thinking     summarized reasoning deltas
        tool_call    {seq, tool, arguments}
        tool_result  {seq, tool, row_count, source_table, truncated, duration_ms}
        notice       {kind, message}   — a caveat the answer must carry
        text         answer deltas
        warning      {reason}          — unsurfaced_notice | notice_forced | logging_failed
        error        {message}
        done         {conversation_id, iterations, tool_calls, status, usage}

    tool_result carries a SUMMARY, never the rows. A single call can return 200
    wide rows; streaming those would dwarf the answer and duplicate data the
    model has already read.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")

    return StreamingResponse(
        _safe_stream(request.question, request.user_id),
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
    """
    schemas = george_loop.build_tool_schemas()
    return {
        "count": len(schemas),
        "tools": [
            {
                "name": s["name"],
                "description": s["description"],
                "parameters": sorted(s["input_schema"]["properties"]),
                "required": s["input_schema"]["required"],
            }
            for s in schemas
        ],
    }

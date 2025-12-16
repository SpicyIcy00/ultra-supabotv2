"""
Chatbot API Routes

Handles natural language to SQL query generation and execution.
"""

import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import AsyncGenerator

from app.core.database import get_db
from app.schemas.chatbot import (
    ChatRequest,
    ChatEventStatus,
    ChatEventFinal,
    ChatEventError,
    FeedbackRequest,
    SuggestionResponse,
    CircuitBreakerStatus
)
from app.services.sql_generator import SQLGenerator, CircuitOpenError
from app.services.query_executor import QueryExecutor, QueryExecutionError
from app.services.query_validator import QueryValidationError
from app.services.chart_intelligence import ChartIntelligence
from app.services.response_formatter import ResponseFormatter

router = APIRouter(tags=["chatbot"])


async def generate_chat_stream(
    question: str,
    db: AsyncSession
) -> AsyncGenerator[str, None]:
    """
    Generate Server-Sent Events stream for chat query processing.

    Emits events:
    1. status: Generating SQL
    2. status: Executing query (with SQL)
    3. status: Analyzing results (with row count)
    4. final: Complete response with data and chart
    5. error: If anything fails
    """

    try:
        # Step 1: Generate SQL
        yield format_sse_event(ChatEventStatus(
            type="status",
            message="Generating SQL query..."
        ))

        await asyncio.sleep(0.1)  # Small delay for UI responsiveness

        generator = SQLGenerator()
        sql_result = await generator.generate_sql(question)

        # Step 2: Validate and execute
        yield format_sse_event(ChatEventStatus(
            type="status",
            message="Executing query...",
            sql=sql_result["sql"]
        ))

        await asyncio.sleep(0.1)

        executor = QueryExecutor(db)
        execution_result = await executor.execute_query(
            sql_result["sql"],
            timeout=10,
            validate=True
        )

        # Step 3: Analyze results
        yield format_sse_event(ChatEventStatus(
            type="status",
            message=f"Analyzing {execution_result['row_count']} results...",
            row_count=execution_result['row_count']
        ))

        await asyncio.sleep(0.1)

        # Generate chart configuration
        chart_intel = ChartIntelligence()
        chart_config = chart_intel.select_chart(
            user_question=question,
            results=execution_result["results"]
        )

        # Extract chart data from config (or use original results)
        chart_data = chart_config.get("data") if chart_config else None

        # Format response text
        formatter = ResponseFormatter()
        formatted_text = formatter.format_response(
            user_question=question,
            results=execution_result["results"],
            chart_data=chart_data
        )

        # Step 4: Send final response
        final_event = ChatEventFinal(
            type="final",
            question=question,
            sql=sql_result["sql"],
            data=execution_result["results"],
            row_count=execution_result["row_count"],
            execution_time_ms=execution_result["execution_time_ms"],
            chart=chart_config,
            chart_data=chart_data,
            final_text=formatted_text,
            query_type=sql_result.get("query_type"),
            assumptions=sql_result.get("assumptions", [])
        )

        yield format_sse_event(final_event)

    except CircuitOpenError as e:
        yield format_sse_event(ChatEventError(
            type="error",
            message=str(e),
            error_type="circuit_breaker",
            suggestion="The AI service is temporarily unavailable. Please try again in a few moments."
        ))

    except QueryValidationError as e:
        yield format_sse_event(ChatEventError(
            type="error",
            message=f"Query validation failed: {str(e)}",
            error_type="validation",
            suggestion="The generated query was not safe to execute. Try rephrasing your question."
        ))

    except QueryExecutionError as e:
        yield format_sse_event(ChatEventError(
            type="error",
            message=f"Query execution failed: {str(e)}",
            error_type="execution",
            suggestion="Try narrowing your date range or adding more specific filters."
        ))

    except Exception as e:
        yield format_sse_event(ChatEventError(
            type="error",
            message=f"An unexpected error occurred: {str(e)}",
            error_type="unknown",
            suggestion="Please try rephrasing your question or contact support if the issue persists."
        ))


def format_sse_event(event: ChatEventStatus | ChatEventFinal | ChatEventError) -> str:
    """
    Format an event as SSE message.

    SSE format:
    data: {json}

    """
    json_data = event.model_dump_json()
    return f"data: {json_data}\n\n"


@router.post("/query/stream")
async def stream_query(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Stream query processing with Server-Sent Events.

    Returns a stream of events:
    - status: Progress updates
    - final: Complete response with results
    - error: If processing fails
    """

    return StreamingResponse(
        generate_chat_stream(request.question, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@router.post("/query")
async def query_chatbot(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Non-streaming endpoint for simple request-response.
    Returns complete result in one response.
    """

    try:
        # Generate SQL
        generator = SQLGenerator()
        sql_result = await generator.generate_sql(request.question)

        # Execute query
        executor = QueryExecutor(db)
        execution_result = await executor.execute_query(
            sql_result["sql"],
            timeout=10,
            validate=True
        )

        # Generate chart
        chart_intel = ChartIntelligence()
        chart_config = chart_intel.select_chart(
            user_question=request.question,
            results=execution_result["results"]
        )

        # Extract chart data from config (or use original results)
        chart_data = chart_config.get("data") if chart_config else None

        # Format response
        formatter = ResponseFormatter()
        formatted_text = formatter.format_response(
            user_question=request.question,
            results=execution_result["results"],
            chart_data=chart_data
        )

        return {
            "question": request.question,
            "sql": sql_result["sql"],
            "data": execution_result["results"],
            "row_count": execution_result["row_count"],
            "execution_time_ms": execution_result["execution_time_ms"],
            "chart": chart_config,
            "chart_data": chart_data,
            "final_text": formatted_text,
            "query_type": sql_result.get("query_type"),
            "assumptions": sql_result.get("assumptions", [])
        }

    except CircuitOpenError as e:
        raise HTTPException(status_code=503, detail=str(e))

    except QueryValidationError as e:
        raise HTTPException(status_code=400, detail=f"Query validation failed: {str(e)}")

    except QueryExecutionError as e:
        raise HTTPException(status_code=500, detail=f"Query execution failed: {str(e)}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


@router.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """
    Submit feedback on a query result.
    This can be used to improve future query generation.
    """

    # TODO: Store feedback in database for training
    # For now, just acknowledge receipt

    return {
        "message": "Feedback received",
        "feedback": request.feedback
    }


@router.get("/suggestions")
async def get_suggestions() -> SuggestionResponse:
    """
    Get suggested questions for the user.
    """

    suggestions = [
        "What are my top 5 selling products this month?",
        "Show me sales by store for the last 7 days",
        "What is the hourly sales trend for today?",
        "Which products are most profitable?",
        "Show me low stock items across all stores",
        "What are the best selling categories this week?",
        "Compare sales between Rockwell and Greenhills stores",
        "Show me transaction count by day for the last month"
    ]

    return SuggestionResponse(
        suggestions=suggestions,
        category="common_queries"
    )


@router.get("/status")
async def get_status() -> CircuitBreakerStatus:
    """
    Get the current status of the SQL generation service.
    Useful for monitoring circuit breaker state.
    """

    generator = SQLGenerator()
    status = generator.get_circuit_breaker_status()

    return CircuitBreakerStatus(**status)

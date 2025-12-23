"""
Chatbot API Routes

Handles natural language to SQL query generation and execution.
Enhanced with AI insights, conversation memory, and better error handling.
"""

import json
import asyncio
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import AsyncGenerator, Optional, List

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
from app.services.insight_generator import InsightGenerator
from app.services.conversation_memory import get_memory, add_exchange, get_context

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

    max_retries = 1
    retry_count = 0
    last_error = None
    
    while retry_count <= max_retries:
        try:
            # Step 1: Generate SQL (with previous error context if retrying)
            if retry_count == 0:
                yield format_sse_event(ChatEventStatus(
                    type="status",
                    message="Generating SQL query..."
                ))
            else:
                 yield format_sse_event(ChatEventStatus(
                    type="status",
                    message=f"Retrying query generation (attempt {retry_count + 1})..."
                ))

            await asyncio.sleep(0.1)  # Small delay for UI responsiveness

            try:
                generator = SQLGenerator()
            except ValueError as ve:
                # API key not set
                yield format_sse_event(ChatEventError(
                    type="error",
                    message=str(ve),
                    error_type="configuration",
                    suggestion="Please contact your administrator to configure the ANTHROPIC_API_KEY environment variable."
                ))
                return

            sql_result = await generator.generate_sql(
                question,
                retry_on_failure=True,
                previous_error=last_error
            )

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
            return  # Success, exit function

        except (QueryValidationError, QueryExecutionError) as e:
            last_error = str(e)
            retry_count += 1
            
            if retry_count > max_retries:
                # Max retries exceeded, yield error
                error_type = "validation" if isinstance(e, QueryValidationError) else "execution"
                yield format_sse_event(ChatEventError(
                    type="error",
                    message=f"Query failed after retry: {last_error}",
                    error_type=error_type, 
                    suggestion="The generated query was problematic. Try simpler questions."
                ))
                return
            
            # Continue to next iteration for retry

        except CircuitOpenError as e:
            yield format_sse_event(ChatEventError(
                type="error",
                message=str(e),
                error_type="circuit_breaker",
                suggestion="The AI service is temporarily unavailable. Please try again in a few moments."
            ))
            return

        except Exception as e:
            yield format_sse_event(ChatEventError(
                type="error",
                message=f"An unexpected error occurred: {str(e)}",
                error_type="unknown",
                suggestion="Please try rephrasing your question or contact support if the issue persists."
            ))
            return


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
    Returns complete result with AI insights, source preview, and follow-up suggestions.
    """
    
    # Generate or use provided session ID
    session_id = request.session_id or str(uuid.uuid4())
    
    max_retries = 1
    retry_count = 0
    last_error = None
    
    # Get conversation context for follow-up questions
    conversation_context = get_context(session_id) if request.session_id else ""
    
    while retry_count <= max_retries:
        try:
            # Generate SQL
            try:
                generator = SQLGenerator()
            except ValueError as ve:
                # API key not set
                raise HTTPException(
                    status_code=503,
                    detail=f"{str(ve)} Please contact your administrator."
                )

            sql_result = await generator.generate_sql(
                request.question,
                retry_on_failure=True,
                previous_error=last_error
            )

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
            
            query_type = sql_result.get("query_type", "unknown")

            # Format response
            formatter = ResponseFormatter()
            formatted_text = formatter.format_response(
                user_question=request.question,
                results=execution_result["results"],
                chart_data=chart_data
            )
            
            # Generate AI insights (non-blocking, with fallback)
            insights = None
            try:
                insight_gen = InsightGenerator()
                insights = await insight_gen.generate_insights(
                    question=request.question,
                    results=execution_result["results"],
                    query_type=query_type
                )
            except Exception as e:
                print(f"Insight generation failed: {e}")
                insights = None
            
            # Prepare source preview (first 5 rows)
            source_preview = execution_result["results"][:5] if execution_result["results"] else []
            
            # Generate follow-up suggestions based on query type
            follow_up_suggestions = _generate_follow_ups(request.question, query_type)
            
            # Store in conversation memory
            answer_summary = f"Found {execution_result['row_count']} results"
            if insights and insights.get("summary"):
                answer_summary = insights["summary"]
            
            add_exchange(
                session_id=session_id,
                question=request.question,
                sql=sql_result["sql"],
                answer_summary=answer_summary,
                results_count=execution_result["row_count"]
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
                "query_type": query_type,
                "assumptions": sql_result.get("assumptions", []),
                # New enhanced fields
                "insights": insights,
                "source_preview": source_preview,
                "follow_up_suggestions": follow_up_suggestions,
                "session_id": session_id
            }
        
        except (QueryValidationError, QueryExecutionError) as e:
            last_error = str(e)
            retry_count += 1
            if retry_count > max_retries:
                # Provide helpful error with suggestions
                error_suggestions = _get_error_suggestions(str(e), request.question)
                raise HTTPException(
                    status_code=400 if isinstance(e, QueryValidationError) else 500,
                    detail={
                        "message": f"Query failed: {last_error}",
                        "suggestions": error_suggestions,
                        "try_instead": _get_alternative_questions(request.question)
                    }
                )
            
            # Continue loop

        except CircuitOpenError as e:
            raise HTTPException(
                status_code=503, 
                detail={
                    "message": str(e),
                    "suggestions": ["Wait a moment and try again", "The AI service is temporarily unavailable"]
                }
            )

        except Exception as e:
            raise HTTPException(
                status_code=500, 
                detail={
                    "message": f"An error occurred: {str(e)}",
                    "suggestions": ["Try rephrasing your question", "Use simpler terms"]
                }
            )


def _generate_follow_ups(question: str, query_type: str) -> List[str]:
    """Generate contextual follow-up question suggestions."""
    question_lower = question.lower()
    
    if query_type == "ranking":
        suggestions = [
            "Show me the bottom performers instead",
            "Break this down by store",
            "How does this compare to last week?"
        ]
        if "product" in question_lower:
            suggestions.append("What categories do these belong to?")
    elif query_type == "time_series":
        suggestions = [
            "Compare to the previous period",
            "Break this down by store",
            "What's the peak hour?"
        ]
    elif query_type == "comparison":
        suggestions = [
            "Add more items to compare",
            "Show this over time",
            "Which has the best margins?"
        ]
    elif query_type == "aggregate":
        suggestions = [
            "Break this down by store",
            "Show me the trend over time",
            "Compare to yesterday"
        ]
    else:
        suggestions = [
            "Show more details",
            "Compare to last week",
            "Filter by specific store"
        ]
    
    return suggestions[:3]


def _get_error_suggestions(error: str, question: str) -> List[str]:
    """Generate helpful suggestions based on error type."""
    suggestions = []
    error_lower = error.lower()
    
    if "column" in error_lower or "does not exist" in error_lower:
        suggestions.append("Try using simpler terms like 'sales', 'revenue', or 'products'")
    if "syntax" in error_lower:
        suggestions.append("Rephrase your question more clearly")
    if "timeout" in error_lower:
        suggestions.append("Try a shorter date range")
        suggestions.append("Limit to a specific store")
    if "ambiguous" in error_lower:
        suggestions.append("Be more specific about what you're looking for")
    
    if not suggestions:
        suggestions = [
            "Try simpler wording",
            "Specify a date range like 'this week' or 'last month'"
        ]
    
    return suggestions[:3]


def _get_alternative_questions(question: str) -> List[str]:
    """Suggest alternative questions based on failed question."""
    alternatives = [
        "What are the top 10 selling products this week?",
        "Show me sales by store for the last 7 days",
        "What is our total sales today?"
    ]
    
    question_lower = question.lower()
    if "product" in question_lower:
        alternatives = [
            "Top 10 selling products this month",
            "Which products have the highest revenue?",
            "Show me products by category"
        ]
    elif "store" in question_lower:
        alternatives = [
            "Sales by store for last 7 days",
            "Compare Rockwell and Greenhills",
            "Which store has the highest sales?"
        ]
    elif "today" in question_lower or "hour" in question_lower:
        alternatives = [
            "Hourly sales trend for today",
            "How many transactions today?",
            "Total sales today"
        ]
    
    return alternatives[:3]



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

    try:
        generator = SQLGenerator()
        status = generator.get_circuit_breaker_status()
        return CircuitBreakerStatus(**status)
    except ValueError as ve:
        # API key not set - return a special status
        return CircuitBreakerStatus(
            is_open=True,
            failures=0,
            threshold=0,
            last_failure=None,
            message=str(ve)
        )

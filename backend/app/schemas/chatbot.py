"""
Chatbot API Schemas

Pydantic models for chatbot requests and responses.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal


class ChatRequest(BaseModel):
    """Request to ask a question to the chatbot"""
    question: str = Field(..., min_length=1, max_length=10000, description="Natural language question")
    store_id: Optional[str] = Field(None, description="Optional store filter")
    date_range: Optional[Dict[str, str]] = Field(None, description="Optional date range filter")


class ChatEventStatus(BaseModel):
    """Status update event during query processing"""
    type: Literal["status"] = "status"
    message: str = Field(..., description="Status message")
    sql: Optional[str] = Field(None, description="Generated SQL (if available)")
    row_count: Optional[int] = Field(None, description="Number of rows returned (if available)")


class ChartConfig(BaseModel):
    """Chart configuration"""
    type: str = Field(..., description="Chart type: bar, line, pie, etc.")
    x_axis: Optional[str] = Field(None, description="X-axis field name")
    y_axis: Optional[str] = Field(None, description="Y-axis field name")
    series: Optional[str] = Field(None, description="Series field for grouped charts")
    title: Optional[str] = Field(None, description="Chart title")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional chart options")


class ChatEventFinal(BaseModel):
    """Final response with complete results"""
    type: Literal["final"] = "final"
    question: str = Field(..., description="Original question")
    sql: str = Field(..., description="Generated SQL query")
    data: List[Dict[str, Any]] = Field(default_factory=list, description="Query results")
    row_count: int = Field(..., description="Number of rows returned")
    execution_time_ms: float = Field(..., description="Query execution time in milliseconds")
    chart: Optional[Dict[str, Any]] = Field(None, description="Chart configuration")
    chart_data: Optional[List[Dict[str, Any]]] = Field(None, description="Processed data for chart")
    final_text: str = Field(..., description="Formatted markdown response")
    query_type: Optional[str] = Field(None, description="Detected query type")
    assumptions: Optional[List[str]] = Field(default_factory=list, description="Assumptions made")


class ChatEventError(BaseModel):
    """Error event"""
    type: Literal["error"] = "error"
    message: str = Field(..., description="Error message")
    error_type: Optional[str] = Field(None, description="Error type/category")
    suggestion: Optional[str] = Field(None, description="Suggestion to fix the error")


# Union type for SSE events
ChatEvent = ChatEventStatus | ChatEventFinal | ChatEventError


class FeedbackRequest(BaseModel):
    """User feedback on a query result"""
    question: str = Field(..., description="Original question")
    sql: str = Field(..., description="Generated SQL")
    feedback: Literal["correct", "incorrect"] = Field(..., description="User feedback")
    corrected_sql: Optional[str] = Field(None, description="Corrected SQL if incorrect")
    comment: Optional[str] = Field(None, description="Additional feedback comment")


class SuggestionResponse(BaseModel):
    """Suggested questions for the user"""
    suggestions: List[str] = Field(..., description="List of suggested questions")
    category: Optional[str] = Field(None, description="Category of suggestions")


class CircuitBreakerStatus(BaseModel):
    """Circuit breaker status"""
    is_open: bool = Field(..., description="Whether circuit is open (failing)")
    failures: int = Field(..., description="Number of consecutive failures")
    threshold: int = Field(..., description="Failure threshold")
    last_failure: Optional[str] = Field(None, description="Timestamp of last failure")

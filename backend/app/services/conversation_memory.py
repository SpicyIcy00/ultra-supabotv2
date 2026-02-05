"""
Conversation Memory Service

Provides session-based conversation storage for AI chatbot.
Enables context-aware follow-up questions by maintaining conversation history.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
from collections import OrderedDict
import threading


class ConversationMemory:
    """
    Manages conversation history for AI chatbot sessions.
    
    Features:
    - Session-based storage
    - Configurable history length
    - Auto-expiration of old sessions
    - Thread-safe operations
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """Singleton pattern for shared memory across requests."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(
        self,
        max_history: int = 5,
        session_timeout_minutes: int = 60
    ):
        """
        Initialize conversation memory.
        
        Args:
            max_history: Maximum Q&A pairs to retain per session
            session_timeout_minutes: Time before session expires
        """
        if self._initialized:
            return
            
        self.max_history = max_history
        self.session_timeout = timedelta(minutes=session_timeout_minutes)
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._initialized = True
    
    def add_exchange(
        self,
        session_id: str,
        question: str,
        sql: str,
        answer_summary: str,
        results_count: int = 0
    ) -> None:
        """
        Add a Q&A exchange to session history.
        
        Args:
            session_id: Unique session identifier
            question: User's question
            sql: Generated SQL query
            answer_summary: Short summary of the answer
            results_count: Number of results returned
        """
        with self._lock:
            # Create session if doesn't exist
            if session_id not in self._sessions:
                self._sessions[session_id] = {
                    "history": [],
                    "created_at": datetime.now(),
                    "last_accessed": datetime.now()
                }
            
            session = self._sessions[session_id]
            session["last_accessed"] = datetime.now()
            
            # Add exchange
            exchange = {
                "question": question,
                "sql": sql,
                "answer_summary": answer_summary,
                "results_count": results_count,
                "timestamp": datetime.now().isoformat()
            }
            
            session["history"].append(exchange)
            
            # Trim to max history
            if len(session["history"]) > self.max_history:
                session["history"] = session["history"][-self.max_history:]
    
    def get_context(self, session_id: str) -> str:
        """
        Get conversation context as formatted string for Claude prompt.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Formatted context string or empty string if no history
        """
        with self._lock:
            if session_id not in self._sessions:
                return ""
            
            session = self._sessions[session_id]
            history = session.get("history", [])
            
            if not history:
                return ""
            
            # Format history for Claude - last exchange is most important
            context_parts = ["## Previous Conversation Context\n"]

            # Get the most recent exchange for special attention
            last_exchange = history[-1]
            context_parts.append(f"""
**MOST RECENT QUERY (this is what the user's follow-up likely refers to):**
- User asked: "{last_exchange['question']}"
- The query returned {last_exchange['results_count']} rows
- SQL used: `{last_exchange['sql'][:200]}...`
""")

            # Add older exchanges if any
            if len(history) > 1:
                context_parts.append("\n**Earlier questions in this session:**")
                for idx, exchange in enumerate(history[-3:-1], 1):  # Previous exchanges (not the last one)
                    context_parts.append(f"""
{idx}. "{exchange['question']}" ({exchange['results_count']} rows)""")

            context_parts.append("""

**CRITICAL - FOLLOW-UP QUESTION HANDLING:**
If the current question is a follow-up (e.g., "how about rockwell only", "what about last week", "show me just the top 3", "break this down by store"):
1. Use the MOST RECENT QUERY as the base - keep the same type of analysis
2. Apply the modification the user is asking for (different store, different time period, different limit, etc.)
3. For "how about X only" or "just X" - filter to that specific entity while keeping the same metrics/groupings
4. For "what about [time period]" - change the date filter while keeping the same analysis

Example: If user asked "top 5 selling products this month" and then asks "how about rockwell only",
generate SQL for "top 5 selling products this month at Rockwell store".
""")
            
            return "\n".join(context_parts)
    
    def get_last_query(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the last query from session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Last exchange dict or None
        """
        with self._lock:
            if session_id not in self._sessions:
                return None
            
            history = self._sessions[session_id].get("history", [])
            return history[-1] if history else None
    
    def get_history(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Get full history for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            List of exchanges
        """
        with self._lock:
            if session_id not in self._sessions:
                return []
            
            return self._sessions[session_id].get("history", []).copy()
    
    def clear_session(self, session_id: str) -> bool:
        """
        Clear a specific session.
        
        Args:
            session_id: Session to clear
            
        Returns:
            True if session existed and was cleared
        """
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                return True
            return False
    
    def cleanup_expired(self) -> int:
        """
        Remove expired sessions.
        
        Returns:
            Number of sessions removed
        """
        with self._lock:
            now = datetime.now()
            expired = [
                sid for sid, session in self._sessions.items()
                if now - session["last_accessed"] > self.session_timeout
            ]
            
            for sid in expired:
                del self._sessions[sid]
            
            return len(expired)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get memory statistics."""
        with self._lock:
            return {
                "active_sessions": len(self._sessions),
                "total_exchanges": sum(
                    len(s.get("history", [])) 
                    for s in self._sessions.values()
                ),
                "max_history_per_session": self.max_history,
                "session_timeout_minutes": self.session_timeout.total_seconds() / 60
            }


# Global instance
_memory = None


def get_memory() -> ConversationMemory:
    """Get the global conversation memory instance."""
    global _memory
    if _memory is None:
        _memory = ConversationMemory()
    return _memory


def add_exchange(
    session_id: str,
    question: str,
    sql: str,
    answer_summary: str,
    results_count: int = 0
) -> None:
    """Convenience function to add an exchange."""
    get_memory().add_exchange(session_id, question, sql, answer_summary, results_count)


def get_context(session_id: str) -> str:
    """Convenience function to get context."""
    return get_memory().get_context(session_id)


def get_last_query(session_id: str) -> Optional[Dict[str, Any]]:
    """Convenience function to get last query."""
    return get_memory().get_last_query(session_id)

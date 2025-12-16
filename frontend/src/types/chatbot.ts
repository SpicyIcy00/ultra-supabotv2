/**
 * Chatbot TypeScript Types
 * Mirrors backend Pydantic schemas
 * Updated: 2025-11-05
 */

export interface ChatRequest {
  question: string;
  store_id?: string;
  date_range?: {
    start_date: string;
    end_date: string;
  };
}

export interface ChatEventStatus {
  type: 'status';
  message: string;
  sql?: string;
  row_count?: number;
}

export interface ChartConfig {
  type: string;
  x_axis?: string;
  y_axis?: string;
  series?: string;
  title?: string;
  options?: Record<string, any>;
}

export interface ChatEventFinal {
  type: 'final';
  question: string;
  sql: string;
  data: Record<string, any>[];
  row_count: number;
  execution_time_ms: number;
  chart?: ChartConfig | null;
  chart_data?: Record<string, any>[] | null;
  final_text: string;
  query_type?: string;
  assumptions?: string[];
}

export interface ChatEventError {
  type: 'error';
  message: string;
  error_type?: string;
  suggestion?: string;
}

// Union type for all chat events
export type ChatEvent = ChatEventStatus | ChatEventFinal | ChatEventError;

// Type guard helpers
export function isChatEventStatus(event: ChatEvent): event is ChatEventStatus {
  return event.type === 'status';
}

export function isChatEventFinal(event: ChatEvent): event is ChatEventFinal {
  return event.type === 'final';
}

export function isChatEventError(event: ChatEvent): event is ChatEventError {
  return event.type === 'error';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;

  // For assistant messages
  sql?: string;
  data?: Record<string, any>[];
  row_count?: number;
  execution_time_ms?: number;
  chart?: ChartConfig | null;
  chart_data?: Record<string, any>[] | null;
  query_type?: string;
  assumptions?: string[];
  error?: string;
  suggestion?: string;

  // UI state
  isLoading?: boolean;
  status?: string;
}

export interface FeedbackRequest {
  question: string;
  sql: string;
  feedback: 'correct' | 'incorrect';
  corrected_sql?: string;
  comment?: string;
}

export interface SuggestionResponse {
  suggestions: string[];
  category?: string;
}

export interface CircuitBreakerStatus {
  is_open: boolean;
  failures: number;
  threshold: number;
  last_failure?: string;
}

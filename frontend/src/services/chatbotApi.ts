/**
 * Chatbot API Service
 * Handles communication with the chatbot backend
 */

import type { ChatRequest, ChatEvent, FeedbackRequest, SuggestionResponse } from '../types/chatbot';

// Get base URL and ensure /api/v1 is handled consistently
const BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://ultra-supabotv2-production.up.railway.app';
const API_BASE_URL = `${BASE_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '')}/api/v1/chatbot`;

/**
 * Stream query with Server-Sent Events
 */
export async function* streamChatQuery(request: ChatRequest): AsyncGenerator<ChatEvent> {
  const response = await fetch(`${API_BASE_URL}/query/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || ''; // Keep incomplete message in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix
          try {
            const event: ChatEvent = JSON.parse(data);
            yield event;
          } catch (e) {
            console.error('Failed to parse SSE data:', data, e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Query chatbot without streaming (simple request-response)
 */
export async function queryChatbot(request: ChatRequest): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Query failed');
  }

  return response.json();
}

/**
 * Submit feedback on a query result
 */
export async function submitFeedback(feedback: FeedbackRequest): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(feedback),
  });

  if (!response.ok) {
    throw new Error('Failed to submit feedback');
  }
}

/**
 * Get suggested questions
 */
export async function getSuggestions(): Promise<SuggestionResponse> {
  const response = await fetch(`${API_BASE_URL}/suggestions`);

  if (!response.ok) {
    throw new Error('Failed to fetch suggestions');
  }

  return response.json();
}

/**
 * Get circuit breaker status
 */
export async function getStatus(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/status`);

  if (!response.ok) {
    throw new Error('Failed to fetch status');
  }

  return response.json();
}

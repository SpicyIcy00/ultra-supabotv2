/**
 * Types for the chats API.
 *
 * A chat is a SESSION — the thread of turns that share a thread_id in
 * george.conversations. It is not a page: a page is a collection of pins, and
 * "Ungrouped" holds pins with no page and nothing else.
 *
 * These mirror the Pydantic models in backend/app/api/v1/routes/george.py
 * (ChatSummary, ChatDetail, ChatTurn) one-for-one, the same discipline
 * types/pins.ts sets. No runtime validation, so drift shows up as an undefined
 * field in the UI rather than an error.
 */
import type { DoneFrame, GeorgeNotice, GeorgeTurn, PinnedFrame, ToolMeta } from './george';

export interface ChatSummary {
  thread_id: string;
  /** The first question, trimmed. A chat has no other name. */
  title: string;
  first_asked_at: string;
  last_asked_at: string;
  turns: number;
}

export interface ChatToolCall {
  seq: number;
  tool: string;
  arguments: Record<string, unknown>;
  result: {
    row_count: number | null;
    source_table: string | null;
    truncated: boolean;
    duration_ms: number;
    error: string | null;
  };
}

/** One stored turn, in the server's snake_case. */
export type ChatTurn =
  | { role: 'user'; text: string; at: string | null }
  | {
      role: 'george';
      text: string;
      at: string | null;
      thinking: string | null;
      tool_calls: ChatToolCall[] | null;
      notices: GeorgeNotice[] | null;
      pinned: PinnedFrame[] | null;
      receipts: ToolMeta | null;
      done: DoneFrame | null;
      error: string | null;
    };

export interface ChatDetail {
  thread_id: string;
  title: string;
  turns: ChatTurn[];
}

/**
 * Stored turns into the shape the conversation column renders — the SAME
 * shape useGeorgeStream builds from a live stream, so a reopened chat and a
 * live one go through one component and one Pin button.
 */
export function toGeorgeTurns(turns: ChatTurn[]): GeorgeTurn[] {
  return turns.map((t) => {
    const at = t.at ?? new Date(0).toISOString();
    if (t.role === 'user') return { role: 'user', text: t.text, at };
    return {
      role: 'george',
      text: t.text,
      thinking: t.thinking ?? '',
      toolCalls: (t.tool_calls ?? []).map((c) => ({
        seq: c.seq,
        tool: c.tool,
        arguments: c.arguments,
        result: c.result,
      })),
      notices: t.notices ?? [],
      pinned: t.pinned ?? [],
      receipts: t.receipts ?? undefined,
      done: t.done ?? undefined,
      error: t.error ?? undefined,
      at,
    };
  });
}

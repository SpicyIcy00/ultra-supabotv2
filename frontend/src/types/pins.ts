/**
 * Types for the pins API.
 *
 * These mirror the Pydantic models in
 * backend/app/api/v1/routes/george_pins.py one-for-one, the same discipline
 * types/george.ts sets for the SSE frames. There is no runtime validation, so
 * drift shows up as an undefined field in the UI rather than an error.
 */
import type { GeorgeNotice, ToolMeta } from './george';

/** What gets stored — the calls behind an answer, never the answer. */
export interface PinToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

/**
 * The four states a tile has to render. Every one arrives as a normal 200:
 *   ok          figures with their receipts
 *   refused     the tool declining to mislead — a real answer, in its own words
 *   unrunnable  the tool or an argument no longer exists; the pin has rotted
 *   failed      timeout or crash
 */
export type PinStatus = 'ok' | 'refused' | 'unrunnable' | 'failed';

export interface Pin {
  id: string;
  title: string;
  question: string | null;
  page: string | null;
  conversation_id: string | null;
  tool_calls: PinToolCall[];
  created_at: string;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_status: PinStatus | null;
}

/** A page is a collection of pins; it has no existence apart from them. */
export interface PinPage {
  page: string | null;
  pins: number;
}

/** One replayed tool call. `meta` is FULL meta, not the chat tool_result summary. */
export interface PinCallResult {
  tool: string;
  arguments: Record<string, unknown>;
  status: PinStatus;
  duration_ms: number;
  rows: Record<string, unknown>[];
  meta: ToolMeta;
  notices: GeorgeNotice[];
  error?: string;
}

export interface PinRun {
  id: string;
  title: string;
  status: PinStatus;
  results: PinCallResult[];
  notices: GeorgeNotice[];
  /** The PREVIOUS success when this run failed, so a tile can say how old the last good figure was. */
  last_ok_at: string | null;
  ran_at: string;
}

export interface CreatePinRequest {
  title?: string;
  question?: string;
  conversation_id?: string;
  page?: string;
  tool_calls: PinToolCall[];
  /** Accept a page name differing from an existing one only by case. */
  allow_similar_page?: boolean;
}

/** The 409 body when a page name collides with an existing one by case alone. */
export interface SimilarPageConflict {
  message: string;
  existing_page: string;
  submitted_page: string;
}

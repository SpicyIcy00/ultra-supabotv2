/**
 * SSE frame types for the George endpoint.
 *
 * These mirror `_sse(...)` in agent/loop.py one-for-one. If a frame changes
 * there, it changes here — there is no runtime validation, so a silent drift
 * shows up as an undefined field in the UI rather than an error.
 */

/** meta.filters_applied entries look like: "<sql>   # metrics.yaml: <key>" */
export interface Reconciliation {
  applicable: boolean;
  reason?: string;
  method?: string;
  net_sales?: number;
  product_revenue?: number;
  gap?: number;
  gap_pct?: number | null;
  discount_total?: number;
  holds?: boolean;
  explained_by_discount?: boolean | null;
  note?: string;
}

export interface ToolMeta {
  source_table?: string;
  filters_applied?: string[];
  snapshot_timestamp?: string;
  row_count?: number;
  truncated?: boolean;
  truncated_for_model?: boolean;
  rows_omitted?: number;
  reconciliation?: Reconciliation;
  window?: {
    kind?: string;
    name?: string;
    start?: string;
    end?: string;
    /** Preset windows say whether they include today's partial day. */
    includes_partial_day?: boolean;
  };
  metric?: string;
  metric_unit?: string;
  definitions_version?: number;
}

export interface GeorgeNotice {
  kind: string;
  message: string;
  source?: string;
}

/** One tool invocation, keyed by its conversation-global seq. */
export interface ToolCall {
  seq: number;
  tool: string;
  arguments: Record<string, unknown>;
  /** Filled when the matching tool_result frame arrives. */
  result?: {
    row_count: number | null;
    source_table: string | null;
    truncated: boolean;
    duration_ms: number;
    error: string | null;
    /**
     * The rows, so an answer can draw the same chart a tile draws.
     *
     * ALL OF THEM OR NONE: empty whenever `rows_complete` is false. The loop
     * sends nothing rather than a prefix, because a chart drawn from part of a
     * series is a different chart, not a smaller one. See MAX_ROWS_TO_CLIENT
     * in agent/loop.py.
     */
    rows?: Record<string, unknown>[];
    rows_complete?: boolean;
    /** Full meta for the receipts line under a charted answer. */
    meta?: ToolMeta | null;
  };
}

/**
 * A pin George created because the user asked him to, in conversation.
 *
 * The answer also says what was pinned and where, but a write that happened is
 * a fact rather than a matter of wording — this frame is what the UI confirms
 * from, so the confirmation cannot go missing because the model phrased it
 * differently.
 */
export interface PinnedFrame {
  pin_id: string;
  title: string;
  page: string | null;
  /** Pins on that page, this one included. */
  pins_on_page: number;
  tool_calls: { tool: string; arguments: Record<string, unknown> }[];
}

/**
 * George's opening line on a new chat.
 *
 * Mirrors GreetingResponse in backend/app/api/v1/routes/george.py. It is NOT a
 * turn and must never be pushed into `turns`: turns are replayed to the model
 * as history (see toHistory in useGeorgeStream), and this is something George
 * said to the reader, not to the model.
 *
 * `kind` has three values and the third is not a variant of the second.
 * `could_not_look` means a section of the brief COULD NOT RUN — a morning
 * nobody was able to look at, which is the opposite of a quiet one.
 */
export interface Greeting {
  kind: 'item' | 'quiet' | 'could_not_look';
  /**
   * A complete, standalone sentence — the one string a voice layer would
   * speak, so it never depends on the markup around it.
   */
  headline: string;
  /**
   * The brief row itself, carrying its own `receipts`. Null when nothing
   * crossed a threshold.
   */
  item: (Record<string, unknown> & { section?: string; receipts?: ToolMeta }) | null;
  notices: GeorgeNotice[];
  /** The brief's own meta — source, filters, snapshot_timestamp, sections. */
  meta: ToolMeta;
  /** Sections that could not run at all. */
  blind_sections: string[];
}

export type GeorgeTurn =
  | { role: 'user'; text: string; at: string }
  | {
      role: 'george';
      text: string;
      thinking: string;
      toolCalls: ToolCall[];
      notices: GeorgeNotice[];
      /** Pins created during this turn, in the order they were made. */
      pinned: PinnedFrame[];
      /** meta of the last tool result — the receipts shown under the answer. */
      receipts?: ToolMeta;
      done?: DoneFrame;
      error?: string;
      at: string;
    };

/**
 * One earlier turn, replayed to the server on the next question.
 *
 * George holds no conversation state between requests, so this is what gives a
 * follow-up its referent — "pin that" is meaningless without it. `tool_calls`
 * carries only calls that SUCCEEDED: they are the ones whose results were shown
 * on screen, and therefore the only ones that may become a pin.
 */
export interface AskHistoryTurn {
  role: 'user' | 'george';
  text: string;
  tool_calls: { tool: string; arguments: Record<string, unknown> }[];
}

export interface DoneFrame {
  conversation_id: string;
  /** The chat this turn belongs to. Send it back on the next question. */
  thread_id?: string;
  iterations: number;
  tool_calls: number;
  status: string;
  notice_forced: boolean;
  usage: { input: number; output: number; cache_read: number };
  cache_hit: boolean;
}

/** Loop state, drives the reactive mark. */
export type GeorgeState = 'idle' | 'listening' | 'thinking' | 'running' | 'answering' | 'error';

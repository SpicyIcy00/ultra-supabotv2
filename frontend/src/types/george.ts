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
  };
}

export type GeorgeTurn =
  | { role: 'user'; text: string; at: string }
  | {
      role: 'george';
      text: string;
      thinking: string;
      toolCalls: ToolCall[];
      notices: GeorgeNotice[];
      /** meta of the last tool result — the receipts shown under the answer. */
      receipts?: ToolMeta;
      done?: DoneFrame;
      error?: string;
      at: string;
    };

export interface DoneFrame {
  conversation_id: string;
  iterations: number;
  tool_calls: number;
  status: string;
  notice_forced: boolean;
  usage: { input: number; output: number; cache_read: number };
  cache_hit: boolean;
}

/** Loop state, drives the reactive mark. */
export type GeorgeState = 'idle' | 'listening' | 'thinking' | 'running' | 'answering' | 'error';

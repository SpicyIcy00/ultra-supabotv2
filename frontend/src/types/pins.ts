/**
 * Types for the pins and pages API.
 *
 * These mirror the Pydantic models in
 * backend/app/api/v1/routes/george_pins.py and george_pages.py one-for-one,
 * the same discipline types/george.ts sets for the SSE frames. There is no
 * runtime validation, so drift shows up as an undefined field in the UI rather
 * than an error.
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
  /** The TITLE of the page it sits on — presentation. Null for Ungrouped. */
  page: string | null;
  /** The page's identity. Null for Ungrouped, which is not a page. */
  page_id: string | null;
  /** Its place on a real page, dense 0..n-1; meaningless in Ungrouped. */
  position: number;
  conversation_id: string | null;
  tool_calls: PinToolCall[];
  created_at: string;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_status: PinStatus | null;
}

/**
 * A page: a person's ordered workspace of pins, with a title and a one-line
 * purpose. A row since 2026-09-08, so it can be empty and can be renamed
 * without anything bound to it moving.
 */
export interface Page {
  id: string;
  title: string;
  purpose: string | null;
  created_at: string;
  updated_at: string;
  /** How many pins sit on it. Zero is a real state. */
  pins: number;
}

/** The legacy listing: a page's title and id, or `page: null` for Ungrouped. */
export interface PinPage {
  page: string | null;
  page_id: string | null;
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
  /** Where it lands: by identity, or by title (an existing title joins, a new one creates). */
  page_id?: string;
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

/**
 * Where on its page a pin goes, relationally. Exactly one field; the
 * service owns the arithmetic.
 */
export interface Placement {
  before?: string;
  after?: string;
  at?: 'top' | 'bottom';
}

/**
 * A membership, order or title change. A field left out is left alone;
 * `page_id: null` is Ungrouped, which is how a pin leaves a page without
 * being deleted.
 */
export interface UpdatePinRequest {
  page_id?: string | null;
  page?: string;
  place?: Placement;
  title?: string;
  allow_similar_page?: boolean;
}

/** What a page rename did: the page, the name it settled on, and its pin count. */
export interface PageRenameResult {
  page_id: string;
  page: string;
  pins_moved: number;
}

/**
 * One section of a page being created: a new analysis with its calls, or one
 * the caller already has, by id. Never both — the service refuses that, as it
 * refuses it for George's own `create_page`.
 */
export interface CreatePageAnalysis {
  title?: string;
  tool_calls?: PinToolCall[];
  pin_id?: string;
}

export interface CreatePageRequest {
  title: string;
  purpose?: string;
  allow_similar_page?: boolean;
  /**
   * The page's first sections, created WITH it in one transaction or not at
   * all (P2.a). Absent or empty makes the empty page this has always made.
   * At most `pages.workshop.max_analyses_per_build`; see room/keeping.ts,
   * which states every bound where the plan is drawn.
   */
  analyses?: CreatePageAnalysis[];
  /** Provenance for the pins the build creates. Decides nothing. */
  question?: string;
  conversation_id?: string;
}

/** A title or purpose change. `purpose: null` clears it. */
export interface UpdatePageRequest {
  title?: string;
  purpose?: string | null;
  allow_similar_page?: boolean;
}

export interface PageDeleted {
  id: string;
  title: string;
  /** Every pin the page held is in Ungrouped now. None was deleted. */
  pins_ungrouped: number;
}

/** One structural write to a page, whoever made it. Metadata only. */
export interface PageEvent {
  id: string;
  page_id: string | null;
  actor: 'user' | 'george';
  operation: string;
  pin_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  conversation_id: string | null;
  at: string;
}

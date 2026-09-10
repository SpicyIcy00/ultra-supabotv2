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
  /** The metric model (metrics.yaml metric_model): base or derived, and its name. */
  metric_kind?: string;
  metric_label?: string;
  /** The business the metric belongs to (metrics.yaml metric_model.registries). */
  metric_domain?: string;
  /**
   * What the DEFINITIONS permit next of this metric (get_sales, from
   * metrics.yaml): the subjects it may be broken down by, and the metrics
   * that explain a change in it. A surface offers "by store" or "why?" only
   * where these say so; nothing is decided by a client or by the model.
   */
  valid_group_by?: string[];
  drivers?: string[];
  /** The top_n the call was made with, when it was: the rows are ordered by value. */
  top_n?: number | null;
  /**
   * get_sales compare_to: both periods and how the baseline was chosen. The
   * deltas themselves are on the rows; this is what they were measured
   * against, for the receipts.
   */
  comparison?: {
    kind?: string;
    display_name?: string;
    method?: string;
    current?: { start?: string; end?: string };
    baseline?: { kind?: string; name?: string; start?: string; end?: string };
    baseline_statuses?: Record<string, number>;
    ranked_by_current?: boolean;
    /**
     * Which ranking the tool applied: null, 'value', 'biggest_drop' or
     * 'biggest_gain'. A Delta Ranking is drawn ONLY for the last two — the
     * tool ranked by change in the metric's unit after matching both windows
     * per subject, and that is the only ordering a ranking may claim.
     */
    rank_by?: string | null;
    /** Under a change ranking: the subjects with no numeric change, counted and named. */
    not_ranked?: {
      counts: Record<string, number>;
      no_current: { subject: string; baseline: number | null; unit?: string }[];
      no_baseline: { subject: string; value: number | null; unit?: string }[];
      ranked_subjects: number;
    };
  };
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
  /**
   * The seq of the call this one repeats, when the loop served it from this
   * turn's own record instead of running it again. Said by the loop on the
   * tool_call frame: the row reads "same as call N, not re-read", the rows
   * are not charted twice, and the call is not pinnable — the original is.
   */
  duplicate_of?: number;
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
    /**
     * Whether this call may become a pin: a read tool that ran without
     * error, as the LOOP says. A workflow run and a page read are calls
     * George made and neither is a tile. Absent on frames from an older
     * backend, which the client reads as pinnable — the server refuses
     * anything that is not.
     */
    pinnable?: boolean;
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
/** One chip under the greeting: a short label, and the question it asks. */
export interface FollowUp {
  label: string;
  question: string;
}

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
  /**
   * The obvious next question per brief item, most notable first.
   *
   * A chip is a QUESTION, not a staged answer. Clicking one asks George
   * normally, so the reply arrives with its own narration, notices and
   * receipts — and nothing here can ever be a figure that went stale sitting
   * on screen.
   */
  follow_ups: FollowUp[];
}

/**
 * A workflow George saved because he was asked to, in conversation.
 *
 * Same reasoning as PinnedFrame: a write that happened is a fact, and the UI
 * confirms it from the frame rather than from the model's wording. A saved
 * workflow is NOT a scheduled one — `awaiting_promotion` says it sits in the
 * approval queue, which is where "needs you" lives.
 */
export interface SavedFrame {
  workflow_id: string;
  name: string;
  version: number;
  steps: { name?: string; tool?: string }[];
  parameters: { name?: string }[];
  scheduled: boolean | null;
  awaiting_promotion: boolean;
  queue: string | null;
}

/**
 * A page George created or changed this turn, from the `page_changed` frame.
 *
 * Same reasoning as PinnedFrame: a write that happened is a fact, and the UI
 * confirms it from the frame — the COMMITTED result the tool returned — never
 * from the model's wording. `operations` are the structured records the
 * service produced (op, titles, where things went); the confirmation line is
 * built from them (pageChangeShape.ts), so "removed" can never be drawn as
 * "deleted" because the model said so.
 */
export interface PageChangedFrame {
  page_id: string;
  title: string;
  purpose: string | null;
  updated_at: string | null;
  analysis_count: number;
  analyses: { pin_id: string; title: string; position: number; tools: string[] }[];
  operations: Record<string, unknown>[];
  /** True for create_page; false for edit_page. */
  created: boolean;
}

/**
 * A George page as an IDENTITY: its id, or null for the ungrouped pins.
 *
 * Mirrors PageScope in backend/app/api/v1/routes/george.py, which binds the
 * server's page reader AND writer to one page of the caller's. `title` rides
 * along for the indicator only — it is what the page was called when the
 * scope was taken, it is never compared, and it is not sent as the identity
 * (pageScope.scopeForRequest). A rename retitles the indicator; the thread
 * stays bound to the same id.
 */
export interface PageScope {
  page_id: string | null;
  title: string | null;
}

/**
 * What George considered of the page the person asked from, as the loop
 * reports it after a `view_page` call — the `page_context` frame, and the
 * same object an answer post keeps in its payload (agent/loop.py, evidence).
 *
 * EVIDENCE, NOT A FIGURE. Nothing here is a number from the warehouse: it is
 * which page, when it was read, which pins were inspected with what status,
 * and what was not read and why. The figures themselves went to the model
 * and are in the tool-call log; the UI draws this to say what was considered.
 * `partial` means something asked for did not come back; `truncated` means
 * something on the page was not read at all.
 */
export interface PageContextPin {
  pin_id: string;
  title: string;
  /** ok | refused | failed | unrunnable | not_read */
  status: string;
  /** Why a not_read pin was not read: deadline, or figures_not_requested. */
  reason: string | null;
  calls: { tool: string; arguments: Record<string, unknown> }[];
  /** The latest snapshot among the pin's successful results, or null. */
  snapshot_timestamp: string | null;
  notice_kinds: string[];
}

export interface PageContextFrame {
  /**
   * The page's identity; null is the ungrouped pins. Absent on an answer
   * stored before 2026-09-08, which knew the page by title only.
   */
  page_id?: string | null;
  /** The page's title at the time of the answer; null is the ungrouped pins. */
  page: string | null;
  /** The owner's one-line purpose, as it read then. */
  purpose?: string | null;
  /** True when the page had nothing on it. */
  empty?: boolean;
  read_at: string;
  figures: boolean;
  pins_total: number;
  pins_inspected: number;
  pins_reproduced: number;
  pins: PageContextPin[];
  /** Pins on the page that were not read at all — beyond the bound. */
  not_inspected: { pin_id: string; title: string }[];
  /** Requested ids that are not on this page. */
  unavailable: string[];
  partial: boolean;
  truncated: boolean;
  rows_dropped: number;
  notice_kinds: string[];
  /** How many reads this record merges, when a turn read the page twice. */
  reads?: number;
}

/**
 * What one read WAS in this piece of work — the `finding` frame, and the same
 * object an answer post keeps in `payload.findings`.
 *
 * THE WHOLE OF WHAT THE MODEL MAY SAY ABOUT COMPOSITION. An integer naming a
 * call that already ran, and one of four words. The loop has validated every
 * entry against the executed set and against metrics.yaml before it is sent
 * (agent/findings.py): a call that failed, a write, a re-read, a driver the
 * definitions do not declare, a breakdown the metric refuses, or a read over a
 * different window is REJECTED and named in `rejected` rather than sent here.
 * So the client trusts this list absolutely and composes from it — and a turn
 * with no frame composes exactly as it did before the frame existed.
 */
export interface Finding {
  /** The call's seq — the same number on its tool_call and tool_result frames. */
  seq: number;
  role: 'primary' | 'driver' | 'breakdown' | 'context';
  /** For a driver or a breakdown: the seq of the primary it hangs off. */
  of: number | null;
  tool: string;
  /**
   * On the primary only: the definitions' identity for its drivers —
   * "net_sales = transaction_count x average_transaction_value" — read from
   * metrics.yaml by the loop, never written by the model. The Driver Split
   * prints it as the one line that is not a row.
   */
  identity?: string | null;
}

/**
 * One block of the composition George made (2026-09-10): which read, as which
 * kind of object, at what weight, under which key. Validated by the loop
 * (agent/compose.py) against the vocabulary in metrics.yaml `composition`
 * before it is sent; the same object an answer post keeps in
 * `payload.composition.blocks`. Nothing here is a figure or a pixel.
 */
export interface CompositionBlock {
  /**
   * What this edit does to the board (2026-09-10). A composition is a set of
   * edits, not a screen: an object George does not name stays exactly as it
   * was. Absent means `put`.
   */
  op?: 'put' | 'change' | 'quiet' | 'drop';
  kind?: 'text' | 'figure' | 'hero' | 'subject' | 'comparison' | 'table' | 'chart' | 'distribution' | 'draft' | 'state';
  /** George's key for the object. The same key in a later turn is the same object, changed. */
  key: string;
  /** Absent on a `change` that only re-points the object at another read. */
  weight?: 'lead' | 'supporting' | 'quiet';
  /** The read it draws from. Absent for text and a state with no read. */
  seq?: number;
  tool?: string;
  subject?: string;
  subjects?: string[];
  form?: 'line' | 'bar';
  label?: 'pending' | 'running' | 'waiting' | 'done' | 'blocked';
}

export interface CompositionFrame {
  /** The seq of the compose call itself; -1 when restored from a stored post. */
  seq: number;
  /** The blocks that stood. Replaces, never accumulates. */
  blocks: CompositionBlock[];
  /** What the model asked for and the loop refused, with the reason. */
  rejected: { block: unknown; reason: string }[];
}

export interface FindingFrame {
  /** The seq of the record_findings call itself. */
  seq: number;
  /** Every role that stood. Replaces, never accumulates. */
  findings: Finding[];
  /** What the model asked for and the loop refused, with the reason. */
  rejected: { seq: number | null; role: string | null; reason: string }[];
}

/**
 * The desk as a question was asked from it (2026-09-09).
 *
 * Mirrors DeskContext in backend/app/api/v1/routes/george.py. The subjects
 * are ids and labels OFF ROWS the tools returned — never a label the model
 * inferred, never text read back out of the DOM — and the window is the one
 * a replay moved the work to. The loop names it to George on the question,
 * and the question post keeps it in its payload so a reload restores the
 * same focus from the same record. Nothing in it is a figure.
 */
export type DeskDimension = 'store' | 'product' | 'category';

export interface DeskSubject {
  id: string;
  label: string;
}

export interface DeskSelection {
  dimension: DeskDimension;
  subjects: DeskSubject[];
}

export interface DeskWindow {
  kind: 'preset' | 'explicit';
  name?: string;
  start?: string;
  end?: string;
}

/**
 * What the workspace is showing, as a layout and never as a figure.
 *
 * The representation the composer chose, the subject dimension, the subjects
 * it drew BY NAME, the metric's display label and whether the figures carry a
 * comparison (metrics.yaml surface.desk.context). Without it a question asked
 * with nothing selected told George nothing about what the person was
 * looking at.
 */
export interface DeskDrawn {
  representation?: string | null;
  dimension?: DeskDimension | null;
  subjects: string[];
  metric_label?: string | null;
  compared: boolean;
}

/** One thing the data singled out, with the reason a tool established. */
export interface DeskAttentionMark {
  subject: string;
  reason: 'against_the_majority' | 'ranked_first';
}

/** The move the workspace last offered, by the ground that produced it. */
export interface DeskRecommendationRef {
  ground: string;
  question?: string | null;
}

export interface DeskContext {
  selection?: DeskSelection | null;
  /**
   * What is on the board, so a fragment resolves against what is being looked
   * at rather than against the transcript (2026-09-10). Keys, kinds, weights
   * and names only — never a figure.
   */
  board?: {
    key: string; kind: string; weight: string;
    about?: string; measure?: string; window?: string;
  }[];
  window?: DeskWindow | null;
  drawn?: DeskDrawn | null;
  attention?: DeskAttentionMark[];
  recommendation?: DeskRecommendationRef | null;
}

export type GeorgeTurn =
  | {
      role: 'user';
      text: string;
      at: string;
      parentId?: string | null;
      /** What was on the desk when this was asked, as it was sent. */
      desk?: DeskContext | null;
    }
  | {
      role: 'george';
      text: string;
      thinking: string;
      /**
       * What George said BEFORE he read something — prose from an iteration
       * that went on to call tools, moved here by an `answer_reset` with
       * reason `interim_prose`. Narration, not the answer: it is shown in
       * the activity disclosure beside his reasoning and never above the
       * answer, so what is on screen and what the river stored agree about
       * what he concluded. Absent on a stored turn; the server keeps the
       * final answer only.
       */
      narration?: string;
      /**
       * The answer George is replacing, kept on screen until the replacement
       * starts arriving.
       *
       * SUPERSEDED, NOT BLANKED. Seven paths ask the model to write the answer
       * again (agent/loop.py, `_reset_answer`) — an unsurfaced caveat, a pin or
       * save or page claimed but never made, the volunteering cap, the
       * convergence cap. Each is right to fire, and until 2026-09-08 each one
       * emptied `text` on arrival: a complete paragraph the reader was halfway
       * through vanished, and the screen sat blank for as long as the rewrite
       * took. That is the "content disappears and then reappears" the dogfood
       * found.
       *
       * So the old answer moves here and stays visible, marked as being
       * rewritten, until the first delta of the new one lands and clears it.
       * Nothing is lost, nothing is claimed to be final, and the stored answer
       * is still only ever `text`.
       *
       * NOT SET FOR `interim_prose`. That reason means George narrated and then
       * went to read something, and CLAUDE.md fixes where that prose belongs:
       * the activity disclosure, never above the answer. It goes to `narration`
       * alone, and the screen is not blank meanwhile because the activity line
       * is saying what he is doing.
       */
      superseded?: string;
      toolCalls: ToolCall[];
      notices: GeorgeNotice[];
      /** Pins created during this turn, in the order they were made. */
      pinned: PinnedFrame[];
      /** Workflows saved during this turn, in the order they were made. */
      saved: SavedFrame[];
      /** Pages created or changed during this turn, in order, from the frame. */
      pageChanges: PageChangedFrame[];
      /**
       * The roles that stood, from the newest `finding` frame. Absent until
       * one arrives, and absent for good on a turn that never recorded any —
       * which composes as adjacency, exactly as before.
       */
      findings?: Finding[];
      /**
       * The screen George composed, from the newest `compose` frame. Absent
       * on a turn that never composed — which the workspace draws plainly.
       */
      composition?: CompositionFrame;
      /** meta of the last tool result — the receipts shown under the answer. */
      receipts?: ToolMeta;
      /**
       * What George considered of the page the question was asked from, from
       * the `page_context` frame. Absent when he did not read the page.
       */
      pageContext?: PageContextFrame;
      /**
       * The turn's posts in the river, from the `post` frame. Absent until the
       * frame arrives; absent for good on a turn that was stopped before it.
       * The ONLY key a live turn may be reconciled with a stored post by.
       */
      post?: PostFrame;
      done?: DoneFrame;
      error?: string;
      /**
       * True when the person stopped the turn. A stopped turn has no `done`
       * and no `post`, and must never be drawn as a finished answer: what is on
       * screen is where George got to, not what he concluded.
       */
      cancelled?: boolean;
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

/**
 * The turn's two posts in the river, named as they are written.
 *
 * Lets a client reconcile the turn it drew optimistically with the one that
 * was stored, instead of refetching to discover it already had it.
 *
 * `stored` is false when logging is off or failed. Nothing was written then,
 * and the client must not render a post that does not exist — the same rule
 * UI rule 8 states for any claim about state.
 */
export interface PostFrame {
  question_post_id: string;
  /** Null when the turn produced no answer — a question nobody answered. */
  answer_post_id: string | null;
  thread_id: string;
  conversation_id: string;
  visibility: 'org' | 'private';
  stored: boolean;
}

export interface DoneFrame {
  conversation_id: string;
  /** The chat this turn belongs to. Send it back on the next question. */
  thread_id?: string;
  iterations: number;
  tool_calls: number;
  status: string;
  notice_forced: boolean;
  usage: {
    input: number;
    output: number;
    cache_read: number;
    /** The write side. 0 on turns logged before the column existed. */
    cache_creation?: number;
  };
  cache_hit: boolean;
  /**
   * Whether `cache_hit` is a measurement. False when the turn never reached
   * the API, where `cache_read` is 0 because no request was made rather than
   * because the cache missed. Optional: turns stored before this field
   * existed do not carry it.
   */
  cache_measured?: boolean;
}

/**
 * Loop state, drives the reactive mark.
 *
 * Every one of these is backed by a signal that exists — a frame the loop
 * emitted, a request the browser sent, or something the person is doing in the
 * composer. `building` is `answering` over results that have already landed;
 * `complete` is the `done` frame, held briefly before the mark settles. See
 * presence.ts for the states this app deliberately refuses to draw.
 */
export type GeorgeState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'running'
  | 'answering'
  | 'building'
  | 'complete'
  | 'error';

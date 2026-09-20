/**
 * SSE frame types for the Bob endpoint.
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
  /**
   * The caveat this read raised, which belongs to the objects drawn from it.
   * `kind: "multiple"` wraps several.
   */
  notice?: BobNotice | null;
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

export interface BobNotice {
  kind: string;
  message: string;
  source?: string;
  /**
   * A `multiple` notice carries the real ones here — one read can raise
   * several, and the purchase plan raises five. The container is never
   * rendered itself; its items are.
   */
  items?: BobNotice[];
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
     * Bob made and neither is a tile. Absent on frames from an older
     * backend, which the client reads as pinnable — the server refuses
     * anything that is not.
     */
    pinnable?: boolean;
  };
}

/**
 * A pin Bob created because the user asked him to, in conversation.
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
 * Bob's opening line on a new chat.
 *
 * Mirrors GreetingResponse in backend/app/api/v1/routes/bob.py. It is NOT a
 * turn and must never be pushed into `turns`: turns are replayed to the model
 * as history (see toHistory in useBobStream), and this is something Bob
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
  notices: BobNotice[];
  /** The brief's own meta — source, filters, snapshot_timestamp, sections. */
  meta: ToolMeta;
  /** Sections that could not run at all. */
  blind_sections: string[];
  /**
   * The obvious next question per brief item, most notable first.
   *
   * A chip is a QUESTION, not a staged answer. Clicking one asks Bob
   * normally, so the reply arrives with its own narration, notices and
   * receipts — and nothing here can ever be a figure that went stale sitting
   * on screen.
   */
  follow_ups: FollowUp[];
}

/**
 * A workflow Bob saved because he was asked to, in conversation.
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
 * A page Bob created or changed this turn, from the `page_changed` frame.
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
 * A Bob page as an IDENTITY: its id, or null for the ungrouped pins.
 *
 * Mirrors PageScope in backend/app/api/v1/routes/bob.py, which binds the
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
 * What Bob considered of the page the person asked from, as the loop
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
 * One block of the composition Bob made (2026-09-10): which read, as which
 * kind of object, at what weight, under which key. Validated by the loop
 * (agent/compose.py) against the vocabulary in metrics.yaml `composition`
 * before it is sent; the same object an answer post keeps in
 * `payload.composition.blocks`. Nothing here is a figure or a pixel.
 */
export interface CompositionBlock {
  /**
   * What this edit does to the board (2026-09-10). A composition is a set of
   * edits, not a screen: an object Bob does not name stays exactly as it
   * was. Absent means `put`.
   */
  op?: 'put' | 'change' | 'quiet' | 'drop';
  kind?:
    /**
     * THE CATALOGUE (P1.f, 2026-09-14): the six marks the renderer draws,
     * plus the five kinds that are not readings of a read and keep their own
     * tiles. `composition.widgets` in metrics.yaml is this list, and Bob
     * may compose nothing else. `memory` is the fifth (P2.f): every view he
     * holds, with a Forget on each row.
     */
    | 'figure' | 'dumbbell' | 'ranked' | 'contributors' | 'line' | 'table'
    /** P2S.3 reopened the catalogue: the design's shapes, each with its rule. */
    | 'bar' | 'multiples' | 'area' | 'stacked' | 'pie' | 'scatter' | 'heatmap'
    | 'calendar' | 'waterfall' | 'treemap' | 'gauge'
    | 'draft' | 'state' | 'control' | 'system' | 'memory'
    /**
     * HISTORICAL ONLY. A board persists between turns and across a deploy, so
     * a browser that had these on screen still has them and a stored thread
     * still carries them: `text` left with P1.c (the reading is not an
     * object, and the board drops those in `editsFor`), and the other seven
     * with P1.f, where fourteen names for six drawings became six.
     * `catalogue.markFor` still maps every one of them onto a mark;
     * `composition.retired_kinds` is the same list on the server.
     */
    | 'text' | 'hero' | 'subject' | 'comparison'
    | 'chart' | 'distribution' | 'timeline' | 'recommendation';
  /** Bob's key for the object. The same key in a later turn is the same object, changed. */
  key: string;
  /**
   * THE LOOP DREW THIS, NOT BOB (P2S.7). Since a turn's board is one list
   * built as he goes, the reads that landed after he composed ride in his
   * composition as quiet blocks the machine shaped — and a key he never chose
   * must never count as him naming an object (`travel`), exactly as a
   * `default: true` frame's keys never did.
   */
  default?: boolean;
  /** Absent on a `change` that only re-points the object at another read. */
  weight?: 'lead' | 'supporting' | 'quiet';
  /** The read it draws from. Absent for text and a state with no read. */
  seq?: number;
  tool?: string;
  subject?: string;
  label?: 'pending' | 'running' | 'waiting' | 'done' | 'blocked';
  /** HISTORICAL ONLY, like the kinds above: a stored comparison, chart or
   *  recommendation still carries these, and nothing composes one now. */
  subjects?: string[];
  form?: 'line' | 'bar';
  action?: 'order' | 'investigate' | 'check' | 'hold' | 'switch_on' | 'leave_it';
  /** What a control changes: scope only, never a threshold. */
  argument?: 'date_range' | 'top_n';
  /**
   * A shape Bob composed himself, instead of naming a widget.
   *
   * A tree of layouts and marks (metrics.yaml composition.grammar, validated
   * in agent/grammar.py). Every mark names a read and a COLUMN — there is
   * nowhere in it for a figure, a word, a colour or a size — so a shape
   * nobody listed in advance is exactly as trustworthy as a named one.
   */
  spec?: SpecNode;
  /** Every read a spec draws from, so the loop charts them all. */
  seqs?: number[];
  /**
   * Which row stays lit while the rest cool — or the two or three a
   * comparison is about (2026-09-15). An annotation, not a shape.
   */
  emphasise?: string | string[];
  /**
   * THE CLAIM-TITLE: the few words saying what this block SAYS, in Bob's
   * own words. Never a digit — that is enforced server-side, because a figure
   * up here would be one with no receipt over one that has. It was `note`
   * until P1.f gave the title its own name; a stored block still says `note`.
   */
  claim?: string;
  note?: string;
  /**
   * THE QUESTION THIS READ ANSWERS (P3.o), in Bob's own words — drawn in bold
   * at the head of the block with the `claim` running on as its answer, so the
   * questions read down the page as the path he took. Held server-side to the
   * claim's rule: no digits, because it sits above a figure
   * (metrics.yaml composition.question).
   */
  question?: string;
  /**
   * WHAT HE THINKS THIS BLOCK SHOWS (2026-09-17): a sentence or two, drawn
   * beside the mark. Held server-side to the reading's rule — a figure only
   * when a read this turn returned it (metrics.yaml composition.thought).
   */
  thought?: string;
  /** A scatter's upright measure and across measure, or a gauge's against — COLUMNS. */
  field?: string;
  against?: string;
  /** The ladder checked this read and ruled it out; drawn `READ n · RULED OUT` (P2S.3). */
  ruled_out?: boolean;
  /**
   * WHAT THIS POINT BELONGS TO (P2S.8): the `key` of another block of the same
   * composition. The board gathers this one under that one instead of placing
   * it beside — which is how a grid of reads becomes one argument.
   *
   * ONE LEVEL, and the server has already settled it: an `under` naming a key
   * that is not there, a second level and a cycle are all dropped before this
   * reaches the room, so the renderer may trust it. An empty string means Bob
   * detached it — nothing else can clear a field the board carries forward.
   */
  under?: string;
  /** How it sits under that block (metrics.yaml `composition.relation`). */
  relation?: 'evidence' | 'counter' | 'scale';
}

/** One node of a composed shape: a layout that arranges, or a mark that draws. */
export interface SpecNode {
  layout?: 'stack' | 'row' | 'grid' | 'panel';
  children?: SpecNode[];
  cols?: number;
  gap?: 'tight' | 'normal' | 'loose';
  heading?: { seq: number; field: string };

  mark?: 'value' | 'delta' | 'bar' | 'line' | 'point' | 'cell' | 'rows' | 'label' | 'prose'
    | 'range' | 'bullet' | 'ring' | 'dots' | 'calendar';
  seq?: number;
  tool?: string;
  /**
   * WHICH ROW this node and its children draw. The one channel naming a
   * VALUE rather than a column — a selector, checked against the rows and
   * refused if none carries it.
   */
  subject?: string;
  /** Each of these names a COLUMN of the read, never a value. */
  field?: string;
  by?: string;
  colour?: string;
  /**
   * Which row stays lit while the others cool. Names a value, not a column.
   * ONE here, unlike a block's: `grammar.annotation` takes a single name, and
   * a type wider than the validator accepts would be a lie about the channel.
   */
  emphasise?: string;
  /** A few words ON the mark. Never contains a digit — that is enforced. */
  note?: string;
  order?: string;
  label?: string;
  /** The whole a bullet's field is part of — a column of the same row. */
  against?: string;
  limit?: number;
  weight?: 'lead' | 'supporting' | 'quiet';
}

/**
 * HOW BOB LAID THE RIGHT-HAND SIDE OUT FOR THIS ANSWER (P3.p, 2026-09-20).
 *
 * The owner: *"i want it to use that space like its designing its own page or
 * artifact for its answer … it doesnt have to have text before a chart … in
 * that space its its playground."* Until this, nothing he said reached the
 * ARRANGEMENT — the room packed his blocks into whichever column was shortest,
 * which is "here's this and here's that" as an algorithm.
 *
 * The four layouts are the grammar's own (`composition.grammar.layouts`), one
 * level up, so there is no second vocabulary. A leaf is one of HIS block keys
 * — which keeps the block's receipts, its notice, its read time and its
 * tap-to-inspect, all of which a page of raw marks would have dropped — or a
 * line of his words, which may sit anywhere in the tree.
 *
 * THERE IS NO VALUE, COLOUR, WIDTH OR SIZE IN IT. That is what makes an
 * unbounded playground cost nothing in trust, and it is enforced server-side
 * (agent/compose._arrangement), never here.
 *
 * ABSENT IS THE PACKING, which is every answer composed before this.
 */
export type Arrangement =
  | { layout: 'stack' | 'row' | 'grid' | 'panel'; children: Arrangement[];
      cols?: number; heading?: string }
  | { block: string }
  | { say: string };

export interface CompositionFrame {
  /** The seq of the compose call itself; -1 when restored from a stored post. */
  seq: number;
  /** The blocks that stood. Replaces, never accumulates. */
  blocks: CompositionBlock[];
  /** How he arranged them, or absent for the packing (P3.p). */
  arrangement?: Arrangement | null;
  /** What the model asked for and the loop refused, with the reason. */
  rejected: { block: unknown; reason: string }[];
  /**
   * TRUE WHEN NOBODY COMPOSED THIS (P1.b, 2026-09-13). The loop composed a
   * default the moment the reads landed, so the board is not empty for the
   * round trip it takes Bob to say what the rows are
   * (agent/default_composition.py). Validated by the same gate as his, drawn
   * the same way, and superseded by his blocks when they arrive.
   *
   * Said on the frame rather than inferred, because a default the client
   * could not tell apart from a composition would be the machine's judgement
   * wearing Bob's name.
   */
  default?: boolean;
}

/**
 * The reading's three slots, as the loop validated them (agent/reading.py).
 * Every one is optional: a confirmation has nothing to say in three parts.
 */
export interface ReadingFrame {
  /** The few words of the answer that ARE the point. A highlight, not a line. */
  claim?: string;
  /** What qualifies the figures, whole, above them. Never carries a digit. */
  caveat?: string;
  /** One sentence: the one thing to do or check. Never carries a digit. */
  next?: string;
  /** Up to three questions he suggests asking next, drawn to tap (2026-09-17). */
  asks?: string[];
}

/**
 * WHAT TO DO ABOUT ONE ROW, as the loop validated it (agent/actions.py).
 *
 * Every field but `reason` is machine fact; `reason` is Bob's few words for
 * WHY this row, held to the annotation rule and carrying no digit. `costs` and
 * `modelTurn` are DERIVED from the act in metrics.yaml and are never written by
 * the model — a suggestion cannot advertise a speed this machine does not have.
 */
export interface ActionOffer {
  /** What the surface does when it is tapped. */
  act: 'why' | 'open' | 'replay' | string;
  /** The read it is about — where the target was checked and what a replay re-runs. */
  seq: number;
  /** The row it sits on, or null for an action about the answer. */
  target: string | null;
  /** Bob's words: why this one. Never a figure. */
  reason: string;
  /** "a turn", "~1s", "replay · ~1s" — from the definitions, drawn as found. */
  costs: string;
  /** Whether tapping it costs a conversation rather than a second. */
  modelTurn: boolean;
  /** For a replay: which scope argument it moves. */
  argument?: string;
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
 * Mirrors DeskContext in backend/app/api/v1/routes/bob.py. The subjects
 * are ids and labels OFF ROWS the tools returned — never a label the model
 * inferred, never text read back out of the DOM — and the window is the one
 * a replay moved the work to. The loop names it to Bob on the question,
 * and the question post keeps it in its payload so a reload restores the
 * same focus from the same record. Nothing in it is a figure.
 */
export type DeskDimension = 'store' | 'product' | 'category' | 'supplier';

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
 * with nothing selected told Bob nothing about what the person was
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

/**
 * Something the person NAMED with `@` that binds neither a selection nor a
 * scope — a rule (P2.c). Bob is told its name and its id; running or
 * editing it is his tool call and the owner's decision.
 */
export interface DeskReference {
  kind: string;
  id: string;
  label: string;
}

export interface DeskContext {
  selection?: DeskSelection | null;
  references?: DeskReference[];
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

export type BobTurn =
  | {
      role: 'user';
      text: string;
      at: string;
      parentId?: string | null;
      /** What was on the desk when this was asked, as it was sent. */
      desk?: DeskContext | null;
    }
  | {
      role: 'bob';
      text: string;
      thinking: string;
      /**
       * What Bob said BEFORE he read something — prose from an iteration
       * that went on to call tools, moved here by an `answer_reset` with
       * reason `interim_prose`. Narration, not the answer: it is shown in
       * the activity disclosure beside his reasoning and never above the
       * answer, so what is on screen and what the river stored agree about
       * what he concluded. Absent on a stored turn; the server keeps the
       * final answer only.
       */
      narration?: string;
      /**
       * The answer Bob is replacing, kept on screen until the replacement
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
       * NOT SET FOR `interim_prose`. That reason means Bob narrated and then
       * went to read something, and CLAUDE.md fixes where that prose belongs:
       * the activity disclosure, never above the answer. It goes to `narration`
       * alone, and the screen is not blank meanwhile because the activity line
       * is saying what he is doing.
       */
      superseded?: string;
      toolCalls: ToolCall[];
      notices: BobNotice[];
      /** Pins created during this turn, in the order they were made. */
      pinned: PinnedFrame[];
      /** Workflows saved during this turn, in the order they were made. */
      saved: SavedFrame[];
      /** Pages created or changed during this turn, in order, from the frame. */
      pageChanges: PageChangedFrame[];
      /**
       * The roles that stood, from the newest `finding` frame. HISTORICAL
       * since P1.f: the loop no longer emits one — the channel is now the
       * reading below — and a stored turn from before it still carries them
       * for any surface that reads the old frames.
       */
      findings?: Finding[];
      /**
       * WHAT BOB SAID, IN ITS THREE SLOTS, from the newest `reading` frame
       * (P1.f). `claim` is a HIGHLIGHT — the few words of the answer that are
       * the point, lit where he said them and drawn nowhere if he did not;
       * `caveat` is drawn whole above the figures; `next` is one sentence,
       * last, under them. Absent on a turn that said none of it, which draws
       * exactly as it drew before this existed.
       */
      reading?: ReadingFrame;
      /**
       * WHAT HE OFFERED TO DO ABOUT A ROW, from the newest `actions` frame
       * (P2.d). A targeted offer is drawn on the row it names, inside the mark
       * that draws that read; an untargeted one is drawn at the foot beside
       * `next`. Absent on a turn that offered none, which draws exactly as it
       * drew before this existed.
       */
      actions?: ActionOffer[];
      /**
       * The screen Bob composed, from the newest `compose` frame. Absent
       * on a turn that never composed — which the workspace draws plainly.
       */
      composition?: CompositionFrame;
      /**
       * The board as it stood before Bob composed: one object per read
       * that landed, shaped by the rule inferShape has always used, composed
       * by the loop and validated exactly as his are. Kept beside his rather
       * than merged into it — `editsFor` in room/board.ts applies both, and
       * supersedes a default over any read he composed over himself.
       */
      defaultComposition?: CompositionFrame;
      /** meta of the last tool result — the receipts shown under the answer. */
      receipts?: ToolMeta;
      /**
       * What Bob considered of the page the question was asked from, from
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
       * screen is where Bob got to, not what he concluded.
       */
      cancelled?: boolean;
      at: string;
    };

/**
 * One earlier turn, replayed to the server on the next question.
 *
 * Bob holds no conversation state between requests, so this is what gives a
 * follow-up its referent — "pin that" is meaningless without it. `tool_calls`
 * carries only calls that SUCCEEDED: they are the ones whose results were shown
 * on screen, and therefore the only ones that may become a pin.
 */
export interface AskHistoryTurn {
  role: 'user' | 'bob';
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
  /**
   * The wait, measured (P0.3): one monotonic clock inside the turn, the same
   * figure written to george.conversations. Absent on turns from a build
   * before the clock existed — which is not the same as zero, and is why this
   * is optional rather than defaulted.
   */
  duration_ms?: number;
  /** The same clock per model round trip, in order. */
  iteration_ms?: number[];
  /**
   * How many times deterministic code made Bob write the answer again —
   * the six gates as one number. Each is a whole extra round trip.
   */
  corrective_turns?: number;
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
export type BobState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'running'
  | 'answering'
  | 'building'
  | 'complete'
  | 'error';

/**
 * A piece of work, as one thing.
 *
 * WHY THIS FILE EXISTS. George has a rigorous vocabulary for what a NUMBER is:
 * inferShape decides what one result may be drawn as, resultShape decides how
 * several results compose, and every figure carries the meta of the call behind
 * it. He has had no vocabulary at all for what a piece of WORK is — a question,
 * everything he did about it, and the answer, as one object. So the two things
 * that ARE one exchange were drawn by two components that agreed only by
 * coincidence: AnswerTurn while it streamed, PostCard once it was stored.
 *
 * WHAT THAT COST. At `done` the loop invalidates the thread query; when the
 * refetch lands, riverMerge drops the live turn and the same exchange is drawn
 * by a different component in a different parent. React unmounts one subtree
 * and mounts another, so every piece of local state in it resets — which is why
 * figures somebody was reading folded away by themselves. Worse, the two
 * renderings could DIVERGE, which is the failure UI rule 3 exists to prevent
 * and which inferShape already solved one layer down.
 *
 * SO BOTH NORMALISE HERE, AND THE LIST IS ONE LIST. `riverItems` takes the
 * stored posts and the live turns riverMerge did not drop and returns a single
 * ordered array of items with stable ids. The handoff then changes a FIELD —
 * `state` goes from `complete` to `stored` — instead of swapping a subtree,
 * because the item at that position keeps its identity, its component and its
 * DOM.
 *
 * WHAT MUST AGREE, AND WHAT MAY NOT. `workSubstance` names the part of a work
 * unit that is the same fact whether it is live or stored: the question, the
 * prose, the notices, the composed blocks, the receipts, the page evidence and
 * the calls a pin may hold. Those are held identical by the suite. The rest is
 * honestly different — a live turn has the model's reasoning and results with
 * row counts, a stored post has neither, and pretending otherwise would mean
 * inventing one of them.
 *
 * NOTHING HERE READS PROSE. Every field comes from a frame, from the stored
 * payload, or from the composition layer. The one thing a work unit will never
 * have is a value parsed out of what George wrote.
 */
import type {
  DeskContext,
  Finding,
  GeorgeNotice,
  GeorgeTurn,
  PageChangedFrame,
  PageContextFrame,
  PinnedFrame,
  SavedFrame,
  ToolCall,
  ToolMeta,
} from '../../types/george';
import type { PinToolCall } from '../../types/pins';
import type { Post } from '../../types/river';
import { storedPageContext } from './pageScope';
import { postView, storedCalls, type PostView } from './postShape';
import { composeWork, compositionBlocks, type Composition } from './composeWork';
import { dedupeSources } from './dedupe';
import {
  blockResults,
  sourcesFromCalls,
  sourcesFromCharted,
  type ResultBlock,
  type ResultSource,
  type ShapedResult,
} from './resultShape';
import { pinnableCalls } from './turnShape';

/**
 * Where a piece of work has got to.
 *
 * `stored` is not a synonym for `complete`. Complete means the turn finished in
 * front of the reader and the client still holds its frames; stored means the
 * river is the source and the frames are gone. They render almost identically
 * and they are different facts, so they are different words.
 */
export type WorkState = 'streaming' | 'complete' | 'stopped' | 'failed' | 'stored';

/** Something a person said. Never George. */
export interface Utterance {
  kind: 'utterance';
  id: string;
  text: string;
  at: string;
  /** Who wrote it, when the river knows. Absent for a live turn: it is yours. */
  authorUser: string | null;
  /** The stored post, when there is one — for sharing and for its own time. */
  post: Post | null;
  /** Whether the viewer may share this into the river. */
  canShare: boolean;
  /**
   * Where the person was when they asked, when that is a known fact: the
   * page the thread is bound to. Never a title the model made up.
   */
  eyebrow: string | null;
  /** This question continues the work above it (see `continuesWork`). */
  continues: boolean;
  /** Live only: the post this question replied to, as the composer sent it. */
  parentId?: string | null;
  /**
   * What was on the desk when this was asked: the subjects selected and the
   * window moved to. From the question post's payload once stored, and from
   * the ask options while live — the same object, so a reload restores the
   * same focus. Never read from prose.
   */
  desk?: DeskContext | null;
}

/** A piece of George's work: the question, what he did, and what he found. */
export interface WorkUnit {
  kind: 'work';
  /**
   * Stable across the live-to-stored handoff.
   *
   * The answer post's id as soon as the `post` frame names it, so the live unit
   * and the stored unit are the SAME item and React keeps the DOM. Before that
   * frame there is no id in existence to use, and a synthetic one is honest:
   * nothing is reconciled by it, because riverMerge reconciles by post id and
   * by nothing else.
   */
  id: string;
  state: WorkState;

  /* ---- substance: identical live and stored (see workSubstance) ---- */

  /** The question this work answers, when the caller has it. Never from prose. */
  question?: string;
  /** George's answer. */
  prose: string;
  notices: GeorgeNotice[];
  /** The results, already composed by resultShape. Every block, in reading order. */
  blocks: ResultBlock[];
  /**
   * The same results, composed by ROLE when George said what each read was.
   *
   * `adjacent` is the V1 surface and is what a turn with no findings gets;
   * `structured` is the ladder — the figure, what moved it, where it sits —
   * built from the validated `finding` frame (composeWork.ts). `blocks` is
   * always this composition flattened, so anything that only needs the blocks
   * keeps working unchanged.
   */
  composition: Composition;
  /** The roles that stood, exactly as the loop validated them. Empty is honest. */
  findings: Finding[];
  /** The sources the surface was composed from, after deduplication. */
  sources: ResultSource[];
  /** What was suppressed as a duplicate of another result, with what shows it. */
  suppressed: { seq: number; coveredBy: number[] }[];
  /** The primary result, when George said which it was and it was drawn. */
  primary: ShapedResult | null;
  /** This work continues the work above it. Presentation only; the post is its own. */
  continues: boolean;
  /** A later piece of work continues this one. */
  continuedBy: boolean;
  /** The fallback receipts, used only when nothing was drawn. */
  receipts?: ToolMeta;
  pageContext?: PageContextFrame;
  /**
   * The calls a pin may hold, or null when there are none it may.
   *
   * Null and empty are different: null is "this cannot be pinned" — a post from
   * before the calls were stored, or one whose payload does not survive
   * validation — and it means no Pin is offered at all. Nothing here ever
   * reconstructs a call from rows or prose.
   */
  pinnable: PinToolCall[] | null;

  /* ---- live-only, and honestly absent once stored ---- */

  /** An answer being replaced, still on screen. Live only. */
  superseded?: string;
  /** Prose written before a read. The activity disclosure's, never the answer's. */
  narration?: string;
  /** The model's own reasoning. Never evidence, never a source of a figure. */
  thinking: string;
  /**
   * The calls, for the activity line.
   *
   * A live turn's carry their results and row counts. A stored post's are the
   * validated `calls` payload with no results, so the line says what George did
   * without a count — true, and better than the nothing a stored post showed
   * before.
   */
  calls: ToolCall[];
  pinned: PinnedFrame[];
  saved: SavedFrame[];
  pageChanges: PageChangedFrame[];
  /** Present on a turn that failed. */
  error?: string;
  /** The done frame's counts, for the activity panel. Live only. */
  iterations?: number;
  cacheHit?: boolean;

  /* ---- chrome ---- */

  at: string;
  conversationId: string | null;
  /** The stored post, when there is one: its time, its label, its sharing. */
  post: Post | null;
  /** How the post is presented. Absent while live — there is no post yet. */
  view: PostView | null;
}

export type RiverItem = Utterance | WorkUnit;

/* -------------------------------------------------------------- from a turn -- */

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

function stateOf(turn: AnswerTurn): WorkState {
  if (turn.cancelled) return 'stopped';
  if (turn.error) return 'failed';
  if (turn.done) return 'complete';
  return 'streaming';
}

/**
 * A live turn as a work unit.
 *
 * @param fallbackId used only until the `post` frame names the answer post.
 *   Never used to reconcile anything.
 */
export function workUnitFromTurn(
  turn: AnswerTurn,
  question: string | undefined,
  fallbackId: string,
): WorkUnit {
  return {
    kind: 'work',
    id: turn.post?.answer_post_id || turn.post?.question_post_id || fallbackId,
    state: stateOf(turn),
    question,
    prose: turn.text,
    notices: turn.notices,
    ...composed(sourcesFromCalls(turn.toolCalls), turn.findings),
    receipts: turn.receipts,
    pageContext: turn.pageContext,
    // Only the calls the LOOP marked pinnable, and only once the turn is over:
    // a pin of a call from a turn still running is a pin of work in progress.
    pinnable: turn.done ? pinnableCalls(turn.toolCalls) : null,
    superseded: turn.superseded,
    narration: turn.narration,
    thinking: turn.thinking,
    calls: turn.toolCalls,
    pinned: turn.pinned,
    saved: turn.saved,
    pageChanges: turn.pageChanges,
    error: turn.error,
    iterations: turn.done?.iterations,
    cacheHit: turn.done?.cache_hit,
    at: turn.at,
    conversationId: turn.done?.conversation_id ?? turn.post?.conversation_id ?? null,
    post: null,
    view: null,
    continues: false,
    continuedBy: false,
  };
}

/* -------------------------------------------------------------- from a post -- */

/**
 * A stored post as a work unit.
 *
 * The activity calls come from the SAME validated list the Pin uses, so a post
 * that cannot be pinned also does not narrate calls it cannot prove it made.
 * `seq` is the position in that list, which is the order the loop stored — the
 * only order this layer is entitled to.
 */
/**
 * Compose once, hand out every view of it. The composition is the thing; the
 * flat block list is derived from it so the two cannot disagree.
 */
function composed(
  raw: ResultSource[],
  findings: Finding[] | undefined,
): Pick<WorkUnit, 'composition' | 'blocks' | 'findings' | 'sources' | 'suppressed' | 'primary'> {
  // One fact, one representation (dedupe.ts) — before composition, so a
  // suppressed result is neither drawn nor sectioned.
  const { kept, suppressed } = dedupeSources(raw);
  const composition = composeWork(kept, findings);
  const blocks = compositionBlocks(composition);
  const primarySeq = (findings ?? []).find((f) => f.role === 'primary')?.seq;
  const primary = blockResults(blocks).find((r) => r.source.seq === primarySeq) ?? null;
  return { composition, blocks, findings: findings ?? [], sources: kept, suppressed, primary };
}

/**
 * The roles a stored post carries, or none.
 *
 * The loop persists only the VALIDATED list (agent/loop.py `_answer_payload`),
 * so what is here already passed every check. It is still read defensively:
 * a payload is data somebody could have edited, and a malformed entry is
 * dropped rather than trusted — the surface then falls back to adjacency,
 * which is never wrong, only less.
 */
export function storedFindings(post: Post): Finding[] | undefined {
  const raw = (post.payload as { findings?: unknown } | null)?.findings;
  if (!Array.isArray(raw)) return undefined;
  const out: Finding[] = [];
  for (const entry of raw) {
    const e = entry as Partial<Finding> | null;
    if (!e || typeof e.seq !== 'number') continue;
    if (e.role !== 'primary' && e.role !== 'driver' && e.role !== 'breakdown' && e.role !== 'context') continue;
    out.push({
      seq: e.seq,
      role: e.role,
      of: typeof e.of === 'number' ? e.of : null,
      tool: typeof e.tool === 'string' ? e.tool : '',
      // The definitions' identity for the drivers, on the primary only, as
      // the loop read it from metrics.yaml. Kept so a reload draws the same
      // line under the drivers the live turn drew.
      ...(e.role === 'primary' && typeof e.identity === 'string' && e.identity ? { identity: e.identity } : {}),
    });
  }
  return out.length ? out : undefined;
}

export function workUnitFromPost(post: Post, question: string | undefined): WorkUnit {
  const payload = post.payload as { charted?: unknown } | null;
  const pinnable = storedCalls(post);
  return {
    kind: 'work',
    id: post.id,
    state: 'stored',
    question,
    prose: post.body ?? '',
    notices: post.notices ?? [],
    ...composed(sourcesFromCharted(payload?.charted), storedFindings(post)),
    receipts: post.receipts ?? undefined,
    pageContext: storedPageContext(post) ?? undefined,
    pinnable,
    thinking: '',
    calls: (pinnable ?? []).map((c, i) => ({ seq: i, tool: c.tool, arguments: c.arguments })),
    pinned: [],
    saved: [],
    pageChanges: [],
    at: post.created_at ?? '',
    conversationId: post.conversation_id ?? null,
    post,
    view: postView(post),
    continues: false,
    continuedBy: false,
  };
}

/**
 * The desk a stored question carries, or null.
 *
 * Read from the payload the loop wrote (agent/loop.py, ConversationLog.posts)
 * and read defensively: a payload is data somebody could have edited, and a
 * malformed selection is dropped rather than trusted. A subject needs a
 * string id and a string label; a dimension outside the three the
 * definitions name is not a dimension.
 */
export function storedDesk(post: Post): DeskContext | null {
  const raw = (post.payload as { desk?: unknown } | null)?.desk;
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as { selection?: unknown; window?: unknown };
  const out: DeskContext = {};
  const sel = d.selection as { dimension?: unknown; subjects?: unknown } | null | undefined;
  if (sel && typeof sel === 'object' && (sel.dimension === 'store' || sel.dimension === 'product' || sel.dimension === 'category')) {
    const subjects = Array.isArray(sel.subjects)
      ? (sel.subjects as { id?: unknown; label?: unknown }[])
          .filter((s) => s && typeof s.id === 'string' && s.id && typeof s.label === 'string' && s.label)
          .map((s) => ({ id: s.id as string, label: s.label as string }))
      : [];
    if (subjects.length > 0) out.selection = { dimension: sel.dimension, subjects };
  }
  const win = d.window as { kind?: unknown; name?: unknown; start?: unknown; end?: unknown } | null | undefined;
  if (win && typeof win === 'object' && (win.kind === 'preset' || win.kind === 'explicit')) {
    out.window = {
      kind: win.kind,
      ...(typeof win.name === 'string' ? { name: win.name } : {}),
      ...(typeof win.start === 'string' ? { start: win.start } : {}),
      ...(typeof win.end === 'string' ? { end: win.end } : {}),
    };
  }
  return out.selection || out.window ? out : null;
}

export function utteranceFromPost(post: Post): Utterance {
  const view = postView(post);
  return {
    kind: 'utterance',
    id: post.id,
    text: post.body ?? '',
    at: post.created_at ?? '',
    authorUser: post.author_user ?? null,
    post,
    canShare: view.canShare,
    eyebrow: null,
    continues: false,
    desk: storedDesk(post),
  };
}

/**
 * A piece of work from results that were REPLAYED rather than answered —
 * the desk at rest, or the same calls over another window.
 *
 * THE SAME BUILDER, THE SAME COMPOSITION. Sources go through dedupe and
 * composeWork exactly as a turn's do, so a replayed field is composed by the
 * one path an answer is. It has no prose (nobody was asked), no post (nothing
 * was written), and its receipts are each result's own. `state` is `stored`
 * because the unit is settled and nothing is streaming into it.
 */
export function workUnitFromResults(
  id: string,
  sources: ResultSource[],
  findings: Finding[] | undefined,
  calls: ToolCall[],
  at: string,
): WorkUnit {
  return {
    kind: 'work',
    id,
    state: 'stored',
    prose: '',
    notices: [],
    ...composed(sources, findings),
    receipts: sources[sources.length - 1]?.meta,
    pinnable: null,
    thinking: '',
    calls,
    pinned: [],
    saved: [],
    pageChanges: [],
    at,
    conversationId: null,
    post: null,
    view: null,
    continues: false,
    continuedBy: false,
  };
}

/* ------------------------------------------------------------------- items -- */

/**
 * The whole surface as one ordered list.
 *
 * Stored posts first, in the order the river gave them, then the live turns
 * riverMerge did not drop. That is the merge riverMerge already decided; this
 * only turns both halves into one kind of thing.
 *
 * A LIVE PAIR SHARES ITS ANSWER'S IDENTITY. A user turn takes its id from the
 * question post named on the ANSWER turn that follows it, for the same reason
 * riverMerge drops the pair together: the loop wrote both, so both become
 * stored at the same instant and both must keep their place when they do.
 */
export function riverItems(posts: Post[], pending: GeorgeTurn[]): RiverItem[] {
  return withContinuity([...storedItems(posts), ...liveItems(pending)]);
}

/* ------------------------------------------------------------ continuity -- */

/**
 * The scope a piece of work was measured over, from the call George named as
 * primary — or, before he has, from its first call. Window, filters and
 * comparison: the same three facts findings.scope_of compares on the server.
 */
export function workScope(unit: WorkUnit): string | null {
  const primarySeq = unit.findings.find((f) => f.role === 'primary')?.seq;
  const call = unit.calls.find((c) => c.seq === primarySeq) ?? unit.calls[0];
  if (!call) return null;
  const a = call.arguments ?? {};
  const filters = a.filters && typeof a.filters === 'object' ? a.filters : null;
  return JSON.stringify([a.date_range ?? null, filters, a.compare_to ?? null]);
}

/**
 * Whether a question and its work CONTINUE the work above them.
 *
 * DETERMINISTIC AND NARROW. Three facts, all of them structural, none from
 * prose: the question is a REPLY to the earlier answer (its post's parent is
 * that answer, or — live — the parent the composer sent is that answer's
 * id); the two pieces of work are in ONE thread; and the later work measured
 * the SAME scope as the earlier — same window, same filters, same
 * comparison. "Why?" after "How did Rockwell do last week?" reads the drivers
 * over the same scope and continues; "And Magnolia?" changes the filter and
 * starts its own piece of work. A follow-up whose first call has not landed
 * yet is not a continuation until it has: the surface composes when the
 * scope is known, never before.
 *
 * What it changes is PRESENTATION ONLY. The posts stay separate rows; the
 * audit trail is untouched; a reload composes the same way from the same
 * facts.
 */
export function continuesWork(prev: WorkUnit, question: Utterance, next: WorkUnit): boolean {
  const replyTo = question.post?.parent_id ?? question.parentId ?? null;
  if (!replyTo || replyTo !== prev.id) return false;
  if (prev.post && next.post && prev.post.thread_id !== next.post.thread_id) return false;
  const a = workScope(prev);
  const b = workScope(next);
  return a !== null && b !== null && a === b;
}

/** Marks continuations in place. Items are returned in the same order. */
export function withContinuity(items: RiverItem[]): RiverItem[] {
  for (let i = 2; i < items.length; i++) {
    const prev = items[i - 2];
    const q = items[i - 1];
    const next = items[i];
    if (prev.kind !== 'work' || q.kind !== 'utterance' || next.kind !== 'work') continue;
    if (continuesWork(prev, q, next)) {
      q.continues = true;
      next.continues = true;
      prev.continuedBy = true;
    }
  }
  return items;
}

/**
 * The stored half, on its own.
 *
 * SPLIT SO MEMOIZATION CAN WORK. RiverEntry is memoized on its props, and a
 * builder that rebuilt every item on every render would defeat that entirely:
 * `patchLast` replaces the turns array on every streamed delta, so a combined
 * builder would hand every stored entry a brand-new object hundreds of times
 * per turn and each one would re-render for content that had not changed.
 * Built separately, the stored items keep their identity for as long as the
 * river's posts do — which is until an actual refetch — and only the entry
 * that is moving re-renders. See the note in ops/RIVER_V2.md on when this
 * stops being enough and virtualization starts.
 */
export function storedItems(posts: Post[]): RiverItem[] {
  return withContinuity(
    posts.map((post) =>
      post.author === 'user'
        ? utteranceFromPost(post)
        : workUnitFromPost(post, questionForPost(posts, post)),
    ),
  );
}

/** The live half: the turns riverMerge did not drop. */
export function liveItems(pending: GeorgeTurn[], eyebrow: string | null = null): RiverItem[] {
  const items: RiverItem[] = [];
  for (let i = 0; i < pending.length; i++) {
    const turn = pending[i];
    if (turn.role === 'user') {
      const next = pending[i + 1];
      const id =
        (next?.role === 'george' && next.post?.question_post_id) || `live-question-${i}`;
      items.push({
        kind: 'utterance',
        id,
        text: turn.text,
        at: turn.at,
        authorUser: null,
        post: null,
        canShare: false,
        eyebrow,
        continues: false,
        parentId: turn.parentId ?? null,
        desk: turn.desk ?? null,
      });
      continue;
    }
    const previous = pending[i - 1];
    const question = previous?.role === 'user' ? previous.text : undefined;
    items.push(workUnitFromTurn(turn, question, `live-answer-${i}`));
  }

  return items;
}

/* ------------------------------------------------------ grouping and focus -- */

/**
 * Whether two adjacent entries belong to one visual run.
 *
 * The same rule postShape.groupsWith holds for posts, lifted to items so a
 * live entry and a stored one are grouped by one decision. Grouping is
 * presentation only — it never merges bodies, and each entry keeps its own
 * receipts and its own notices, because those belong to the entry.
 *
 * A live entry never groups: its time is the client's clock and the entry above
 * it may be timed by the server's, and two clocks cannot be differenced.
 */
export function groupsWithItem(previous: RiverItem | undefined, item: RiverItem): boolean {
  if (!previous || previous.kind !== item.kind) return false;
  if (!previous.at || !item.at) return false;
  if (item.kind === 'utterance') {
    if (previous.kind !== 'utterance') return false;
    if (previous.authorUser !== item.authorUser) return false;
  } else {
    if (previous.kind !== 'work') return false;
    // A labelled kind always starts its own block: "Workflow ran" under a run
    // that is visually part of the previous answer would attach the label to
    // the wrong thing.
    if (item.view?.label) return false;
    // Neither side may be live, for the two-clocks reason above.
    if (item.state !== 'stored' || previous.state !== 'stored') return false;
  }
  const gap = Date.parse(item.at) - Date.parse(previous.at);
  return Number.isFinite(gap) && gap >= 0 && gap < GROUP_WINDOW_MS;
}

/** Consecutive entries within this window read as one block. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * The id of the entry that leads — the newest piece of WORK.
 *
 * Everything else goes quieter (turnShape's emphasis, applied to items). A
 * question is never the leader: the answer is what the reader came back for.
 */
export function latestWorkId(items: RiverItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'work') return items[i].id;
  }
  return null;
}

/** The question a stored answer replied to, when its parent is in the list. */
function questionForPost(posts: Post[], post: Post): string | undefined {
  if (!post.parent_id) return undefined;
  const parent = posts.find((p) => p.id === post.parent_id);
  return parent?.kind === 'question' && parent.body ? parent.body : undefined;
}

/* --------------------------------------------------------------- substance -- */

/**
 * The part of a work unit that is the same fact live and stored.
 *
 * THE INVARIANT UI RULE 3 ASKS FOR, AS A VALUE. "Every number is inspectable,
 * identically whether the figure came from chat or from a tile" is only true by
 * construction if the two renderings are built from one structure — and the way
 * to hold that is to name the structure and compare it. The suite drives a turn
 * and its stored post through the two builders and asserts these are equal.
 *
 * `state`, `thinking`, `calls`, `narration` and `superseded` are deliberately
 * NOT here: a stored post has no reasoning and no row counts, and a builder
 * that made them match would be inventing them.
 */
export interface WorkSubstance {
  question?: string;
  prose: string;
  notices: GeorgeNotice[];
  blocks: ResultBlock[];
  /** The composition too: a reload must structure the answer as it was structured live. */
  composition: Composition;
  findings: Finding[];
  suppressed: { seq: number; coveredBy: number[] }[];
  receipts?: ToolMeta;
  pageContext?: PageContextFrame;
  pinnable: PinToolCall[] | null;
}

export function workSubstance(unit: WorkUnit): WorkSubstance {
  return {
    question: unit.question,
    prose: unit.prose,
    notices: unit.notices,
    blocks: unit.blocks,
    composition: unit.composition,
    findings: unit.findings,
    suppressed: unit.suppressed,
    receipts: unit.receipts,
    pageContext: unit.pageContext,
    pinnable: unit.pinnable,
  };
}

/* ------------------------------------------------------------------ signal -- */

/**
 * How much of this work has arrived, as a value that changes when it grows.
 *
 * WHAT IT IS FOR. useAutoFollow keeps the viewport with content that is
 * growing, and it needs to know when the content grew. The obvious signal is
 * the turns array itself, which is referentially new on every streamed delta —
 * but it is also referentially new on renders that changed nothing a reader
 * can see, and each of those would move the page.
 *
 * SO IT MEASURES WHAT IS ON SCREEN, NOT WHAT WAS RECEIVED. Characters written,
 * results landed, notices raised, confirmations made. `thinking` is
 * deliberately absent: it streams into a fixed-height line inside the activity
 * disclosure and does not change the height of anything, so following it would
 * scroll the page for content that did not move.
 */
export function streamSignal(turns: GeorgeTurn[]): string {
  let chars = 0;
  let results = 0;
  let notes = 0;
  for (const turn of turns) {
    if (turn.role === 'user') {
      chars += turn.text.length;
      continue;
    }
    chars += turn.text.length + (turn.superseded?.length ?? 0);
    results += turn.toolCalls.length;
    for (const call of turn.toolCalls) if (call.result) results += 1;
    notes +=
      turn.notices.length +
      turn.pinned.length +
      turn.saved.length +
      turn.pageChanges.length +
      (turn.done ? 1 : 0) +
      (turn.error ? 1 : 0) +
      (turn.cancelled ? 1 : 0) +
      (turn.pageContext ? 1 : 0);
  }
  return `${turns.length}:${chars}:${results}:${notes}`;
}

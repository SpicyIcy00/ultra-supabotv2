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
import { blocksFromCalls, blocksFromCharted, type ResultBlock } from './resultShape';
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
  /** The results, already composed by resultShape. */
  blocks: ResultBlock[];
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
    blocks: blocksFromCalls(turn.toolCalls),
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
    blocks: blocksFromCharted(payload?.charted),
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
  };
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
  return [...storedItems(posts), ...liveItems(pending)];
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
  return posts.map((post) =>
    post.author === 'user'
      ? utteranceFromPost(post)
      : workUnitFromPost(post, questionForPost(posts, post)),
  );
}

/** The live half: the turns riverMerge did not drop. */
export function liveItems(pending: GeorgeTurn[]): RiverItem[] {
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

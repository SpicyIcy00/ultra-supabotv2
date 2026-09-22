/**
 * Consumes the Bob SSE stream.
 *
 * Uses @microsoft/fetch-event-source rather than native EventSource because
 * /api/v1/bob/ask is a POST — EventSource is GET-only. The library also
 * gives real event-name framing and, critically, lets us DISABLE auto-retry:
 * a retrying agent loop would silently re-ask the question and bill for it
 * again, so a dropped connection surfaces as an error instead.
 *
 * THREADS, NOT SESSIONS. The hook holds the id of the thread the turns belong
 * to: the server hands it back in the `start` frame of the first question and
 * every later question sends it, so the turns land in one thread rather than
 * one unrelated row per request. `open` loads stored turns into the same
 * `turns` state, so a reopened thread and a live one are rendered by one
 * component and continued by one `ask`.
 *
 * ONE OWNER, ABOVE THE ROUTES. This hook is mounted once, in
 * BobStreamProvider, so an answer keeps arriving while the person moves
 * from Ask to Inbox and back. That is persistent ownership of a live HTTP
 * response and nothing more: the backend has no background job, and if the
 * provider unmounts (logout) the request is aborted like any other.
 *
 * TWO FRAMES THE CLIENT USED TO DROP. `post` names the two posts the turn
 * wrote — the only key a live turn may ever be reconciled with the river by.
 * `saved` confirms a workflow write from the write itself rather than from
 * the model's prose, exactly as `pinned` does for a pin.
 *
 * STOPPING IS A STATE, NOT A SILENCE. Cancelling used to abort the request and
 * leave the half-written turn on screen with nothing to say it was cut off,
 * so a stopped answer looked like a finished one. The turn is now marked
 * `cancelled`; whether the server went on to finish and store it is unknown
 * from here, and the UI says exactly that.
 *
 * THE CONVERSATION FOLLOWS THE PAGE (W1.4, 2026-09-22 — reverses "a thread
 * has one page scope, decided when it starts"). A question asked from a page
 * binds the new thread to that page and remembers WHERE it was asked
 * (`where`); a follow-up from the same page continues it, and a question from
 * another page starts a new thread there (pageScope.askPlan). A question from
 * no page — the room's own composer — continues the thread under its scope.
 * `reset` clears both; `open` sets the scope to the reopened thread's own
 * (recovered from what Bob recorded on its answers) or to nothing. It lives
 * here, on the one stream the shell owns, and not in route state — which is
 * lost on the first navigation and was why the page context used to survive
 * exactly one turn (pageScope.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '../services/httpAuth';
import { askPlan, retitled, scopeForRequest } from '../components/bob/pageScope';
import type { ScreenFrame } from '../components/bob/here';
import type {
  ActionOffer,
  AskHistoryTurn,
  DeskContext,
  DoneFrame,
  CompositionFrame,
  FindingFrame,
  ReadingFrame,
  BobNotice,
  BobState,
  BobTurn,
  PageContextFrame,
  PageScope,
  PageChangedFrame,
  PinnedFrame,
  PostFrame,
  ReusedFrame,
  SavedFrame,
  ToolCall,
  ToolMeta,
} from '../types/bob';

/**
 * Relative, exactly like services/api.ts — the rest of the app hardcodes
 * '/api/v1' so every call is same-origin and Vercel's rewrite in vercel.json
 * forwards it to Railway.
 *
 * Do NOT reintroduce import.meta.env.VITE_API_URL here. On the production
 * deployment that variable is set to the Railway origin, which makes the
 * browser call Railway cross-origin, triggers a CORS preflight, and fails with
 * "No 'Access-Control-Allow-Origin' header is present" because Railway does not
 * allow the Vercel origin. Same-origin through the proxy avoids CORS entirely
 * and works identically in dev and production.
 */
const API_BASE = '/api/v1';

/** Matches MAX_HISTORY_TURNS in agent/loop.py; the server truncates too. */
const MAX_HISTORY_TURNS = 20;
/** Matches HistoryTurn.tool_calls' bound in backend/app/api/v1/routes/bob.py. */
const MAX_HISTORY_CALLS = 20;

/** Thrown to stop fetchEventSource retrying — see FatalError in its docs. */
class BobStreamError extends Error {}

type BobAnswerTurn = Extract<BobTurn, { role: 'bob' }>;

/**
 * The conversation so far, in the shape /bob/ask takes.
 *
 * Bob is stateless between requests: he sees only what is sent. So a
 * follow-up ("pin that", "and for Rockwell?") needs the turns before it, and
 * the calls behind each earlier answer — those are what a pin can hold.
 *
 * Only calls that came back WITHOUT an error are included. A call that refused
 * produced no result the user ever saw, and pinning it would make a tile out of
 * something nobody read. The same filter applies to a reopened thread: its
 * stored calls carry their error field for display, and are excluded here on
 * the same grounds.
 */
export function toHistory(turns: BobTurn[]): AskHistoryTurn[] {
  return turns.slice(-MAX_HISTORY_TURNS).map((t) =>
    t.role === 'user'
      ? { role: 'user' as const, text: t.text, tool_calls: [] }
      : {
          role: 'bob' as const,
          text: t.text,
          // THE LAST 20, NOT ALL OF THEM (P11). The server takes 20 per turn;
          // since the convergence cap stopped counting `compose` (P6.j) a turn
          // can make more than that, and sending them all made the NEXT
          // question fail validation with nothing on screen to say why.
          tool_calls: t.toolCalls
            .filter((c) => c.result && !c.result.error)
            .slice(-MAX_HISTORY_CALLS)
            .map((c) => ({ tool: c.tool, arguments: c.arguments })),
        },
  );
}

/** What `ask` accepts beside the question. */
export interface AskOptions {
  /**
   * Where the person is asking from, as a display string Bob reads out
   * ("Pages / AJI BARN Reorder", or a legacy page key like "warehouse").
   * Context only; never an identity.
   */
  pageContext?: string | null;
  /**
   * The Bob page in scope, as an identity. Binds a NEW thread to that
   * page so the server injects a reader for it; ignored inside a thread,
   * whose scope was fixed when it started.
   */
  pageScope?: PageScope | null;
  /**
   * WHERE THE PERSON IS STANDING (`here.whereOf`), sent by the line that is
   * on every page (W1.4). A thread asked from one page and continued from
   * another is two conversations: a different `where` starts a new thread.
   * Absent — the room's own composer — continues whatever thread is open.
   */
  where?: string | null;
  /**
   * The screen's account of itself (W1.4): key, tab, subjects by name,
   * window. Never a figure. The server reads it out in place of pageContext.
   */
  screen?: ScreenFrame | null;
  /**
   * The post this question replies to, inside the current thread. Only
   * meaningful when a thread is open; the server validates it is in the thread.
   */
  parentId?: string | null;
  /**
   * What is on the desk: the subjects selected (ids and labels off rows) and
   * the window a replay moved the work to. Named to Bob on the question
   * by the loop; kept on the question post so a reload restores it.
   */
  desk?: DeskContext | null;
}

/** How long the mark holds `complete` before settling back to `idle`. */
export const COMPLETE_SETTLE_MS = 1400;

export function useBobStream() {
  const [turns, setTurns] = useState<BobTurn[]>([]);
  const [state, setState] = useState<BobState>('idle');
  const [threadId, setThreadId] = useState<string | null>(null);
  /**
   * The thread id once its posts are actually in the river.
   *
   * Separate from `threadId` on purpose, and the difference is the whole of the
   * "That thread isn't available." bug. `threadId` arrives in the `start` frame
   * and is what the NEXT question is sent with — it has to be early. This one
   * arrives in the `post` frame, which the loop emits after `log.posts(...)`
   * has written them, and is the only id a reader may be sent to look at.
   */
  const [storedThreadId, setStoredThreadId] = useState<string | null>(null);
  const [pageScope, setPageScope] = useState<PageScope | null>(null);
  // Where the open thread was asked from (`here.whereOf`), or null.
  const [where, setWhereState] = useState<string | null>(null);
  // THE MORNING SHOWN AGAIN (W2.1): the last question answered by today's
  // morning page instead of a model turn, or null. The room follows it to
  // that thread and stamps it; the next question or a reset clears it.
  const [reused, setReused] = useState<ReusedFrame | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  useEffect(() => () => abortRef.current?.abort(), []);

  // `complete` settles to `idle` on its own. Long enough to be seen, short
  // enough that the mark is not still congratulating itself when the next
  // question is typed — and a new turn clears it early, because the effect
  // re-runs the moment the state changes.
  useEffect(() => {
    if (state !== 'complete') return;
    const t = setTimeout(() => setState((s) => (s === 'complete' ? 'idle' : s)), COMPLETE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [state]);

  // `ask` must read the turns as they stand when the user submits, not as they
  // stood when it was last created. A ref rather than a dependency: turns
  // change on every streamed delta, and rebuilding the callback that often
  // would churn every component holding it.
  const turnsRef = useRef<BobTurn[]>([]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  // The thread id likewise: read at submit time, set from the `start` frame.
  const threadRef = useRef<string | null>(null);
  const setThread = useCallback((id: string | null) => {
    threadRef.current = id;
    setThreadId(id);
  }, []);

  const storedThreadRef = useRef<string | null>(null);
  const setStoredThread = useCallback((id: string | null) => {
    storedThreadRef.current = id;
    setStoredThreadId(id);
  }, []);

  // The thread's page scope, read at submit time like the thread id.
  const scopeRef = useRef<PageScope | null>(null);
  const setScope = useCallback((scope: PageScope | null) => {
    scopeRef.current = scope;
    setPageScope(scope);
  }, []);

  // And where the thread was asked from, likewise.
  const whereRef = useRef<string | null>(null);
  const setWhere = useCallback((at: string | null) => {
    whereRef.current = at;
    setWhereState(at);
  }, []);

  /** Mutate the in-flight bob turn (always the last one). */
  const patchLast = useCallback((fn: (t: BobAnswerTurn) => void) => {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role !== 'bob') return prev;
      const copy: BobAnswerTurn = {
        ...last,
        toolCalls: [...last.toolCalls],
        notices: [...last.notices],
        pinned: [...last.pinned],
        saved: [...last.saved],
        pageChanges: [...last.pageChanges],
      };
      fn(copy);
      next[next.length - 1] = copy;
      return next;
    });
  }, []);

  /**
   * Stop the turn in flight.
   *
   * The turn stays on screen — what Bob had said so far is still what he
   * said — but it is marked cancelled so it can never be drawn as a finished
   * answer. Nothing is claimed about storage: no `post` frame arrived, so
   * whether the server finished and stored the turn anyway is unknown here.
   */
  const cancel = useCallback(() => {
    const inFlight = abortRef.current !== null;
    abortRef.current?.abort();
    abortRef.current = null;
    if (inFlight) {
      patchLast((t) => {
        if (!t.done) t.cancelled = true;
      });
    }
    setState('idle');
  }, [patchLast]);

  /** Nothing on screen, no thread to continue, no page in scope. */
  const reset = useCallback(() => {
    cancel();
    setTurns([]);
    setThread(null);
    setStoredThread(null);
    setScope(null);
    setWhere(null);
    setReused(null);
  }, [cancel, setThread, setStoredThread, setScope, setWhere]);

  /**
   * Load stored turns. They take the place of whatever was on screen, and the
   * next `ask` continues them under the thread id given.
   *
   * Takes turns already in the rendered shape: a reopened chat's come through
   * toBobTurns, an org thread's through threadHistory — the hook does not
   * care which, and must not, so that one `ask` continues both.
   */
  const open = useCallback(
    (loaded: BobTurn[], thread: string | null, scope: PageScope | null = null,
     at: string | null = null) => {
      cancel();
      turnsRef.current = loaded;
      setTurns(loaded);
      setThread(thread);
      // A thread being OPENED was read from the river, so its posts exist by
      // definition — it is already at an address a reader can be sent to.
      setStoredThread(thread);
      // The reopened thread's own scope, or none. Never the previous
      // thread's: opening B after A must not carry A's page into B.
      setScope(scope);
      setWhere(at);
    },
    [cancel, setThread, setStoredThread, setScope, setWhere],
  );

  const ask = useCallback(
    async (question: string, options: AskOptions = {}) => {
      if (!question.trim()) return;
      // A second question while one is running stops the first, and the first
      // is marked as stopped rather than left looking finished.
      cancel();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // THE CONVERSATION FOLLOWS THE PAGE (W1.4): asked from another page
      // than the open thread was, this is a new thread there, and nothing of
      // the old one travels with it — not its turns, not its scope.
      const plan = askPlan(
        { thread: threadRef.current, scope: scopeRef.current, where: whereRef.current },
        { scope: options.pageScope, where: options.where },
      );
      if (plan.fresh) {
        turnsRef.current = [];
        setTurns([]);
        setThread(null);
        setStoredThread(null);
      }
      // Captured BEFORE this turn is appended, so it is the conversation up to
      // but not including the question being asked.
      const history = toHistory(turnsRef.current);
      // What was on screen before this question — put back as it was if the
      // server answers with today's morning instead of a turn (W2.1).
      const before = turnsRef.current;
      let reusedHere = false;
      setReused(null);
      const thread = threadRef.current;
      const scope = plan.scope;
      if (!thread) { setScope(scope); setWhere(plan.where); }

      const now = new Date().toISOString();
      setTurns((prev) => [
        ...prev,
        // The parent travels on the turn so the surface can tell a reply
        // from a new piece of work before the post frame names it.
        {
          role: 'user', text: question, at: now,
          parentId: thread ? (options.parentId ?? null) : null,
          desk: options.desk ?? null,
        },
        {
          role: 'bob',
          text: '',
          thinking: '',
          toolCalls: [],
          notices: [],
          pinned: [],
          saved: [],
          pageChanges: [],
          at: now,
        },
      ]);
      setState('listening');

      try {
        await fetchEventSource(`${API_BASE}/bob/ask`, {
          fetch: authenticatedFetch,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          // page_context, not user_id: who is asking comes from the bearer
          // token on the server. Sending the page in the user_id field (as this
          // did) meant the conversation log recorded "replenishment" as the
          // person who asked.
          body: JSON.stringify({
            question,
            page_context: options.pageContext ?? null,
            page_scope: scopeForRequest(scope),
            screen: options.screen ?? null,
            history,
            thread_id: thread,
            parent_id: thread ? (options.parentId ?? null) : null,
            // The desk: ids and labels off rows, and a window. Never a figure.
            desk: options.desk ?? null,
          }),
          signal: ctrl.signal,
          openWhenHidden: true,

          async onopen(res) {
            if (res.ok) return;
            // WHAT THE SERVER SAID, NOT JUST THAT IT SAID NO (P11). "Bob
            // returned 422" cost an afternoon: a 422 is the request being
            // refused, and the reason is in the body. It is read here and
            // shown, bounded, because a person who cannot see the reason
            // cannot tell a refusal from a breakage.
            let said = '';
            try {
              const body = await res.clone().json() as { detail?: unknown };
              const detail = body?.detail;
              said = typeof detail === 'string' ? detail
                : Array.isArray(detail) && detail.length
                  ? detail.map((d) => {
                    const e = d as { loc?: unknown[]; msg?: string };
                    return `${(e.loc ?? []).join('.')}: ${e.msg ?? ''}`;
                  }).join('; ')
                  : '';
            } catch {
              said = '';
            }
            throw new BobStreamError(
              `Bob returned ${res.status}${said ? ` — ${said.slice(0, 300)}` : ''}`);
          },

          onmessage(ev) {
            let data: Record<string, unknown> = {};
            try {
              data = JSON.parse(ev.data);
            } catch {
              return; // a malformed frame should not kill the stream
            }

            switch (ev.event) {
              case 'start':
                // A reused morning names ITS thread, which the room opens from
                // the record; it is not the thread this question continues.
                if (data.reused) break;
                // The first turn of a new thread names it; later turns echo
                // the one we sent. Either way this is the id to continue.
                if (typeof data.thread_id === 'string' && data.thread_id) {
                  setThread(data.thread_id);
                }
                break;

              case 'thinking':
                setState('thinking');
                patchLast((t) => {
                  t.thinking += String(data.delta ?? '');
                });
                break;

              case 'tool_call':
                setState('running');
                patchLast((t) => {
                  t.toolCalls.push({
                    seq: Number(data.seq),
                    tool: String(data.tool),
                    arguments: (data.arguments ?? {}) as Record<string, unknown>,
                    ...(typeof data.duplicate_of === 'number'
                      ? { duplicate_of: data.duplicate_of }
                      : {}),
                  });
                });
                break;

              case 'tool_result':
                // Matched on the conversation-global seq, not array position:
                // parallel calls arrive out of order.
                patchLast((t) => {
                  const call = t.toolCalls.find((c) => c.seq === Number(data.seq));
                  if (call) {
                    call.result = {
                      row_count: (data.row_count ?? null) as number | null,
                      source_table: (data.source_table ?? null) as string | null,
                      truncated: Boolean(data.truncated),
                      duration_ms: Number(data.duration_ms ?? 0),
                      error: (data.error ?? null) as string | null,
                      // Only ever a whole result — the loop sends no rows at
                      // all when it cannot send them all, and rows_complete
                      // says which happened. Defaulted to false so a frame
                      // from an older backend charts nothing rather than
                      // charting a prefix.
                      rows: (data.rows ?? []) as Record<string, unknown>[],
                      rows_complete: Boolean(data.rows_complete),
                      meta: (data.meta ?? null) as ToolMeta | null,
                      pinnable: data.pinnable === undefined ? undefined : Boolean(data.pinnable),
                    };
                  }
                });
                // W2.2: a draft put through the line, or the line moved — the
                // queue and the needs-you count have to learn it.
                if (!data.error && (data.source_table === 'george.requests'
                    || data.source_table === 'george.authority_versions')) {
                  qc.invalidateQueries({ queryKey: ['authority-requests'] });
                  qc.invalidateQueries({ queryKey: ['authority'] });
                }
                break;

              case 'notice':
                patchLast((t) => {
                  t.notices.push({
                    kind: String(data.kind ?? 'notice'),
                    message: String(data.message ?? ''),
                    source: data.source ? String(data.source) : undefined,
                  });
                });
                break;

              case 'text':
                setState('answering');
                patchLast((t) => {
                  // The replacement has started arriving, so the answer it
                  // replaces comes off the screen now — not when the rewrite
                  // finishes, or the two would be on screen together saying
                  // different things.
                  if (t.superseded) t.superseded = undefined;
                  t.text += String(data.delta ?? '');
                });
                break;

              case 'answer_reset':
                // Bob is about to write the answer again — because a caveat
                // was missing, a pin was claimed but not made, the tool
                // budget ran out, or what he wrote so far was narration
                // before a read. Deltas accumulate into one turn, so without
                // this the rewrite lands UNDER the draft it replaces and the
                // whole answer reads twice.
                //
                // Interim prose is KEPT, as narration: "Rockwell is down; let
                // me look at the drivers" is a true account of what he did,
                // and it belongs in the activity disclosure beside his
                // reasoning — never above the answer, which is what it was
                // doing until the loop learned to say which it was.
                patchLast((t) => {
                  const written = t.text.trim();
                  if (data.reason === 'interim_prose') {
                    // Narration. It belongs in the activity disclosure and
                    // nowhere else, so it is NOT superseded prose — putting it
                    // back above the answer is exactly what the loop learned to
                    // stop doing.
                    if (written) {
                      t.narration = [t.narration, written].filter(Boolean).join('\n\n');
                    }
                  } else if (written) {
                    // Every other reason is a REWRITE of the answer. Keep what
                    // is on screen until the replacement starts, so the reader
                    // is never left looking at nothing (see `superseded`).
                    t.superseded = written;
                  }
                  t.text = '';
                });
                break;

              case 'pinned':
                patchLast((t) => {
                  t.pinned.push(data as unknown as PinnedFrame);
                });
                // A pin made in conversation has to appear on its page without
                // a reload — the same invalidation the Pin button does.
                qc.invalidateQueries({ queryKey: ['pin-pages'] });
                qc.invalidateQueries({ queryKey: ['pins'] });
                break;

              case 'saved':
                patchLast((t) => {
                  t.saved.push({
                    workflow_id: String(data.workflow_id ?? ''),
                    name: String(data.name ?? ''),
                    version: Number(data.version ?? 0),
                    steps: (data.steps ?? []) as SavedFrame['steps'],
                    parameters: (data.parameters ?? []) as SavedFrame['parameters'],
                    scheduled: (data.scheduled ?? null) as boolean | null,
                    awaiting_promotion: data.awaiting_promotion !== false,
                    queue: (data.queue ?? null) as string | null,
                  });
                });
                // A saved version enters the approval queue; the count beside
                // the mark and the Workflows page both have to learn that.
                qc.invalidateQueries({ queryKey: ['workflow-approvals'] });
                qc.invalidateQueries({ queryKey: ['workflows'] });
                break;

              case 'page_changed':
                // A page Bob created or changed, from the committed
                // result. Confirmed from here, never from prose; the page
                // lists and the pins on it are re-read, because the write is
                // real the moment this frame exists.
                patchLast((t) => {
                  t.pageChanges.push(data as unknown as PageChangedFrame);
                });
                // A rename of the page this thread is bound to changes the
                // indicator's word and nothing else: the identity is the id.
                if (typeof data.page_id === 'string' && typeof data.title === 'string') {
                  setScope(retitled(scopeRef.current, data.page_id, data.title));
                }
                qc.invalidateQueries({ queryKey: ['pages'] });
                qc.invalidateQueries({ queryKey: ['page'] });
                qc.invalidateQueries({ queryKey: ['pin-pages'] });
                qc.invalidateQueries({ queryKey: ['pins'] });
                break;

              case 'post':
                // The ids of this turn's posts. Kept on the turn so the river
                // can drop the live copy the moment the stored one is fetched
                // — by id, never by matching text.
                patchLast((t) => {
                  t.post = {
                    question_post_id: String(data.question_post_id ?? ''),
                    answer_post_id:
                      typeof data.answer_post_id === 'string' ? data.answer_post_id : null,
                    thread_id: String(data.thread_id ?? ''),
                    conversation_id: String(data.conversation_id ?? ''),
                    visibility: data.visibility === 'org' ? 'org' : 'private',
                    stored: Boolean(data.stored),
                  } satisfies PostFrame;
                });
                // The thread now EXISTS in the river, and only now may a
                // client navigate to its address. `start` names the thread id
                // before a single tool has run and long before any post is
                // written, so following it there sent every first question to a
                // URL whose read is a guaranteed 404 — which is where "That
                // thread isn't available." came from, drawn above an answer
                // that was streaming perfectly well underneath it.
                if (data.stored && typeof data.thread_id === 'string' && data.thread_id) {
                  setStoredThread(data.thread_id);
                }
                break;

              case 'finding':
                // HISTORICAL. The loop stopped emitting this with P1.f — the
                // roles it carried were drawn by nothing the room renders —
                // and the case stays because a thread recorded before then
                // replays its frames through here.
                patchLast((t) => {
                  t.findings = ((data as unknown as FindingFrame).findings ?? []).slice();
                });
                break;

              case 'reading':
                // WHAT HE SAID, IN ITS THREE SLOTS, already validated by the
                // loop. Replaces rather than accumulates: a later compose is
                // the model refining one reading, not adding a second.
                //
                // The claim is a HIGHLIGHT of the answer, not a line of its
                // own — `splitClaim` finds those words in what he actually
                // said and lights them there, and draws nothing where he did
                // not say them. So nothing here can put text on screen that
                // the answer does not already carry.
                patchLast((t) => {
                  const frame = data as unknown as ReadingFrame;
                  t.reading = {
                    ...(typeof frame.claim === 'string' ? { claim: frame.claim } : {}),
                    ...(typeof frame.caveat === 'string' ? { caveat: frame.caveat } : {}),
                    ...(typeof frame.next === 'string' ? { next: frame.next } : {}),
                  };
                });
                break;

              case 'actions':
                // WHAT TO DO ABOUT A ROW, already validated by the loop.
                // Replaces rather than accumulates, like the reading: two
                // rounds of composing in one turn are one turn's worth of
                // offers, and the second one is Bob changing his mind.
                //
                // `costs` rides the frame because it was DERIVED server-side
                // from the act (metrics.yaml composition.actions.acts). The
                // client draws what it is given and works none of it out — a
                // second derivation here could disagree with the record of
                // what the person was actually shown.
                patchLast((t) => {
                  const frame = data as unknown as { actions?: ActionOffer[] };
                  t.actions = Array.isArray(frame.actions) ? frame.actions : [];
                });
                break;

              case 'compose':
                // The screen Bob composed, already validated by the loop.
                // Replaces rather than accumulates, like a finding. Nothing
                // here is read from prose, and nothing here is a figure.
                //
                // TWO KINDS OF COMPOSITION ARRIVE ON THIS FRAME (P1.b). The
                // loop composes a DEFAULT the moment the reads land so the
                // board is not empty for the round trip it takes Bob to
                // speak; it says `default: true` and is kept on its own field.
                // His supersedes it — never the other way round, so a default
                // arriving late (it cannot, but the client does not have to
                // trust that) can never overwrite what he decided.
                patchLast((t) => {
                  const frame = data as unknown as CompositionFrame;
                  if (frame.default) {
                    if (!t.composition) t.defaultComposition = frame;
                  } else {
                    t.composition = frame;
                  }
                });
                break;

              case 'receipts':
                patchLast((t) => {
                  t.receipts = data as ToolMeta;
                });
                break;

              case 'page_context':
                // What Bob considered of the page: evidence from the read
                // itself, never from the model's prose. A second read in the
                // same turn arrives already merged with the first.
                patchLast((t) => {
                  t.pageContext = data as unknown as PageContextFrame;
                });
                break;

              case 'warning':
                patchLast((t) => {
                  t.notices.push({
                    kind: String(data.reason ?? 'warning'),
                    message: String(data.detail ?? data.kinds ?? data.reason ?? ''),
                    source: 'loop',
                  });
                });
                break;

              case 'error':
                patchLast((t) => {
                  t.error = String(data.message ?? 'Unknown error');
                });
                setState('error');
                break;

              case 'reused':
                // TODAY'S MORNING, SHOWN AGAIN (W2.1): no model turn was spent.
                // The question and its empty answer come off the screen — the
                // answer is the stored thread, which the room now opens.
                if (typeof data.thread_id !== 'string' || !data.thread_id) break;
                reusedHere = true;
                turnsRef.current = before;
                setTurns(before);
                setReused({
                  thread_id: data.thread_id,
                  question: String(data.question ?? question),
                  answered_at: typeof data.answered_at === 'string' ? data.answered_at : null,
                  read_at: typeof data.read_at === 'string' ? data.read_at : null,
                  checked_at: typeof data.checked_at === 'string' ? data.checked_at : null,
                });
                break;

              case 'done':
                // A reused morning's `done` lands on no turn (W2.1): its
                // answer is the stored thread the room opens, not the last
                // turn on screen.
                if (!reusedHere) patchLast((t) => {
                  t.done = data as unknown as DoneFrame;
                  // A rewrite that never arrived is not the answer. `answer` was
                  // reset on the server too, so the stored post holds the
                  // rewrite or nothing — and the screen may not show prose the
                  // river does not have.
                  t.superseded = undefined;
                });
                // Not straight to idle: a turn that finishes and leaves no
                // trace looks like one that never ran. `complete` is the
                // `done` frame and nothing else, and it settles on its own.
                setState('complete');
                // The turn is stored now. The river and this thread have two
                // new posts, and the recent-asks list has a new entry.
                qc.invalidateQueries({ queryKey: ['river'] });
                qc.invalidateQueries({ queryKey: ['thread'] });
                qc.invalidateQueries({ queryKey: ['chats'] });
                qc.invalidateQueries({ queryKey: ['bob-status'] });
                // Today's morning may be this answer (W2.1).
                qc.invalidateQueries({ queryKey: ['morning'] });
                break;
            }
          },

          onerror(err) {
            // Rethrowing stops the library's retry loop. A silent retry would
            // re-run the whole agent loop and bill for it again.
            throw err instanceof BobStreamError
              ? err
              : new BobStreamError(String(err));
          },
        });
      } catch (err) {
        if (!ctrl.signal.aborted) {
          patchLast((t) => {
            t.error = err instanceof Error ? err.message : String(err);
          });
          setState('error');
        }
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        // `complete` survives the same way `error` does: both are things that
        // HAPPENED, and the response body ending is not news about either.
        setState((s) => (s === 'error' || s === 'complete' ? s : 'idle'));
      }
    },
    [cancel, patchLast, qc, setThread, setStoredThread, setScope, setWhere],
  );

  return {
    turns,
    state,
    ask,
    cancel,
    /** The page the open thread is scoped to, or null. */
    pageScope,
    /** Where the open thread was asked from (`here.whereOf`), or null. */
    where,
    // `complete` is NOT busy: the answer is finished and the composer must
    // take the next question immediately, whatever the mark is still doing.
    busy: state !== 'idle' && state !== 'error' && state !== 'complete',
    threadId,
    /** The thread id once its posts exist. What a router may follow. */
    storedThreadId,
    /** Today's morning shown again instead of a turn (W2.1), or null. */
    reused,
    open,
    reset,
  };
}

export type { BobNotice, PinnedFrame, SavedFrame, ToolCall, ToolMeta };

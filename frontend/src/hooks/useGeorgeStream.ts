/**
 * Consumes the George SSE stream.
 *
 * Uses @microsoft/fetch-event-source rather than native EventSource because
 * /api/v1/george/ask is a POST — EventSource is GET-only. The library also
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
 * GeorgeStreamProvider, so an answer keeps arriving while the person moves
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
 * A THREAD HAS ONE PAGE SCOPE, DECIDED WHEN IT STARTS. A question asked from
 * a page binds the new thread to that page; every follow-up sends the same
 * scope whether or not the person is still standing on the page, and a
 * scope offered mid-thread is ignored. `reset` clears it; `open` sets it to
 * the reopened thread's own (recovered from what George recorded on its
 * answers) or to nothing. It lives here, on the one stream the shell owns,
 * and not in route state — which is lost on the first navigation and was
 * why the page context used to survive exactly one turn (pageScope.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '../services/httpAuth';
import { scopeForAsk } from '../components/george/pageScope';
import type {
  AskHistoryTurn,
  DoneFrame,
  GeorgeNotice,
  GeorgeState,
  GeorgeTurn,
  PageContextFrame,
  PageScope,
  PinnedFrame,
  PostFrame,
  SavedFrame,
  ToolCall,
  ToolMeta,
} from '../types/george';

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

/** Thrown to stop fetchEventSource retrying — see FatalError in its docs. */
class GeorgeStreamError extends Error {}

type GeorgeAnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

/**
 * The conversation so far, in the shape /george/ask takes.
 *
 * George is stateless between requests: he sees only what is sent. So a
 * follow-up ("pin that", "and for Rockwell?") needs the turns before it, and
 * the calls behind each earlier answer — those are what a pin can hold.
 *
 * Only calls that came back WITHOUT an error are included. A call that refused
 * produced no result the user ever saw, and pinning it would make a tile out of
 * something nobody read. The same filter applies to a reopened thread: its
 * stored calls carry their error field for display, and are excluded here on
 * the same grounds.
 */
export function toHistory(turns: GeorgeTurn[]): AskHistoryTurn[] {
  return turns.slice(-MAX_HISTORY_TURNS).map((t) =>
    t.role === 'user'
      ? { role: 'user' as const, text: t.text, tool_calls: [] }
      : {
          role: 'george' as const,
          text: t.text,
          tool_calls: t.toolCalls
            .filter((c) => c.result && !c.result.error)
            .map((c) => ({ tool: c.tool, arguments: c.arguments })),
        },
  );
}

/** What `ask` accepts beside the question. */
export interface AskOptions {
  /**
   * Where the person is asking from, as a display string George reads out
   * ("Pages / AJI BARN Reorder", or a legacy page key like "warehouse").
   * Context only; never an identity.
   */
  pageContext?: string | null;
  /**
   * The George page in scope, as an identity. Binds a NEW thread to that
   * page so the server injects a reader for it; ignored inside a thread,
   * whose scope was fixed when it started.
   */
  pageScope?: PageScope | null;
  /**
   * The post this question replies to, inside the current thread. Only
   * meaningful when a thread is open; the server validates it is in the thread.
   */
  parentId?: string | null;
}

/** How long the mark holds `complete` before settling back to `idle`. */
export const COMPLETE_SETTLE_MS = 1400;

export function useGeorgeStream() {
  const [turns, setTurns] = useState<GeorgeTurn[]>([]);
  const [state, setState] = useState<GeorgeState>('idle');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [pageScope, setPageScope] = useState<PageScope | null>(null);
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
  const turnsRef = useRef<GeorgeTurn[]>([]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  // The thread id likewise: read at submit time, set from the `start` frame.
  const threadRef = useRef<string | null>(null);
  const setThread = useCallback((id: string | null) => {
    threadRef.current = id;
    setThreadId(id);
  }, []);

  // The thread's page scope, read at submit time like the thread id.
  const scopeRef = useRef<PageScope | null>(null);
  const setScope = useCallback((scope: PageScope | null) => {
    scopeRef.current = scope;
    setPageScope(scope);
  }, []);

  /** Mutate the in-flight george turn (always the last one). */
  const patchLast = useCallback((fn: (t: GeorgeAnswerTurn) => void) => {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role !== 'george') return prev;
      const copy: GeorgeAnswerTurn = {
        ...last,
        toolCalls: [...last.toolCalls],
        notices: [...last.notices],
        pinned: [...last.pinned],
        saved: [...last.saved],
      };
      fn(copy);
      next[next.length - 1] = copy;
      return next;
    });
  }, []);

  /**
   * Stop the turn in flight.
   *
   * The turn stays on screen — what George had said so far is still what he
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
    setScope(null);
  }, [cancel, setThread, setScope]);

  /**
   * Load stored turns. They take the place of whatever was on screen, and the
   * next `ask` continues them under the thread id given.
   *
   * Takes turns already in the rendered shape: a reopened chat's come through
   * toGeorgeTurns, an org thread's through threadHistory — the hook does not
   * care which, and must not, so that one `ask` continues both.
   */
  const open = useCallback(
    (loaded: GeorgeTurn[], thread: string | null, scope: PageScope | null = null) => {
      cancel();
      turnsRef.current = loaded;
      setTurns(loaded);
      setThread(thread);
      // The reopened thread's own scope, or none. Never the previous
      // thread's: opening B after A must not carry A's page into B.
      setScope(scope);
    },
    [cancel, setThread, setScope],
  );

  const ask = useCallback(
    async (question: string, options: AskOptions = {}) => {
      if (!question.trim()) return;
      // A second question while one is running stops the first, and the first
      // is marked as stopped rather than left looking finished.
      cancel();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Captured BEFORE this turn is appended, so it is the conversation up to
      // but not including the question being asked.
      const history = toHistory(turnsRef.current);
      const thread = threadRef.current;
      // The thread's scope if one is open; otherwise what was asked for,
      // which the thread about to start is bound to.
      const scope = scopeForAsk(thread, scopeRef.current, options.pageScope);
      if (!thread) setScope(scope);

      const now = new Date().toISOString();
      setTurns((prev) => [
        ...prev,
        { role: 'user', text: question, at: now },
        {
          role: 'george',
          text: '',
          thinking: '',
          toolCalls: [],
          notices: [],
          pinned: [],
          saved: [],
          at: now,
        },
      ]);
      setState('listening');

      try {
        await fetchEventSource(`${API_BASE}/george/ask`, {
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
            page_scope: scope,
            history,
            thread_id: thread,
            parent_id: thread ? (options.parentId ?? null) : null,
          }),
          signal: ctrl.signal,
          openWhenHidden: true,

          async onopen(res) {
            if (!res.ok) {
              throw new GeorgeStreamError(`George returned ${res.status}`);
            }
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
                  t.text += String(data.delta ?? '');
                });
                break;

              case 'answer_reset':
                // George is about to write the answer again — because a caveat
                // was missing, a pin was claimed but not made, or the tool
                // budget ran out. Deltas accumulate into one turn, so without
                // this the rewrite lands UNDER the draft it replaces and the
                // whole answer reads twice.
                patchLast((t) => {
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
                break;

              case 'receipts':
                patchLast((t) => {
                  t.receipts = data as ToolMeta;
                });
                break;

              case 'page_context':
                // What George considered of the page: evidence from the read
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

              case 'done':
                patchLast((t) => {
                  t.done = data as unknown as DoneFrame;
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
                qc.invalidateQueries({ queryKey: ['george-status'] });
                break;
            }
          },

          onerror(err) {
            // Rethrowing stops the library's retry loop. A silent retry would
            // re-run the whole agent loop and bill for it again.
            throw err instanceof GeorgeStreamError
              ? err
              : new GeorgeStreamError(String(err));
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
    [cancel, patchLast, qc, setThread, setScope],
  );

  return {
    turns,
    state,
    ask,
    cancel,
    /** The page the open thread is scoped to, or null. */
    pageScope,
    // `complete` is NOT busy: the answer is finished and the composer must
    // take the next question immediately, whatever the mark is still doing.
    busy: state !== 'idle' && state !== 'error' && state !== 'complete',
    threadId,
    open,
    reset,
  };
}

export type { GeorgeNotice, PinnedFrame, SavedFrame, ToolCall, ToolMeta };

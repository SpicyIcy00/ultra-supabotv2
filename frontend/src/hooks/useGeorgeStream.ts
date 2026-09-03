/**
 * Consumes the George SSE stream.
 *
 * Uses @microsoft/fetch-event-source rather than native EventSource because
 * /api/v1/george/ask is a POST — EventSource is GET-only. The library also
 * gives real event-name framing and, critically, lets us DISABLE auto-retry:
 * a retrying agent loop would silently re-ask the question and bill for it
 * again, so a dropped connection surfaces as an error instead.
 *
 * CHATS ARE SESSIONS. The hook holds the id of the chat the turns belong to
 * (`threadId`): the server hands it back in the `start` frame of the first
 * question and every later question sends it, so the turns land in one thread
 * of george.conversations instead of one unrelated row per request. `open`
 * loads a stored chat into the same `turns` state, so a reopened chat and a
 * live one are rendered by one component and continued by one `ask`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import type { ChatDetail } from '../types/chats';
import { toGeorgeTurns } from '../types/chats';
import type {
  AskHistoryTurn,
  DoneFrame,
  GeorgeNotice,
  GeorgeState,
  GeorgeTurn,
  PinnedFrame,
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

/**
 * The conversation so far, in the shape /george/ask takes.
 *
 * George is stateless between requests: he sees only what is sent. So a
 * follow-up ("pin that", "and for Rockwell?") needs the turns before it, and
 * the calls behind each earlier answer — those are what a pin can hold.
 *
 * Only calls that came back WITHOUT an error are included. A call that refused
 * produced no result the user ever saw, and pinning it would make a tile out of
 * something nobody read. The same filter applies to a reopened chat: its
 * stored calls carry their error field for display, and are excluded here on
 * the same grounds.
 */
function toHistory(turns: GeorgeTurn[]): AskHistoryTurn[] {
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

export function useGeorgeStream() {
  const [turns, setTurns] = useState<GeorgeTurn[]>([]);
  const [state, setState] = useState<GeorgeState>('idle');
  const [threadId, setThreadId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

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

  /** Mutate the in-flight george turn (always the last one). */
  const patchLast = useCallback((fn: (t: Extract<GeorgeTurn, { role: 'george' }>) => void) => {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role !== 'george') return prev;
      const copy = {
        ...last,
        toolCalls: [...last.toolCalls],
        notices: [...last.notices],
        pinned: [...last.pinned],
      };
      fn(copy);
      next[next.length - 1] = copy;
      return next;
    });
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState('idle');
  }, []);

  /** Start a new chat: nothing on screen, no thread to continue. */
  const reset = useCallback(() => {
    cancel();
    setTurns([]);
    setThread(null);
  }, [cancel, setThread]);

  /**
   * Load a stored chat. Its turns take the place of whatever was on screen,
   * and the next `ask` continues it under its thread id.
   */
  const open = useCallback(
    (chat: ChatDetail) => {
      cancel();
      const loaded = toGeorgeTurns(chat.turns);
      turnsRef.current = loaded;
      setTurns(loaded);
      setThread(chat.thread_id);
    },
    [cancel, setThread],
  );

  const ask = useCallback(
    async (question: string, pageContext?: string) => {
      if (!question.trim()) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Captured BEFORE this turn is appended, so it is the conversation up to
      // but not including the question being asked.
      const history = toHistory(turnsRef.current);
      const thread = threadRef.current;

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
          at: now,
        },
      ]);
      setState('listening');

      try {
        await fetchEventSource(`${API_BASE}/george/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          // page_context, not user_id: who is asking comes from the bearer
          // token on the server. Sending the page in the user_id field (as this
          // did) meant the conversation log recorded "replenishment" as the
          // person who asked.
          body: JSON.stringify({
            question,
            page_context: pageContext ?? null,
            history,
            thread_id: thread,
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
                // The first turn of a new chat names the thread; later turns
                // echo the one we sent. Either way this is the id to continue.
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
                // A pin made in conversation has to appear in the rails and on
                // its page without a reload — the same invalidation the Pin
                // button does on success.
                qc.invalidateQueries({ queryKey: ['pin-pages'] });
                qc.invalidateQueries({ queryKey: ['pins'] });
                break;

              case 'receipts':
                patchLast((t) => {
                  t.receipts = data as ToolMeta;
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
                setState('idle');
                // The turn is logged now, so the chat list can show it — a
                // new chat appears, an old one moves to the top.
                qc.invalidateQueries({ queryKey: ['chats'] });
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
        abortRef.current = null;
        setState((s) => (s === 'error' ? s : 'idle'));
      }
    },
    [patchLast, qc, setThread, token],
  );

  return {
    turns,
    state,
    ask,
    cancel,
    busy: state !== 'idle' && state !== 'error',
    threadId,
    open,
    reset,
  };
}

export type { GeorgeNotice, PinnedFrame, ToolCall, ToolMeta };

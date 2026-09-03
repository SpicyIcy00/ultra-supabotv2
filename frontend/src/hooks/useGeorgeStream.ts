/**
 * Consumes the George SSE stream.
 *
 * Uses @microsoft/fetch-event-source rather than native EventSource because
 * /api/v1/george/ask is a POST — EventSource is GET-only. The library also
 * gives real event-name framing and, critically, lets us DISABLE auto-retry:
 * a retrying agent loop would silently re-ask the question and bill for it
 * again, so a dropped connection surfaces as an error instead.
 */
import { useCallback, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import type {
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

/** Thrown to stop fetchEventSource retrying — see FatalError in its docs. */
class GeorgeStreamError extends Error {}

export function useGeorgeStream() {
  const [turns, setTurns] = useState<GeorgeTurn[]>([]);
  const [state, setState] = useState<GeorgeState>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

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

  const ask = useCallback(
    async (question: string, pageContext?: string) => {
      if (!question.trim()) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

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
          body: JSON.stringify({ question, page_context: pageContext ?? null }),
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
    [patchLast, qc, token],
  );

  return { turns, state, ask, cancel, busy: state !== 'idle' && state !== 'error' };
}

export type { GeorgeNotice, PinnedFrame, ToolCall, ToolMeta };

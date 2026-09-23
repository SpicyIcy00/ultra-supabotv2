/**
 * A STREAM THAT ENDS WITHOUT SAYING HOW (D1, 2026-09-23).
 *
 * The owner, of the live build: *"it hung there i had to refresh"*. His turn
 * of 06:44:35 UTC wrote its gaps and its answer post and then failed before it
 * wrote a `george.conversations` row; the response body closed with neither a
 * `done` frame nor an `error` one.
 *
 * `fetchEventSource` resolves when the body closes, whether or not the turn
 * finished — so the hook fell through to its `finally`, set `idle`, and left a
 * Bob turn on screen with no answer, no error and nothing running: the LOADED
 * rendering of a turn that never loaded, which is the one thing UI rule 8
 * forbids. From outside it looks exactly like a hang, and the only way out was
 * the browser's reload button.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Frame = { event: string; data: Record<string, unknown> };
let script: Frame[] = [];

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: async (
    _url: string,
    init: {
      onopen?: (r: { ok: boolean }) => Promise<void>;
      onmessage?: (ev: { event: string; data: string }) => void;
    },
  ) => {
    await init.onopen?.({ ok: true });
    for (const f of script) init.onmessage?.({ event: f.event, data: JSON.stringify(f.data) });
    // AND THEN THE BODY ENDS. No throw: the library resolves, exactly as it
    // does when a server closes the connection part-way through a turn.
  },
}));
vi.mock('../services/httpAuth', () => ({ authenticatedFetch: vi.fn() }));

const { useBobStream } = await import('./useBobStream');

function mount() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useBobStream(), { wrapper });
}

const DONE = {
  conversation_id: 'c', thread_id: 't', iterations: 2, tool_calls: 1,
  status: 'ok', notice_forced: false,
  usage: { input: 0, output: 0, cache_read: 0 }, cache_hit: false,
};

function lastBob(turns: ReturnType<typeof useBobStream>['turns']) {
  const t = turns[turns.length - 1];
  if (t.role !== 'bob') throw new Error('expected a Bob turn');
  return t;
}

afterEach(() => {
  cleanup();
  script = [];
});

describe('a turn that stops speaking says so', () => {
  it('fails the turn when the stream ends with no done and no error', async () => {
    script = [
      { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } },
      { event: 'tool_call', data: { seq: 0, tool: 'get_stock', arguments: {} } },
      { event: 'tool_result', data: { seq: 0, tool: 'get_stock', row_count: 3, source_table: 'stock', truncated: false, duration_ms: 9, error: null, rows: [], rows_complete: false } },
      // …and the loop dies here. No `done`, no `error`, the body just ends.
    ];
    const { result } = mount();
    await act(() => result.current.ask('come up with your own warning levels'));
    await waitFor(() => expect(result.current.state).toBe('error'));

    const turn = lastBob(result.current.turns);
    // THREE RENDERINGS, NEVER TWO (UI rule 8): this one is `failed`, and it
    // says what happened in words rather than leaving the room quiet.
    expect(turn.error).toMatch(/stopped before he finished/i);
    expect(turn.done).toBeUndefined();
    expect(result.current.busy).toBe(false);
  });

  it('says nothing of its own when the turn ended properly', async () => {
    script = [
      { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } },
      { event: 'text', data: { delta: 'Greenhills gave back the most.' } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('compare to last week'));
    await waitFor(() => expect(lastBob(result.current.turns).done).toBeDefined());

    expect(lastBob(result.current.turns).error).toBeUndefined();
    expect(result.current.state).toBe('complete');
  });

  it('says nothing of its own when the loop already said the turn failed', async () => {
    script = [
      { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } },
      { event: 'error', data: { message: 'the read timed out' } },
    ];
    const { result } = mount();
    await act(() => result.current.ask('check all products'));
    await waitFor(() => expect(result.current.state).toBe('error'));

    // The loop's own words, not a second sentence written over them.
    expect(lastBob(result.current.turns).error).toBe('the read timed out');
  });
});

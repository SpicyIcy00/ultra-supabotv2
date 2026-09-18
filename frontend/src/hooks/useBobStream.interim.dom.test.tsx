/**
 * Interim prose is narration, not the answer.
 *
 * When Bob writes a sentence and then calls tools, the loop sends an
 * `answer_reset` with reason `interim_prose` before the tool_call frames.
 * The hook must move what it has into the turn's narration and start the
 * answer again from nothing — so the text on screen when the turn ends is
 * exactly the final answer the river stored, and the sentence before the
 * read is still there, in the activity, where an account of the work
 * belongs.
 *
 * The event source is a stub that replays one scripted frame list.
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

describe('interim prose', () => {
  it('moves text written before a read into narration and keeps the final answer alone', async () => {
    script = [
      { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } },
      { event: 'text', data: { delta: 'Rockwell is down. ' } },
      { event: 'text', data: { delta: 'Let me look at the drivers.' } },
      { event: 'answer_reset', data: { reason: 'interim_prose' } },
      { event: 'tool_call', data: { seq: 0, tool: 'get_sales', arguments: { metric: 'net_sales' } } },
      { event: 'tool_result', data: { seq: 0, tool: 'get_sales', row_count: 1, source_table: 'new_transactions', truncated: false, duration_ms: 3, error: null, rows: [], rows_complete: false } },
      { event: 'text', data: { delta: 'Transactions held and ATP fell.' } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('Why is Rockwell down?'));
    await waitFor(() => expect(lastBob(result.current.turns).done).toBeDefined());

    const turn = lastBob(result.current.turns);
    expect(turn.text).toBe('Transactions held and ATP fell.');
    expect(turn.narration).toBe('Rockwell is down. Let me look at the drivers.');
  });

  it('accumulates narration across rounds, in order', async () => {
    script = [
      { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } },
      { event: 'text', data: { delta: 'First look.' } },
      { event: 'answer_reset', data: { reason: 'interim_prose' } },
      { event: 'tool_call', data: { seq: 0, tool: 'get_sales', arguments: {} } },
      { event: 'text', data: { delta: 'Second look.' } },
      { event: 'answer_reset', data: { reason: 'interim_prose' } },
      { event: 'tool_call', data: { seq: 1, tool: 'get_sales', arguments: { top_n: 3 } } },
      { event: 'text', data: { delta: 'The answer.' } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('Dig deeper'));
    await waitFor(() => expect(lastBob(result.current.turns).done).toBeDefined());
    const turn = lastBob(result.current.turns);
    expect(turn.narration).toBe('First look.\n\nSecond look.');
    expect(turn.text).toBe('The answer.');
  });

  it('keeps every other reset a plain reset — a draft cleared for a rewrite is not narration', async () => {
    script = [
      { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } },
      { event: 'text', data: { delta: 'A draft without its caveat.' } },
      { event: 'answer_reset', data: { reason: 'unsurfaced_notice' } },
      { event: 'text', data: { delta: 'The answer, with the caveat.' } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('q'));
    await waitFor(() => expect(lastBob(result.current.turns).done).toBeDefined());
    const turn = lastBob(result.current.turns);
    expect(turn.text).toBe('The answer, with the caveat.');
    expect(turn.narration).toBeUndefined();
  });

  it('does not record an empty interim as narration', async () => {
    script = [
      { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } },
      { event: 'text', data: { delta: '   ' } },
      { event: 'answer_reset', data: { reason: 'interim_prose' } },
      { event: 'text', data: { delta: 'The answer.' } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('q'));
    await waitFor(() => expect(lastBob(result.current.turns).done).toBeDefined());
    expect(lastBob(result.current.turns).narration).toBeUndefined();
  });
});

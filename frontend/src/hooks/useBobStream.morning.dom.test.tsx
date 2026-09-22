/**
 * THE MORNING, ASKED AGAIN THE SAME DAY (W2.1, 2026-09-22).
 *
 * The server answers a repeat of the morning question with today's thread
 * instead of a model turn: `start` (reused), `reused`, `done` with no rounds.
 * What is held here is the hook's half: the question and its empty answer
 * come off the screen, the thread being continued is not replaced by the
 * morning's, the `done` frame lands on nothing, and `reused` names the thread
 * the room opens — with when it was answered and read.
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const replies: Array<'turn' | 'reused'> = [];

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: async (
    _url: string,
    init: {
      body: string;
      onopen?: (r: { ok: boolean }) => Promise<void>;
      onmessage?: (ev: { event: string; data: string }) => void;
    },
  ) => {
    await init.onopen?.({ ok: true });
    const send = (event: string, data: unknown) =>
      init.onmessage?.({ event, data: JSON.stringify(data) });
    if (replies.shift() === 'reused') {
      send('start', { thread_id: 'morning-1', reused: true });
      send('reused', { thread_id: 'morning-1', question: 'How are we doing?',
                       answered_at: '2026-09-22T00:02:00Z', read_at: '2026-09-22T00:01:00Z',
                       checked_at: '2026-09-22T01:30:00Z' });
      send('done', { thread_id: 'morning-1', status: 'ok', reused: true, iterations: 0,
                     tool_calls: 0 });
      return;
    }
    send('start', { thread_id: 'thread-A', conversation_id: 'c' });
    send('text', { delta: 'Fairview fell.' });
    send('done', { conversation_id: 'c', thread_id: 'thread-A', iterations: 2, tool_calls: 1,
                   status: 'ok', notice_forced: false });
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

afterEach(() => {
  cleanup();
  replies.length = 0;
});

describe('a reused morning', () => {
  it('names the morning thread and leaves the screen and the thread as they were', async () => {
    replies.push('turn', 'reused');
    const { result } = mount();
    await act(() => result.current.ask('why is Fairview down?'));
    const answered = result.current.turns;
    expect(answered).toHaveLength(2);
    expect(result.current.threadId).toBe('thread-A');

    await act(() => result.current.ask('how are we doing?'));
    expect(result.current.reused).toEqual(expect.objectContaining({
      thread_id: 'morning-1', read_at: '2026-09-22T00:01:00Z',
      answered_at: '2026-09-22T00:02:00Z',
    }));
    // No question and no empty answer left behind; the earlier answer's own
    // `done` is untouched by the reused one.
    expect(result.current.turns).toHaveLength(2);
    const last = result.current.turns[1] as { done?: { iterations: number } };
    expect(last.done?.iterations).toBe(2);
    // The thread being continued is still the one it was.
    expect(result.current.threadId).toBe('thread-A');
    expect(result.current.busy).toBe(false);
  });

  it('is cleared by the next question and by a reset', async () => {
    replies.push('reused', 'turn', 'reused');
    const { result } = mount();
    await act(() => result.current.ask('how are we doing?'));
    expect(result.current.reused?.thread_id).toBe('morning-1');
    await act(() => result.current.ask('why is Fairview down?'));
    expect(result.current.reused).toBeNull();
    await act(() => result.current.ask('how are we doing?'));
    act(() => result.current.reset());
    expect(result.current.reused).toBeNull();
  });
});

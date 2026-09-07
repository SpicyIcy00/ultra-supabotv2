/**
 * A thread has one page scope, decided when it starts.
 *
 * The event source is a stub that records every request body and answers
 * with a `start` and a `done` frame, so what is under test is the hook's
 * own rule: which scope each question is SENT with, and when it is cleared.
 * This is the continuity that route state could not hold — the page context
 * used to survive exactly one turn, because the first navigation lost it.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Sent {
  question: string;
  page_context: string | null;
  page_scope: { name: string | null } | null;
  thread_id: string | null;
}

const sent: Sent[] = [];

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: async (
    _url: string,
    init: {
      body: string;
      onopen?: (r: { ok: boolean }) => Promise<void>;
      onmessage?: (ev: { event: string; data: string }) => void;
    },
  ) => {
    const body = JSON.parse(init.body) as Sent;
    sent.push(body);
    await init.onopen?.({ ok: true });
    const thread = body.thread_id ?? `thread-${sent.length}`;
    init.onmessage?.({
      event: 'start',
      data: JSON.stringify({ thread_id: thread, conversation_id: 'c', logging_enabled: false }),
    });
    init.onmessage?.({
      event: 'done',
      data: JSON.stringify({
        conversation_id: 'c', thread_id: thread, iterations: 1, tool_calls: 0,
        status: 'ok', notice_forced: false,
        usage: { input: 0, output: 0, cache_read: 0 }, cache_hit: false,
      }),
    });
  },
}));
vi.mock('../services/httpAuth', () => ({ authenticatedFetch: vi.fn() }));

const { useGeorgeStream } = await import('./useGeorgeStream');

function mount() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useGeorgeStream(), { wrapper });
}

afterEach(() => {
  cleanup();
  sent.length = 0;
});

describe('page scope on the stream', () => {
  it('binds a new thread to the page it was asked from, and every follow-up carries it', async () => {
    const { result } = mount();
    await act(() => result.current.ask('What has changed?', {
      pageContext: 'Pages / AJI BARN Reorder', pageScope: { name: 'AJI BARN Reorder' },
    }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));
    expect(result.current.pageScope).toEqual({ name: 'AJI BARN Reorder' });
    expect(sent[0].page_scope).toEqual({ name: 'AJI BARN Reorder' });
    expect(sent[0].page_context).toBe('Pages / AJI BARN Reorder');

    // The follow-up names no page — the person may have navigated away —
    // and still goes out under the thread's scope.
    await act(() => result.current.ask('Which one matters most?'));
    expect(sent[1].thread_id).toBe('thread-1');
    expect(sent[1].page_scope).toEqual({ name: 'AJI BARN Reorder' });
    expect(sent[1].page_context).toBeNull();
  });

  it('ignores a different scope offered inside a thread', async () => {
    const { result } = mount();
    await act(() => result.current.ask('q', { pageScope: { name: 'A' } }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));
    await act(() => result.current.ask('q2', { pageScope: { name: 'B' } }));
    expect(sent[1].page_scope).toEqual({ name: 'A' });
    expect(result.current.pageScope).toEqual({ name: 'A' });
  });

  it('has no scope on a fresh Ask, and reset clears it', async () => {
    const { result } = mount();
    await act(() => result.current.ask('q', { pageScope: { name: 'A' } }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));

    act(() => result.current.reset());
    expect(result.current.pageScope).toBeNull();
    expect(result.current.threadId).toBeNull();

    await act(() => result.current.ask('an ordinary question'));
    expect(sent[1].thread_id).toBeNull();
    expect(sent[1].page_scope).toBeNull();
    await waitFor(() => expect(result.current.threadId).toBe('thread-2'));
    expect(result.current.pageScope).toBeNull();
  });

  it('gives an opened thread its own scope, never the previous thread’s', async () => {
    const { result } = mount();
    await act(() => result.current.ask('q', { pageScope: { name: 'A' } }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));

    // Thread B, reopened with the scope recovered from its stored answers.
    act(() => result.current.open([], 'thread-B', { name: 'B' }));
    expect(result.current.pageScope).toEqual({ name: 'B' });
    await act(() => result.current.ask('and here?'));
    expect(sent[1].thread_id).toBe('thread-B');
    expect(sent[1].page_scope).toEqual({ name: 'B' });

    // An ordinary thread, reopened: nothing from A or B.
    act(() => result.current.open([], 'thread-C'));
    expect(result.current.pageScope).toBeNull();
    await act(() => result.current.ask('plain'));
    expect(sent[2].thread_id).toBe('thread-C');
    expect(sent[2].page_scope).toBeNull();
  });

  it('carries the ungrouped scope as null, never as a word', async () => {
    const { result } = mount();
    await act(() => result.current.ask('q', {
      pageContext: 'Pages / Ungrouped', pageScope: { name: null },
    }));
    expect(sent[0].page_scope).toEqual({ name: null });
    expect(JSON.stringify(sent[0].page_scope)).not.toContain('Ungrouped');
  });

  it('leaves a legacy caller exactly as it was', async () => {
    const { result } = mount();
    await act(() => result.current.ask('q', { pageContext: 'warehouse' }));
    expect(sent[0].page_context).toBe('warehouse');
    expect(sent[0].page_scope).toBeNull();
    expect(result.current.pageScope).toBeNull();
  });
});

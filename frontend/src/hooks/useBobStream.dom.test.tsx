/**
 * A thread's page scope, and the page the conversation follows (W1.4).
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
  page_scope: { page_id: string | null } | null;
  thread_id: string | null;
  history: unknown[];
  screen?: unknown;
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

const { useBobStream } = await import('./useBobStream');

function mount() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useBobStream(), { wrapper });
}

afterEach(() => {
  cleanup();
  sent.length = 0;
});

describe('page scope on the stream', () => {
  it('binds a new thread to the page it was asked from, and every follow-up carries it', async () => {
    const { result } = mount();
    await act(() => result.current.ask('What has changed?', {
      pageContext: 'Pages / AJI BARN Reorder',
      pageScope: { page_id: 'p-reorder', title: 'AJI BARN Reorder' },
    }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));
    expect(result.current.pageScope).toEqual({ page_id: 'p-reorder', title: 'AJI BARN Reorder' });
    // The identity goes to the server; the title is the indicator's alone.
    expect(sent[0].page_scope).toEqual({ page_id: 'p-reorder' });
    expect(JSON.stringify(sent[0].page_scope)).not.toContain('Reorder');
    expect(sent[0].page_context).toBe('Pages / AJI BARN Reorder');

    // The follow-up names no page — the person may have navigated away —
    // and still goes out under the thread's scope.
    await act(() => result.current.ask('Which one matters most?'));
    expect(sent[1].thread_id).toBe('thread-1');
    expect(sent[1].page_scope).toEqual({ page_id: 'p-reorder' });
    expect(sent[1].page_context).toBeNull();
  });

  // REWRITTEN 2026-09-22 (W1.4). This held "a different scope offered inside a
  // thread is ignored" for every caller — scope belonged to the thread. It now
  // holds only for a question that names no page (an @page in the room); a
  // question asked from ANOTHER PAGE starts a new thread there, below.
  it('ignores a different scope offered inside a thread by a question from no page', async () => {
    const { result } = mount();
    await act(() => result.current.ask('q', { pageScope: { page_id: 'a', title: 'A' } }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));
    await act(() => result.current.ask('q2', { pageScope: { page_id: 'b', title: 'B' } }));
    expect(sent[1].page_scope).toEqual({ page_id: 'a' });
    expect(result.current.pageScope).toEqual({ page_id: 'a', title: 'A' });
  });

  it('follows the page: the same page continues the thread, another page starts a new one', async () => {
    const { result } = mount();
    await act(() => result.current.ask('what is on here?', {
      where: 'page:a', pageContext: 'Pages / A', pageScope: { page_id: 'a', title: 'A' },
    }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));
    expect(result.current.where).toBe('page:a');

    await act(() => result.current.ask('add date filters to this', {
      where: 'page:a', pageContext: 'Pages / A', pageScope: { page_id: 'a', title: 'A' },
    }));
    expect(sent[1].thread_id).toBe('thread-1');
    expect(sent[1].page_scope).toEqual({ page_id: 'a' });
    expect(sent[1].history.length).toBeGreaterThan(0);

    // On the warehouse now: a new thread, no page scope, nothing of the old one.
    await act(() => result.current.ask('which shops are short?', {
      where: 'screen:warehouse', pageContext: 'Warehouse',
      screen: { key: 'warehouse', label: 'Warehouse' },
    }));
    expect(sent[2].thread_id).toBeNull();
    expect(sent[2].page_scope).toBeNull();
    expect(sent[2].history).toEqual([]);
    expect(sent[2].screen).toEqual({ key: 'warehouse', label: 'Warehouse' });
    await waitFor(() => expect(result.current.threadId).toBe('thread-3'));
    expect(result.current.where).toBe('screen:warehouse');
    expect(result.current.pageScope).toBeNull();
    // Only the new thread's own question is on screen.
    expect(result.current.turns.filter((t) => t.role === 'user')).toHaveLength(1);
  });

  it('has no scope on a fresh Ask, and reset clears it', async () => {
    const { result } = mount();
    await act(() => result.current.ask('q', { pageScope: { page_id: 'a', title: 'A' } }));
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
    await act(() => result.current.ask('q', { pageScope: { page_id: 'a', title: 'A' } }));
    await waitFor(() => expect(result.current.threadId).toBe('thread-1'));

    // Thread B, reopened with the scope recovered from its stored answers.
    act(() => result.current.open([], 'thread-B', { page_id: 'b', title: 'B' }));
    expect(result.current.pageScope).toEqual({ page_id: 'b', title: 'B' });
    await act(() => result.current.ask('and here?'));
    expect(sent[1].thread_id).toBe('thread-B');
    expect(sent[1].page_scope).toEqual({ page_id: 'b' });

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
      pageContext: 'Pages / Ungrouped', pageScope: { page_id: null, title: null },
    }));
    expect(sent[0].page_scope).toEqual({ page_id: null });
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

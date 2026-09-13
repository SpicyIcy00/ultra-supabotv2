/**
 * Two kinds of composition arrive on one frame (P1.b, 2026-09-13).
 *
 * The loop composes a DEFAULT the moment reads land, so the board is not empty
 * for the round trip it takes George to say what the rows are. It rides the
 * `compose` frame and says `default: true`. The hook keeps the two apart —
 * his on `composition`, the loop's on `defaultComposition` — because a default
 * the client could not tell apart from a composition would be the machine's
 * judgement wearing his name.
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

const { useGeorgeStream } = await import('./useGeorgeStream');

function mount() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useGeorgeStream(), { wrapper });
}

const DONE = {
  conversation_id: 'c', thread_id: 't', iterations: 2, tool_calls: 1,
  status: 'ok', notice_forced: false,
  usage: { input: 0, output: 0, cache_read: 0 }, cache_hit: false,
};
const START = { event: 'start', data: { thread_id: 't', conversation_id: 'c', logging_enabled: false } };
const SEEDED = { op: 'put', kind: 'figure', key: 'read-0', weight: 'lead', seq: 0 };
const HIS = { op: 'put', kind: 'hero', key: 'rockwell', weight: 'lead', seq: 0, subject: 'Rockwell' };

function lastGeorge(turns: ReturnType<typeof useGeorgeStream>['turns']) {
  const t = turns[turns.length - 1];
  if (t.role !== 'george') throw new Error('expected a George turn');
  return t;
}

afterEach(() => {
  cleanup();
  script = [];
});

describe('a default composition', () => {
  it('lands on its own field, leaving the composition unset until George composes', async () => {
    script = [
      START,
      { event: 'compose', data: { seq: -1, blocks: [SEEDED], rejected: [], default: true } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('how are we doing?'));
    await waitFor(() => expect(lastGeorge(result.current.turns).done).toBeDefined());

    const turn = lastGeorge(result.current.turns);
    expect(turn.defaultComposition?.blocks).toEqual([SEEDED]);
    expect(turn.composition).toBeUndefined();
  });

  it('is kept beside his when he composes, not replaced by it', async () => {
    script = [
      START,
      { event: 'compose', data: { seq: -1, blocks: [SEEDED], rejected: [], default: true } },
      { event: 'compose', data: { seq: 3, blocks: [HIS], rejected: [] } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('how are we doing?'));
    await waitFor(() => expect(lastGeorge(result.current.turns).done).toBeDefined());

    const turn = lastGeorge(result.current.turns);
    expect(turn.composition?.blocks).toEqual([HIS]);
    expect(turn.defaultComposition?.blocks).toEqual([SEEDED]);
  });

  it('never overwrites what he decided, whatever order the frames arrive in', async () => {
    script = [
      START,
      { event: 'compose', data: { seq: 3, blocks: [HIS], rejected: [] } },
      { event: 'compose', data: { seq: -1, blocks: [SEEDED], rejected: [], default: true } },
      { event: 'done', data: DONE },
    ];
    const { result } = mount();
    await act(() => result.current.ask('how are we doing?'));
    await waitFor(() => expect(lastGeorge(result.current.turns).done).toBeDefined());

    const turn = lastGeorge(result.current.turns);
    expect(turn.composition?.blocks).toEqual([HIS]);
    expect(turn.defaultComposition).toBeUndefined();
  });
});

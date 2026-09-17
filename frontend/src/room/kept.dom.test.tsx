// @vitest-environment jsdom
/**
 * A KEPT PAGE IS THE SAME APP (P2S.3(g), was P2.k).
 *
 * His words, 2026-09-15: *"it doesnt feel like its from the same app and its
 * beacause its not, so make it."* The card's done-when, held here over recorded
 * reads (`__fixtures__/vocab-reads.json`):
 *
 *   - a kept page and the board draw the same read IDENTICALLY — the same
 *     blocks through the same `Board`, compared figure by figure;
 *   - "make that one a pie" changes that object and only that one on the
 *     board, and a pin that remembers a pie is drawn as one on its page (the
 *     server half, that it is that pin only, is
 *     `tests/test_kept_page_shapes_contract.py`);
 *   - a run that is still reading, partly came back, came back empty, or could
 *     not be reached is drawn as itself (UI rule 8).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AnswerTurn } from './data';
import type { Pin, PinRun } from '../types/pins';
import type { CompositionBlock } from '../types/george';
import { buildBoard } from './board';
import { Board } from './render';
import { KeptPin, turnFromRun } from './KeptPage';
import reads from './__fixtures__/vocab-reads.json';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
vi.mock('../hooks/useGeorge', () => ({
  useGeorge: () => ({ ask: vi.fn(), reset: vi.fn(), busy: false }),
}));
const runPin = vi.fn();
vi.mock('../services/pinsApi', async (original) => ({
  ...(await original<typeof import('../services/pinsApi')>()),
  runPin: (id: string) => runPin(id),
}));
afterEach(() => { cleanup(); runPin.mockReset(); });

type Read = { tool: string; arguments: Record<string, unknown>; rows: Record<string, unknown>[];
              meta: Record<string, unknown> };
const R = reads as unknown as Record<string, Read>;

const PIN: Pin = {
  id: 'pin-1', title: 'Shops last month', question: null, page: 'Shops', page_id: 'page-1',
  position: 0, conversation_id: null, created_at: '2026-09-17T00:00:00Z',
  tool_calls: [], last_run_at: null, last_ok_at: '2026-09-17T00:00:00Z', last_status: 'ok',
};

function runOf(names: string[], blocks: CompositionBlock[], statuses: string[] = []): PinRun {
  return {
    id: PIN.id, title: PIN.title, status: 'ok', notices: [], last_ok_at: null,
    ran_at: '2026-09-17T08:00:00Z', blocks,
    results: names.map((n, i) => ({
      tool: R[n].tool, arguments: R[n].arguments, status: (statuses[i] ?? 'ok') as PinRun['status'],
      duration_ms: 12, rows: statuses[i] && statuses[i] !== 'ok' ? [] : R[n].rows,
      meta: R[n].meta as never, notices: [],
      ...(statuses[i] && statuses[i] !== 'ok' ? { error: 'the tool declined' } : {}),
    })),
  };
}

function kept(run: PinRun | Error) {
  if (run instanceof Error) runPin.mockRejectedValue(run); else runPin.mockResolvedValue(run);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <KeptPin pin={PIN} pageId="page-1" title="Shops" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const on = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn() };

function onTheBoard(turn: AnswerTurn) {
  return render(
    <Board answers={[turn]} board={buildBoard([turn])} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

const BLOCKS: CompositionBlock[] = [
  { op: 'put', kind: 'dumbbell', key: 'pin-0', weight: 'lead', seq: 0, tool: 'get_sales' },
  { op: 'put', kind: 'heatmap', key: 'pin-1', weight: 'supporting', seq: 1, tool: 'get_sales' },
];

describe('a kept page and the board draw the same read identically', () => {
  it('draws every figure of a recorded run exactly as the board does', async () => {
    const run = runOf(['dumbbell', 'heatmap'], BLOCKS);
    const page = kept(run).container;
    await waitFor(() => expect(page.querySelectorAll('.r-mk-body')).toHaveLength(2));
    const pageBodies = Array.from(page.querySelectorAll('.r-mk-body')).map((b) => b.outerHTML);
    const pageReceipts = Array.from(page.querySelectorAll('.r-src--tap')).map((b) => b.textContent);
    cleanup();

    const board = onTheBoard(turnFromRun(run)).container;
    const boardBodies = Array.from(board.querySelectorAll('.r-mk-body')).map((b) => b.outerHTML);
    const boardReceipts = Array.from(board.querySelectorAll('.r-src--tap')).map((b) => b.textContent);

    expect(pageBodies).toEqual(boardBodies);
    expect(pageReceipts).toEqual(boardReceipts);
    expect(pageBodies.map((b) => /data-mark="([a-z]+)"/.exec(b)?.[1])).toEqual(['dumbbell', 'heatmap']);
  });

  it('draws a pin that remembers a pie as a pie', async () => {
    const page = kept(runOf(['pie'], [
      { op: 'put', kind: 'pie', key: 'pin-0', weight: 'lead', seq: 0, tool: 'get_sales' },
    ])).container;
    await waitFor(() => expect(page.querySelector('.r-mk-body')?.getAttribute('data-mark')).toBe('pie'));
  });
});

describe('"make that one a pie" on the board', () => {
  it('redraws that object and no other, over the rows it already draws', () => {
    const first = turnFromRun(runOf(['ranked', 'dumbbell'], [
      { op: 'put', kind: 'ranked', key: 'shops', weight: 'lead', seq: 0, tool: 'get_sales' },
      { op: 'put', kind: 'dumbbell', key: 'moves', weight: 'supporting', seq: 1, tool: 'get_sales' },
    ]));
    const second = {
      ...turnFromRun(runOf([], [])),
      composition: { blocks: [{ op: 'change', key: 'shops', kind: 'pie' }] },
    } as unknown as AnswerTurn;
    const board = buildBoard([first, second]);
    const shops = board.find((o) => o.key === 'shops');
    const moves = board.find((o) => o.key === 'moves');
    expect(shops?.kind).toBe('pie');
    expect(shops?.turn).toBe(0);           // still drawing the rows it drew
    expect(moves?.kind).toBe('dumbbell');   // untouched

    const { container } = render(
      <Board answers={[first, second]} board={board} local={{}} focused={null}
             selection={[]} live={false} retuned={{}} on={on} />,
    );
    const marks = Array.from(container.querySelectorAll('[data-figure]')).map((f) => [
      f.getAttribute('data-figure'), f.querySelector('.r-mk-body')?.getAttribute('data-mark'),
    ]);
    expect(Object.fromEntries(marks)).toEqual({ shops: 'pie', moves: 'dumbbell' });
  });
});

describe('a run drawn as what it is', () => {
  it('says it is reading until the run returns', () => {
    runPin.mockReturnValue(new Promise(() => {}));
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}><MemoryRouter>
        <KeptPin pin={PIN} pageId="page-1" title="Shops" />
      </MemoryRouter></QueryClientProvider>,
    );
    expect(container.textContent).toContain('Reading…');
    expect(container.querySelector('.r-mk-body')).toBeNull();
  });

  it('names what did not come back above what did', async () => {
    const { container } = kept(runOf(['ranked', 'dumbbell'], [
      { op: 'put', kind: 'dumbbell', key: 'pin-1', weight: 'lead', seq: 1, tool: 'get_sales' },
    ], ['refused', 'ok']));
    await waitFor(() => expect(container.querySelector('.r-mk-body')).not.toBeNull());
    const note = container.querySelector('[data-missing]') as HTMLElement;
    expect(note.textContent).toContain('1 of 2 reads did not reproduce');
    expect(note.textContent).toContain('declined: the tool declined');
    // Above the figure it qualifies (UI rule 4).
    expect(note.compareDocumentPosition(container.querySelector('.r-mk-body') as Node)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says an empty result is empty, not zero', async () => {
    const run = runOf(['ranked'], []);
    run.results[0].rows = [];
    const { container } = kept(run);
    await waitFor(() => expect(container.querySelector('[data-state="empty"]')).not.toBeNull());
    expect(container.textContent).toContain('not a zero');
  });

  it('says it could not reach George, and when the pin last worked', async () => {
    const { container } = kept(new Error('network down'));
    await waitFor(() => expect(container.querySelector('[data-state="failed"]')).not.toBeNull());
    expect(container.textContent).toContain('Last worked');
  });
});

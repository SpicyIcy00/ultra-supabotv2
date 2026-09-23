// @vitest-environment jsdom
/**
 * THE LEFT IS THE BIGGER PICTURE (D2, 2026-09-23) — on the real Room.
 *
 * The owner, of the live build: *"i couldnt scroll down the left but there was
 * more, i why is there soo much text on the left i want most text on the
 * right. the left is just the bigger picture."* and, for the third time,
 * *"theres still alot of discliamers i dont really want to see them."*
 *
 * One of the three notices drawn on his 2026-09-23 turns was the first thing
 * under his question: *"2,180 stock counts are below zero, the lowest
 * -78,291…"*, forty words of it, before Bob said anything at all — and on the
 * side that is meant to hold the answer.
 *
 * A notice whose read IS drawn rides that figure already (`turnNotices`). What
 * is left qualifies no number on his side, so it is drawn at the HEAD OF THE
 * FIGURES: still always drawn, still above every number this turn drew, still
 * never the accent (UI rule 4, UI rule 5) — and off his column.
 *
 * AND SO IS HIS OWN CAVEAT. Measured live on his "Why is Greenhills down?" the
 * same day: an EIGHT-word answer under a FORTY-SEVEN word caveat. The caveat
 * qualifies the figures, so it goes above them, and his column is left with
 * the point and the line under it.
 *
 * Mounted whole, as voice.dom.test.tsx mounts it: a fake stream holding one
 * recorded-shape turn, an axios adapter answering the definitions, no network.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BobCtx, type BobContext } from '../components/bob/bobContext';
import { useAuthStore } from '../stores/authStore';
import frames from '../frames/scenes.json';
import Room from './Room';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));

afterEach(cleanup);

const META = {
  source_table: 'new_transactions', snapshot_timestamp: '2026-09-18T06:00:00Z',
  filters_applied: ['sales_day: Asia/Manila'],
};
const ROWS = [
  { store_id: 's-rockwell', store: 'Rockwell', value: 1075722.48, baseline: 2355681.78, change_pct: -54.3, unit: 'PHP' },
  { store_id: 's-greenhills', store: 'Greenhills', value: 1231651.4, baseline: 1294579.0, change_pct: -4.9, unit: 'PHP' },
];
/** The notice as the live turn of 2026-09-23 carried it, word for word. */
const BELOW_ZERO = '2,180 stock counts are below zero, the lowest -78,291. A count below zero '
  + 'is a broken record and not a shelf, so something shown here as out of stock may just '
  + 'have a bad count.';
const ANSWER = 'Greenhills is down on fewer transactions, not a smaller basket.';

const CAVEAT = 'Greenhills is measured Monday to Sunday against the same seven days '
  + 'before; 44 of the 118 products have no figure on one side, so the product split is '
  + 'partial and the shop total is not.';

function mountRoom(notices: { kind: string; message: string }[], caveat: string | null = null) {
  const desk = (frames as { desk: Record<string, unknown> }).desk;
  axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const url = config.url ?? '';
    const ok = (data: unknown): AxiosResponse => ({ data, status: 200, statusText: 'OK', headers: {}, config });
    if (url.endsWith('/definitions/desk')) return ok(desk);
    if (url.includes('/standing/latest')) return ok(null);
    return ok([]);
  };
  useAuthStore.setState({
    user: { id: 'd2', username: 'owner', display_name: 'You', role: 'owner', allowed_pages: ['bob'] },
  } as never);
  const turns = [
    { role: 'user', text: 'check all products', at: '2026-09-23T06:40:00Z' },
    {
      role: 'bob', text: ANSWER, thinking: '', at: '2026-09-23T06:40:05Z',
      reading: { claim: 'Greenhills is down on fewer transactions', caveat, next: null, asks: [] },
      toolCalls: [{
        seq: 0, tool: 'get_sales',
        arguments: { group_by: ['store'], date_range: 'last_7_days', compare_to: 'previous_period' },
        result: { rows: ROWS, meta: META },
      }],
      defaultComposition: { blocks: [{ op: 'put', kind: 'table', key: 't', seq: 0, tool: 'get_sales', weight: 'lead' }] },
      notices,
      post: { question_post_id: 'q-1', answer_post_id: 'post-1', thread_id: 't-1',
              conversation_id: 'c-1', visibility: 'org', stored: true },
    },
  ];
  const noop = () => {};
  const bob = {
    turns, busy: false, threadId: null, storedThreadId: null,
    open: noop, ask: vi.fn(async () => {}), reset: noop, cancel: noop, setComposer: noop,
    presence: 'idle', live: null, composer: 'idle',
  } as unknown as BobContext;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <BobCtx.Provider value={bob}>
        <MemoryRouter initialEntries={['/bob']}>
          <Routes><Route path="*" element={<Room />} /></Routes>
        </MemoryRouter>
      </BobCtx.Provider>
    </QueryClientProvider>
  );
}

async function room(notices: { kind: string; message: string }[] = [],
                    caveat: string | null = null) {
  render(mountRoom(notices, caveat));
  await waitFor(() => expect(document.querySelector('.r-steer .r-token')).not.toBeNull());
}

describe('a notice with no figure of its own is drawn at the head of the figures', () => {
  it('is not in his column, and is in the figures column', async () => {
    await room([{ kind: 'negative_on_hand', message: BELOW_ZERO }]);
    await waitFor(() => expect(document.querySelector('.r-figures-caveats .r-caveat')).not.toBeNull());
    const words = document.querySelector('.r-words') as HTMLElement;
    expect(words.textContent).toContain('fewer transactions');
    expect(words.querySelector('.r-caveats')).toBeNull();
    expect(words.textContent).not.toContain('below zero');
    const right = document.querySelector('.r-right') as HTMLElement;
    expect(right.textContent).toContain('below zero');
  });

  it('is drawn ABOVE the figures it qualifies, never under them (UI rule 4)', async () => {
    await room([{ kind: 'negative_on_hand', message: BELOW_ZERO }]);
    await waitFor(() => expect(document.querySelector('.r-figures-caveats .r-caveat')).not.toBeNull());
    const drawn = document.querySelector('.r-figures-caveats')!;
    const board = document.querySelector('.r-board')!;
    // Node.DOCUMENT_POSITION_FOLLOWING: the board comes after the notice.
    expect(drawn.compareDocumentPosition(board) & 4).toBeTruthy();
  });

  it('never wears the accent — prominence from position (UI rule 5)', async () => {
    await room([{ kind: 'negative_on_hand', message: BELOW_ZERO }]);
    const drawn = await waitFor(() => document.querySelector('.r-figures-caveats .r-caveat')!);
    expect(drawn.className).not.toContain('accent');
    expect(drawn.getAttribute('style') ?? '').not.toContain('--accent');
  });

  it('draws nothing at all when the turn raised none', async () => {
    await room([]);
    expect(document.querySelector('.r-figures-caveats .r-caveat')).toBeNull();
    expect(document.querySelector('.r-caveats')).toBeNull();
  });

  it('folds two or more to one line, which is what three on one screen needs', async () => {
    await room([
      { kind: 'negative_on_hand', message: BELOW_ZERO },
      { kind: 'stale_stock', message: 'The newest stock count is nine days old.' },
    ]);
    const box = await waitFor(() => document.querySelector('.r-figures-caveats .r-caveats')!);
    expect(box.getAttribute('data-folded')).toBe('yes');
    expect(box.textContent).toContain('2 notes on these figures');
  });
});

describe('his own caveat goes with the figures it qualifies', () => {
  it('is drawn at the head of the figures, not in his column', async () => {
    await room([], CAVEAT);
    const drawn = await waitFor(() => document.querySelector('.r-figures-caveats .r-turn-caveat')!);
    expect(drawn.textContent).toContain('44 of the 118 products');
    const words = document.querySelector('.r-words') as HTMLElement;
    expect(words.querySelector('.r-turn-caveat')).toBeNull();
    expect(words.textContent).not.toContain('44 of the 118 products');
  });

  it('leaves his column the point and the line under it', async () => {
    await room([], CAVEAT);
    await waitFor(() => expect(document.querySelector('.r-figures-caveats .r-turn-caveat')).not.toBeNull());
    const words = (document.querySelector('.r-words') as HTMLElement).textContent ?? '';
    expect(words).toContain('fewer transactions');
    // His answer is eight words; nothing here multiplies it.
    expect(words.split(/\s+/).filter(Boolean).length).toBeLessThan(40);
  });

  it('draws his caveat above the machine notices, both above the figures', async () => {
    await room([{ kind: 'negative_on_hand', message: BELOW_ZERO }], CAVEAT);
    const box = await waitFor(() => document.querySelector('.r-figures-caveats')!);
    const his = box.querySelector('.r-turn-caveat')!;
    const placed = box.querySelector('.r-caveats')!;
    expect(his.compareDocumentPosition(placed) & 4).toBeTruthy();
    expect(box.compareDocumentPosition(document.querySelector('.r-board')!) & 4).toBeTruthy();
  });
});

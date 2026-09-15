// @vitest-environment jsdom
/**
 * THE OFFERS NO ROW COULD CARRY (P2.d).
 *
 * The half of "an offer is drawn exactly once" that the marks cannot show. An
 * offer George made about the ANSWER names no row; one he aimed at a row the
 * board did not draw has nowhere to sit. Both land here, and they are drawn
 * the same, because a reader does not need to know which kind it was.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FootOffers } from './FootOffers';
import type { ActionOffer } from '../types/george';
import type { AnswerTurn } from './data';
import type { TileActions } from './tiles';

afterEach(cleanup);

const on: TileActions = {
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), aside: vi.fn(), patch: vi.fn(),
  retune: vi.fn(), shift: vi.fn(), move: vi.fn(), resize: vi.fn(), keep: vi.fn(),
};

const ROWS = [
  { store: 'OPUS', value: 555147 },
  { store: 'Magnolia', value: 121004 },
];

const TURN = {
  role: 'george', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
  toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {},
                result: { rows: ROWS, meta: { source_table: 'new_transactions',
                                              filters_applied: [] } } }],
} as unknown as AnswerTurn;

const offer = (over: Partial<ActionOffer> = {}): ActionOffer => ({
  act: 'why', seq: 1, target: null, reason: 'before the order goes out',
  costs: 'a turn', modelTurn: true, ...over,
});

function draw(offers: ActionOffer[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FootOffers offers={offers} answers={[TURN]} on={on} />
    </QueryClientProvider>,
  );
}

describe('the foot', () => {
  it('draws an offer about the answer, with its reason and its cost', () => {
    const { container } = draw([offer()]);
    const button = container.querySelector('.r-foot-offers .r-offer');
    expect(button?.querySelector('.r-offer-why')?.textContent).toBe('before the order goes out');
    expect(button?.querySelector('.r-offer-cost')?.textContent).toBe('a turn');
  });

  it('draws nothing at all when there is nothing left over', () => {
    const { container } = draw([]);
    expect(container.querySelector('.r-foot-offers')).toBeNull();
  });

  it('asks George about the row, when the offer named one nothing drew', () => {
    const { container } = draw([offer({ target: 'Magnolia' })]);
    (container.querySelector('.r-offer') as HTMLButtonElement).click();
    // The dimension is resolved off the READ's rows, never guessed from the
    // word: a product called "Rockwell Crackers" is a product.
    expect(on.why).toHaveBeenCalledWith('Magnolia', 'store');
  });

  it('wears no colour here either', () => {
    const { container } = draw([offer()]);
    const button = container.querySelector('.r-offer') as HTMLElement;
    expect(button.getAttribute('style')).toBeNull();
    expect(button.className).toBe('r-offer');
  });
});

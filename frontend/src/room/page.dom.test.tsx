/**
 * THE PAGE, DRAWN: his paragraphs in his order, each followed by the figures it
 * cites — and everything that stops being drawn because the paragraph says it.
 *
 * The owner, 2026-09-19: *"this doesn't feel like a page with a well thought out
 * path."* `page.test.ts` holds that the path is read out of his answer; this
 * holds that the room then DRAWS that path and not the figures' own order.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Board } from './render';
import { pageOf } from './page';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';

afterEach(cleanup);

const read = (seq: number, label: string, rows: Record<string, unknown>[]) => ({
  seq, tool: 'get_sales', arguments: { seq },
  result: { rows, meta: { source_table: 'new_transactions', metric_label: label,
                          snapshot_timestamp: '2026-09-19T10:35:00Z', filters_applied: [] } },
});

// His prose runs shops, then products. His COMPOSE call ran products first —
// which is the order the room used to draw.
const TEXT = `Two things fell, and they are separate.

Shops: OPUS gave back 88,045 and Greenhills 16,026. The rest were up.

Products: bayberry gave back 30,049 and mango 12,139.

**Caveats:** one window, the closed week.

I'd look at Greenhills next.`;

const TURN = {
  role: 'bob', text: TEXT, thinking: '', at: '2026-09-19T10:36:00Z',
  reading: { claim: 'Two things fell, and they are separate', next: "I'd look at Greenhills next." },
  toolCalls: [
    read(0, 'Attention', [{ subject: 'OPUS', value: 88045 }, { subject: 'x', value: 16026 }]),
    read(1, 'Net sales', [{ store: 'OPUS', value: 1, change: -88045 },
                          { store: 'Greenhills', value: 2, change: -16026 }]),
    read(2, 'Product revenue', [{ product: 'bayberry', value: 1, change: -30049 },
                                { product: 'mango', value: 2, change: -12139 }]),
  ],
} as unknown as AnswerTurn;

const PAGE = pageOf(TEXT, 'Two things fell, and they are separate',
                    "I'd look at Greenhills next.", TURN.toolCalls);

const block = (key: string, seq: number, extra: Partial<BoardObject> = {}): BoardObject => ({
  key, kind: 'ranked', weight: 'supporting', seq, tool: 'get_sales', turn: 0, touched: 0, ...extra,
} as BoardObject);

const ACTIONS = (): TileActions => ({
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn(),
});

function draw(board: BoardObject[], extra: Record<string, unknown> = {}) {
  return render(
    <Board answers={[TURN]} board={board} local={{}} focused={null} selection={[]}
           live={false} retuned={{}} on={ACTIONS()} page={PAGE} {...extra} />,
  );
}

/** The flow, top to bottom: `para` for a paragraph, the key for a figure. */
function flow(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-para], [data-figure]'))
    .map((el) => (el.hasAttribute('data-para')
      ? `para:${(el.textContent ?? '').split(/[ :]/)[0]}` : el.getAttribute('data-figure') ?? ''));
}

describe('the page follows what he wrote, not what he composed', () => {
  // Composed products FIRST, and weighted it the lead.
  const board = [
    block('products', 2, { weight: 'lead', claim: 'Bayberry leads the fall', thought: 'By a distance.' }),
    block('shops', 1, { claim: 'OPUS is most of it', thought: 'The rest barely moved.' }),
  ];

  it('runs his paragraphs in his order, each followed by the figure it cites', () => {
    const { container } = draw(board);
    expect(flow(container)).toEqual([
      'para:Shops', 'shops', 'para:Products', 'products', 'para:Caveats']);
  });

  it('draws every paragraph whole — the orphan is back in its sentence', () => {
    const { container } = draw(board);
    const shops = container.querySelector('[data-para]')?.textContent ?? '';
    expect(shops).toContain('OPUS gave back 88,045');
    expect(shops).toContain('The rest were up.');
  });

  it('leaves the headline and what he would do next to the column beside it', () => {
    const { container } = draw(board);
    const paras = Array.from(container.querySelectorAll('[data-para]')).map((p) => p.textContent);
    expect(paras.join(' ')).not.toContain('Two things fell');
    expect(paras.join(' ')).not.toContain("I'd look at Greenhills next");
  });

  it('keeps a paragraph that cites nothing — a caveat is part of the path', () => {
    const { container } = draw(board);
    expect(container.querySelectorAll('[data-para]')).toHaveLength(3);
  });

  it('a paragraph spans the page, and so does the one figure under it', () => {
    const { container } = draw(board);
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-para]'))) {
      expect(el.style.gridColumn).toBe('1 / -1');
    }
    expect((container.querySelector('[data-figure="shops"]') as HTMLElement).style.gridColumn)
      .toBe('1 / -1');
  });
});

describe('what stops being said twice', () => {
  const board = [block('shops', 1, { claim: 'OPUS is most of it', thought: 'The rest barely moved.' })];

  it('keeps the claim as the figure\'s caption and drops the thought the paragraph already says', () => {
    const { container } = draw(board);
    const fig = container.querySelector('[data-figure="shops"]') as HTMLElement;
    expect(fig.getAttribute('data-told')).toBe('yes');
    expect(fig.querySelector('.r-mk-title')?.textContent).toBe('OPUS is most of it');
    expect(fig.querySelector('.r-mk-thought')).toBeNull();
  });

  it('does not draw his cited sentence again under the chart', () => {
    const { container } = draw(board, { thoughts: new Map([[1, ['OPUS gave back 88,045.']]]) });
    expect(container.querySelector('.r-fig-thought')).toBeNull();
  });

  it('with no page, draws the block as it always did', () => {
    const { container } = render(
      <Board answers={[TURN]} board={board} local={{}} focused={null} selection={[]}
             live={false} retuned={{}} on={ACTIONS()} />,
    );
    expect(container.querySelector('[data-para]')).toBeNull();
    expect(container.querySelector('.r-mk-thought')?.textContent).toBe('The rest barely moved.');
    expect(container.querySelector('[data-figure="shops"]')?.getAttribute('data-told')).toBeNull();
  });
});

describe('two figures under one paragraph', () => {
  it('sit side by side when neither is the lead', () => {
    const { container } = draw([block('shops', 1, { claim: 'a' }),
                                block('attn', 0, { claim: 'b' })]);
    const cols = ['shops', 'attn'].map((k) => (container
      .querySelector(`[data-figure="${k}"]`) as HTMLElement).style.gridColumn);
    expect(cols.sort()).toEqual(['1', '2']);
  });

  it('put the one the answer rests on across the top', () => {
    const { container } = draw([block('attn', 0, { claim: 'b' }),
                                block('shops', 1, { claim: 'a', weight: 'lead' })]);
    expect(flow(container).slice(0, 3)).toEqual(['para:Shops', 'shops', 'attn']);
    expect((container.querySelector('[data-figure="shops"]') as HTMLElement).style.gridColumn)
      .toBe('1 / -1');
  });

  it('keep what he gathered under a point under it, with its word', () => {
    const { container } = draw([block('shops', 1, { claim: 'a', weight: 'lead' }),
                                block('attn', 0, { claim: 'b', under: 'shops', relation: 'counter' })]);
    expect(flow(container).slice(0, 3)).toEqual(['para:Shops', 'shops', 'attn']);
    expect(container.querySelector('[data-figure="attn"] .r-fig-rel')?.textContent).toBe('against that');
  });
});

describe('a read he never wrote up, on the page', () => {
  const machine = (key: string, seq: number) => block(key, seq, { kind: 'table', weight: 'quiet', default: true });

  it('stays folded when he drew that same read himself', () => {
    // His figure and the loop's table of ONE read: the same numbers, worse.
    const { container } = draw([block('shops', 1, { claim: 'a' }), machine('m-shops', 1)]);
    expect(container.querySelector('[data-figure="m-shops"]')).toBeNull();
    expect(container.querySelector('.r-earlier-line')?.textContent).toMatch(/1 more read he did not write up/);
  });

  it('is the evidence for a read his paragraph cites and he drew no chart of', () => {
    // The shops paragraph cites the attention read too; he drew only the shops.
    const { container } = draw([block('shops', 1, { claim: 'a', weight: 'lead' }), machine('m-attn', 0)]);
    expect(flow(container).slice(0, 3)).toEqual(['para:Shops', 'shops', 'm-attn']);
    expect(container.querySelector('.r-earlier-line')).toBeNull();
  });

  it('is the evidence when the paragraph has none of his', () => {
    // He wrote up the shops; the products paragraph cites a read only the loop drew.
    const { container } = draw([block('shops', 1, { claim: 'a' }), machine('m-products', 2)]);
    expect(flow(container)).toEqual(['para:Shops', 'shops', 'para:Products', 'm-products', 'para:Caveats']);
  });

  it('still opens from the foot', () => {
    const { container } = draw([block('shops', 1, { claim: 'a' }), machine('m-shops', 1)]);
    fireEvent.click(container.querySelector('.r-earlier-line') as HTMLElement);
    expect(container.querySelector('[data-figure="m-shops"]')).not.toBeNull();
  });
});

describe('what no paragraph cites', () => {
  it('comes after the prose — gathered, and not talked about', () => {
    const uncited = { ...block('other', 9, { claim: 'nobody mentioned this' }) };
    const turn = { ...TURN, toolCalls: [...TURN.toolCalls,
      read(9, 'Units', [{ store: 'Fairview', value: 777777 }])] } as unknown as AnswerTurn;
    const { container } = render(
      <Board answers={[turn]} board={[uncited, block('shops', 1, { claim: 'a' })]} local={{}}
             focused={null} selection={[]} live={false} retuned={{}} on={ACTIONS()} page={PAGE} />,
    );
    const order = flow(container);
    expect(order.indexOf('other')).toBeGreaterThan(order.indexOf('para:Caveats'));
  });
});

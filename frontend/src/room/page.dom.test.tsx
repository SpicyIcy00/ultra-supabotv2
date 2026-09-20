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
    const rel = container.querySelector('[data-figure="attn"] .r-fig-rel');
    expect(rel?.textContent).toBe('against that');
    // Beside its stem, the word needs no more than itself.
    expect(rel?.getAttribute('data-points')).toBeNull();
  });
});

/**
 * THE RELATION WHEN ITS POINT IS A BEAT AWAY (P3.o).
 *
 * The word was drawn off `under` and the PLACEMENT off the beat, so the two
 * disagreed exactly when it mattered: `whatsdown.json`, the live board of
 * 2026-09-19, hung the basket read under the shops read, his prose talked
 * about them in two different paragraphs, and the page drew "WHY" over a chart
 * whose stem was a screen above. At the one place the page tried to say what
 * led to what, it pointed off the edge.
 */
describe('a point whose stem is in another beat', () => {
  // `products` is cited by the products paragraph; `shops` by the shops one.
  const apart = (extra: Partial<BoardObject> = {}) => draw([
    block('shops', 1, { claim: 'OPUS is most of it', weight: 'lead' }),
    block('products', 2, { claim: 'Bayberry leads the fall', under: 'shops',
                           relation: 'evidence', ...extra }),
  ]);

  it('names the point it answers, in that point\'s own words', () => {
    const { container } = apart();
    const rel = container.querySelector('[data-figure="products"] .r-fig-rel');
    expect(rel?.getAttribute('data-points')).toBe('yes');
    expect(rel?.querySelector('.r-fig-rel-word')?.textContent).toBe('why');
    expect(rel?.querySelector('.r-fig-rel-pt')?.textContent).toBe('OPUS is most of it');
  });

  it('still draws them in his order, a beat apart', () => {
    const { container } = apart();
    expect(flow(container)).toEqual([
      'para:Shops', 'shops', 'para:Products', 'products', 'para:Caveats']);
  });

  it('says nothing at all when the stem has no claim to name', () => {
    // A default block carries no claim, so there is no honest way to finish
    // the sentence — and a bare "why" pointing nowhere is the defect itself.
    const { container } = draw([
      block('shops', 1, { weight: 'lead', default: true, thought: 'The rest barely moved.' }),
      block('products', 2, { claim: 'Bayberry leads the fall', under: 'shops',
                             relation: 'evidence' }),
    ]);
    expect(container.querySelector('[data-figure="products"]')).not.toBeNull();
    expect(container.querySelector('[data-figure="products"] .r-fig-rel')).toBeNull();
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

/**
 * ONE THOUGHT, THEN EXACTLY THE EVIDENCE FOR IT (P3.o).
 *
 * Twenty-one rows were on the owner's screen — three charts of seven shops — to
 * say that OPUS fell most and Greenhills' basket shrank. He called it, fairly,
 * a thing that *"still kinda feels off"*. So a paragraph splits where his
 * thought moves to a new read, and a figure under a thought that names one or
 * two rows draws those rows and folds the rest.
 */
describe('a thought, and the evidence for it', () => {
  const shops = ['OPUS', 'Greenhills', 'Shangri-La', 'Magnolia', 'Rockwell'];
  const TEXT2 = `Shops fell, in two ways.

Shops: OPUS gave back 88,045, Greenhills 16,026 and Rockwell 4,901. The rest were up. OPUS I would leave alone: its tills lost 1,107 down to 999. Greenhills is the real one.`;
  const TURN2 = {
    role: 'bob', text: TEXT2, thinking: '', at: '2026-09-19T10:36:00Z',
    reading: { claim: 'Shops fell, in two ways' },
    toolCalls: [
      read(1, 'Net sales', shops.map((store, i) => ({ store, value: i + 1,
        change: [-88045, -16026, 5, 6, -4901][i] }))),
      read(2, 'Transactions', shops.map((store, i) => ({ store, value: [999, 693, 525, 490, 359][i],
        baseline: [1107, 677, 486, 509, 366][i] }))),
    ],
  } as unknown as AnswerTurn;
  const PAGE2 = pageOf(TEXT2, 'Shops fell, in two ways', null, TURN2.toolCalls);
  const draw2 = (board: BoardObject[]) => render(
    <Board answers={[TURN2]} board={board} local={{}} focused={null} selection={[]}
           live={false} retuned={{}} on={ACTIONS()} page={PAGE2} />,
  );
  const board = [block('sales', 1, { kind: 'dumbbell', claim: 'three fell', weight: 'lead' }),
                 block('tills', 2, { kind: 'dumbbell', claim: 'the tills' })];

  it('splits his paragraph where the thought moves to a new read', () => {
    const { container } = draw2(board);
    expect(flow(container)).toEqual(['para:Shops', 'sales', 'para:OPUS', 'tills']);
  });

  it('gives a carried-on thought less room than one that opens a paragraph', () => {
    const { container } = draw2(board);
    const paras = Array.from(container.querySelectorAll('[data-para]'));
    expect(paras[0].getAttribute('data-opens')).toBeNull();      // the first thing on the page
    expect(paras[1].getAttribute('data-opens')).toBeNull();      // carries on, mid-paragraph
  });

  it('leaves the overview whole — three names is everyone', () => {
    const { container } = draw2(board);
    const sales = container.querySelector('[data-figure="sales"]') as HTMLElement;
    expect(sales.querySelectorAll('.r-mk-row')).toHaveLength(5);
    expect(sales.querySelector('.r-mk-more')).toBeNull();
  });

  it('draws only the rows the thought names, and folds the rest to a line', () => {
    const { container } = draw2(board);
    const tills = container.querySelector('[data-figure="tills"]') as HTMLElement;
    const names = Array.from(tills.querySelectorAll('.r-mk-row .r-mk-name-text, .r-mk-row .r-mk-name'))
      .map((el) => el.textContent);
    expect(tills.querySelectorAll('.r-mk-row')).toHaveLength(2);
    expect(names.join(' ')).toContain('OPUS');
    expect(names.join(' ')).toContain('Greenhills');
    expect(tills.querySelector('.r-mk-more')?.textContent).toBe('3 more · show');
  });

  it('opens to every row, and folds back', () => {
    const { container } = draw2(board);
    const tills = container.querySelector('[data-figure="tills"]') as HTMLElement;
    fireEvent.click(tills.querySelector('.r-mk-more') as HTMLElement);
    expect(tills.querySelectorAll('.r-mk-row')).toHaveLength(5);
    fireEvent.click(tills.querySelector('.r-mk-more') as HTMLElement);
    expect(tills.querySelectorAll('.r-mk-row')).toHaveLength(2);
  });

  it('offers no fold under a single number, which has no rows to open', () => {
    // His figure of ONE shop, over a read of five: already one row of it.
    const { container } = draw2([block('sales', 1, { kind: 'dumbbell', claim: 'three fell', weight: 'lead' }),
      block('opus-tills', 2, { kind: 'figure', subject: 'OPUS', claim: "OPUS's tills" })]);
    const fig = container.querySelector('[data-figure="opus-tills"]') as HTMLElement;
    expect(fig.querySelector('.r-mk-num')).not.toBeNull();
    expect(fig.querySelector('.r-mk-more')).toBeNull();
  });

  it('never folds a figure drawn without the page — a kept page shows every row', () => {
    const { container } = render(
      <Board answers={[TURN2]} board={board} local={{}} focused={null} selection={[]}
             live={false} retuned={{}} on={ACTIONS()} />,
    );
    expect(container.querySelector('.r-mk-more')).toBeNull();
    expect(container.querySelector('[data-figure="tills"]')?.querySelectorAll('.r-mk-row')).toHaveLength(5);
  });
});

/**
 * HIS ARRANGEMENT OF THE RIGHT-HAND SIDE (P3.p, 2026-09-20).
 *
 * The owner, of the shipped board and of four template variants drawn for him
 * the same day: *"i dont [want] it to just be text chart here this and heres
 * that, i want it to use that space like its designing its own page or artifact
 * for its answer … it doesnt have to have text before a chart … in that space
 * its its playground."*
 *
 * Until this, nothing he said reached the arrangement: `beside.placeFigures`
 * dropped each figure into whichever column was shortest. These hold that when
 * he sends one the packing steps aside, that the figures inside it are the
 * ordinary ones, and that nothing he composed can be lost by it.
 */
describe('the arrangement he laid out', () => {
  const two = [block('shops', 1, { claim: 'a', weight: 'lead' }),
               block('products', 2, { claim: 'b' })];

  it('draws his tree instead of the packing', () => {
    const { container } = draw(two, {
      arrangement: { layout: 'row', children: [{ block: 'shops' }, { block: 'products' }] },
    });
    const row = container.querySelector('.r-laid--row');
    expect(row).not.toBeNull();
    expect(row?.querySelectorAll('[data-figure]')).toHaveLength(2);
    // Packed, a figure carries a column and a measured row span. Laid out by
    // him it carries neither — it fills what his tree gives it.
    const fig = container.querySelector('[data-figure="shops"]') as HTMLElement;
    expect(fig.getAttribute('data-col')).toBeNull();
    expect(fig.style.gridColumn).toBe('');
  });

  it('puts his words wherever he placed them, including after a figure', () => {
    const { container } = draw(two, {
      arrangement: { layout: 'stack', children: [
        { block: 'shops' },
        { say: 'and the rest of the estate held' },
        { block: 'products' },
      ] },
    });
    const flowed = Array.from(container.querySelectorAll('[data-figure], .r-laid-say'))
      .map((el) => el.getAttribute('data-figure') ?? el.textContent);
    expect(flowed).toEqual(['shops', 'and the rest of the estate held', 'products']);
  });

  it('draws the figures with everything a figure carries', () => {
    const { container } = draw(two, {
      arrangement: { layout: 'panel', heading: 'Last week',
                     children: [{ block: 'shops' }] },
    });
    expect(container.querySelector('.r-laid-head')?.textContent).toBe('Last week');
    // The claim, the source line and the read's own chrome are the ordinary
    // ones: `drawFigure` is the same function the packing calls.
    expect(container.querySelector('[data-figure="shops"] .r-mk-title')?.textContent)
      .toBe('a');
    expect(container.querySelector('[data-figure="shops"] .r-src')).not.toBeNull();
  });

  it('draws a block he did not place, rather than losing it', () => {
    const { container } = draw(two, {
      arrangement: { layout: 'stack', children: [{ block: 'shops' }] },
    });
    // `products` is not in his tree. The server says so on `coerced`; this is
    // the half that keeps it on screen.
    expect(container.querySelector('[data-figure="products"]')).not.toBeNull();
  });

  it('packs exactly as before when he sends none', () => {
    const { container } = draw(two);
    expect(container.querySelector('.r-laid')).toBeNull();
    const fig = container.querySelector('[data-figure="shops"]') as HTMLElement;
    expect(fig.getAttribute('data-col')).not.toBeNull();
  });
});

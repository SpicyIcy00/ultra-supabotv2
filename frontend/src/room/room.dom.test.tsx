/**
 * The room's board, as rendered. The room's FIRST tests.
 *
 * WHY THESE EXIST, WRITTEN DOWN BECAUSE THE GAP WAS EXPENSIVE. The room is
 * what "/" renders — the surface this whole product is — and on 2026-09-11 it
 * had no tests at all, while 892 of them covered a desk nobody can reach any
 * more. In one afternoon that let three defects ship:
 *
 *   a global rename left callFor() calling itself, so the board crashed with a
 *   stack overflow and rendered nothing;
 *   a control read `.state` off a result whose field is `status`, so every
 *   click did nothing at all;
 *   a tile returned `unknown` where React wanted a node.
 *
 * The suite stayed green through all three, and the typecheck that would have
 * caught two of them was being run in a way that checked no files.
 *
 * So these assert the two things a renderer has to do: draw every kind of
 * object it claims to draw, and hand a person's touch back as the right
 * intent. They mock nothing below the component — the board fold, the call
 * resolver and every tile run for real.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Board } from './render';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';

vi.mock('./ObjectPanel', () => ({
  // The panel fetches; the board does not. Its own behaviour is not what these
  // assert, and letting it run would make every test a network test.
  ObjectPanel: () => null,
  kindOf: () => null,
}));

// Renders accumulate in one document otherwise, and every query after the
// first finds two of everything.
afterEach(cleanup);

const ROWS = [
  { store: 'Rockwell', value: 203717, change_pct: 13.8, direction: 'up', unit: 'PHP',
    product: 'Aji Mix', sku: 'SH1', quantity_on_hand: 12, document_date: '2026-09-01' },
  { store: 'OPUS', value: 555147, change_pct: 30.6, direction: 'up', unit: 'PHP',
    product: 'Kameda', sku: 'K1', quantity_on_hand: 0, document_date: '2026-09-08' },
];

const TURN: AnswerTurn = {
  role: 'george',
  text: 'Both shops are up on last week.',
  thinking: '',
  at: '2026-09-11T08:00:00Z',
  toolCalls: [{
    seq: 0,
    tool: 'get_sales',
    arguments: { metric: 'net_sales', date_range: 'last_week' },
    result: {
      rows: ROWS,
      meta: { source_table: 'new_transactions', metric_label: 'Net sales',
              snapshot_timestamp: '2026-09-11T08:00:00Z', filters_applied: [] },
    },
  }],
} as unknown as AnswerTurn;

function object(kind: string, extra: Partial<BoardObject> = {}): BoardObject {
  return {
    key: `k-${kind}`, kind: kind as BoardObject['kind'], weight: 'supporting',
    seq: 0, tool: 'get_sales', turn: 0, touched: 0, ...extra,
  } as BoardObject;
}

const ACTIONS = (): TileActions => ({
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(),
  retune: vi.fn(),
});

function draw(objects: BoardObject[], on: TileActions = ACTIONS()) {
  return render(
    <Board answers={[TURN]} board={objects} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

describe('the room draws what it claims to draw', () => {
  // EVERY KIND, INCLUDING THE FOUR ADDED FOR FEATURE 1. A widget declared in
  // metrics.yaml that the renderer cannot draw is a promise the model will
  // keep and the screen will not.
  //
  // `text` IS NOT AMONG THEM ANY MORE (P1.c): the reading is a region above
  // the board, not a widget, and there is nothing left for the renderer to
  // draw under that name. Reading.dom.test.tsx holds the region itself.
  const KINDS: [string, Partial<BoardObject>][] = [
    ['figure', { subject: 'Rockwell' }],
    ['hero', { subject: 'Rockwell', weight: 'lead' }],
    ['subject', { subject: 'Rockwell' }],
    ['comparison', { subjects: ['Rockwell', 'OPUS'] }],
    ['table', {}],
    ['chart', { form: 'bar' }],
    ['distribution', {}],
    ['draft', {}],
    ['state', { label: 'waiting' }],
    ['timeline', {}],
    ['recommendation', { subject: 'Rockwell', action: 'order' }],
    ['control', { argument: 'date_range' }],
    ['system', { subject: 'Rockwell' }],
  ];

  it.each(KINDS)('draws a %s without crashing', (kind, extra) => {
    const { container } = draw([object(kind, extra)]);
    expect(container.firstChild).toBeTruthy();
  });

  it('draws a whole board of every kind at once', () => {
    // The stack overflow only appeared with several objects on screen; one at
    // a time would not have found it.
    const { container } = draw(KINDS.map(([kind, extra]) => object(kind, extra)));
    expect(container.querySelectorAll('.r-tile').length).toBeGreaterThan(5);
  });
});

describe('a control hands back the right intent', () => {
  it('asks to re-run the read it names, with the argument it changes', () => {
    // THE BUG THIS HOLDS. The handler read `.state` off a result whose field
    // is `status`, so it returned early every time and the chips did nothing.
    // Nothing about the tile was wrong — which is why only a click finds it.
    const on = ACTIONS();
    draw([object('control', { argument: 'date_range' })], on);

    const chip = screen.getByRole('button', { name: 'last month' });
    fireEvent.click(chip);

    expect(on.retune).toHaveBeenCalledWith('k-control', 'date_range', 'last_month');
  });

  it('offers the windows the definitions know, not free text', () => {
    draw([object('control', { argument: 'date_range' })]);
    for (const window of ['yesterday', 'last week', 'last month']) {
      expect(screen.getByRole('button', { name: window })).toBeTruthy();
    }
  });
});

describe('a recommendation shows the verb and the read’s figure', () => {
  it('never invents a number of its own', () => {
    draw([object('recommendation', { subject: 'Rockwell', action: 'order' })]);
    // The verb is George's, from the closed list. Since P1.e it LEADS the
    // block as its title, because it is the one word the read has not got.
    expect(screen.getByText('Order Rockwell')).toBeTruthy();
    // The figure is the read's, rendered by the system.
    expect(screen.getByText(/203,717/)).toBeTruthy();
  });
});


describe('a shape George composed', () => {
  // The grammar's whole promise: a shape nobody listed in advance, drawing
  // only values the renderer resolved from rows.
  const SPEC = {
    layout: 'panel' as const,
    heading: { seq: 0, field: 'store' },
    children: [
      { layout: 'row' as const, children: [
        { mark: 'value' as const, seq: 0, field: 'value', weight: 'lead' as const },
        { mark: 'delta' as const, seq: 0, field: 'change_pct' },
      ] },
      { layout: 'grid' as const, cols: 2, children: [
        { mark: 'bar' as const, seq: 0, field: 'value', by: 'store', colour: 'direction' },
        { mark: 'point' as const, seq: 0, field: 'value', by: 'store' },
        { mark: 'cell' as const, seq: 0, field: 'value', by: 'store', colour: 'store' },
        { mark: 'rows' as const, seq: 0 },
      ] },
    ],
  };

  it('draws a tree of layouts and marks nobody enumerated', () => {
    const { container } = draw([object('spec', { spec: SPEC, seqs: [0] })]);
    expect(container.querySelector('.r-spec-panel')).toBeTruthy();
    expect(container.querySelectorAll('.r-spec-bar').length).toBe(2);
    expect(container.querySelectorAll('.r-spec-cell').length).toBe(2);
  });

  it('resolves every value from the rows, never from the spec', () => {
    draw([object('spec', { spec: SPEC, seqs: [0] })]);
    // The heading is a column's VALUE and the figure is a row's; neither
    // appears anywhere in the spec itself. His WORDS are not in it either,
    // and since P1.c there is no mark that could draw them — the reading is
    // a region above the board, drawn from the turn.
    expect(screen.getAllByText(/Rockwell/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/203,717/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Both shops are up/)).toBeNull();
    expect(JSON.stringify(SPEC)).not.toMatch(/203,?717|Both shops|prose/);
  });
});


describe('a composed shape draws the row it names', () => {
  it('scopes a panel and everything inside it to its subject', () => {
    // THE BUG THIS HOLDS. Without a subject a panel-per-shop drew the FIRST
    // row on every panel — seven panels, identical figures, each headed with
    // the same shop. Plausible and wrong is worse than not drawing.
    const panel = (subject: string) => ({
      layout: 'panel' as const, subject,
      heading: { seq: 0, field: 'store' },
      children: [{ mark: 'value' as const, seq: 0, field: 'value' }],
    });
    const { container } = draw([
      object('spec', { key: 'a', spec: panel('Rockwell'), seqs: [0] }),
      object('spec', { key: 'b', spec: panel('OPUS'), seqs: [0] }),
    ]);
    const text = container.textContent ?? '';
    expect(text).toMatch(/203,717/);
    expect(text).toMatch(/555,147/);
    // And each heading is its own shop, not the first row's twice.
    expect(text).toMatch(/Rockwell/);
    expect(text).toMatch(/OPUS/);
  });
});


describe('nothing on a figure arranges it by hand (P2S.1)', () => {
  // The owner, 2026-09-17, of drag, resize, keep and set aside on a figure:
  // "remove". The figures flow; a hand-placed figure breaks the flow he asked
  // for, and keeping is said, or done from the thread's Page view.
  it('draws no move, bigger, smaller, keep or set-aside control', () => {
    draw([object('table', { key: 'a' }), object('figure', { key: 'b', subject: 'Rockwell' })]);
    for (const name of [/move it/i, /bigger/i, /smaller/i, /^keep$/i, /set aside/i, /undo/i]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(document.querySelector('.r-acts, .r-grip')).toBeNull();
  });

  it('keeps George\'s order, and opening a figure does not move it', async () => {
    const { inOrder } = await import('./board');
    const board = [
      object('subject', { key: 'a', weight: 'lead', subject: 'Rockwell' }),
      object('table', { key: 'b' }),
    ];
    expect(inOrder(board, {}, null).map((o) => o.key)).toEqual(['a', 'b']);
    // Opening a figure no longer moves it (the log, 2026-09-17: "we dont need
    // the feature where when you click the chart it rearranges").
    expect(inOrder(board, {}, 'b').map((o) => o.key)).toEqual(['a', 'b']);
  });
});

describe('the figures flow into columns, left to right then down (P2S.1(c))', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => object('table', { key: `f${i}` }));
  const columnsOf = () => Array.from(document.querySelectorAll('[data-figure]'))
    .map((el) => Number(el.getAttribute('data-col')));

  it.each([
    [1, 1, [0]],
    [2, 2, [0, 1]],
    [3, 2, [0, 1, 0]],
    [4, 2, [0, 1, 0, 1]],
    [5, 3, [0, 1, 2, 0, 1]],
  ])('puts %i figures in %i columns, in that order', (n, cols, want) => {
    const { container } = draw(many(n as number));
    expect(container.querySelector('.r-flow')?.getAttribute('data-columns')).toBe(String(cols));
    expect(columnsOf()).toEqual(want);
  });

  it('labels every figure with the read it came from, as the superscripts do', () => {
    const { container } = draw([object('table', { key: 'a' })]);
    expect(container.querySelector('.r-fig-lbl')?.textContent).toBe('read 1');
  });

  it('arrives in order — the first at 200ms, the next 260ms after', async () => {
    vi.useFakeTimers();
    try {
      const { container } = draw(many(3));
      const state = () => Array.from(container.querySelectorAll('[data-figure]'))
        .map((el) => el.getAttribute('data-arrived'));
      expect(state()).toEqual(['no', 'no', 'no']);
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(state()).toEqual(['yes', 'no', 'no']);
      await act(async () => { vi.advanceTimersByTime(260); });
      expect(state()).toEqual(['yes', 'yes', 'no']);
      await act(async () => { vi.advanceTimersByTime(260); });
      expect(state()).toEqual(['yes', 'yes', 'yes']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts a receipt with its read time under every figure', () => {
    const { container } = draw(many(2));
    const receipts = container.querySelectorAll('[data-figure] .r-src');
    expect(receipts).toHaveLength(2);
    for (const r of Array.from(receipts)) expect(r.textContent).toMatch(/read (\w{3} \d+ )?\d\d:\d\d/);
  });
});

describe('the picture points, so the sentence does not have to', () => {
  it('lights the row George named and cools the rest', () => {
    const { container } = draw([object('table', { emphasise: 'OPUS' })]);
    const rows = [...container.querySelectorAll('tbody tr')] as HTMLElement[];
    const lit = rows.filter((r) => r.style.opacity === '1');
    // 0.5 until 2026-09-15 — "all stores still matter not full focus on one".
    const cooled = rows.filter((r) => r.style.opacity === '0.75');
    expect(lit).toHaveLength(1);
    expect(cooled).toHaveLength(1);
    expect(lit[0].textContent).toMatch(/OPUS/);
  });

  it('leaves every row lit when he pointed at nothing', () => {
    // A chart with no point to make must not look like one where everything
    // failed to matter.
    const { container } = draw([object('table', {})]);
    const rows = [...container.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows.every((r) => r.style.opacity === '1')).toBe(true);
  });

  it('draws his few words about what is shown', () => {
    draw([object('table', { note: 'carries the whole week' })]);
    expect(screen.getByText('carries the whole week')).toBeTruthy();
  });
});


describe('a bar chart names its bars', () => {
  // THE BUG THIS HOLDS. The bar form drew seven unlabelled rectangles in one
  // colour over "OPUS → Rockwell": a ranking with nothing to say which bar
  // was which shop or what any of them measured. A bar is a row — its name,
  // its length, its figure. Since P1.e the bar form IS the `ranked` mark and
  // the rows are `.r-mk-row`; what is asserted is unchanged.
  it('draws every row as a named bar with its figure', () => {
    const { container } = draw([object('chart', { form: 'bar' })]);
    const bars = [...container.querySelectorAll('.r-mk-ranked .r-mk-row')];
    expect(bars).toHaveLength(2);
    expect(bars[0].textContent).toContain('Rockwell');
    expect(bars[0].textContent).toContain('203,717');
    expect(bars[1].textContent).toContain('OPUS');
    expect(container.textContent).not.toContain('→');
  });

  // THE OPPOSITE OF WHAT THIS ASSERTED UNTIL P1.e, and deliberately. It used
  // to require a hue per shop; the owner then reported that he did not know
  // what he was looking at, and "seven shops, seven hues" is the second of the
  // five failures in that report — colour spent on identity a row label
  // already gives, over rows that all measure one thing. Inside a mark colour
  // is DIRECTION now. Identity keeps its hue on the tile's own edge and wash,
  // which is where it still does work.
  it('paints by direction, not by which shop it is', () => {
    const { container } = draw([object('chart', { form: 'bar' })]);
    const fills = [...container.querySelectorAll('.r-mk-bar i')].map(
      (i) => (i as HTMLElement).style.background);
    // Both shops are up, so both bars are the up colour and no shop hue is
    // anywhere inside the drawing.
    expect(fills[0]).toBe('rgb(var(--up))');
    expect(fills[1]).toBe('rgb(var(--up))');
  });

  it('cools the rows George did not point at', () => {
    const { container } = draw([object('chart', { form: 'bar', emphasise: 'OPUS' })]);
    const rows = [...container.querySelectorAll('.r-mk-ranked .r-mk-row')] as HTMLElement[];
    expect(rows.map((r) => r.getAttribute('data-lit'))).toEqual(['no', 'yes']);
    expect(rows[0].style.opacity).toBe('0.75');
    expect(rows[1].style.opacity).toBe('1');
  });

  it('still draws the way a cooled row moved, because a tool measured it', () => {
    // The report this rule came from, held as a drawing: the row he did NOT
    // point at is quieter and still wears its own direction. Both shops in the
    // fixture rose, so both bars are the up colour whichever one is emphasised
    // — the failure it catches is the cooled bar going flat.
    const { container } = draw([object('chart', { form: 'bar', emphasise: 'OPUS' })]);
    const fills = [...container.querySelectorAll('.r-mk-ranked .r-mk-bar i')]
      .map((i) => (i as HTMLElement).style.background);
    expect(fills[0]).toBe('rgb(var(--up))');
    expect(fills[1]).toBe('rgb(var(--up))');
  });
});


describe('what arrived since you last looked comes to the centre', () => {
  it('lands the objects touched from the first unseen answer on', () => {
    const objects = [
      object('table', { key: 'old', touched: 0 }),
      object('table', { key: 'new', touched: 1 }),
    ];
    const { container } = render(
      <Board answers={[TURN, TURN]} board={objects} local={{}} focused={null}
             selection={[]} live={false} retuned={{}} on={ACTIONS()} seenUpTo={1} />,
    );
    const landing = [...container.querySelectorAll('[data-figure]')]
      .filter((el) => el.querySelector('.r-landing'))
      .map((el) => (el as HTMLElement).dataset.figure);
    expect(landing).toEqual(['new']);
  });

  it('lands nothing when everything has been seen', () => {
    const { container } = render(
      <Board answers={[TURN]} board={[object('table', { touched: 0 })]} local={{}} focused={null}
             selection={[]} live={false} retuned={{}} on={ACTIONS()} seenUpTo={1} />,
    );
    expect(container.querySelector('.r-landing')).toBeNull();
  });
});


describe('a comparison is drawn as an instrument, not only a pill', () => {
  const COMPARED_TURN = {
    ...TURN,
    toolCalls: [{
      seq: 0, tool: 'get_sales', arguments: { compare_to: 'previous_period' },
      result: { rows: [
        { store: 'Rockwell', value: 203717, baseline: 179000, change_pct: 13.8, direction: 'up' },
        { store: 'OPUS', value: 555147, baseline: 425000, change_pct: 30.6, direction: 'up' },
      ], meta: { source_table: 'new_transactions', metric_label: 'Net sales', snapshot_timestamp: '2026-09-11T08:00:00Z' } },
    }],
  } as unknown as AnswerTurn;
  const drawWith = (o: BoardObject) => render(
    <Board answers={[COMPARED_TURN]} board={[o]} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={ACTIONS()} />,
  );

  // SINCE P1.e THE INSTRUMENT IS THE DUMBBELL. It was a bullet — a fill on a
  // track — under a sentence saying what the track and the fill were, and an
  // encoding that needs a sentence to decode is the third of the owner's five
  // failures. Two dots and a line say it without the sentence. What is
  // asserted is the same: both figures are the tool's, on the same row.
  it('puts a subject\'s value against its own baseline under the figure', () => {
    const { container } = drawWith(object('subject', { subject: 'Rockwell' }));
    expect(container.querySelector('.r-mk-dot--was')).toBeTruthy();
    expect(container.querySelector('.r-mk-band')).toBeNull();
    expect(container.querySelector('.r-mk-fig small')?.textContent).toContain('179,000');
    expect(container.textContent).not.toContain('the mark is the period before');
  });

  it('draws the noise floor when the row carries the definition it was judged by', () => {
    const turn = { ...COMPARED_TURN, toolCalls: [{ ...COMPARED_TURN.toolCalls[0], result: {
      ...COMPARED_TURN.toolCalls[0].result, rows: [{
        subject: 'North Edsa', store: 'North Edsa', value: 28073.5, baseline: 13068.97, change_pct: 114.8, direction: 'up',
        threshold_applied: { pct_threshold: 30, absolute_floor: 5473.26 },
      }] } }] } as unknown as AnswerTurn;
    const { container } = render(
      <Board answers={[turn]} board={[object('hero', { subject: 'North Edsa', weight: 'lead' })]} local={{}}
             focused={null} selection={[]} live={false} retuned={{}} on={ACTIONS()} />,
    );
    expect(container.querySelector('.r-mk-band')).toBeTruthy();
    // The band is still only ever the tool's own floor: both of its numbers
    // are on the row, and nothing draws one where the row carries none.
    expect(container.querySelector('.r-mk-track')?.getAttribute('aria-label'))
      .toContain('13,069');
  });

  it('draws a bar chart of compared rows as dumbbells — a dot where it was, a dot where it is', () => {
    const { container } = drawWith(object('chart', { form: 'bar' }));
    expect(container.querySelectorAll('.r-mk-dumbbells .r-mk-row')).toHaveLength(2);
    expect(container.textContent).toContain('425,000');
    // No caption decoding the encoding — that was the thing being fixed.
    expect(container.querySelector('.r-spec-how')).toBeNull();
  });

  it('says what and when at the foot, never which table', () => {
    const { container } = drawWith(object('table'));
    const src = container.querySelector('.r-src') as HTMLElement;
    expect(src.textContent).toContain('Net sales');
    expect(src.textContent).not.toContain('new_transactions');
    expect(src.title).toContain('new_transactions');
  });
});


describe('the board maintains, not accumulates', () => {
  // THE BUG THIS HOLDS. 168 puts to 3 changes: asked the same thing again,
  // George put a twin beside the object he had, under a fresh key, and the
  // board held the same read drawn five ways. An object is identified by
  // the read it draws; a later put of that read replaces it where it stands.
  const read = { seq: 0, tool: 'get_sales', arguments: { group_by: ['store'], date_range: 'last_week' },
                 result: { rows: ROWS, meta: { source_table: 'new_transactions', snapshot_timestamp: '2026-09-11T08:00:00Z' } } };
  const turnWith = (blocks: unknown[]) => ({
    ...TURN, toolCalls: [read], composition: { blocks },
  }) as unknown as AnswerTurn;

  it('replaces the object that draws the same read, where it stands, under its old key', async () => {
    const { buildBoard } = await import('./board');
    const t1 = turnWith([{ op: 'put', key: 'shops', kind: 'table', seq: 0, weight: 'supporting' },
                         { op: 'put', key: 'reading', kind: 'text', weight: 'quiet' }]);
    const t2 = turnWith([{ op: 'put', key: 'shops-again', kind: 'comparison', seq: 0, subjects: ['Rockwell', 'OPUS'], weight: 'lead' }]);
    const t3 = turnWith([{ op: 'put', key: 'wtd-table', kind: 'table', seq: 0, weight: 'supporting' }]);
    const board = buildBoard([t1, t2, t3]);
    const shops = board.filter((o) => o.seq === 0);
    expect(shops).toHaveLength(1);
    expect(shops[0].key).toBe('shops');
    expect(shops[0].kind).toBe('table');
    expect(shops[0].turn).toBe(2);
  });

  it('lands a later edit made under the twin\'s key on the old object', async () => {
    const { buildBoard } = await import('./board');
    const t1 = turnWith([{ op: 'put', key: 'shops', kind: 'table', seq: 0 }]);
    const t2 = turnWith([{ op: 'put', key: 'shops-again', kind: 'table', seq: 0 }]);
    const t3 = turnWith([{ op: 'quiet', key: 'shops-again' }]);
    const board = buildBoard([t1, t2, t3]);
    expect(board).toHaveLength(1);
    expect(board[0].key).toBe('shops');
    expect(board[0].weight).toBe('quiet');
  });

  it('keeps two subjects of one read as two objects', async () => {
    const { buildBoard } = await import('./board');
    const t1 = turnWith([{ op: 'put', key: 'rockwell', kind: 'subject', seq: 0, subject: 'Rockwell' },
                         { op: 'put', key: 'opus', kind: 'subject', seq: 0, subject: 'OPUS' }]);
    expect(buildBoard([t1])).toHaveLength(2);
  });

  it('lets a quiet object nobody touched for six turns leave — unless it was kept', async () => {
    const { buildBoard, EXPIRE_AFTER_TURNS } = await import('./board');
    const first = turnWith([{ op: 'put', key: 'old', kind: 'table', seq: 0, weight: 'quiet' }]);
    const later = Array.from({ length: EXPIRE_AFTER_TURNS }, (_, n) =>
      turnWith([{ op: 'put', key: `t${n}`, kind: 'state', label: 'waiting', weight: 'supporting' }]));
    expect(buildBoard([first, ...later]).some((o) => o.key === 'old')).toBe(false);
    expect(buildBoard([first, ...later.slice(0, -1)]).some((o) => o.key === 'old')).toBe(true);
    expect(buildBoard([first, ...later], new Set(['old'])).some((o) => o.key === 'old')).toBe(true);
  });

  it('sends the read behind each object with the board, so the server can apply the same rule', async () => {
    const { buildBoard, boardContext } = await import('./board');
    const t1 = turnWith([{ op: 'put', key: 'shops', kind: 'table', seq: 0 }]);
    const ctx = boardContext([t1], buildBoard([t1]), {}, null);
    expect(ctx[0].read?.tool).toBe('get_sales');
    expect(ctx[0].read?.arguments).toEqual({ group_by: ['store'], date_range: 'last_week' });
  });
});

/**
 * THE TWO DISPLAY DEFECTS, AS THE OWNER SAW THEM (P1.c, 2026-09-14). Both
 * came out of `fmt` in data.ts; these hold them where a person met them,
 * which is a tile.
 */
describe('a tile draws what the rows actually say', () => {
  const ATTENTION = Array.from({ length: 4 }, (_, n) => ({
    section: 'sales_vs_same_weekday',
    subject: `Shop ${n}`,
    value: 1187 + n,
    unit: 'transactions',
    silent: false,
    // Both of these are objects on every brief row, and both reached the
    // caption: one as "[object Object]", the empty list as nothing at all.
    receipts: { source_table: 'new_transactions' },
    filters_applied: [],
  }));

  const COUNTED = {
    ...TURN,
    toolCalls: [{
      seq: 0, tool: 'get_attention', arguments: {},
      result: { rows: ATTENTION, meta: { source_table: 'new_transactions',
                                         metric_label: 'Transactions',
                                         snapshot_timestamp: '2026-09-14T08:00:00Z',
                                         filters_applied: [] } },
    }],
  } as unknown as AnswerTurn;

  function drawCounted() {
    return render(
      <Board answers={[COUNTED]} board={[{ key: 'k', kind: 'table', weight: 'supporting',
                                           seq: 0, tool: 'get_attention', turn: 0, touched: 0 } as BoardObject]}
             local={{}} focused={null} selection={[]} live={false} retuned={{}} on={ACTIONS()} />,
    );
  }

  it('never writes "object Object", and never leaves the field beside it empty', () => {
    const { container } = drawCounted();
    const caption = container.querySelector('.r-label')?.textContent ?? '';
    expect(caption).not.toContain('object Object');
    expect(caption).not.toMatch(/ · · /);
  });

  it('draws a count as a count — the unit says transactions, so no peso sign', () => {
    const { container } = drawCounted();
    const text = container.textContent ?? '';
    expect(text).toContain('1,187');
    expect(text).not.toContain('₱1,187');
  });
});

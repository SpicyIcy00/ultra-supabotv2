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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), aside: vi.fn(), patch: vi.fn(),
  retune: vi.fn(), shift: vi.fn(), move: vi.fn(), resize: vi.fn(), keep: vi.fn(),
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
  const KINDS: [string, Partial<BoardObject>][] = [
    ['text', {}],
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

  // THE BUG THIS HOLDS. Arranging was drawn by the tile, and only two of the
  // fourteen kinds drew it — so on a real board of ten objects, nine could
  // not be moved, kept, resized or set aside, and nothing failed to say so.
  it.each(KINDS)('lets you arrange a %s, whatever shape it is', (kind, extra) => {
    const { container } = draw([object(kind, extra)]);
    expect(container.querySelector('.r-grip')).toBeTruthy();
    expect(container.querySelectorAll('[aria-label="Keep"]').length).toBe(1);
    expect(container.querySelectorAll('[aria-label="Bigger"]').length).toBe(1);
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
    // The verb is George's, from the closed list.
    expect(screen.getByText('Order')).toBeTruthy();
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
      { mark: 'prose' as const },
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
    // The heading is a column's VALUE, the figure is a row's, the prose is
    // the turn's. None of the three appears anywhere in the spec itself.
    expect(screen.getAllByText(/Rockwell/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/203,717/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Both shops are up/)).toBeTruthy();
    expect(JSON.stringify(SPEC)).not.toMatch(/203,?717|Both shops/);
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


describe('the board is yours to arrange', () => {
  // George arranges it because he knows what matters. You rearrange it
  // because you know what you want to look at. Both are legitimate, and
  // yours wins on your screen — which is what makes it a workspace rather
  // than a report he sends you.
  it('offers move, resize and keep on an object', () => {
    const on = ACTIONS();
    draw([object('subject', { subject: 'Rockwell' })], on);

    // MOVING IS A DRAG, AND THE KEYBOARD IS THE OTHER WAY IN. The grip is
    // where a finger picks a tile up; the arrow keys on it do one step, so a
    // board can still be arranged by somebody with no pointer.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move it' }), { key: 'ArrowLeft' });
    expect(on.shift).toHaveBeenCalledWith('k-subject', -1);

    fireEvent.click(screen.getByRole('button', { name: 'Bigger' }));
    expect(on.resize).toHaveBeenCalledWith('k-subject', 'big');

    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(on.keep).toHaveBeenCalledWith('k-subject', true);
  });

  it('lets you turn a size back off rather than only on', () => {
    const on = ACTIONS();
    render(
      <Board answers={[TURN]} board={[object('subject', { subject: 'Rockwell' })]}
             local={{ 'k-subject': { size: 'big' } }} focused={null}
             selection={[]} live={false} retuned={{}} on={on} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bigger' }));
    expect(on.resize).toHaveBeenCalledWith('k-subject', null);
  });
});

describe('your arrangement beats his', () => {
  it('puts a resized object where you put it, not where he did', async () => {
    const { inOrder } = await import('./board');
    const board = [
      object('subject', { key: 'a', weight: 'lead', subject: 'Rockwell' }),
      object('table', { key: 'b', weight: 'quiet' }),
    ];
    // He led with 'a'. You made 'b' big, so 'b' leads for you.
    const ordered = inOrder(board, { b: { size: 'big' } }, null);
    expect(ordered[0].key).toBe('b');
    // And his weight survives underneath: clear your size and his order returns.
    expect(inOrder(board, {}, null)[0].key).toBe('a');
  });

  it('carries a tile to where the pointer left it, and renumbers the rest', async () => {
    const { dropped } = await import('./board');
    const order = [
      object('table', { key: 'a' }), object('table', { key: 'b' }),
      object('table', { key: 'c' }),
    ];
    // Carried over 'a' and released above its middle: it goes first.
    expect(dropped(order, 'c', 'a', false)).toEqual({ c: 0, a: 1, b: 2 });
    // Below its middle: straight after it.
    expect(dropped(order, 'c', 'a', true)).toEqual({ a: 0, c: 1, b: 2 });
    // Landing where it already was is not a move — it must not reach the
    // undo stack, or one drag across the board fills the stack with the
    // arrangement the board was already in.
    expect(dropped(order, 'a', 'b', false)).toBeNull();
    expect(dropped(order, 'a', 'a', true)).toBeNull();
  });

  it('lets you drag his lead out of the lead row without it springing back', async () => {
    const { inOrder } = await import('./board');
    const board = [
      object('subject', { key: 'a', weight: 'lead', subject: 'Rockwell' }),
      object('table', { key: 'b' }),
    ];
    // Dropped in the body of the board, below 'b'. `normal` is what records
    // that; with only `big` and `small` there was nothing to write, and his
    // weight pulled it straight back to the top.
    const order = inOrder(board, { a: { at: 1, size: 'normal' }, b: { at: 0 } }, null);
    expect(order.map((o) => o.key)).toEqual(['b', 'a']);
    expect(order[1].weight).toBe('supporting');
  });

  it('honours a position you set', async () => {
    const { inOrder } = await import('./board');
    const board = [object('table', { key: 'a' }), object('table', { key: 'b' })];
    expect(inOrder(board, { b: { at: 0 }, a: { at: 1 } }, null).map((o) => o.key))
      .toEqual(['b', 'a']);
  });
});


describe('the picture points, so the sentence does not have to', () => {
  it('lights the row George named and cools the rest', () => {
    const { container } = draw([object('table', { emphasise: 'OPUS' })]);
    const rows = [...container.querySelectorAll('tbody tr')] as HTMLElement[];
    const lit = rows.filter((r) => r.style.opacity === '1');
    const cooled = rows.filter((r) => r.style.opacity === '0.4');
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
  // its length, its figure.
  it('draws every row as a named bar with its figure', () => {
    const { container } = draw([object('chart', { form: 'bar' })]);
    const bars = [...container.querySelectorAll('.r-spec-bar')];
    expect(bars).toHaveLength(2);
    expect(bars[0].textContent).toContain('Rockwell');
    expect(bars[0].textContent).toContain('203,717');
    expect(bars[1].textContent).toContain('OPUS');
    expect(container.textContent).not.toContain('→');
  });

  it('paints each shop in its own colour', () => {
    const { container } = draw([object('chart', { form: 'bar' })]);
    const fills = [...container.querySelectorAll('.r-spec-bar-track i')].map((i) => (i as HTMLElement).style.background);
    expect(fills[0]).not.toBe(fills[1]);
  });

  it('cools the rows George did not point at', () => {
    const { container } = draw([object('chart', { form: 'bar', emphasise: 'OPUS' })]);
    const fills = [...container.querySelectorAll('.r-spec-bar-track i')] as HTMLElement[];
    expect(fills[0].style.opacity).toBe('0.28');
    expect(fills[1].style.opacity).toBe('1');
  });
});

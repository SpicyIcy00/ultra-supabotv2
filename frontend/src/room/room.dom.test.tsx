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

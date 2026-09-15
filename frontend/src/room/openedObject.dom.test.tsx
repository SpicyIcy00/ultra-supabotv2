// @vitest-environment jsdom
/**
 * WHAT OPENS WHEN YOU CLICK A BLOCK — and what must not.
 *
 * HIS REPORT, 2026-09-15: *"why when click on a chart made for 'analyze
 * tradsanx per store' it opens greenhills for some reason"*. The chart drew
 * seven shops. Greenhills was the first row.
 *
 * THE CAUSE. A block's subject was read as `o.subject ?? subjectOf(rows[0])`,
 * so a block George composed over a SET — which declares no subject, because
 * it is not about one thing — borrowed whichever row the read happened to sort
 * first. Focusing the tile then opened that shop. The subject was chosen by
 * nobody: not by him, not by George, not by the read. By the ORDER BY.
 *
 * That is the "a label the model inferred" this whole surface refuses
 * (`surface.desk` Selection: "subject ids and labels the rows carried, never a
 * label the model inferred"), arriving through a `??` in a renderer.
 *
 * THE RULE THIS FILE HOLDS. One row IS its own subject and still opens. Many
 * rows open nothing — a row is opened by tapping the ROW, which `pick`, `why`
 * and an `open` offer all already do, each carrying that row's own name.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { Board } from './render';

// The panel renders the name it was asked for, so the test can see WHICH
// object was opened rather than only that one was.
vi.mock('./ObjectPanel', () => ({
  ObjectPanel: ({ name }: { name: string }) => <div data-testid="opened">{name}</div>,
  kindOf: (dimension: string | null) => (dimension === 'store' ? 'shop' : null),
}));

afterEach(cleanup);

const on: TileActions = {
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), aside: vi.fn(), patch: vi.fn(),
  retune: vi.fn(), shift: vi.fn(), move: vi.fn(), resize: vi.fn(), keep: vi.fn(),
};

const META = {
  source_table: 'new_transactions',
  snapshot_timestamp: '2026-09-15T15:41:00Z',
  filters_applied: [],
  metric_label: 'Product revenue',
  metric_unit: 'PHP',
  window: { name: 'last_week' },
};

/** The shops of his screenshot, in the order the read returned them. */
const SEVEN = [
  { store: 'Greenhills', value: 154140, baseline: 158995 },
  { store: 'Rockwell', value: 137540, baseline: 123807 },
  { store: 'OPUS', value: 136375, baseline: 188489 },
  { store: 'Shangri-La', value: 100787, baseline: 92525 },
  { store: 'Magnolia', value: 74589, baseline: 86374 },
  { store: 'North Edsa', value: 54598, baseline: 61025 },
  { store: 'Fairview', value: 33805, baseline: 34964 },
];

function draw(o: Partial<BoardObject>, rows: Record<string, unknown>[]) {
  const turn = {
    role: 'george', text: 'Tradsnax fell hardest at OPUS.', thinking: '',
    at: '2026-09-15T15:41:00Z',
    toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows, meta: META } }],
  } as unknown as AnswerTurn;
  const object = {
    key: 'k', kind: 'dumbbell', weight: 'lead', seq: 1, tool: 'get_sales',
    turn: 0, touched: 0, ...o,
  } as BoardObject;
  return render(
    <Board answers={[turn]} board={[object]} local={{}} focused="k"
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

describe('the object a focused block opens', () => {
  it('opens nothing for a block about many rows', () => {
    // The report, exactly: seven shops, no declared subject, and the first row
    // is Greenhills. Nothing may open.
    draw({}, SEVEN);
    expect(screen.queryByTestId('opened')).toBeNull();
  });

  it('never opens the first row just because it sorted first', () => {
    draw({}, SEVEN);
    expect(screen.queryByText('Greenhills', { selector: '[data-testid="opened"]' }))
      .toBeNull();
    // And re-ordering the same rows cannot change what opens, because nothing
    // opens either way. A subject that moves with the sort is not a subject.
    cleanup();
    draw({}, [...SEVEN].reverse());
    expect(screen.queryByTestId('opened')).toBeNull();
  });

  it('opens the one row a single-row block is about', () => {
    // Unambiguous: the block has one row, and that row IS what it is about.
    draw({}, [SEVEN[2]]);
    expect(screen.getByTestId('opened').textContent).toBe('OPUS');
  });

  it('opens the subject George declared, whatever the rows are sorted like', () => {
    draw({ subject: 'OPUS' }, SEVEN);
    expect(screen.getByTestId('opened').textContent).toBe('OPUS');
  });

  it('opens nothing at all until the block is focused', () => {
    const turn = {
      role: 'george', text: 'A reading.', thinking: '', at: '2026-09-15T15:41:00Z',
      toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {},
                    result: { rows: [SEVEN[0]], meta: META } }],
    } as unknown as AnswerTurn;
    render(
      <Board answers={[turn]} board={[{
        key: 'k', kind: 'dumbbell', weight: 'lead', seq: 1, tool: 'get_sales',
        turn: 0, touched: 0,
      } as BoardObject]} local={{}} focused={null}
             selection={[]} live={false} retuned={{}} on={on} />,
    );
    expect(screen.queryByTestId('opened')).toBeNull();
  });
});

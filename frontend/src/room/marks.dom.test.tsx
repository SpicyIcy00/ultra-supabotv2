// @vitest-environment jsdom
/**
 * THE SIX, DRAWN.
 *
 * Two halves, and the second is the card's Done-when.
 *
 * THE SIX THEMSELVES: each mark draws its own shape, carries a title, a
 * subtitle off `meta` and a source line, and states no number the rows did not
 * carry. The dumbbell's two ends are the tool's value and the tool's baseline;
 * the contributors' bars are changes the tool measured and never shares of a
 * total; the line's dotted series is the baseline the read returned and is
 * absent when it returned none.
 *
 * THE RECORDED RUNS: `__fixtures__/recorded-runs.json` is the board the gate
 * scenarios actually produced — rows and `meta` lifted whole out of the eval
 * reports, blocks rebuilt by `agent/default_composition` (see
 * ops/recorded_board.py for what that can and cannot recover). Every block in
 * it is rendered here for real and has to come out as one of the six with a
 * source line under it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { fmt, rowFor, subjectOf, unitOf, valueOf, type AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { MARKS } from './catalogue';
import { Board } from './render';
import recorded from './__fixtures__/recorded-runs.json';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const on: TileActions = {
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), aside: vi.fn(), patch: vi.fn(),
  retune: vi.fn(), shift: vi.fn(), move: vi.fn(), resize: vi.fn(), keep: vi.fn(),
};

const META = {
  source_table: 'new_transactions',
  snapshot_timestamp: '2026-09-11T08:00:00Z',
  filters_applied: [],
  metric_label: 'Net sales',
  metric_unit: 'PHP',
  window: { name: 'last_week' },
};

function draw(o: Partial<BoardObject>, rows: Record<string, unknown>[], meta: unknown = META) {
  const turn = {
    role: 'george', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
    toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows, meta } }],
  } as unknown as AnswerTurn;
  const object = {
    key: 'k', kind: 'table', weight: 'supporting', seq: 1, tool: 'get_sales',
    turn: 0, touched: 0, ...o,
  } as BoardObject;
  return render(
    <Board answers={[turn]} board={[object]} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

const markOf = (c: HTMLElement) => c.querySelector('[data-mark]')?.getAttribute('data-mark');

const COMPARED = [
  { store: 'OPUS', value: 555147, baseline: 425000, change: 130147, change_pct: 30.6, direction: 'up', unit: 'PHP' },
  { store: 'Rockwell', value: 203717, baseline: 179000, change: 24717, change_pct: 13.8, direction: 'up', unit: 'PHP' },
  { store: 'Magnolia', value: 121004, baseline: 133000, change: -11996, change_pct: -9.0, direction: 'down', unit: 'PHP' },
];
const DAYS = [
  { day: '2026-09-07', value: 21244 }, { day: '2026-09-08', value: 12258 },
  { day: '2026-09-09', value: 24020 }, { day: '2026-09-10', value: 34124 },
  { day: '2026-09-11', value: 60108 },
];

describe('every block is framed the same way round', () => {
  it('carries a title, a subtitle off meta and a source line', () => {
    const { container } = draw({ kind: 'comparison' }, COMPARED);
    expect(container.querySelector('.r-mk-title')?.textContent).toBe('Net sales');
    const sub = container.querySelector('.r-mk-sub')?.textContent ?? '';
    expect(sub).toContain('Net sales');
    expect(sub).toContain('last week');
    expect(sub).toContain('₱');
    expect(container.querySelector('.r-src')?.textContent).toContain('read');
  });

  it('puts George\'s note in the title when he characterised the shape', () => {
    const { container } = draw({ kind: 'comparison', note: 'the barn, not the shops' }, COMPARED);
    expect(container.querySelector('.r-mk-title')?.textContent).toContain('the barn, not the shops');
  });

  it('still names its source when the read carried almost no meta', () => {
    const { container } = draw({ kind: 'table' }, [{ store: 'OPUS', value: 1 }],
                               { source_table: 'new_transactions', filters_applied: [] });
    expect(container.querySelector('.r-src')?.textContent).toContain('new_transactions');
  });

  it('puts the read\'s own caveat above the figures it qualifies', () => {
    const { container } = draw({ kind: 'figure' }, [{ store: 'OPUS', value: 1 }],
      { ...META, notice: { kind: 'frozen_export', message: 'Purchase orders are a frozen export.' } });
    const caveat = container.querySelector('.r-caveat');
    const title = container.querySelector('.r-mk-title');
    expect(caveat?.textContent).toContain('frozen export');
    expect(caveat!.compareDocumentPosition(title!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('figure', () => {
  it('draws one number, in the unit the rows declared', () => {
    const { container } = draw({ kind: 'figure', subject: 'OPUS' }, COMPARED);
    expect(markOf(container)).toBe('figure');
    expect(container.querySelector('.r-mk-num')?.textContent).toBe('₱555,147');
  });

  it('draws a count as a count, not as money', () => {
    const { container } = draw({ kind: 'figure' },
      [{ value: 359, baseline: 366, change_pct: -1.9, direction: 'down', unit: 'transactions' }]);
    expect(container.querySelector('.r-mk-num')?.textContent).toBe('359');
  });

  it('shows the movement as a one-row dumbbell where the read carried a before', () => {
    const { container } = draw({ kind: 'figure', subject: 'OPUS' }, COMPARED);
    expect(container.querySelectorAll('.r-mk-dot--was')).toHaveLength(1);
    expect(container.querySelector('.r-mk-fig small')?.textContent).toBe('was ₱425,000');
  });
});

describe('dumbbell', () => {
  it('is what a comparison with a before becomes', () => {
    const { container } = draw({ kind: 'comparison' }, COMPARED);
    expect(markOf(container)).toBe('dumbbell');
    expect(container.querySelectorAll('.r-mk-dumbbells .r-mk-row')).toHaveLength(3);
  });

  it('puts both of the tool\'s own figures on each row and no third one', () => {
    const { container } = draw({ kind: 'comparison' }, COMPARED);
    const first = container.querySelectorAll('.r-mk-dumbbells .r-mk-row')[0];
    expect(first.querySelector('b')?.textContent).toBe('₱555,147');
    expect(first.querySelector('small')?.textContent).toBe('was ₱425,000');
  });

  it('labels the ends of the scale on the mark, with no legend anywhere', () => {
    const { container } = draw({ kind: 'comparison' }, COMPARED);
    expect(container.querySelector('.r-mk-scale')?.textContent).toContain('₱555,147');
    expect(container.textContent).not.toContain('the track is the period before');
  });

  it('draws the noise floor only where the row carried one', () => {
    expect(draw({ kind: 'comparison' }, COMPARED).container
      .querySelectorAll('.r-mk-band')).toHaveLength(0);
    cleanup();
    const withFloor = COMPARED.map((r) => ({
      ...r, threshold_applied: { pct_threshold: 10, absolute_floor: 5000 },
    }));
    expect(draw({ kind: 'comparison' }, withFloor).container
      .querySelectorAll('.r-mk-band')).toHaveLength(3);
  });
});

describe('ranked', () => {
  it('is what a set of values with nothing measured against them becomes', () => {
    const plain = COMPARED.map(({ store, value }) => ({ store, value }));
    const { container } = draw({ kind: 'chart', form: 'bar' }, plain);
    expect(markOf(container)).toBe('ranked');
    expect(container.querySelectorAll('.r-mk-ranked .r-mk-row')).toHaveLength(3);
  });

  it('names every bar and prints its figure — no unlabelled rectangles', () => {
    const plain = COMPARED.map(({ store, value }) => ({ store, value }));
    const { container } = draw({ kind: 'chart', form: 'bar' }, plain);
    const names = [...container.querySelectorAll('.r-mk-ranked .r-mk-name')].map((n) => n.textContent);
    expect(names).toEqual(['OPUS', 'Rockwell', 'Magnolia']);
    expect(container.querySelector('.r-mk-ranked b')?.textContent).toBe('₱555,147');
  });

  it('cools every row but the one George pointed at', () => {
    const plain = COMPARED.map(({ store, value }) => ({ store, value }));
    const { container } = draw({ kind: 'chart', form: 'bar', emphasise: 'Rockwell' }, plain);
    const lit = [...container.querySelectorAll('.r-mk-ranked .r-mk-row')]
      .map((r) => r.getAttribute('data-lit'));
    expect(lit).toEqual(['no', 'yes', 'no']);
  });
});

describe('contributors', () => {
  const DRIVERS = [
    { product: 'Aji Mix', change: -18400, direction: 'down', unit: 'PHP' },
    { product: 'Fuan Haw', change: -9100, direction: 'down', unit: 'PHP' },
    { product: 'G35 sampaloc', change: 4200, direction: 'up', unit: 'PHP' },
  ];

  it('is what a signed change with no before becomes', () => {
    const { container } = draw({ kind: 'comparison' }, DRIVERS);
    expect(markOf(container)).toBe('contributors');
  });

  it('prints the change the tool measured, never a share of the total', () => {
    const { container } = draw({ kind: 'comparison' }, DRIVERS);
    const figures = [...container.querySelectorAll('.r-mk-contributors b')].map((n) => n.textContent);
    expect(figures).toEqual(['-₱18,400', '-₱9,100', '₱4,200']);
    // A share would have to be a percentage of the sum of the three, and
    // nothing here computes one. 58% is that share; it must not appear.
    expect(container.textContent).not.toContain('58');
  });
});

describe('line', () => {
  it('is what an ordered series becomes', () => {
    const { container } = draw({ kind: 'chart', form: 'line' }, DAYS);
    expect(markOf(container)).toBe('line');
    expect(container.querySelector('svg polyline')).toBeTruthy();
  });

  it('dots the baseline only when the tool returned one', () => {
    expect(draw({ kind: 'chart', form: 'line' }, DAYS).container
      .querySelector('.r-mk-baseline')).toBeNull();
    cleanup();
    const withBase = DAYS.map((r) => ({ ...r, baseline: r.value * 0.9 }));
    const { container } = draw({ kind: 'chart', form: 'line' }, withBase);
    expect(container.querySelector('.r-mk-baseline')).toBeTruthy();
    expect(container.querySelector('.r-mk-ends')?.textContent).toContain('the period before');
  });

  it('names its two ends off the ordered column', () => {
    const { container } = draw({ kind: 'chart', form: 'line' }, DAYS);
    const ends = container.querySelector('.r-mk-ends')?.textContent ?? '';
    expect(ends).toContain('2026-09-07');
    expect(ends).toContain('2026-09-11');
  });
});

describe('table', () => {
  it('is what precision becomes, and every cell is a row\'s own value', () => {
    const { container } = draw({ kind: 'table' }, COMPARED);
    expect(markOf(container)).toBe('table');
    expect(container.querySelectorAll('.r-rows tbody tr')).toHaveLength(3);
  });
});

describe('every block in the recorded runs', () => {
  const runs = recorded.runs as {
    run: string; blocks: Record<string, unknown>[];
    calls: { seq: number; tool: string; result: { rows: Record<string, unknown>[]; meta: unknown } }[];
  }[];

  it('has runs to check, and enough of them', () => {
    expect(runs.length).toBeGreaterThanOrEqual(4);
    expect(runs.reduce((n, r) => n + r.blocks.length, 0)).toBeGreaterThanOrEqual(4);
  });

  for (const run of runs) {
    for (const block of run.blocks) {
      const kind = String(block.kind);
      const seq = Number(block.seq);
      it(`${run.run} · ${kind} (seq ${seq}) draws one of the six with a source line`, () => {
        const call = run.calls.find((c) => c.seq === seq)!;
        const turn = {
          role: 'george', text: '', thinking: '', at: '2026-09-11T08:00:00Z',
          toolCalls: run.calls.map((c) => ({
            seq: c.seq, tool: c.tool, arguments: {}, result: c.result,
          })),
        } as unknown as AnswerTurn;
        const object = {
          ...block, tool: call.tool, turn: 0, touched: 0,
        } as unknown as BoardObject;
        const { container } = render(
          <Board answers={[turn]} board={[object]} local={{}} focused={null}
                 selection={[]} live={false} retuned={{}} on={on} />,
        );
        const mark = container.querySelector('[data-mark]')?.getAttribute('data-mark');
        expect(MARKS, `${run.run}/${kind}`).toContain(mark as never);
        expect(container.querySelector('.r-mk-title')?.textContent ?? '').not.toBe('');
        expect(container.querySelector('.r-src')?.textContent ?? '').not.toBe('');
      });
    }
  }
});

/**
 * A FIGURE UNDER A CLAIM THAT IS NOT ABOUT IT — the dogfood log's worst item,
 * 2026-09-15, and the reason `rowUnderClaim` exists.
 *
 * The shape of the defect: a tile captioned "Greenhills turned down on a
 * smaller basket" drew ₱206,800, a green ▲+1.5%, and a dumbbell row labelled
 * Rockwell, because `Figure` chose `rowFor(...) ?? rows[0]`. Every figure on
 * that tile was real and had been read; none of them was about the shop the
 * sentence named.
 *
 * The test is over the RECORDED RUNS rather than a hand-made pair, because the
 * question the fallback hid is whether any read a real run produced can be
 * captioned with a subject it does not hold — and the answer has to be no for
 * all of them, not for one I thought of.
 */
describe('a claim over a read that does not hold its subject', () => {
  const runs = recorded.runs as {
    run: string;
    calls: { seq: number; tool: string; result: { rows: Record<string, unknown>[]; meta: unknown } }[];
  }[];

  /** One `figure` block, with its subject, over one recorded read. */
  function figureOver(
    call: { seq: number; tool: string; result: { rows: Record<string, unknown>[]; meta: unknown } },
    subject: string,
  ) {
    const turn = {
      role: 'george', text: '', thinking: '', at: '2026-09-11T08:00:00Z',
      toolCalls: [{ seq: call.seq, tool: call.tool, arguments: {}, result: call.result }],
    } as unknown as AnswerTurn;
    const object = {
      key: 'k', kind: 'figure', weight: 'lead', seq: call.seq, tool: call.tool,
      turn: 0, touched: 0, subject,
    } as unknown as BoardObject;
    return render(
      <Board answers={[turn]} board={[object]} local={{}} focused={null}
             selection={[]} live={false} retuned={{}} on={on} />,
    );
  }

  it('is exactly the screenshot, and it draws no number now', () => {
    const rows = [
      { store: 'Rockwell', value: 206800, baseline: 203700, change_pct: 1.5, direction: 'up', unit: 'PHP' },
      { store: 'Magnolia', value: 121004, baseline: 133000, change_pct: -9.0, direction: 'down', unit: 'PHP' },
    ];
    const { container } = draw({ kind: 'figure', weight: 'lead', subject: 'Greenhills' }, rows);
    expect(container.querySelector('.r-mk-num')).toBeNull();
    expect(container.textContent).not.toContain('206,800');
    expect(container.textContent).not.toContain('Rockwell');
    expect(container.querySelector('.r-mk-absent')?.getAttribute('data-absent')).toBe('Greenhills');
  });

  it('still draws the shop the read DOES hold, and its own row', () => {
    const rows = [
      { store: 'Rockwell', value: 206800, change_pct: 1.5, direction: 'up', unit: 'PHP' },
      { store: 'Greenhills', value: 278266, change_pct: -3.2, direction: 'down', unit: 'PHP' },
    ];
    const { container } = draw({ kind: 'figure', weight: 'lead', subject: 'Greenhills' }, rows);
    expect(container.querySelector('.r-mk-num')?.textContent).toBe('₱278,266');
    expect(container.querySelector('.r-mk-absent')).toBeNull();
  });

  it('has reads to check, from the recorded runs, and enough of them', () => {
    const withRows = runs.flatMap((r) => r.calls.filter((c) => (c.result.rows ?? []).length));
    expect(withRows.length).toBeGreaterThanOrEqual(8);
  });

  for (const run of runs) {
    for (const call of run.calls) {
      const rows = call.result.rows ?? [];
      if (!rows.length) continue;
      const names = [...new Set(rows.map((r) => subjectOf(r)).filter(Boolean))] as string[];

      it(`${run.run} · ${call.tool} (seq ${call.seq}) draws nothing for a subject it does not hold`, () => {
        const { container } = figureOver(call, 'Seikyo Trading Annex');
        if (names.length) {
          // The rows name subjects of their own, and none of them is this one.
          expect(container.querySelector('.r-mk-num')).toBeNull();
          expect(container.querySelector('.r-mk-absent')?.getAttribute('data-absent'))
            .toBe('Seikyo Trading Annex');
        } else {
          // The rows name nothing, so they contradict nothing; a single-row read
          // is the subject's own read, scoped by its filters. More than one and
          // there is no row to choose.
          expect(Boolean(container.querySelector('.r-mk-num')))
            .toBe(rows.length === 1);
        }
      });

      if (names.length > 1) {
        it(`${run.run} · ${call.tool} (seq ${call.seq}) draws each named subject's own row`, () => {
          for (const name of names.slice(0, 4)) {
            cleanup();
            const { container } = figureOver(call, name);
            const own = rowFor(rows, name)!;
            const v = valueOf(own);
            expect(container.querySelector('.r-mk-absent'), name).toBeNull();
            if (v) {
              expect(container.querySelector('.r-mk-num')?.textContent, name)
                .toBe(fmt(v.key, v.value, unitOf(own) ?? unitOf(call.result.meta as never)));
            }
          }
        });
      }
    }
  }
});

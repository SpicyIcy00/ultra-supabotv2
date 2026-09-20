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
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(),
  retune: vi.fn(),
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
    role: 'bob', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
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
  it('carries its say line and a source line, and no subtitle (P2S.1(c))', () => {
    // The design's figure is READ n, its say line, its mark and its receipt.
    // What the subtitle said — the measure and the window — is on the receipt.
    const { container } = draw({ kind: 'comparison' }, COMPARED);
    expect(container.querySelector('.r-mk-title')?.textContent).toBe('Net sales');
    expect(container.querySelector('.r-mk-sub')).toBeNull();
    const src = container.querySelector('.r-src')?.textContent ?? '';
    expect(src).toContain('Net sales');
    expect(src).toContain('read');
  });

  it('puts Bob\'s note in the title when he characterised the shape', () => {
    const { container } = draw({ kind: 'comparison', note: 'the barn, not the shops' }, COMPARED);
    expect(container.querySelector('.r-mk-title')?.textContent).toContain('the barn, not the shops');
  });

  /**
   * THE POINT AND WHAT HE THINKS OF IT ARE ONE PARAGRAPH (P3.m).
   *
   * They were two until 2026-09-19 — a 14px title over a 15px thought, so the
   * point of a block was set smaller than its elaboration and every block read
   * as a captioned chart. The owner: "it still just feels like here's this and
   * here's this". In the design he approved, the claim is the bold opening of
   * the paragraph and what he thinks runs on from it.
   */
  it('opens one paragraph with the claim and runs on into what he thinks', () => {
    const { container } = draw({ kind: 'comparison', claim: 'OPUS gave back the most',
                                 thought: 'The others barely moved.' }, COMPARED);
    const say = container.querySelector('p.r-mk-say') as HTMLElement;
    expect(say).not.toBeNull();
    expect(say.querySelector('.r-mk-title')?.textContent).toBe('OPUS gave back the most');
    expect(say.querySelector('.r-mk-thought')?.textContent).toBe('The others barely moved.');
    // one paragraph, and the claim is closed before the thought begins
    expect(say.textContent).toBe('OPUS gave back the most. The others barely moved.');
    expect(container.querySelectorAll('p.r-mk-title, p.r-mk-thought')).toHaveLength(0);
  });

  it('does not double a full stop the claim already carries, or add one to a bare title', () => {
    const asked = draw({ kind: 'comparison', claim: 'Is it the barn?',
                         thought: 'It is.' }, COMPARED);
    expect(asked.container.querySelector('p.r-mk-say')?.textContent).toBe('Is it the barn? It is.');
    cleanup();
    const bare = draw({ kind: 'comparison', claim: 'OPUS gave back the most' }, COMPARED);
    expect(bare.container.querySelector('p.r-mk-say')?.textContent).toBe('OPUS gave back the most');
  });

  /**
   * A BLOCK IS A STEP (P3.o, 2026-09-19).
   *
   * The owner, of the board after the relation line landed: *"It looks like
   * ours just a little changed, still some widgets not page."* The design he
   * approved calls a block a `step` and heads it with the question it answers,
   * in bold, the claim running on — so the questions read down the page as the
   * path he took. What was drawn was the answer alone, which is a caption.
   */
  it('opens a step with the question, and the claim answers it', () => {
    const { container } = draw({ kind: 'comparison', question: 'Fewer visits, or smaller baskets?',
                                 claim: 'Smaller baskets', thought: 'Both fell, one far harder.' },
                               COMPARED);
    const say = container.querySelector('p.r-mk-say') as HTMLElement;
    expect(say.getAttribute('data-step')).toBe('yes');
    expect(say.querySelector('.r-mk-ask')?.textContent).toBe('Fewer visits, or smaller baskets?');
    expect(say.querySelector('.r-mk-title')?.textContent).toBe('Smaller baskets');
    // Still ONE paragraph: question, answer, what he thinks of it.
    expect(say.textContent).toBe('Fewer visits, or smaller baskets?Smaller baskets. Both fell, one far harder.');
  });

  it('is the head it always was where he asked nothing', () => {
    const { container } = draw({ kind: 'comparison', claim: 'OPUS gave back the most' }, COMPARED);
    const say = container.querySelector('p.r-mk-say') as HTMLElement;
    expect(say.getAttribute('data-step')).toBeNull();
    expect(say.querySelector('.r-mk-ask')).toBeNull();
    expect(say.textContent).toBe('OPUS gave back the most');
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

  /**
   * SAID ONCE (P6.b, 2026-09-20; the owner: "it's the same"). A figure with
   * a change draws the pill; the one-row dumbbell under it said the same two
   * numbers a third time. It is drawn where it adds something — a before with
   * no change to say it with, or a noise floor, which a pill cannot draw.
   */
  it('draws no dumbbell under a number whose pill already says the movement', () => {
    const { container } = draw({ kind: 'figure', subject: 'OPUS' }, COMPARED);
    expect(container.querySelector('.r-delta')).not.toBeNull();
    expect(container.querySelectorAll('.r-mk-dot--was')).toHaveLength(0);
  });

  it('shows the movement as a one-row dumbbell where the read carried a before and no change', () => {
    const rows = COMPARED.map(({ change: _c, change_pct: _p, direction: _d, ...rest }) => rest);
    const { container } = draw({ kind: 'figure', subject: 'OPUS' }, rows);
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

  it('cools every row but the one Bob pointed at', () => {
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
          role: 'bob', text: '', thinking: '', at: '2026-09-11T08:00:00Z',
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
      role: 'bob', text: '', thinking: '', at: '2026-09-11T08:00:00Z',
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
    // SAID TO THE READER, about the read — not about Bob's composing (the
    // dogfood log, 2026-09-15, "a tile explaining itself to the reader").
    const said = container.querySelector('.r-mk-absent')?.textContent ?? '';
    expect(said).toContain('Greenhills is not in this read');
    expect(said).not.toMatch(/Bob|composed/);
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

/**
 * AN OFFER, ON THE ROW IT IS ABOUT (P2.d).
 *
 * The pure placement is `actions.test.ts`. This is what a person sees: the
 * button lands inside the mark, on the row the offer named and on no other,
 * carrying Bob's reason and the cost the server derived. And it draws no
 * colour — an offer is not a direction and not an approval.
 */
describe('an offer on its row', () => {
  const OFFER = {
    act: 'why', seq: 1, target: 'Magnolia',
    reason: 'the only shop that went the other way',
    costs: 'a turn', modelTurn: true,
  };

  function drawWithOffers(o: Partial<BoardObject>, rows: Record<string, unknown>[],
                          offers: typeof OFFER[]) {
    const turn = {
      role: 'bob', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
      toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows, meta: META } }],
    } as unknown as AnswerTurn;
    const object = {
      key: 'k', kind: 'table', weight: 'supporting', seq: 1, tool: 'get_sales',
      turn: 0, touched: 0, ...o,
    } as BoardObject;
    return render(
      <Board answers={[turn]} board={[object]} local={{}} focused={null}
             selection={[]} live={false} retuned={{}} on={on}
             offers={new Map([['k', offers as never]])} />,
    );
  }

  it('draws the act, the reason and the cost, on the row it names', () => {
    const { container } = drawWithOffers({ kind: 'comparison' }, COMPARED, [OFFER]);
    const buttons = [...container.querySelectorAll('.r-offer')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('data-target')).toBe('Magnolia');
    expect(buttons[0].querySelector('.r-offer-act')?.textContent).toBe('why');
    expect(buttons[0].querySelector('.r-offer-why')?.textContent).toBe(OFFER.reason);
    expect(buttons[0].querySelector('.r-offer-cost')?.textContent).toBe('a turn');
    // AND IT IS INSIDE MAGNOLIA'S ROW, not beside the mark. The third row of
    // COMPARED is Magnolia; nobody else's row carries a button.
    const rows = [...container.querySelectorAll('.r-mk-dumbbells .r-mk-row')];
    expect(rows.map((r) => r.querySelectorAll('.r-offer').length)).toEqual([0, 0, 1]);
  });

  it('lands on a ranked row and on a contributors row the same way', () => {
    const plain = COMPARED.map(({ store, value }) => ({ store, value }));
    expect(drawWithOffers({ kind: 'chart', form: 'bar' }, plain, [OFFER]).container
      .querySelectorAll('.r-mk-ranked .r-mk-row .r-offer')).toHaveLength(1);
    cleanup();
    const drivers = COMPARED.map(({ store, change_pct, direction }) =>
      ({ store, change: change_pct * 100, direction }));
    expect(drawWithOffers({ kind: 'contributors' }, drivers, [OFFER]).container
      .querySelectorAll('.r-mk-contributors .r-mk-row .r-offer')).toHaveLength(1);
  });

  it('asks Bob when `why` is tapped, about that row and not the block\'s', () => {
    const { container } = drawWithOffers(
      { kind: 'comparison', subject: 'OPUS' }, COMPARED, [OFFER]);
    (container.querySelector('.r-offer') as HTMLButtonElement).click();
    expect(on.why).toHaveBeenCalledWith('Magnolia', 'store');
  });

  it('draws no offer where the turn made none, which is most turns', () => {
    const { container } = draw({ kind: 'comparison' }, COMPARED);
    expect(container.querySelectorAll('.r-offer')).toHaveLength(0);
  });

  it('wears no colour: it is not a direction and it is not an approval', () => {
    // UI rule 5 — one colour means "needs you" — and the four data colours
    // mean direction. An offer is neither, so nothing on the button is
    // painted at all.
    const { container } = drawWithOffers({ kind: 'comparison' }, COMPARED, [OFFER]);
    const button = container.querySelector('.r-offer') as HTMLElement;
    expect(button.getAttribute('style')).toBeNull();
    expect(button.className).toBe('r-offer');
  });
});

/* ---------------------------------------------------------------------------
 * A TAP ON A ROW'S NAME (the dogfood log, 2026-09-15)
 *
 * THIS IS THE TEST WHOSE ABSENCE SHIPPED P2.c HALF-BUILT. `subjects.ts`
 * resolved the id off the row, `subjectOnBoard` was tested, the composer drew
 * the chip — and no mark ever called `pick`, so there was no tap to resolve
 * anything from. Every piece was covered and the gesture joining them was not.
 * The owner, on the live build: *"i cant click any store cause theres no
 * tap."*
 *
 * So these drive the ROW, through the whole board, in each mark that has
 * named rows. A unit test of `pick` would have passed the whole time.
 * ------------------------------------------------------------------------ */

import { fireEvent, screen } from '@testing-library/react';   // eslint-disable-line

const NAMED = [
  { store: 'Rockwell', value: 412884, baseline: 455000, change: -42116, change_pct: -9.4 },
  { store: 'OPUS', value: 121451, baseline: 93000, change: 28451, change_pct: 30.6 },
];

describe('tapping a row', () => {
  for (const kind of ['dumbbell', 'ranked', 'contributors'] as const) {
    it(`puts the row's own subject in the selection from a ${kind}`, () => {
      (on.pick as ReturnType<typeof vi.fn>).mockClear();
      draw({ kind }, NAMED);
      fireEvent.click(screen.getByRole('button', { name: 'OPUS' }));
      expect(on.pick).toHaveBeenCalledWith('OPUS', 'store');
    });

    it(`does not also open the object when a ${kind} row is tapped`, () => {
      /**
       * THE OTHER HALF OF THE REPORT, and the reason it read as *"it just
       * moves or expands the widget"* rather than *"nothing happens"*: the
       * tile is role=button with an onClick over the whole of it, so without
       * stopPropagation the tap would select the row AND open the tile.
       */
      (on.open as ReturnType<typeof vi.fn>).mockClear();
      draw({ kind }, NAMED);
      fireEvent.click(screen.getByRole('button', { name: 'Rockwell' }));
      expect(on.open).not.toHaveBeenCalled();
    });
  }

  it('taps the subject cell of a table and no other cell', () => {
    (on.pick as ReturnType<typeof vi.fn>).mockClear();
    draw({ kind: 'table' }, NAMED);
    // The figure is not a subject and never becomes one.
    expect(screen.queryByRole('button', { name: '412,884' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rockwell' }));
    expect(on.pick).toHaveBeenCalledWith('Rockwell', 'store');
  });

  it('says which rows are already picked', () => {
    const turn = {
      role: 'bob', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
      toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows: NAMED, meta: META } }],
    } as unknown as AnswerTurn;
    const object = { key: 'k', kind: 'ranked', weight: 'lead', seq: 1, tool: 'get_sales',
                     turn: 0, touched: 0 } as BoardObject;
    render(<Board answers={[turn]} board={[object]} local={{}} focused={null}
                  selection={['OPUS']} live={false} retuned={{}} on={on} />);
    expect(screen.getByRole('button', { name: 'OPUS' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Rockwell' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('draws a plain label where the row names nothing to ask about', () => {
    /** A button that selects nothing is worse than a label. */
    draw({ kind: 'ranked' }, [{ hour: 10, value: 9732 }, { hour: 15, value: 114928 }]);
    expect(screen.queryByRole('button', { name: '1' })).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * A COMPARISON LIGHTS BOTH ROWS (the dogfood log, 2026-09-15)
 *
 * `emphasise` took one name. Asked to compare two shops Bob read the
 * estate and composed `emphasise: "Magnolia"` under the claim "Both selected
 * shops gave back basket value in August" — a sentence the drawing could not
 * support, with the comparison pushed into the prose because the picture had
 * nowhere to hold it. The owner: *"when it compares it didnt generate any
 * charts or anything"*.
 * ------------------------------------------------------------------------ */

const THREE = [
  { store: 'OPUS', value: 490.47, baseline: 510.12, change: -19.65, change_pct: -3.9 },
  { store: 'Greenhills', value: 431.7, baseline: 439.29, change: -7.59, change_pct: -1.7 },
  { store: 'Magnolia', value: 406.47, baseline: 429.6, change: -23.13, change_pct: -5.4 },
];

/** Which row names are drawn lit, off the DOM the board produced. */
function litNames(): string[] {
  return [...document.querySelectorAll('.r-mk-row[data-lit="yes"]')]
    .map((r) => r.querySelector('.r-mk-name')?.textContent ?? '')
    .filter(Boolean);
}

describe('emphasising the rows a claim is about', () => {
  it('lights both shops when the claim is about both', () => {
    draw({ kind: 'dumbbell', emphasise: ['Greenhills', 'Magnolia'] }, THREE);
    expect(litNames().sort()).toEqual(['Greenhills', 'Magnolia']);
  });

  it('still lights exactly one when one name is given', () => {
    /** Every board stored before today draws as it did. */
    draw({ kind: 'dumbbell', emphasise: 'Magnolia' }, THREE);
    expect(litNames()).toEqual(['Magnolia']);
  });

  it('lights every row when nothing is emphasised', () => {
    /** A chart with no point to make must not look like one where everything
     *  failed to matter. */
    draw({ kind: 'dumbbell' }, THREE);
    expect(litNames()).toHaveLength(THREE.length);
  });

  it('cools the rows the claim is not about', () => {
    draw({ kind: 'ranked', emphasise: ['Greenhills', 'Magnolia'] }, THREE);
    const cooled = [...document.querySelectorAll('.r-mk-row[data-lit="no"]')]
      .map((r) => r.querySelector('.r-mk-name')?.textContent);
    expect(cooled).toEqual(['OPUS']);
  });

  it('treats an empty list as nothing emphasised, not as nothing lit', () => {
    draw({ kind: 'ranked', emphasise: [] }, THREE);
    expect(litNames()).toHaveLength(THREE.length);
  });
});

describe('a click on a figure (the log, 2026-09-17)', () => {
  it('opens nothing and moves nothing — "we dont need the feature where when you click the chart it rearranges"', () => {
    (on.open as ReturnType<typeof vi.fn>).mockClear();
    const { container } = draw({ kind: 'ranked' }, COMPARED);
    const tile = container.querySelector('.r-tile') as HTMLElement;
    expect(tile.getAttribute('data-open')).toBeNull();
    expect(tile.getAttribute('role')).toBeNull();
    tile.click();
    expect(on.open).not.toHaveBeenCalled();
  });
});

describe('a reopened read whose rows were not kept (the log, 2026-09-17)', () => {
  it('says the rows were not kept, not that the read came back empty', () => {
    const turn = {
      role: 'bob', text: '', thinking: '', at: '2026-09-11T08:00:00Z',
      toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows: [], row_count: 7, meta: META } }],
    } as unknown as AnswerTurn;
    const o = { key: 'k', kind: 'ranked', weight: 'supporting', seq: 1, tool: 'get_sales', turn: 0, touched: 0 } as BoardObject;
    const { container } = render(
      <Board answers={[turn]} board={[o]} local={{}} focused={null} selection={[]} live={false} retuned={{}} on={on} />,
    );
    expect(container.querySelector('[data-not-kept]')?.textContent).toMatch(/not kept with the conversation/);
    expect(container.textContent).not.toMatch(/came back without rows/);
  });
});

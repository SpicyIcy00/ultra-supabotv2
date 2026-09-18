// @vitest-environment jsdom
/**
 * HIS THOUGHTS WITH THE CHARTS (the owner, 2026-09-17: "if the ai thoughts are
 * with the charts it feels likes your going thorugh it together").
 *
 * Held here: his sentences placed on the chart they cite, word for word, and the
 * rest kept with his words; the headline drawn apart from the rest; a
 * comparison listing stores in the answer's one order. (The `speak` layout these
 * were first built for was tried and not kept; the pieces were.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { thoughtsOf } from './beside';
import { Reading } from './Reading';
import { Board } from './render';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const META = { source_table: 'new_transactions', snapshot_timestamp: '2026-09-17T06:20:00Z', metric_label: 'Net sales', filters_applied: [] };
const SALES = [
  { store: 'OPUS', value: 467102, baseline: 555147, change_pct: -15.9, direction: 'down', unit: 'PHP' },
  { store: 'Rockwell', value: 206800, baseline: 203717, change_pct: 1.5, direction: 'up', unit: 'PHP' },
];
const BASKET = [
  { store: 'Rockwell', value: 576.04, baseline: 556.6, change_pct: 3.5, direction: 'up', unit: 'PHP' },
  { store: 'OPUS', value: 467.57, baseline: 501.49, change_pct: -6.8, direction: 'down', unit: 'PHP' },
];
const CALLS = [
  { seq: 0, tool: 'get_sales', arguments: {}, result: { rows: SALES, meta: META } },
  { seq: 1, tool: 'get_sales', arguments: {}, result: { rows: BASKET, meta: META } },
];

describe('his thoughts, on the chart they cite', () => {
  const TEXT = 'OPUS alone gave up the estate. OPUS fell to ₱467,102 while Rockwell held at ₱206,800. '
    + 'The basket at Rockwell rose to ₱576.04. Nothing else moved enough to matter.';

  it('puts a sentence on the read its figures came from, and keeps the rest', () => {
    const got = thoughtsOf(TEXT, 'OPUS alone gave up the estate', CALLS as never);
    expect(got.bySeq.get(0)).toEqual(['OPUS fell to ₱467,102 while Rockwell held at ₱206,800.']);
    expect(got.bySeq.get(1)).toEqual(['The basket at Rockwell rose to ₱576.04.']);
    expect(got.unbound).toBe('Nothing else moved enough to matter.');
  });

  it('never moves the headline, and changes no character', () => {
    const got = thoughtsOf(TEXT, 'OPUS alone gave up the estate', CALLS as never);
    const moved = [...got.bySeq.values()].flat();
    expect(moved.join(' ')).not.toContain('OPUS alone gave up the estate');
    for (const s of [...moved, got.unbound]) expect(TEXT).toContain(s);
  });

  it('draws the thought on the first figure of its read', () => {
    const turn = { role: 'george', text: TEXT, thinking: '', at: '2026-09-17T06:20:00Z', toolCalls: CALLS } as unknown as AnswerTurn;
    const board = [
      { key: 'sales', kind: 'dumbbell', seq: 0, tool: 'get_sales', weight: 'supporting', turn: 0, touched: 0 },
      { key: 'basket', kind: 'dumbbell', seq: 1, tool: 'get_sales', weight: 'supporting', turn: 0, touched: 0 },
    ] as unknown as BoardObject[];
    const on: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn() };
    const { container } = render(
      <Board answers={[turn]} board={board} local={{}} focused={null} selection={[]} live={false}
             retuned={{}} on={on} thoughts={thoughtsOf(TEXT, 'OPUS alone gave up the estate', CALLS as never).bySeq}
             sameOrder />,
    );
    const sales = container.querySelector('[data-figure="sales"] .r-fig-thought');
    expect(sales?.textContent).toContain('OPUS fell to');
    expect(container.querySelector('[data-figure="basket"] .r-fig-thought')?.textContent).toContain('basket at Rockwell');
    // ONE ORDER: the basket chart lists OPUS first, as the sales chart does.
    const names = (key: string) => [...container.querySelectorAll(`[data-figure="${key}"] .r-mk-row .r-mk-name-text`)]
      .map((n) => n.textContent);
    expect(names('sales')).toEqual(['OPUS', 'Rockwell']);
    expect(names('basket')).toEqual(['OPUS', 'Rockwell']);
  });
});

describe('the headline apart from the rest', () => {
  const reading = { claim: 'OPUS alone gave up the estate', caveat: 'Last week against the week before.' };
  const TEXT = 'OPUS alone gave up the estate. That is the whole of it.';

  it('draws only the headline as the claim part', () => {
    const { container } = render(<Reading part="claim" text={TEXT} reading={reading as never} />);
    expect(container.querySelector('.r-say--claim')?.textContent).toContain('OPUS alone gave up the estate');
    expect(container.textContent).not.toContain('That is the whole of it');
    expect(container.textContent).not.toContain('Last week against');
  });

  it('draws the caveat and the sentences no chart took as the rest part', () => {
    const { container } = render(<Reading part="rest" text={TEXT} reading={reading as never} standing="That is the whole of it." />);
    expect(container.querySelector('.r-say--claim')).toBeNull();
    expect(container.textContent).toContain('Last week against the week before.');
    expect(container.textContent).toContain('That is the whole of it.');
  });
});

describe('a thought George writes for a chart (2026-09-17)', () => {
  it('draws it beside the mark, in his words', () => {
    const turn = { role: 'george', text: 'OPUS fell.', thinking: '', at: '2026-09-17T06:20:00Z', toolCalls: CALLS } as unknown as AnswerTurn;
    const board = [{
      key: 'sales', kind: 'dumbbell', seq: 0, tool: 'get_sales', weight: 'lead', turn: 0, touched: 0,
      claim: 'OPUS gave up the estate',
      thought: 'OPUS dropped to ₱467,102 while Rockwell held — the fall is one shop, not the estate.',
    }] as unknown as BoardObject[];
    const on: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn() };
    const { container } = render(
      <Board answers={[turn]} board={board} local={{}} focused={null} selection={[]} live={false} retuned={{}} on={on} />,
    );
    const thought = container.querySelector('[data-figure="sales"] .r-mk-thought');
    expect(thought?.textContent).toContain('the fall is one shop, not the estate');
    expect(thought?.textContent).toContain('₱467,102');
  });
});

describe('the questions he suggests, under the headline (2026-09-17)', () => {
  it('draws each as a tap that asks it', async () => {
    const { ReadingAsks } = await import('./Reading');
    const onAsk = vi.fn();
    const { container } = render(
      <ReadingAsks busy={false} onAsk={onAsk}
                   reading={{ asks: ['Which products fell at OPUS?', 'What about Greenhills?'] } as never} />,
    );
    const buttons = container.querySelectorAll('.r-ask');
    expect([...buttons].map((b) => b.textContent)).toEqual(['Which products fell at OPUS?', 'What about Greenhills?']);
    (buttons[1] as HTMLButtonElement).click();
    expect(onAsk).toHaveBeenCalledWith('What about Greenhills?');
  });

  it('draws none while he works, or where he suggested none', async () => {
    const { ReadingAsks } = await import('./Reading');
    expect(render(<ReadingAsks busy onAsk={vi.fn()} reading={{ asks: ['x?'] } as never} />).container.firstChild).toBeNull();
    cleanup();
    expect(render(<ReadingAsks busy={false} onAsk={vi.fn()} reading={{} as never} />).container.firstChild).toBeNull();
  });
});

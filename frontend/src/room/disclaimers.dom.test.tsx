// @vitest-environment jsdom
/**
 * THE DISCLAIMERS — the dogfood log, 2026-09-17, and UI rule 4 as changed that
 * day: *"we dont need those disclaimers unless it has wrong data"*.
 *
 * A notice that only explains how a figure was measured is not drawn over it;
 * one that says the figure may be wrong still is; before the definitions load,
 * and for a kind they do not name, everything is drawn. And the turn's caveat
 * no longer repeats a sentence the answer already says.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import { Caveats, type TileActions } from './tiles';
import { Board } from './render';
import { Reading, unsaid } from './Reading';
import { ExplainsOnlyContext, drawnOnly, explainsOnlyFrom } from './noticeDrawing';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const on: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn() };
const EXPLAINS = explainsOnlyFrom({ notices: { explains_only: ['comparison_incomplete'] } });

/** His screenshot's read: products compared, the incomplete-comparison notice on it. */
function boardWith(notice: { kind: string; message: string }, explains?: ReadonlySet<string>) {
  const turn = {
    role: 'bob', text: '', thinking: '', at: '2026-09-17T06:20:00Z',
    toolCalls: [{
      seq: 1, tool: 'get_sales', arguments: {},
      result: {
        rows: [
          { product: 'P4 kiamoy strips', value: 1200, baseline: 4575, change: -3375, change_pct: -73.8, direction: 'down', unit: 'PHP' },
          { product: 'Aji Dilis Spicy', value: 800, baseline: 3790, change: -2990, change_pct: -78.9, direction: 'down', unit: 'PHP' },
        ],
        meta: { source_table: 'new_transaction_items', snapshot_timestamp: '2026-09-17T06:20:00Z', notice },
      },
    }],
  } as unknown as AnswerTurn;
  const o = { key: 'k', kind: 'ranked', seq: 1, tool: 'get_sales', weight: 'lead', turn: 0, touched: 0 } as unknown as BoardObject;
  const board = <Board answers={[turn]} board={[o]} local={{}} focused={null} selection={[]} live={false} retuned={{}} on={on} />;
  return render(explains ? <ExplainsOnlyContext.Provider value={explains}>{board}</ExplainsOnlyContext.Provider> : board);
}

const INCOMPLETE = {
  kind: 'comparison_incomplete',
  message: '110 of 173 compared row(s) could not be compared against the 2026-09-07 00:00:00 to 2026-09-10 14:20:23 baseline: 48 no_baseline (the baseline window returned no figure (NULL) — nothing to compare against).',
};
const STALE = { kind: 'stale_stock', message: 'Stock was last counted 9 days ago; on-hand may have moved since.' };

describe('a disclaimer over a chart', () => {
  it('is not drawn when it only explains how the figure was measured — the one he pointed at', () => {
    const { container } = boardWith(INCOMPLETE, EXPLAINS);
    expect(container.querySelector('.r-caveat')).toBeNull();
    expect(container.textContent).not.toMatch(/no_baseline|row\(s\)|NULL/);
  });

  it('is still drawn when it says the data may be wrong', () => {
    const { container } = boardWith(STALE, EXPLAINS);
    expect(container.querySelector('.r-caveat')?.textContent).toContain('last counted 9 days ago');
  });

  it('is drawn, all of them, before the definitions say which is which', () => {
    const { container } = boardWith(INCOMPLETE);
    expect(container.querySelector('.r-caveat')).not.toBeNull();
  });

  it('keeps an unlisted kind — a new notice is never hidden by nobody deciding', () => {
    expect(drawnOnly([{ kind: 'brand_new_kind', message: 'x' }], EXPLAINS)).toHaveLength(1);
  });
});

describe("the turn's caveat", () => {
  const said = 'The basket moved into the weighed mix: aji mix is up 12.3% at Shangri-La this week. '
    + 'Shangri-La, Monday to this afternoon against the same stretch of last week — a bit over half the week.';
  const caveat = 'Shangri-La, Monday to this afternoon against the same stretch of last week — a bit over half the week. '
    + 'Of 173 products, 110 cannot be compared at all.';

  it('does not repeat a sentence the answer already says, and keeps the rest word for word', () => {
    expect(unsaid(caveat, said)).toBe('Of 173 products, 110 cannot be compared at all.');
  });

  it('keeps a decimal whole when splitting sentences', () => {
    expect(unsaid('Aji mix is up 12.3% at ₱1.70m. Nothing else.', 'Nothing else.')).toBe('Aji mix is up 12.3% at ₱1.70m.');
  });

  it('draws the repeated sentence once on the screen', () => {
    const { container } = render(<Reading text={said} reading={{ caveat, claim: 'weighed mix' } as never} />);
    const count = (container.textContent ?? '').split('a bit over half the week').length - 1;
    expect(count).toBe(1);
  });
});

describe('more than one note folds, and opens when asked', () => {
  // The owner, 2026-09-19: "disclaimers can be hid and you can open it if you
  // want to see it". Said of the attention read, which carried a paragraph
  // about its stale sources and another about a section that does not exist.
  const TWO = [
    { kind: 'stale_sources', message: 'These sources are too old to say what changed since yesterday.' },
    { kind: 'no_low_stock_level', message: "There is no 'newly low on stock' section." },
  ] as unknown as Parameters<typeof Caveats>[0]['notices'];

  it('says how many there are rather than saying them', () => {
    const { container } = render(<Caveats notices={TWO} />);
    expect(container.querySelector('.r-caveats')?.getAttribute('data-folded')).toBe('yes');
    // THE WARNING IS STILL THERE, which is what UI rule 4 is for: a person
    // cannot look at the figures without seeing that something qualifies them.
    expect(container.textContent).toContain('2 notes on these figures');
    expect(container.textContent).not.toContain('too old');
  });

  it('opens on the line and closes again', () => {
    const { container } = render(<Caveats notices={TWO} />);
    fireEvent.click(screen.getByRole('button', { name: '2 notes on these figures' }));
    expect(container.textContent).toContain('too old');
    expect(container.textContent).toContain("newly low on stock");
    fireEvent.click(screen.getByRole('button', { name: 'less' }));
    expect(container.textContent).not.toContain('too old');
  });

  it('leaves a single note in the open, where folding would save nothing', () => {
    const { container } = render(<Caveats notices={[TWO![0]]} />);
    expect(container.querySelector('.r-caveats')?.getAttribute('data-folded')).toBe('no');
    expect(container.textContent).toContain('too old');
  });
});

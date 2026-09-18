// @vitest-environment jsdom
/**
 * THE OWNER'S REPORTS ON THE LIVE P2S.3 BUILD, 2026-09-17 — each held here in
 * the words he used (ops/DOGFOOD_LOG.md, Fixed):
 *
 *   "why is there 2 thinkings it should only be around the blob …"
 *   "and this stays its not closeable"
 *   "down arrow should be in the center of the charts"
 *   "its failing here" — validator messages drawn as caveats, a figure that
 *     drew nothing, one point said three times on a chart
 *   the headline shown from its middle, "it:54"
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { Board, turnNotices } from './render';
import { thoughtsOf } from './beside';
import { Figures } from './Reading';
import { Tokens } from './Tokens';
import { Doing } from './Working';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const ROOM = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');
const CSS = postcss.parse(readFileSync(join(__dirname, 'room.css'), 'utf8'));

const call = (seq: number, rows: Record<string, unknown>[]) => ({
  seq, tool: 'get_sales', arguments: {},
  result: { rows, meta: { source_table: 'new_transactions', snapshot_timestamp: '2026-09-17T14:43:00Z',
                          filters_applied: [], metric_label: 'Net sales' } },
});

describe('"its failing here" — what reached the screen', () => {
  it("never draws the loop's own warnings as a caveat", () => {
    const turn = {
      role: 'bob', text: '', thinking: '', at: '', toolCalls: [],
      notices: [
        { kind: 'reading_rejected', source: 'loop',
          message: 'caveat: caveat is at most 320 characters — it is one thing said once (voice.reading.slots.caveat) — said.' },
        { kind: 'unsurfaced_notice', source: 'loop', message: 'header_total_mismatch' },
        { kind: 'supplier_coverage', source: 'definitions/metrics.yaml: purchasing.plan.supplier_link',
          message: 'Nothing records who supplies a product.' },
      ],
    } as unknown as AnswerTurn;
    const drawn = turnNotices({ answers: [turn], board: [], local: {}, focused: null });
    expect(drawn.map((n) => n.kind)).toEqual(['supplier_coverage']);
  });

  it('draws a folded table as its first rows and "all N", never nothing', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ product: `P${i}`, units_per_day: i, on_hand: 3 * i }));
    const turn = { role: 'bob', text: '', thinking: '', at: '', toolCalls: [call(1, rows)], notices: [] } as unknown as AnswerTurn;
    const o = { key: 'plan', kind: 'table', weight: 'quiet', seq: 1, tool: 'get_sales', turn: 0, touched: 0 } as BoardObject;
    const on: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn() };
    const { container } = render(<Board answers={[turn]} board={[o]} local={{}} focused={null}
                                        selection={[]} live={false} retuned={{}} on={on} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8);
    expect(container.textContent).toContain('all 20');
  });

  it('places no sentence of the answer on a chart that carries its own thought', () => {
    const calls = [call(0, [{ supplier: 'GZ aji mix', value: 5745000 }])] as never;
    const text = 'Before I build anything: two of the top five are the same name. '
      + 'On this year\'s spend GZ aji mix leads at ₱5,745,000, and that changes who the five are.';
    const claim = 'two of the top five are the same name';
    expect(thoughtsOf(text, claim, calls).bySeq.get(0)).toHaveLength(1);
    const held = thoughtsOf(text, claim, calls, new Set([0]));
    expect(held.bySeq.get(0)).toBeUndefined();
    // AND NOT UNDER HIM EITHER (the owner, 2026-09-18: "if its stating whats
    // already stated or shown in the page … dont make it say that"): the chart
    // already says it, in his thought.
    expect(held.unbound).not.toContain('GZ aji mix leads');
  });
});

describe('the headline reads as he wrote it', () => {
  it('keeps the space before a figure ("it: 54", not "it:54")', () => {
    const calls = [call(1, [{ store: 'North Edsa', value: 54 }, { store: 'OPUS', value: 14816 }])] as never;
    const { container } = render(
      <p><Figures text="transactions doing it: 54 fewer, down ₱14,816, 19.9%" calls={calls} onFigure={() => {}} /></p>);
    // The marker's digit is taken out, so what is left is his sentence.
    container.querySelectorAll('sup').forEach((s) => s.remove());
    expect(container.textContent).toBe('transactions doing it: 54 fewer, down ₱14,816, 19.9%');
    expect(Array.from(container.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['54', '₱14,816']);
  });

  it('puts the words column back at its top when a turn settles', () => {
    expect(ROOM).toMatch(/if \(!busy && wordsRef\.current\) wordsRef\.current\.scrollTop = 0;/);
  });
});

describe('"why is there 2 thinkings"', () => {
  it('draws the work once, under him, as small steps with what he is doing now', () => {
    const turn = {
      role: 'bob', text: '', thinking: '', at: new Date().toISOString(), notices: [],
      toolCalls: [call(1, [{ store: 'OPUS', value: 1 }]), { seq: 2, tool: 'get_sales', arguments: {} }],
    } as unknown as AnswerTurn;
    const { container } = render(<Doing turn={turn} live answering={false} />);
    expect(container.querySelectorAll('.r-doing .r-work-trail .r-work').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.r-doing-line')?.textContent).toMatch(/^reading…/);
    // And not a second time over the figures.
    expect(ROOM).not.toMatch(/<Working\b/);
  });
});

describe('"this stays its not closeable"', () => {
  it('has a close on the refused line', () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(
      <Tokens tokens={[]} correction="not what I meant" refusal={{ head: 'That change cannot be made to this read.', detail: null }}
              onMove={() => {}} onCorrect={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(getByLabelText('close'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('"down arrow should be in the center of the charts"', () => {
  it('centres the arrows on the figures area', () => {
    let decls: Record<string, string> | null = null;
    CSS.walkRules((r) => {
      if (decls === null && r.selectors.includes('.r-arr')) {
        decls = {};
        r.walkDecls((d) => { (decls as Record<string, string>)[d.prop] = d.value; });
      }
    });
    expect(decls).toMatchObject({ left: '50%', transform: 'translateX(-50%)' });
    expect((decls as unknown as Record<string, string>).right).toBeUndefined();
  });
});

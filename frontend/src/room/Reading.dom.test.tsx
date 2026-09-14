/**
 * THE READING, AND THE DEFECT IT CLOSES.
 *
 * The owner, 2026-09-13: *"i asked how are doing like and those 4 widgets are
 * all the poped up … no text no george actually talking to me"*. His prose
 * reached the board only as a `text` block he composed, so a turn that
 * composed figures and forgot one dropped the answer on the floor: it was in
 * the turn, the board had nowhere to put it, and the person saw shapes and
 * silence.
 *
 * These hold the fix, which is a subtraction: `text` is not a widget, the
 * reading is a region drawn from the turn's own words, and nothing George
 * composes — or fails to compose — can take it off the screen.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Reading, ReadingNext } from './Reading';
import { buildBoard } from './board';
import type { AnswerTurn } from './data';
import type { GeorgeNotice } from '../types/george';

afterEach(cleanup);

const ROWS = [
  { store: 'Rockwell', value: 203717, change_pct: 13.8, direction: 'up', unit: 'PHP' },
  { store: 'OPUS', value: 555147, change_pct: 30.6, direction: 'up', unit: 'PHP' },
];

const TURN = {
  role: 'george',
  text: 'OPUS carried the week; Rockwell held. Nothing here needs you today.',
  at: '2026-09-14T08:00:00Z',
  toolCalls: [{
    seq: 0,
    tool: 'get_sales',
    arguments: { group_by: ['store'], date_range: 'last_week' },
    result: { rows: ROWS, meta: { source_table: 'new_transactions', metric_label: 'Net sales',
                                  snapshot_timestamp: '2026-09-14T08:00:00Z', filters_applied: [] } },
  }],
  // FOUR WIDGETS AND NOT ONE WORD — his composition from the report, to the
  // shape: figures, and no block carrying his prose.
  composition: { blocks: [
    { op: 'put', key: 'opus', kind: 'hero', seq: 0, subject: 'OPUS', weight: 'lead' },
    { op: 'put', key: 'rockwell', kind: 'subject', seq: 0, subject: 'Rockwell', weight: 'supporting' },
    { op: 'put', key: 'shops', kind: 'table', seq: 0, weight: 'quiet' },
  ] },
} as unknown as AnswerTurn;

describe('the reading is drawn from the turn, not composed', () => {
  it('says what he said even when his composition is all figures', () => {
    const board = buildBoard([TURN]);
    expect(board).toHaveLength(3);
    expect(board.every((o) => o.kind !== 'text')).toBe(true);
    const { container } = render(<Reading text={TURN.text} />);
    expect(container.textContent).toContain('OPUS carried the week');
  });

  it('is not a tile: no card, no clamp, its own region', () => {
    const { container } = render(<Reading text={TURN.text} />);
    expect(container.querySelector('.r-tile')).toBeNull();
    expect(container.querySelector('.r-reading')).toBeTruthy();
    expect(container.querySelector('.r-say--reading')?.textContent)
      .toBe(TURN.text);
  });

  it('draws nothing at all when he said nothing, and claims nothing either', () => {
    // A turn with no prose is a defect the loop records (answer_without_prose).
    // What the screen must not do is narrate it — "no answer" is a claim.
    const { container } = render(<Reading text="" />);
    expect(container.firstChild).toBeNull();
  });

  it('puts the caveats above the reading, never beside or under it', () => {
    const notices: GeorgeNotice[] = [
      { kind: 'dead_stock_share', message: '1802 of 3397 products recorded no sale.',
        source: 'tool' } as unknown as GeorgeNotice,
    ];
    const { container } = render(<Reading text={TURN.text} notices={notices} />);
    const text = container.textContent ?? '';
    expect(text.indexOf('recorded no sale')).toBeLessThan(text.indexOf('OPUS carried'));
    expect(container.querySelector('.r-caveats')).toBeTruthy();
  });

  it('lights the claim where he said it, and changes not one character', () => {
    const claim = 'OPUS carried the week';
    const { container } = render(
      <Reading text={TURN.text} reading={{ claim }} />);
    const lit = container.querySelector('.r-claim');
    expect(lit?.textContent).toBe(claim);
    // The sentence is still the sentence: the highlight is a span inside it.
    expect(container.querySelector('.r-say--reading')?.textContent).toBe(TURN.text);
  });

  it('lights nothing when the claim is not in what he said', () => {
    // The one guarantee that makes a text slot safe: it can only ever
    // emphasise words the answer already carries, so a claim he did not say
    // draws nothing rather than drawing itself.
    const { container } = render(
      <Reading text={TURN.text} reading={{ claim: 'Rockwell is in trouble' }} />);
    expect(container.querySelector('.r-claim')).toBeNull();
    expect(container.querySelector('.r-say--reading')?.textContent).toBe(TURN.text);
  });

  it('puts his caveat whole above the reading, and never in the accent', () => {
    const caveat = 'Purchase orders are a frozen export, so replenishment already sent is invisible';
    const { container } = render(
      <Reading text={TURN.text} reading={{ caveat }} />);
    const text = container.textContent ?? '';
    expect(text.indexOf('frozen export')).toBeLessThan(text.indexOf('OPUS carried'));
    const el = container.querySelector('.r-caveat');
    expect(el?.textContent).toBe(caveat);
    // UI rule 5: one colour means "needs you", and a caveat is not that.
    expect(el?.className).not.toContain('accent');
  });

  it('draws the next sentence as its own line, and nothing when there is none', () => {
    const next = 'Draft the Seikyo order before the cut-off';
    const { container } = render(<ReadingNext reading={{ next }} />);
    expect(container.querySelector('.r-next')?.textContent).toContain(next);
    cleanup();
    const empty = render(<ReadingNext reading={{ claim: 'anything' }} />);
    expect(empty.container.firstChild).toBeNull();
  });

  it('drops a text block stored before the vocabulary lost the kind', () => {
    const old = { ...TURN, composition: { blocks: [
      { op: 'put', key: 'reading', kind: 'text', weight: 'lead' },
      { op: 'put', key: 'shops', kind: 'table', seq: 0, weight: 'supporting' },
    ] } } as unknown as AnswerTurn;
    const board = buildBoard([old]);
    expect(board.map((o) => o.key)).toEqual(['shops']);
  });
});

/**
 * WHERE AN OFFER GOES (P2.d).
 *
 * The server decided WHAT may be offered (agent/actions.py) and what it costs.
 * This decides WHERE, and the property that matters is the one a single mark
 * filtering for itself could not have: every offer is drawn exactly once, and
 * none is drawn nowhere. An offer that vanishes because the board happened to
 * draw its read as a line chart is a suggestion the person never got to
 * refuse, which is worse than one drawn a line lower.
 */
import { describe, expect, it } from 'vitest';
import type { ActionOffer, BobTurn } from '../types/bob';
import type { BoardObject } from './board';
import { cost, key, offersOf, onRow, placement, says } from './actions';
import type { AnswerTurn } from './data';

const ROWS = [
  { store: 'OPUS', value: 555147, baseline: 425000, change_pct: 30.6, direction: 'up', unit: 'PHP' },
  { store: 'Rockwell', value: 203717, baseline: 179000, change_pct: 13.8, direction: 'up', unit: 'PHP' },
  { store: 'Magnolia', value: 121004, baseline: 133000, change_pct: -9.0, direction: 'down', unit: 'PHP' },
];
const DAYS = [
  { day: '2026-09-07', value: 21244 }, { day: '2026-09-08', value: 12258 },
  { day: '2026-09-09', value: 24020 },
];
const META = { source_table: 'new_transactions', filters_applied: [],
               snapshot_timestamp: '2026-09-11T08:00:00Z' };

function turn(calls: { seq: number; rows: Record<string, unknown>[] }[]): AnswerTurn {
  return {
    role: 'bob', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
    toolCalls: calls.map((c) => ({
      seq: c.seq, tool: 'get_sales', arguments: {},
      result: { rows: c.rows, meta: META },
    })),
  } as unknown as AnswerTurn;
}

function object(over: Partial<BoardObject>): BoardObject {
  return {
    key: 'k', kind: 'dumbbell', weight: 'lead', seq: 1, tool: 'get_sales',
    turn: 0, touched: 0, ...over,
  } as BoardObject;
}

const offer = (over: Partial<ActionOffer> = {}): ActionOffer => ({
  act: 'why', seq: 1, target: 'Magnolia', reason: 'it went the other way',
  costs: 'a turn', modelTurn: true, ...over,
});

describe('an offer is drawn exactly once', () => {
  it('lands on the object drawing the read its row is in', () => {
    const a = offer();
    const { onRows, foot } = placement([a], [object({ key: 'shops' })], [turn([{ seq: 1, rows: ROWS }])]);
    expect(onRows.get('shops')).toEqual([a]);
    expect(foot).toEqual([]);
  });

  it('falls to the foot when no mark on the board draws that row', () => {
    // The read is on screen as a LINE — days, not shops — so there is no row
    // called Magnolia to sit on. It is not dropped.
    const a = offer();
    const { onRows, foot } = placement(
      [a], [object({ key: 'days', kind: 'line', seq: 1 })], [turn([{ seq: 1, rows: DAYS }])]);
    expect(onRows.size).toBe(0);
    expect(foot).toEqual([a]);
  });

  it('falls to the foot when the object drawing that read is not on the board', () => {
    const a = offer({ seq: 2 });
    const { onRows, foot } = placement(
      [a], [object({ key: 'shops', seq: 1 })],
      [turn([{ seq: 1, rows: ROWS }, { seq: 2, rows: ROWS }])]);
    expect(onRows.size).toBe(0);
    expect(foot).toEqual([a]);
  });

  it('puts an offer about the answer at the foot and never on a row', () => {
    const a = offer({ target: null });
    const { onRows, foot } = placement([a], [object({ key: 'shops' })], [turn([{ seq: 1, rows: ROWS }])]);
    expect(onRows.size).toBe(0);
    expect(foot).toEqual([a]);
  });

  it('never draws one twice, even where two objects draw the same read', () => {
    const a = offer();
    const { onRows, foot } = placement(
      [a],
      [object({ key: 'shops' }), object({ key: 'again', weight: 'supporting' })],
      [turn([{ seq: 1, rows: ROWS }])],
    );
    const drawn = [...onRows.values()].flat().length + foot.length;
    expect(drawn).toBe(1);
  });

  it('accounts for every offer, on a row or at the foot, always', () => {
    const many = [
      offer({ target: 'OPUS' }),
      offer({ act: 'open', target: 'Rockwell', costs: '~1s', modelTurn: false }),
      offer({ target: null }),
      offer({ target: 'Greenhills' }),          // no row on the board carries it
    ];
    const { onRows, foot } = placement(
      many, [object({ key: 'shops' })], [turn([{ seq: 1, rows: ROWS }])]);
    const drawn = [...onRows.values()].flat().concat(foot).map(key).sort();
    expect(drawn).toEqual(many.map(key).sort());
  });

  it('will not put this turn\'s offer on an object from an older turn', () => {
    // An offer belongs to the turn it came with. An older object is folded to
    // one line above the reading, and a button on it is a button nobody sees.
    const a = offer();
    const older = object({ key: 'old', turn: 0 });
    const answers = [turn([{ seq: 1, rows: ROWS }]), turn([{ seq: 1, rows: ROWS }])];
    const { onRows, foot } = placement([a], [older], answers);
    expect(onRows.size).toBe(0);
    expect(foot).toEqual([a]);
  });
});

describe('which row', () => {
  it('matches the row whatever the capitals', () => {
    const a = offer({ target: 'magnolia' });
    expect(onRow([a], 1, 'Magnolia')).toEqual([a]);
  });

  it('is nobody else\'s row', () => {
    expect(onRow([offer()], 1, 'OPUS')).toEqual([]);
  });

  it('is nobody else\'s read', () => {
    expect(onRow([offer()], 2, 'Magnolia')).toEqual([]);
  });
});

describe('what the button says', () => {
  it('draws the cost exactly as it arrived, and works none of it out', () => {
    expect(cost(offer({ costs: 'a turn' }))).toBe('a turn');
    expect(cost(offer({ costs: '~1s' }))).toBe('~1s');
  });

  it('draws no cost rather than a guess where the act declared none', () => {
    expect(cost(offer({ costs: '' }))).toBeNull();
  });

  it('uses the surface\'s own word for the act, not a second one', () => {
    // "why" is already the word on the tile's own button. Two words for one
    // act is how a reader ends up thinking they are two different things.
    expect(says(offer({ act: 'why' }))).toBe('why');
    expect(says(offer({ act: 'open' }))).toBe('open');
  });
});

describe('a turn that offered nothing', () => {
  it('draws exactly as it drew before offers existed', () => {
    expect(offersOf(null)).toEqual([]);
    expect(offersOf({} as BobTurn & { actions?: ActionOffer[] })).toEqual([]);
    const { onRows, foot } = placement([], [object({})], [turn([{ seq: 1, rows: ROWS }])]);
    expect(onRows.size).toBe(0);
    expect(foot).toEqual([]);
  });
});

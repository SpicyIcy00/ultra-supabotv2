/**
 * The watching client's two derivations (W4.4), with nothing mocked.
 *
 *   railRows   one query, two readings — the rail selects a flat list out of
 *              the shape the watches page reads, so they share a cache key
 *              instead of writing two shapes under one. (Two query functions
 *              under `['watching']` WAS this card's own bug: the rail's array
 *              overwrote the page's object and the page drew "none yet"
 *              beside a rail listing five.)
 *   slotShort  the same slot in the rail's width, built from the SLOT the
 *              service holds and never from the sentence, so the rail and
 *              the page cannot come to say different times.
 */
import { describe, expect, it } from 'vitest';
import { anchorOf, railRows, slotShort, type Watching, type WatchingRow } from './standingApi';

function row(over: Partial<WatchingRow>): WatchingRow {
  return {
    id: 'x', family: 'question', asks: 'How are we doing?', when: 'every day at 08:00',
    on: false, state: 'switched off', told: [], told_by: 'instructions',
    slot: { kind: 'daily', hour: 8, minute: 0, days_of_week: null },
    last_run_at: null, last_status: null, last_error: null, last_said: null,
    thread_id: null, checks: null, spoke: null, backtest: null, backtest_at: null,
    backtest_window: null, switch_on_refusal: null,
    may: { switch: true, reschedule: true, rewrite: true, remove: true },
    ...over,
  } as WatchingRow;
}

describe('one query, two readings', () => {
  it('flattens questions first, in the page’s own order', () => {
    const w: Watching = {
      questions: [row({ id: 'q1' }), row({ id: 'q2' })],
      watches: [row({ id: 'w1', family: 'watch' })],
    };
    expect(railRows(w).map((r) => r.id)).toEqual(['q1', 'q2', 'w1']);
    // A select, not a second fetch: the same objects come back.
    expect(railRows(w)[0]).toBe(w.questions[0]);
  });

  it('gives each row the anchor its page draws', () => {
    expect(anchorOf(row({ id: 'q1' }))).toBe('question-q1');
    expect(anchorOf(row({ id: 'w1', family: 'watch' }))).toBe('watch-w1');
  });
});

describe('the slot, in the rail’s width', () => {
  it('says the time daily, or the days and the time', () => {
    expect(slotShort(row({}))).toBe('08:00 daily');
    expect(slotShort(row({ slot: { kind: 'daily', hour: 6, minute: 5, days_of_week: null } })))
      .toBe('06:05 daily');
    expect(slotShort(row({ slot: { kind: 'weekly', hour: 7, minute: 0, days_of_week: [0, 3] } })))
      .toBe('Mon, Thu 07:00');
    expect(slotShort(row({ slot: { kind: 'weekly', hour: 8, minute: 0, days_of_week: [6] } })))
      .toBe('Sun 08:00');
  });

  it('is a time whether the thing is on or off — "off" is the switch', () => {
    expect(slotShort(row({ on: false }))).toBe(slotShort(row({ on: true })));
    expect(slotShort(row({ on: false }))).toMatch(/\d\d:\d\d/);
  });
});

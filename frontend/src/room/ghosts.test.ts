/**
 * GREY TEXT THAT FINISHES THE QUESTION (P2.d).
 *
 * The property the card names is the one worth testing hardest: a completion
 * is built from what is ALREADY ON SCREEN, so it can never need a model call
 * and can never put a word on the line that nothing served. Everything else —
 * which one wins, when it stays quiet — follows from that.
 */
import { describe, expect, it } from 'vitest';
import { MIN_TYPED, accepted, ghostFor, ghostsFor } from './ghosts';
import type { DrawnToken } from './tokenShape';

const WINDOW: DrawnToken = {
  argument: 'date_range',
  kind: 'navigation',
  label: 'window',
  value: 'last_week',
  valueLabel: 'last week',
  alternatives: [
    { value: 'last_week', label: 'last week', spellings: ['last week'] },
    { value: 'last_month', label: 'last month', spellings: ['last month', 'august'] },
    { value: 'yesterday', label: 'yesterday', spellings: ['yesterday'] },
  ],
  targets: [{ post: 'p1', turn: 0, seq: 1, tool: 'get_sales' }],
};

const SUBJECTS = ['Greenhills', 'Rockwell', 'Magnolia'];
const PAGES = [
  { id: 'p-1', title: 'Greenhills weekly' },
  { id: 'p-2', title: 'Supplier costs' },
];

const input = (draft: string, over: Partial<Parameters<typeof ghostsFor>[0]> = {}) => ({
  draft, tokens: [WINDOW], subjects: SUBJECTS, pages: PAGES, ...over,
});

describe('what it completes to', () => {
  it('finishes a window the board is not already on — which is a replay', () => {
    const g = ghostFor(input('last mo'));
    expect(g?.text).toBe('last month');
    expect(g?.rest).toBe('nth');
    expect(g?.does).toBe('replay');
  });

  it('offers a spelling the definitions served, not one it made up', () => {
    // "august" is a SPELLING of last_month in `tokens.spoken`. No stemming, no
    // fuzzy match, no "did you mean" — the same rule the typed fragment is
    // resolved by.
    expect(ghostFor(input('aug'))?.text).toBe('august');
    expect(ghostsFor(input('septem'))).toEqual([]);
  });

  it('never offers to change the window to the one it is already on', () => {
    // The board is on last week. "last we" completes to nothing, because
    // taking it would re-run the same reads on the same scope.
    expect(ghostsFor(input('last we'))).toEqual([]);
  });

  it('finishes a name the board is drawing', () => {
    const g = ghostFor(input('green'));
    expect(g?.text).toBe('Greenhills');
    expect(g?.does).toBe('subject');
  });

  it('finishes a page only where its title names something on the board', () => {
    const g = ghostFor(input('greenhills w'));
    expect(g?.text).toBe('Greenhills weekly');
    expect(g?.does).toBe('page');
    // "Supplier costs" names nothing on this board, so it is not a completion
    // even though it matches what was typed. A list of every page is a menu.
    expect(ghostsFor(input('suppl'))).toEqual([]);
  });

  it('offers nothing at all from an empty board', () => {
    expect(ghostsFor(input('last mo', { tokens: [], subjects: [], pages: [] }))).toEqual([]);
  });
});

describe('when it stays quiet', () => {
  it('says nothing until enough has been typed to mean something', () => {
    expect(ghostsFor(input('g'))).toEqual([]);
    expect('gr'.length).toBe(MIN_TYPED);
    expect(ghostsFor(input('gr'))[0]?.text).toBe('Greenhills');
  });

  it('says nothing when the whole word is already typed', () => {
    // A completion with nothing left to add only flickers.
    expect(ghostsFor(input('Greenhills')).some((g) => g.text === 'Greenhills')).toBe(false);
  });

  it('says nothing when the draft is not the start of anything', () => {
    expect(ghostsFor(input('how are we doing'))).toEqual([]);
  });

  it('matches the WHOLE draft, never the word under the caret', () => {
    // Mid-sentence, the thing being typed is usually not a shop. Matching the
    // last word would fire constantly and be wrong nearly every time.
    expect(ghostsFor(input('what about green'))).toEqual([]);
  });
});

describe('what taking it puts on the line', () => {
  it('leaves a replay as the plain words the fragment resolver reads', () => {
    expect(accepted({ text: 'last month', rest: 'nth', does: 'replay', costs: '~1s' }))
      .toBe('last month');
  });

  it('makes a name an @mention, because that is what binds it', () => {
    expect(accepted({ text: 'Greenhills', rest: 'hills', does: 'subject', costs: 'no turn' }))
      .toBe('@Greenhills');
    expect(accepted({ text: 'Greenhills weekly', rest: ' weekly', does: 'page', costs: 'no turn' }))
      .toBe('@Greenhills weekly');
  });
});

describe('the order it offers them in', () => {
  it('puts the replay first: it is the cheapest and the most specific', () => {
    const ordered = ghostsFor(input('la', { subjects: ['Last chance mix'] }));
    expect(ordered[0].does).toBe('replay');
    expect(ordered.some((g) => g.does === 'subject')).toBe(true);
  });

  it('offers each candidate once, however many sources name it', () => {
    const twice = ghostsFor(input('greenh', { subjects: ['Greenhills', 'Greenhills'] }));
    expect(twice.filter((g) => g.text === 'Greenhills')).toHaveLength(1);
  });
});

describe('what it costs', () => {
  it('says a second for a replay and no turn for a binding', () => {
    // Neither is a model call, which is the rule; they are different anyway,
    // and a person about to press Tab is owed the difference.
    expect(ghostFor(input('last mo'))?.costs).toBe('~1s');
    expect(ghostFor(input('green'))?.costs).toBe('no turn');
  });
});

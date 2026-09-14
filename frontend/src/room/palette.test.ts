/**
 * FOUR DATA COLOURS INSIDE A MARK, AND A FIFTH FAILS HERE.
 *
 * The owner's second failure, in his own screenshots: seven shops in seven
 * hues, over rows whose labels already said which shop each one was. One
 * series, one measurement, and colour spent decoding nothing — the reference
 * calls it the most common way a chart misses its point. So inside a mark
 * colour is DIRECTION: `--up`, `--down`, `--flat`, and `--george` for the row
 * that matters in a read that declared no direction. Identity keeps its hue
 * where identity is the point — the tile's edge and wash, the object panel —
 * and never enters a drawing.
 *
 * WHY A SOURCE TEST RATHER THAN A REVIEW, and it is the same reason
 * `accentUse.test.ts` gives: a fifth colour arrives as one plausible line in
 * one component, feels justified at the time, and nobody sees the fourteenth
 * one coming. A test that reads the source makes adding one a visible edit
 * with a name on it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_COLOURS } from './catalogue';

const MARKS = readFileSync(join(__dirname, 'marks.tsx'), 'utf8');
const CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');

/**
 * Tokens that carry no data meaning: the ground a mark sits on, its ink, its
 * type. A drawing needs somewhere to be drawn; none of these says anything
 * about a value.
 */
const STRUCTURAL = new Set([
  'track', 'card', 'sunk', 'ground', 'paper', 'edge', 'edge-strong',
  'ink', 'ink-2', 'ink-3', 'on-colour', 'on-colour-2',
  'sans', 'mono', 'ease', 'radius', 'size', 'd', 'i',
]);

/**
 * Every token a stretch of source actually READS — `var(--x)` and nothing
 * else. A class name with two dashes in it (`r-mk-dot--was`) names no colour,
 * and neither does a comment rule.
 */
function tokens(text: string): string[] {
  return [...text.matchAll(/var\(\s*--([a-z0-9-]+)\s*\)/g)].map((m) => m[1]);
}

/** The mark section of the stylesheet — everything after its own heading. */
function markCss(): string {
  const at = CSS.indexOf('/* ---------------------------------------------------------------- the six');
  expect(at).toBeGreaterThan(-1);
  return CSS.slice(at);
}

describe('the data palette', () => {
  it('is four colours', () => {
    expect(DATA_COLOURS).toHaveLength(4);
  });

  it('is the only thing marks.tsx can paint with', () => {
    // One function produces every colour in the file, and its argument is a
    // `DataColour` — so the compiler refuses a fifth and this refuses a
    // second producer, which is the hole the compiler cannot see.
    expect(MARKS).toMatch(/function paint\(c: DataColour\): string \{\s*\n\s*return `rgb\(var\(--\$\{c\}\)\)`;/);
    const painted = [...MARKS.matchAll(/(?:background|borderColor|stroke|fill)[:=]\s*([^,\n}]+)/g)]
      .map((m) => m[1].trim().replace(/["'{}]/g, ''));
    for (const value of painted) {
      expect(value, `${value} is a colour no direction chose`)
        .toMatch(/^(paint\(c\)|var\(--card\)|none|url\(#|`url\(#)/);
    }
    const spent = tokens(MARKS).filter((t) => !STRUCTURAL.has(t));
    const allowed = new Set<string>([...DATA_COLOURS, 'hue']);
    const fifth = spent.filter((t) => !allowed.has(t));
    expect(fifth, `a fifth data colour reached a mark: ${fifth.join(', ')}`).toEqual([]);
  });

  it('lets identity nowhere near a drawing', () => {
    // `--hue` is the tile's own colour and belongs to the SHELL and to the
    // object panel under it. One use, on the panel's wrapper; a second would
    // mean a hue had got inside a mark.
    expect(tokens(MARKS).filter((t) => t === 'hue')).toHaveLength(0);
    expect(MARKS.match(/'--hue'/g) ?? []).toHaveLength(1);
    expect(MARKS).toMatch(/'--hue': hueFor\(label, dimension, kindOfRead\(p\.o\.tool\)\)[\s\S]{0,120}<ObjectPanel/);
  });

  it('is the only thing the mark stylesheet paints with either', () => {
    const spent = tokens(markCss()).filter((t) => !STRUCTURAL.has(t) && !t.startsWith('mk'));
    const fifth = spent.filter((t) => !(DATA_COLOURS as readonly string[]).includes(t));
    expect(fifth, `a fifth data colour reached the stylesheet: ${fifth.join(', ')}`).toEqual([]);
  });

  it('paints no literal colour anywhere in a mark', () => {
    // A hex, an rgb() with numbers in it, or a named colour is a value nobody
    // can trace to a direction the tool declared.
    expect(MARKS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(MARKS).not.toMatch(/rgba?\(\s*\d/);
    expect(markCss()).not.toMatch(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/);
  });

  it('does not reach for the one colour that means "needs you"', () => {
    // UI rule 5. A mark is never an approval, so `--accent` has no business
    // in one, and a caveat takes prominence from position, never from hue.
    expect(tokens(MARKS)).not.toContain('accent');
    expect(tokens(markCss())).not.toContain('accent');
  });
});

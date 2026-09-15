/**
 * FOUR DATA COLOURS INSIDE A MARK, AND A FIFTH FAILS HERE — AND SINCE P2.l THE
 * SHELL IS HELD TO THE SAME RULE INSTEAD OF BEING EXEMPTED FROM IT.
 *
 * The owner's second failure, in his own screenshots: seven shops in seven
 * hues, over rows whose labels already said which shop each one was. One
 * series, one measurement, and colour spent decoding nothing — the reference
 * calls it the most common way a chart misses its point. So inside a mark
 * colour is DIRECTION: `--up`, `--down`, `--flat`, and `--george` for the row
 * that matters in a read that declared no direction.
 *
 * WHAT THIS FILE USED TO SAY, in its own words: *"identity keeps its hue where
 * identity is the point — the tile's edge and wash, the object panel — and
 * never enters a drawing"*. The drawing half held. The EXEMPTION did not: the
 * tile's edge and wash are the biggest colour on the screen, on dark the wash
 * burnt at `--bloom: 0.62`, its brightness carried |change| as a second
 * meaning with no direction in it, and three of the seven shop hues sat on the
 * three semantic colours. He looked at the live build on 2026-09-15 and asked
 * *"what do the colors mean now? does this make sense?"* — the same complaint,
 * at the layer this test wrote the exemption for.
 *
 * So the exemption is gone. The tile is a frame; `--hue` reaches exactly one
 * rule, the one an OPENED object wears, where identity is the point and
 * nothing beside it competes. `accentUse.test.ts` holds that from the outside
 * — which file may name an identity at all — and this holds the stylesheet:
 * every rule that paints, and what it is allowed to paint with.
 *
 * WHY A SOURCE TEST RATHER THAN A REVIEW, and it is the same reason
 * `accentUse.test.ts` gives: a fifth colour arrives as one plausible line in
 * one component, feels justified at the time, and nobody sees the fourteenth
 * one coming. A test that reads the source makes adding one a visible edit
 * with a name on it.
 *
 * AND WHY THE STYLESHEET IS PARSED RATHER THAN SEARCHED: the lesson of
 * `keptChrome.test.ts`, 2026-09-15. A comment closed twice swallowed a
 * selector, the declarations were in the file and dead, and a string search
 * could not tell that apart from a rule that works.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { DATA_COLOURS } from './catalogue';

const MARKS = readFileSync(join(__dirname, 'marks.tsx'), 'utf8');
const SHELL = readFileSync(join(__dirname, 'tiles.tsx'), 'utf8');
const CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');
const SHEET = postcss.parse(CSS);

/**
 * Tokens that carry no data meaning: the ground a mark sits on, its ink, its
 * type. A drawing needs somewhere to be drawn; none of these says anything
 * about a value.
 */
const STRUCTURAL = new Set([
  'track', 'card', 'sunk', 'ground', 'paper', 'edge', 'edge-strong',
  'ink', 'ink-2', 'ink-3',
  'sans', 'mono', 'ease', 'radius', 'size', 'd',
]);
// `on-colour`, `on-colour-2` and `i` left this list with P2.l: the first two
// were the ink a FULLY COLOURED tile needed and there is no longer one, and
// `i` was the magnitude every tile burnt at.


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

  it('lets identity nowhere near a drawing, and nowhere but an opened object', () => {
    // `--hue` had two homes: the tile SHELL, and the panel under an opened
    // object. P2.l took the first away, so one use is left in this file and it
    // is the second — the wrapper that hands an opened object its own colour.
    // A second would mean a hue had got back onto a tile or into a mark.
    expect(tokens(MARKS).filter((t) => t === 'hue')).toHaveLength(0);
    expect(MARKS.match(/'--hue'/g) ?? []).toHaveLength(1);
    expect(MARKS).toMatch(/'--hue': hueFor\(label, dimension, kindOfRead\(p\.o\.tool\)\)[\s\S]{0,160}<ObjectPanel/);
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

  it('lets identity into exactly one rule, and it is not on a tile', () => {
    // Read as a browser reads it: every declaration in the sheet that PAINTS
    // with `--hue`, by the selector it applies to. One rule, and it is the one
    // an opened object wears — a panel about one named thing, with nothing
    // beside it. It was THIRTEEN rules before P2.l, eight of them a tile.
    const wearing: string[] = [];
    SHEET.walkRules((rule) => {
      rule.walkDecls((decl) => {
        if (/var\(\s*--hue\s*\)/.test(decl.value)) wearing.push(rule.selector.trim());
      });
    });
    expect([...new Set(wearing)]).toEqual(['.r-obj']);
  });

  it('draws no tile in the colour of the thing it is about', () => {
    // The shell, stated as itself. Every rule whose selector names a tile, and
    // nothing any of them paints with may be an identity or a magnitude.
    const spent: string[] = [];
    SHEET.walkRules((rule) => {
      if (!/\.r-tile\b/.test(rule.selector)) return;
      rule.walkDecls((decl) => {
        for (const token of tokens(decl.value)) spent.push(`${rule.selector.trim()} { ${token} }`);
      });
    });
    const identity = spent.filter((use) => /\b(hue|i|bloom|on-colour|on-colour-2)\b/.test(use));
    expect(identity, `a tile still paints with identity or magnitude: ${identity.join(', ')}`)
      .toEqual([]);
  });

  it('gives every tile the same black', () => {
    // HIS REPORT, twice on 2026-09-15: "why are there 2 different colors of
    // black here? a navy ish and a more greyish?", and then "look its still
    // different shades of black". A cooled tile drew on `--paper` — white at
    // 3% over the ground, `#121218` — beside a read tile's `#14141C`, so two
    // tiles in one row were two blacks. Near black, two units of 255 is a
    // tenth of the luminance; it is not a rounding error.
    //
    // A tile's ground is not a channel: cooled is said by no shadow and a
    // rule down the left. So every background any tile rule sets is `--card`,
    // and there is exactly one of them.
    const grounds: string[] = [];
    SHEET.walkRules((rule) => {
      if (!/\.r-tile\b/.test(rule.selector)) return;
      rule.walkDecls((decl) => {
        if (decl.prop === 'background' || decl.prop === 'background-color') {
          grounds.push(`${rule.selector.trim()} { ${decl.value.trim()} }`);
        }
      });
    });
    expect(grounds).toEqual(['.r-tile { var(--card) }']);
  });

  it('leaves no magnitude channel anywhere — it was dead before it was removed', () => {
    // `--i` was |change| against a 30% cap, drawn as a brightness with no
    // direction in it. P1.e deleted the last tile that passed a `change` to
    // `Shell` on 2026-09-14, so every tile burnt at 0 from that day, and the
    // dogfood log still described the brightness as a live meaning. Its
    // absence is the answer to the card's open question, and it is held here
    // so the channel cannot come back without an argument.
    const declared: string[] = [];
    const read: string[] = [];
    SHEET.walkDecls((decl) => {
      if (decl.prop === '--i' || decl.prop === '--bloom') declared.push(decl.prop);
      if (/var\(\s*--(i|bloom)\s*\)/.test(decl.value)) read.push(decl.value.trim());
    });
    expect(declared, 'the stylesheet still declares a magnitude').toEqual([]);
    expect(read, 'a rule still paints with a magnitude').toEqual([]);
    expect(SHELL).not.toMatch(/'--i'/);
    expect(SHELL).not.toMatch(/intensity/);
  });

  it('gives the shell no colour to be handed', () => {
    // `Shell` took a `hue` and a `change`; both are gone from its arguments,
    // so a caller has nothing to paint a tile with. The compiler enforces this
    // for callers in the repo; this states it for the reader.
    const signature = /export function Shell\(\{([^}]*)\}/.exec(SHELL);
    expect(signature, 'Shell has moved').toBeTruthy();
    const args = signature![1];
    expect(args).not.toContain('hue');
    expect(args).not.toContain('change');
    expect(args).not.toContain('solid');
  });

  it('does not reach for the one colour that means "needs you"', () => {
    // UI rule 5. A mark is never an approval, so `--accent` has no business
    // in one, and a caveat takes prominence from position, never from hue.
    expect(tokens(MARKS)).not.toContain('accent');
    expect(tokens(markCss())).not.toContain('accent');
  });
});

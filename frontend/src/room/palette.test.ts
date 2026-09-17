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
const PARTS = readFileSync(join(__dirname, 'markParts.tsx'), 'utf8');
const SHAPES = readFileSync(join(__dirname, 'shapes.tsx'), 'utf8');
const SHELL = readFileSync(join(__dirname, 'tiles.tsx'), 'utf8');
const CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');
const SHEET = postcss.parse(CSS);

/**
 * One rule's declarations, by selector, from the parsed stylesheet.
 *
 * Parsed rather than searched, for the reason the header gives: a comment
 * closed twice once swallowed a selector and a string search could not tell
 * that apart from a rule that works. The LAST matching rule wins, as the
 * cascade does, so a media query's override is what a caller sees when it
 * asks for one.
 */
function rule(selector: string): Record<string, string> | null {
  let found: Record<string, string> | null = null;
  SHEET.walkRules((r) => {
    // THE FIRST MATCH, WHICH IS THE BASE RULE — not the last, and not the
    // cascade folded together. A first draft of this merged every matching
    // rule, so `.r-mk-row` resolved to the phone override inside a media query
    // and the assertion passed against the very defect it was written for.
    // The base rule is the one that draws the screen he was looking at.
    if (found === null && r.selectors.includes(selector)) {
      const decls: Record<string, string> = {};
      r.walkDecls((d) => { decls[d.prop] = d.value; });
      found = decls;
    }
  });
  return found;
}


/**
 * Tokens that carry no data meaning: the ground a mark sits on, its ink, its
 * type. A drawing needs somewhere to be drawn; none of these says anything
 * about a value.
 */
const STRUCTURAL = new Set([
  'track', 'card', 'sunk', 'raise', 'ground', 'paper', 'edge', 'edge-strong',
  'ink', 'ink-2', 'ink-3', 'ink-4',
  // The design's serif (P2S.1(a)): George's voice, and a face is not a colour.
  'sans', 'mono', 'serif', 'ease', 'radius', 'size', 'd',
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
    // Moved to markParts.tsx by P2S.3, beside `wash` — the same colour at a
    // strength, for parts of a whole and a cell's brightness.
    expect(PARTS).toMatch(/function paint\(c: DataColour\): string \{\s*\n\s*return `rgb\(var\(--\$\{c\}\)\)`;/);
    expect(PARTS).toMatch(/function wash\(c: DataColour, strength: number\): string \{\s*\n\s*return `rgba\(var\(--\$\{c\}\), /);
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
    // object. P2.l took the first away, so every use left in this file is the
    // second kind — a wrapper handing an opened object its own colour. One
    // anywhere else would mean a hue had got back onto a tile or into a mark.
    //
    // COUNTED AGAINST THE PANELS, not against 1 (P2.d, 2026-09-15). There are
    // two openings now: the tile's own subject, and the row an offer opened,
    // which are different subjects and must not be drawn as each other. The
    // rule was never "one hue in the file" — it was "a hue only where an
    // object is opened" — so that is what is asserted, and a hue with no
    // ObjectPanel after it still fails.
    expect(tokens(MARKS).filter((t) => t === 'hue')).toHaveLength(0);
    const hues = MARKS.match(/'--hue'/g) ?? [];
    const panels = MARKS.match(/<ObjectPanel/g) ?? [];
    expect(hues.length, 'a --hue that opens no object').toBe(panels.length);
    expect(hues.length).toBeGreaterThan(0);
    for (const m of MARKS.matchAll(/'--hue': (.*)/g)) {
      expect(m[1], 'a hue not from hueFor').toMatch(/^hueFor\(/);
    }
    // And every one of them is the wrapper immediately above a panel.
    expect(MARKS.match(/'--hue': hueFor\([\s\S]{0,200}?<ObjectPanel/g) ?? [])
      .toHaveLength(panels.length);
  });

  it('is the only thing the eleven shapes paint with (P2S.3)', () => {
    // Every colour a new shape paints is `paint` or `wash` of a DataColour —
    // directly, through the two helpers that take one (`step`, `glow`), or the
    // `c` a line took from `paint` — or the ground and ink a drawing sits on.
    const painted = [...SHAPES.matchAll(/(?:background|borderColor|stroke|fill)[:=]\s*([^,\n}]+)/g)]
      // The value only — not the next JSX attribute on the same line.
      .map((m) => m[1].trim().replace(/["'{}]/g, '').replace(/\s+([a-zA-Z-]+=.*|\/>.*|>.*)$/, ''));
    expect(painted.length).toBeGreaterThan(10);
    for (const value of painted) {
      expect(value, `${value} is a colour no value chose`).toMatch(
        /^(paint\(|wash\(|step\(|glow\(|c$|none( stroke=c)?$|r \? glow\(|var\(--(ground|ink|track|edge-strong)\)$|b\.i < 2 \? var\(--ground\))/);
    }
    const spent = tokens(SHAPES).filter((t) => !STRUCTURAL.has(t) && !t.startsWith('mk'));
    expect(spent, `a data colour named outside paint/wash: ${spent.join(', ')}`).toEqual([]);
    expect(SHAPES).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SHAPES).not.toMatch(/rgba?\(\s*\d/);
    expect(SHAPES).not.toMatch(/--sw|--hue/);
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

  it("lets a store's slot paint the swatch and nothing else (P2S.2(e))", () => {
    // Identity came back on ONE channel: the dot before a name. Every rule
    // that paints with `--sw` or a slot, by selector — and each of them must be
    // the swatch. A slot reaching a segment, a bar or a line would put the
    // store's colour where the owner asked for the verdict.
    const wearing: string[] = [];
    SHEET.walkRules((r) => {
      r.walkDecls((decl) => {
        if (/^--c-\d$/.test(decl.prop)) return; // the tokens themselves
        if (/var\(\s*--(sw-dark|sw-light|ring|c-\d)\s*\)/.test(decl.value)) wearing.push(r.selector.trim());
      });
    });
    expect(wearing.length).toBeGreaterThan(0);
    for (const selector of new Set(wearing)) expect(selector).toMatch(/\.r-sw$/);
    expect(MARKS).not.toMatch(/--c-\d|'--sw'/);
  });

  it('declares eight slots in every theme, and no ninth', () => {
    const declared = new Map<string, number>();
    SHEET.walkDecls((decl) => {
      if (!/^--c-\d+$/.test(decl.prop)) return;
      const scope = (decl.parent as { selector?: string }).selector ?? '';
      declared.set(scope, (declared.get(scope) ?? 0) + 1);
    });
    expect([...declared.values()]).toEqual([8, 8, 8]);
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
    // P2S.1(c): a figure has NO ground at all — no box — and the one tile that
    // keeps one (a draft, a thing you act on) keeps the one black.
    expect(grounds).toEqual(['.r-tile { none }', '.r-tile--boxed { var(--card) }']);
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

/**
 * THE ROW LABEL COLUMN, HELD AGAINST THE LABELS IT ACTUALLY DRAWS.
 *
 * His report, 2026-09-15: *"the product name are cut"*. The column was
 * `minmax(6ch, 13ch)`, and 13ch was measured — correctly — against the nine
 * SHOPS, the longest of which is "Greenhills" at 10ch. Then the same grid met
 * the catalogue, where the median name is 22 characters and **13ch fits 6.8%
 * of 3,728 products**.
 *
 * This is the second bound in one evening that was reasoned against the wrong
 * population (the `@` menu refused a space, and 99.8% of product names have
 * one). So the rule is held here rather than remembered: the column may not go
 * back to a fixed character cap, because a fixed one is always right for one
 * population and wrong for the next.
 */
describe('the row label column', () => {
  // THE TRACK LIST IS THE MARK'S, and every row takes it by subgrid (the log,
  // 2026-09-17: "why are these bars diiferent size depending on the size of the
  // name?"). A per-row list sized each row's name column to its own name.
  const ROW = rule('.r-mk-dumbbells');
  const SCALE = rule('.r-mk-scale');

  it('gives every row and the scale the MARK\'s columns, so every bar starts in one place', () => {
    for (const mark of ['.r-mk-dumbbells', '.r-mk-ranked', '.r-mk-contributors']) {
      expect(rule(mark)?.['grid-template-columns'], mark).toBe(ROW?.['grid-template-columns']);
    }
    expect(rule('.r-mk-row')?.['grid-template-columns']).toBe('subgrid');
    expect(rule('.r-mk-row')?.['grid-column']).toBe('1 / -1');
    expect(SCALE?.['grid-template-columns']).toBe('subgrid');
  });

  it('sizes itself to the label rather than to a fixed number of characters', () => {
    const tracks = ROW?.['grid-template-columns'] ?? '';
    expect(tracks).toContain('fit-content');
    // A FIXED CAP IS THE DEFECT, by name. `minmax(6ch, 13ch)` fitted nine
    // shops and cut 3,473 of 3,728 products.
    expect(tracks).not.toMatch(/minmax\(\s*\d+ch\s*,\s*\d+ch\s*\)/);
  });

  it('keeps the figure column fixed, because a figure is read in one place', () => {
    // Only the NAME gives way. The track stays `1fr` and the figure stays a
    // fixed minimum, so the eye finds the number in the same place on every
    // mark. Asserted as a SHAPE rather than as exact widths, because the
    // phone rule tightens both and `rule()` folds the cascade the way a
    // browser does.
    expect(ROW?.['grid-template-columns'] ?? '')
      .toMatch(/^fit-content\(\d+%\)\s+1fr\s+minmax\(\s*\d+ch\s*,\s*auto\s*\)$/);
  });

  it('draws the scale on the very same track list as the rows', () => {
    // A scale whose ends do not sit under the track's ends is a ruler
    // measuring something else — both take the mark's columns.
    expect(SCALE?.['grid-template-columns']).toBe(rule('.r-mk-row')?.['grid-template-columns']);
  });

  it('wraps to two lines before it cuts a name (the log, 2026-09-17)', () => {
    // "some charts are still getting cut": one line and an ellipsis cut
    // "P4 kiamoy strips" to "P4 kiamoy s…". Two lines, then clipped.
    const name = rule('.r-mk-name-text');
    expect(name?.['white-space']).toBe('normal');
    expect(name?.['-webkit-line-clamp']).toBe('2');
    expect(name?.['text-overflow']).toBeUndefined();
    // And the box that clamps is NOT the box the dot sits in (the log,
    // 2026-09-17: "these things keep getting slightly cut").
    expect(rule('.r-mk-name')?.overflow).toBeUndefined();
  });
});

/**
 * THE EIGHT SLOTS ARE THE ONES THAT WERE VALIDATED (P2S.2(e)).
 *
 * `ops/palette/REPORT.md` records the dataviz validator run on the room's two
 * grounds, with the exact hex list each run checked. A slot edited in the
 * stylesheet without re-running it would be a palette nobody validated.
 */
describe('the identity palette', () => {
  const REPORT = readFileSync(join(__dirname, '..', '..', '..', 'ops', 'palette', 'REPORT.md'), 'utf8');
  const validated = (mode: string) => {
    const m = new RegExp(`validate_palette\.js "([^"]+)" --mode ${mode}`).exec(REPORT);
    return (m?.[1] ?? '').split(',').map((h) => h.toLowerCase());
  };
  const declared = (selectorTest: (s: string) => boolean) => {
    const out: string[] = [];
    SHEET.walkRules((r) => {
      if (!selectorTest(r.selector)) return;
      r.walkDecls((d) => { if (/^--c-\d$/.test(d.prop)) out.push(d.value.toLowerCase()); });
    });
    return out;
  };

  it('declares on the dark ground exactly the eight validated for it', () => {
    expect(validated('dark')).toHaveLength(8);
    expect(declared((s) => s.trim() === '.room')).toEqual(validated('dark'));
  });

  it('declares in both light scopes exactly the eight validated for paper', () => {
    expect(validated('light')).toHaveLength(8);
    expect(declared((s) => /data-room-theme/.test(s))).toEqual([...validated('light'), ...validated('light')]);
  });
});

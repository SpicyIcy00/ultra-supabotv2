/**
 * THE PAGE IS CENTRED, AND NOTHING IS CUT OFF.
 *
 * Two things the owner reported in one sentence on 2026-09-14, on his first
 * sitting with the six marks: *"should i be able to scroll down on this? and
 * at 100% size theres lots of empty space on the right and its not centered"*.
 * Both were true, and they were three faults between them.
 *
 * They are held by reading the stylesheet, for the reason `accentUse.test.ts`
 * and `palette.test.ts` give: jsdom does no layout, so a dom test can prove
 * the ATTRIBUTES are there and nothing about what they produce. The rules
 * themselves are what regressed and they are what is asserted. A rule that
 * moves has to move here too, which is the point — each of these was a single
 * plausible line, and nobody saw any of them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');
const RENDER = readFileSync(join(__dirname, 'render.tsx'), 'utf8');

/** The declarations inside one selector's block. */
function rule(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

describe('the page is centred on one measure', () => {
  it('has a measure, and it is set on the room rather than per region', () => {
    expect(rule('.room')).toContain('--measure:');
  });

  it('centres the main column in the space beside the rail', () => {
    const measure = rule('.r-measure');
    expect(measure).toContain('max-width: var(--measure)');
    expect(measure).toContain('margin-inline: auto');
    // The rail is PADDING, not margin: a margin cannot be centred around,
    // and `margin-left: 56px` is what it was before this.
    expect(rule('.r-main')).toContain('padding-left: calc(56px');
    expect(rule('.r-main')).not.toMatch(/margin-left:\s*56px/);
  });

  it('wraps the page and the composer in the SAME element, not two rules', () => {
    // Both used to cap themselves, one of them centred, and that divergence
    // is what the report was looking at.
    //
    // TWO FILES SINCE P2.c, one claim. The composer became a component of its
    // own when the `@` menu needed a test to mount, so the page's wrapper is
    // in Room.tsx and the composer's is in Composer.tsx — the same class,
    // which is what the rule was ever about. Counted across both, because
    // counting one would say the composer had stopped sharing the axis.
    const room = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');
    const composer = readFileSync(join(__dirname, 'Composer.tsx'), 'utf8');
    expect((room + composer).match(/className="r-measure"/g) ?? []).toHaveLength(2);
    expect(room).not.toContain('maxWidth: 1320');
    expect(composer).not.toContain('maxWidth: 1320');
  });

  it('puts the composer on the same measure, so the two share an axis', () => {
    // The composer already centred itself when the page did not, which is
    // exactly what "it's not centered" looked like.
    expect(rule('.r-line')).toContain('max-width: var(--measure)');
  });

  it('never sizes the page from how many objects are on the board', () => {
    // THE DEFECT THIS REPLACES, reported three times. `--measure` was set from
    // `data-rest` — 680px for a board of one or fewer under the lead — so the
    // chrome, the reading and the composer were a function of the answer. The
    // assertion is the absence: no rule anywhere may set the measure from a
    // count.
    const sets = CSS.split(/\r?\n/).filter((l) => /--measure\s*:/.test(l));
    for (const line of sets) {
      expect(line, `the measure is set from a count: ${line.trim()}`)
        .not.toMatch(/data-rest|data-board/);
    }
    expect(rule('.room')).toContain('--measure: 1320px');
    // And no `:has()` rule may reintroduce it by another route.
    expect(CSS).not.toMatch(/\.room:has\([^)]*data-(rest|board)[^)]*\)\s*\{[^}]*--measure/);
  });

  /*
   * THE NUMBERS THE RULES PRODUCE, not the text of the rules.
   *
   * Every test above this reads the stylesheet as a string, for the reason the
   * file header gives: jsdom does no layout. That is also why three reports in
   * a row got past 1,284 tests — a string match cannot see that 680px in a
   * 1,863px window leaves 56% of the screen black. There is no browser in this
   * toolchain to ask, so the arithmetic is done here instead, from the same
   * two rules the browser would use.
   */
  function occupied(viewport: number): number {
    // THE NARROWEST WIDTH ANY RULE CAN SET, not the default on `.room`.
    // Reading only the default is how this check would have passed on the
    // stylesheet that produced the report: `.room` said 1320px and a `:has()`
    // override three hundred lines below said 680px, and the page he was
    // looking at got the 680.
    const all = [...CSS.matchAll(/--measure:\s*(\d+)px/g)].map((m) => parseInt(m[1], 10));
    expect(all.length, 'no --measure is set in px anywhere').toBeGreaterThan(0);
    const measure = Math.min(...all);
    // `.r-main` padding: clamp(18px, 3vw, 40px), and the rail is 56px of it.
    const pad = Math.min(40, Math.max(18, viewport * 0.03));
    const available = viewport - (56 + pad) - pad;
    return Math.min(measure, available) / viewport;
  }

  it('fills the window it is given, at the sizes he actually uses', () => {
    // 1,863px is his own window, measured off the 2026-09-16 screenshot; the
    // rule then in force gave the page 680px of it. Anything under this floor
    // is the strip he reported, whatever the rules say in words.
    for (const viewport of [1440, 1663, 1863, 1920]) {
      expect(occupied(viewport), `${viewport}px window`).toBeGreaterThan(0.65);
    }
    // The strip itself, so the floor is known to be able to fail: 680 in 1863.
    expect(680 / 1863).toBeLessThan(0.65);
  });

  it('gives the same frame to every screen in the room', () => {
    // "why is the side gaps different from other pages" — 2026-09-16. The list
    // screens had `--measure-list`, 200px narrower, so walking between two
    // screens moved the frame.
    expect(rule('.r-column')).toContain('max-width: var(--measure)');
    // Declared nowhere and read nowhere. The NAME still appears, in the
    // comment recording why it went, and a test that banned the word would
    // ban the history with it.
    expect(CSS).not.toMatch(/--measure-list\s*:/);
    expect(CSS).not.toMatch(/var\(--measure-list\)/);
  });

  it('puts two objects side by side rather than stacking two regions', () => {
    // The half the measure does not touch: what LEADS and what PACKS are two
    // containers, so a board of two was vertical at any width. With one thing
    // in the pack they are a row — and both containers survive, because
    // `drag.ts` decides lead-or-rest by which one the pointer is over.
    const row = /\.r-board\[data-rest="1"\]:has\(\.r-board-lead\)\s*\{([^}]*)\}/.exec(CSS);
    expect(row, 'no two-region row rule').toBeTruthy();
    expect(row![1]).toMatch(/grid-template-columns:\s*1fr 1fr/);
    expect(row![1]).toMatch(/align-items:\s*start/);
    expect(RENDER).toContain('r-board-lead');
    // ONE object George did not weight `lead` is ALSO data-rest="1", and a
    // lone tile in a two-column row is the empty right half he reported on
    // 09-14. The row is conditioned on both regions existing, and that single
    // tile is capped and centred instead.
    expect(CSS).toMatch(/\.r-board\[data-rest="1"\]:not\(:has\(\.r-board-lead\)\) \.r-board-rest \{[^}]*max-width/);
    // UI rule 7: not on a phone.
    expect(CSS).toMatch(/max-width: 900px\)\s*\{\s*\.r-board\[data-rest="1"\]:has\(\.r-board-lead\)\s*\{ grid-template-columns: 1fr/);
  });

  it('caps a lone tile on the region, never on the frame', () => {
    // The natural width of one object is a fact about the object. Putting it
    // on the page is what narrowed the composer and the chrome with it.
    expect(CSS).toMatch(/\.r-board\[data-rest="0"\] \.r-board-lead \{[^}]*max-width/);
  });

  it('never leaves more columns than there are things to put in them', () => {
    expect(CSS).toContain('.r-board[data-rest="1"] .r-board-rest { columns: 1; }');
    expect(CSS).toMatch(/\.r-board\[data-rest="2"\] \.r-board-rest,\s*\n\.r-board\[data-rest="3"\] \.r-board-rest \{ columns: 2 340px; \}/);
  });

  it('still collapses to one column on a phone, whatever the count says', () => {
    // UI rule 7. The count-based rules are more specific than the media
    // query, so the phone rule has to name them or it loses.
    expect(CSS).toContain('.r-board-rest, .r-board[data-rest] .r-board-rest { columns: 1; }');
  });

  it('tells the page how many objects are packed below the lead', () => {
    expect(RENDER).toContain('data-rest={rest.length}');
  });
});

describe('a long body scrolls inside its tile', () => {
  it('lets exactly ONE child shrink, and it is the mark body', () => {
    // THE BUG THIS HOLDS, and it lasted an hour. `min-height: 0` is what lets
    // a flex child shrink below its content, and the scrolling body needs it.
    // It was put on EVERY child of the tile, so a caveat — a block of text
    // with nowhere to scroll — shrank too, and its words ran over the title
    // underneath. Every child holds its size; the body says otherwise itself.
    expect(rule('.r-tile > *')).toContain('flex: 0 0 auto');
    expect(rule('.r-tile > *')).not.toContain('min-height: 0');
    expect(rule('.r-tile')).toContain('overflow: hidden');
    expect(rule('.r-tile')).toContain('max-height: 560px');
  });

  it('scrolls the mark and never the title, the subtitle or the source line', () => {
    const body = rule('.r-tile > .r-mk-body');
    expect(body).toContain('overflow-y: auto');
    expect(body).toContain('min-height: 0');
    expect(body).toContain('flex: 1 1 auto');
    // Named with the tile so it beats `.r-tile > *` on specificity rather than
    // on which of them happens to come later in the file.
    expect(CSS.indexOf('.r-tile > .r-mk-body')).toBeGreaterThan(-1);
  });

  it('draws a scrollbar you can see on the body as well as on a table', () => {
    expect(CSS).toContain('.r-scroll::-webkit-scrollbar, .r-mk-body::-webkit-scrollbar');
  });
});

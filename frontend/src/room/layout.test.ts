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
    const room = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');
    expect(room.match(/className="r-measure"/g) ?? []).toHaveLength(2);
    expect(room).not.toContain('maxWidth: 1320');
  });

  it('puts the composer on the same measure, so the two share an axis', () => {
    // The composer already centred itself when the page did not, which is
    // exactly what "it's not centered" looked like.
    expect(rule('.r-line')).toContain('max-width: var(--measure)');
  });

  it('narrows the measure when there is little on the board', () => {
    for (const rest of ['1', '2', '3']) {
      expect(CSS, `no measure for a board of ${rest}`)
        .toContain(`.room:has(.r-board[data-rest="${rest}"])`);
    }
    // And the default is the wide one, so a browser without :has() is still
    // centred — which is the half that matters.
    expect(rule('.room')).toContain('--measure: 1320px');
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

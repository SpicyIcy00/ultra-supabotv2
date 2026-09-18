/**
 * HIS WORDS ARE NEVER GREY, AND NOTHING IS LOWERED TO LIGHT SOMETHING ELSE.
 *
 * The owner, 2026-09-18, of a chart's thought, a caveat and the words under
 * him: *"i dont like how alot of text is grey if it says something in a chart
 * it should already be white just use other methods to emphasize things you
 * want to dont lower others like maybe color to hightlight it just dont
 * desaturate or lower other things to emphsize something else"*.
 *
 * Held here: every class Bob's prose is drawn in uses the full ink; no row,
 * figure or tile is drawn at reduced opacity for being the one he did not point
 * at; and the one he did point at gains weight and a ringed swatch, never a
 * band behind it (tried and refused the same day).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { COOL } from './markParts';

const CSS = postcss.parse(readFileSync(join(__dirname, 'room.css'), 'utf8'));
const SPEC = readFileSync(join(__dirname, 'Spec.tsx'), 'utf8');
const MARKS = readFileSync(join(__dirname, 'marks.tsx'), 'utf8');
const TILES = readFileSync(join(__dirname, 'tiles.tsx'), 'utf8');

/** The declaration of a top-level rule (not inside a media query). */
function top(selector: string, prop: string): string | undefined {
  let found: string | undefined;
  CSS.each((node) => {
    if (node.type !== 'rule' || node.selector !== selector) return;
    node.walkDecls(prop, (d) => { found = d.value; });
  });
  return found;
}

describe('everything Bob says is drawn in the full ink', () => {
  const HIS = [
    '.r-say',                 // a chart's placed sentence, and the page's own lines
    '.r-say--claim',          // the headline
    '.r-say--standing',       // the rest of what he said, under him
    '.r-caveat',              // his caveat
    '.r-next',                // what he'd do next
    '.r-mk-title',            // a chart's title
    '.r-mk-thought',          // a chart's thought
    '.r-doing-said',          // what he says while he works
    '.r-asked-q',             // the question, in the person's words
  ];
  for (const selector of HIS) {
    it(`${selector} is --ink`, () => {
      expect(top(selector, 'color'), `${selector}'s colour`).toBe('var(--ink)');
    });
  }

  it('a figure no read holds takes the ink of the sentence it is in', () => {
    expect(top('.r-figure-bare', 'color')).toBe('inherit');
  });
});

describe('nothing is lowered to light something else', () => {
  it('a row he did not point at is drawn at full strength', () => {
    expect(COOL).toBe(1);
    expect(SPEC).not.toMatch(/litness/);
    expect(MARKS).not.toMatch(/isLit\(o, row\) \? 1 : COOL/);
    expect(TILES).not.toMatch(/opacity: isLit/);
  });

  it('a ruled-out figure and a quiet tile are not dimmed', () => {
    expect(top('.r-fig--out', 'opacity')).toBe('1');
    expect(top('.r-tile--quiet', 'opacity')).toBe('1');
  });

  it('the row he pointed at gains weight and a ring, and no band behind it', () => {
    // A band was tried and refused the same day: "wtf happend here dont do that".
    const banded: string[] = [];
    CSS.walkRules((rule) => {
      if (!rule.selector.includes('[data-lit="yes"]')) return;
      rule.walkDecls(/^(background|box-shadow)$/, (d) => {
        if (!rule.selector.includes('.r-sw')) banded.push(`${rule.selector} { ${d.prop}: ${d.value} }`);
      });
    });
    expect(banded).toEqual([]);
    expect(top('.r-mk-row[data-lit="yes"] .r-mk-name', 'font-weight')).toBe('600');
    expect(top('tr[data-lit="yes"] td', 'font-weight')).toBe('600');
  });
});

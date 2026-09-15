/**
 * THE KEPT PAGE IS READ IN THIS ROOM'S LIGHT — reported 2026-09-15.
 *
 *   > saved pages look really weird i think theyre broken using old ui elemets
 *
 * He was right about the cause. `/pages/:id` renders `PinnedPage` and the tree
 * under it — `PinTile`, `ResultBlocks`, `Instruments`, `ReceiptsBlock` — and
 * every colour in that tree comes from SIX `george-*` chrome tokens that
 * described one surface: a cream page with navy text. The three LIST screens
 * (Kept, Needs you, Running) were converted to room classes on 2026-09-12; the
 * page a person opens FROM Kept was not, and nothing said so. Inside the room's
 * dark chrome that is navy on near-black and white receipt pills.
 *
 * Two things are held here, and neither is a look:
 *
 *   1. THE SIX ARE VARIABLES, AND EVERY ONE APPLIES IN EVERY THEME. A token
 *      defined in one theme and not the other is the failure room.css already
 *      names for its own palette; these now live under the same rule. A hex
 *      written back into the config is a token that cannot follow a theme
 *      again, and that is the whole defect returning.
 *   2. THE RECEIPTS LINE SAYS THE DEFINITIONS' WORDS ONCE. Every
 *      `comparisons.*.display_name` already begins with "vs", so prefixing one
 *      produced "vs vs previous period" — in his screenshot, on the live build.
 *      `room/catalogue.ts` fixed this on 09-14 and the older copy in
 *      `receiptShape.ts` never heard; both are checked, so a third copy has
 *      somewhere to be added and a fixed one cannot regress alone.
 *
 * WHAT THIS DOES NOT CLAIM. Legibility is not the redesign. Those components
 * are still the pre-P1.e widgets — fourteen shapes where the room draws six —
 * and drawing a kept page with the room's own marks is a card.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

import { subtitleFor } from './catalogue';
import { scopeLine } from '../components/george/receiptShape';
import type { ToolMeta } from '../types/george';

const ROOT = join(__dirname, '..', '..');
const CONFIG = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8');

/**
 * THE STYLESHEET AS A BROWSER READS IT, NEVER AS TEXT — and this is the lesson
 * of 2026-09-15 rather than a preference.
 *
 * The first version of this file asserted `ROOM_CSS.toContain('--g-navy:')`. It
 * passed, and the room was still unreadable: the comment above the block had
 * been closed twice, so three lines of prose ending in a second close marker
 * were parsed as part of the SELECTOR — `body reported that ... in one commit.
 * <close> .room` — which matches nothing. The declarations were in the file, in
 * the bundle, and dead. A string search cannot tell that apart from a rule that
 * works; a parser only ever sees what actually applies.
 *
 * He asked "are you sure you fixed it?" and the honest answer was no.
 */
const ROOM = postcss.parse(readFileSync(join(__dirname, 'room.css'), 'utf8'));
const INDEX = postcss.parse(readFileSync(join(ROOT, 'src', 'index.css'), 'utf8'));

/** The declarations of the rule with this exact selector, or null if there is none. */
function ruleFor(root: postcss.Root, selector: string): Record<string, string> | null {
  let found: Record<string, string> | null = null;
  root.walkRules((rule) => {
    if (rule.selector.trim() !== selector) return;
    found = {};
    rule.walkDecls((decl) => { found![decl.prop] = decl.value.trim(); });
  });
  return found;
}

/** Every declaration a rule with EXACTLY this selector makes, custom or not. */
function declsOn(root: postcss.Root, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  root.walkRules((rule) => {
    if (rule.selector.trim() !== selector) return;
    rule.walkDecls((decl) => { out[decl.prop] = decl.value.trim(); });
  });
  return out;
}

/** Every `--g-*` a rule with EXACTLY this selector declares, and its value. */
function valuesOn(root: postcss.Root, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  root.walkRules((rule) => {
    if (rule.selector.trim() !== selector) return;
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--g-')) out[decl.prop] = decl.value.trim();
    });
  });
  return out;
}

const DARK = '.room';
const LIGHT = ':root[data-room-theme="light"] .room';

/** The chrome tokens every `george-*` component paints with. Not the accent. */
const CHROME = ['cream', 'paper', 'line', 'navy', 'slate', 'muted'] as const;

describe('the six chrome tokens the old components paint with', () => {
  it.each(CHROME)('%s is a variable in the config, never a hex', (name) => {
    const declared = new RegExp(`\\b${name}:\\s*'([^']+)'`).exec(CONFIG);
    expect(declared, `george.${name} is not declared in tailwind.config.js`).toBeTruthy();
    // The alpha form matters as much as the variable: `bg-george-line/40` is
    // written in these components, and a bare `var(--x)` silently drops the
    // modifier rather than failing.
    expect(declared![1]).toBe(`rgb(var(--g-${name}) / <alpha-value>)`);
  });

  it.each(CHROME)('%s applies outside the room, and in each theme inside it', (name) => {
    const token = `--g-${name}`;
    // Outside the room — a surface still on cream keeps the hexes it had.
    expect(Object.keys(valuesOn(INDEX, ':root')), `${token} does not apply globally`)
      .toContain(token);
    // Inside it, dark and light both.
    expect(Object.keys(valuesOn(ROOM, DARK)), `${token} does not apply in the dark room`)
      .toContain(token);
    expect(Object.keys(valuesOn(ROOM, LIGHT)), `${token} does not apply in the light room`)
      .toContain(token);
  });

  it('leaves the light room on the exact values it always had', () => {
    // The light room was never the broken one. Changing it in the same edit
    // would be a second change nobody reported and nobody has seen.
    expect(valuesOn(ROOM, LIGHT)).toMatchObject({
      '--g-cream': '251 247 239', '--g-paper': '255 253 248', '--g-line': '228 220 203',
      '--g-navy': '18 35 63', '--g-slate': '74 93 120', '--g-muted': '132 150 172',
    });
  });

  it('gives the dark room its own ink, because they are two grounds', () => {
    // The whole report in one assertion: navy on near-black is what "weird"
    // was, and it is what a dark room sharing the light room's ink would be.
    const dark = valuesOn(ROOM, DARK);
    const light = valuesOn(ROOM, LIGHT);
    for (const name of CHROME) {
      expect(dark[`--g-${name}`],
             `--g-${name} is the same in both rooms, so one of them is unreadable`)
        .not.toBe(light[`--g-${name}`]);
    }
  });

  it('has no rule anywhere whose selector swallowed a comment', () => {
    // The 2026-09-15 defect in general form, over the whole stylesheet: a
    // comment closed twice leaves prose at the top level, and everything up to
    // the next brace becomes the selector of the rule after it.
    const swallowed: string[] = [];
    ROOM.walkRules((rule) => {
      if (rule.selector.includes('*/') || /[.:#[\w-]*\s{2,}\w/.test(rule.selector)) {
        swallowed.push(rule.selector.slice(0, 90));
      }
    });
    expect(swallowed, 'these selectors have prose in them and match nothing').toEqual([]);
  });

  it("sets the old headings in this room's own face, not a serif", () => {
    // "its a different font" — 2026-09-15. The room has no serif at all: its
    // headings and its figures are both `--sans`, and a kept page in Georgia
    // was a different app on the same screen.
    expect(CONFIG).toContain("'george-serif': 'var(--g-serif)'");
    expect(valuesOn(ROOM, DARK)['--g-serif']).toBe('var(--sans)');
    // Outside the room it is the exact stack it always was.
    expect(valuesOn(INDEX, ':root')['--g-serif']).toContain('Georgia');
  });

  it("fills a ranking's bar with a mark colour and not with the ink", () => {
    // A bar painted in `navy` — the PRIMARY TEXT colour — is near-white on this
    // ground, which is what the second screenshot showed. Ink is for words.
    const bars = readFileSync(join(ROOT, 'src', 'components', 'george', 'Instruments.tsx'), 'utf8');
    expect(bars).not.toContain('rounded-r-[4px] bg-george-navy');
    expect(bars).toContain('rounded-r-[4px] bg-george-bar');
    expect(valuesOn(ROOM, DARK)['--g-bar']).toBe('var(--flat)');
  });

  it('centres the column the other three screens are drawn in', () => {
    // "its not centered" — 2026-09-15. `.r-measure` has carried this since the
    // room existed; `.r-column`, which Kept, Needs you and Running are drawn
    // in, never did, so all three sat against the left edge.
    // The WIDTH is the next test's subject; this one is only about whether the
    // column is in the middle of the screen or against its left edge.
    expect(declsOn(ROOM, '.r-column')['margin-inline'], 'the column is not centred')
      .toBe('auto');
  });

  it('gives the list screens a measure of their own, wider than 820px', () => {
    // "dont you think the center is too small?" — 2026-09-15. Its own token
    // rather than the board's, because a grid of tiles and a list of rows are
    // two kinds of content; both named in room.css so neither is a number
    // somebody once typed into a rule.
    expect(declsOn(ROOM, '.r-column')['max-width']).toBe('var(--measure-list)');
    const measure = declsOn(ROOM, '.room')['--measure-list'];
    expect(measure, '--measure-list is not defined on the room').toBeTruthy();
    expect(parseInt(measure, 10)).toBeGreaterThan(820);
  });

  it('does not put a list of question names on a prose measure', () => {
    // Widening the column alone would have done nothing visible: every
    // paragraph on these screens is `.r-note`, capped at 62ch, so a wider
    // column moves prose left rather than stretching it. The one line that is
    // a LIST and not a sentence is what uses the width.
    const kept = readFileSync(join(ROOT, 'src', 'pages', 'PagesPage.tsx'), 'utf8');
    expect(kept).toContain('className="r-item-of"');
    expect(Object.keys(declsOn(ROOM, '.r-item-of'))).not.toContain('max-width');
    // And prose keeps its own, here and in the reading. Running an answer the
    // full width of a 1900px screen is what a measure exists to prevent.
    expect(declsOn(ROOM, '.r-note')['max-width']).toBe('62ch');
    expect(declsOn(ROOM, '.r-say--reading')['max-width']).toBe('66ch');
  });

  it('does not size a page with no board as though it had a small one', () => {
    // "it didnt change for the [t]alking page" — 2026-09-15. `data-rest="0"`
    // is true both of a lead tile with nothing under it and of no board at
    // all, and only the first is a board being sized. A turn that read nothing
    // was getting the narrowest page in the room.
    const empty = ruleFor(ROOM, '.room:has(.r-board[data-board="0"])');
    expect(empty, 'a boardless page has no measure of its own').toBeTruthy();
    expect(empty!['--measure']).toBe('var(--measure-list)');
    // And it has to come AFTER the data-rest rules, which have the same
    // specificity: source order is what decides between them.
    const at = (sel: string) => ROOM.index(
      ROOM.nodes.find((n) => n.type === 'rule' && (n as postcss.Rule).selector.includes(sel))!);
    expect(at('data-board="0"')).toBeGreaterThan(at('data-rest="3"'));
  });

  it('leaves the reading on its own measure whatever the page does', () => {
    // The page got wider; his words did not. 66ch is prose, decided in P1.c,
    // and no page width may run an answer across a 1900px screen.
    expect(declsOn(ROOM, '.r-say--reading')['max-width']).toBe('66ch');
  });

  it('keeps the reserved colour out of this entirely', () => {
    // UI rule 5: one colour means "needs you", one value, whichever chrome and
    // whichever theme. It is not a chrome token and does not follow a ground.
    expect(CONFIG).toContain("accent: '#D2691E'");
  });
});

/* --------------------------------------------------------------- the words */

const COMPARED: ToolMeta = {
  metric_label: 'Net sales',
  window: { kind: 'preset', name: 'last_week' },
  comparison: { display_name: 'vs previous period', baseline: { start: '2026-09-01', end: '2026-09-08' } },
} as unknown as ToolMeta;

describe('what a figure was measured against, said once', () => {
  it('does not say it twice on a kept page', () => {
    const line = scopeLine(COMPARED);
    expect(line).toContain('vs previous period');
    expect(line).not.toContain('vs vs');
  });

  it('does not say it twice on the board either', () => {
    const line = subtitleFor(COMPARED, [{ value: 1 }]);
    expect(line).toContain('vs previous period');
    expect(line).not.toContain('vs vs');
  });

  it("still says the word where the sentence is its own, not the yaml's", () => {
    // No display_name: the fallback is this module's own wording and has to
    // carry the "vs" the definitions would have supplied.
    const line = scopeLine({
      ...COMPARED, comparison: { baseline: { start: 'a', end: 'b' } },
    } as unknown as ToolMeta);
    expect(line).toContain('vs the previous period');
    expect(line).not.toContain('vs vs');
  });

  it('says nothing about a comparison that was not made', () => {
    const line = scopeLine({ metric_label: 'Net sales' } as unknown as ToolMeta);
    expect(line).not.toContain('vs');
  });
});

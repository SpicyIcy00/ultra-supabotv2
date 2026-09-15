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
 *   1. THE SIX ARE VARIABLES, AND EVERY ONE EXISTS IN EVERY THEME. A token
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
import { describe, expect, it } from 'vitest';

import { subtitleFor } from './catalogue';
import { scopeLine } from '../components/george/receiptShape';
import type { ToolMeta } from '../types/george';

const ROOT = join(__dirname, '..', '..');
const CONFIG = readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8');
const INDEX_CSS = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8');
const ROOM_CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');

/** The chrome tokens every `george-*` component paints with. Not the accent. */
const CHROME = ['cream', 'paper', 'line', 'navy', 'slate', 'muted'] as const;

describe('the six chrome tokens the old components paint with', () => {
  it.each(CHROME)('%s is a variable in the config, never a hex', (name) => {
    const declared = new RegExp(`\\b${name}:\\s*'([^']+)'`).exec(CONFIG);
    expect(declared, `george.${name} is not declared in tailwind.config.js`).toBeTruthy();
    const value = declared![1];
    // The alpha form matters as much as the variable: `bg-george-line/40` is
    // written in these components, and a bare `var(--x)` silently drops the
    // modifier rather than failing.
    expect(value).toBe(`rgb(var(--g-${name}) / <alpha-value>)`);
  });

  it.each(CHROME)('%s has a value outside the room, and one in each theme inside it', (name) => {
    const token = `--g-${name}:`;
    // Outside the room — a surface still on cream keeps the hexes it had.
    expect(INDEX_CSS, `${token} is not defined globally`).toContain(token);
    // Inside it, dark and light both. Read off the two blocks by name so a
    // token added to one and forgotten in the other fails here rather than on
    // a screen nobody is looking at.
    const dark = ROOM_CSS.slice(ROOM_CSS.indexOf('\n.room {'), ROOM_CSS.indexOf('[data-room-theme="light"] .room'));
    const light = ROOM_CSS.slice(ROOM_CSS.indexOf('[data-room-theme="light"] .room'));
    expect(dark, `${token} is missing from the dark room`).toContain(token);
    expect(light, `${token} is missing from the light room`).toContain(token);
  });

  it('leaves the light room on the exact values it always had', () => {
    // The light room was never the broken one. Changing it in the same edit
    // would be a second change nobody reported and nobody has seen.
    const light = ROOM_CSS.slice(ROOM_CSS.indexOf('[data-room-theme="light"] .room'));
    for (const [name, channels] of [
      ['cream', '251 247 239'], ['paper', '255 253 248'], ['line', '228 220 203'],
      ['navy', '18 35 63'], ['slate', '74 93 120'], ['muted', '132 150 172'],
    ] as const) {
      expect(light).toContain(`--g-${name}: ${channels};`);
    }
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

  it('still says the word where the sentence is its own, not the yaml\'s', () => {
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

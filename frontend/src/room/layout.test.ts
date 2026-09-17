/**
 * THE BESIDE ROOM'S STYLESHEET, HELD RULE BY RULE (P2S.1(b)(c)(h)).
 *
 * Re-derived from the design on 2026-09-17. What this file used to hold — one
 * `--measure` for the page, a lead row and a packed region, a tile that
 * scrolled its own body — was the answer to three reports that the design
 * answers differently, and all of it is gone. What it holds now is the owner's
 * own fixes (NOW.md, "THE OWNER'S FIXES"), each as the rule a browser reads:
 *
 *   row 5   "it still feels like its in squares"      → no box on a figure
 *   row 8   "here it gets cut … it should feel all connected" → nothing clipped
 *   row 9   "why is there scroll bar on the edge now?" → no visible scrollbar
 *
 * PARSED, NOT SEARCHED (`keptChrome.test.ts`, 2026-09-15): a comment closed
 * twice once swallowed a selector, and a string search could not tell a dead
 * rule from a live one. The arithmetic — centre, columns, reveal, wires, the
 * mark — is in `beside.test.ts`; the pixels are `ops/frames.py`'s.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');
const SHEET = postcss.parse(CSS);

/** Every rule, with its selector and declarations, media-query rules included. */
function rules(): { selector: string; decls: Record<string, string>; media: string | null }[] {
  const out: { selector: string; decls: Record<string, string>; media: string | null }[] = [];
  SHEET.walkRules((r) => {
    const decls: Record<string, string> = {};
    r.walkDecls((d) => { decls[d.prop] = d.value.trim(); });
    const parent = r.parent as postcss.AtRule | undefined;
    out.push({ selector: r.selector.trim(), decls,
               media: parent?.type === 'atrule' ? parent.params : null });
  });
  return out;
}

function base(selector: string): Record<string, string> {
  const found = rules().find((r) => r.selector === selector && r.media === null);
  expect(found, `no base rule for ${selector}`).toBeTruthy();
  return found!.decls;
}

describe('the page is a composition, not a measure', () => {
  it('has no --measure anywhere, and nothing sized from a count', () => {
    expect(CSS).not.toMatch(/--measure\s*:/);
    expect(CSS).not.toMatch(/var\(--measure/);
    expect(CSS).not.toMatch(/data-rest|r-board-lead|r-board-rest/);
  });

  it('fixes the room to the window and slides it with the sidebar', () => {
    const main = base('.r-main');
    expect(main.position).toBe('fixed');
    expect(main.overflow).toBe('hidden');
    expect(base(':root[data-side="open"] .r-main').left).toBe('var(--side-w)');
  });

  it('lays out him, his words and the figures as the design does', () => {
    const b = base('.r-beside');
    expect(b['grid-template-areas']).toBe('"him right" "words right"');
    expect(b['column-gap']).toBe('var(--comp-gap)');
    expect(b['margin-inline']).toBe('auto');
  });

  it('draws the lines as the design does: 1px, dashed 2 5, the wire grey', () => {
    const line = base('.r-wires line');
    expect(line.stroke).toBe('rgba(138, 143, 152, 0.32)');
    expect(line['stroke-dasharray']).toBe('2 5');
  });

  it('stacks on a phone: one column, no lines, no arrows, the page scrolls (UI rule 7)', () => {
    const phone = rules().filter((r) => r.media?.includes('max-width: 900px'));
    const at = (sel: string) => phone.find((r) => r.selector === sel)?.decls ?? {};
    expect(at('.r-wires').display).toBe('none');
    expect(at('.r-arr').display).toBe('none');
    expect(at('.r-flow').display).toBe('block');
    expect(at('.r-main').position).toBe('static');
  });
});

describe('no figure sits in a box — his row 5', () => {
  it('gives a tile no border, no ground and no shadow', () => {
    const tile = base('.r-tile');
    expect(tile.border).toBe('0');
    expect(tile.background).toBe('none');
    expect(tile['box-shadow']).toBe('none');
  });

  it('keeps a box only for a thing you act on, and the draft is the one that asks', () => {
    const boxed = rules().filter((r) => /\.r-tile/.test(r.selector)
      && (r.decls.border?.includes('solid') || (r.decls.background && r.decls.background !== 'none')));
    expect(boxed.map((r) => r.selector)).toEqual(['.r-tile--boxed']);
    const tiles = readFileSync(join(__dirname, 'tiles.tsx'), 'utf8');
    expect(tiles.match(/<Shell boxed/g) ?? []).toHaveLength(1);
    expect(tiles).toMatch(/export function DraftTile[\s\S]*?<Shell boxed/);
  });
});

describe('nothing is cut, and nothing shows a scrollbar — rows 8 and 9', () => {
  it('clips nothing inside the composition', () => {
    // `overflow: hidden` on the room itself stops the PAGE scrolling (row 9);
    // on anything inside it, it cuts a figure off (row 8). Truncating TEXT —
    // one line with an ellipsis, or a name clamped at two lines (2026-09-17) —
    // is not a cut and is allowed.
    const cuts = rules().filter((r) => r.media === null
      && (r.decls.overflow === 'hidden' || r.decls['overflow-y'] === 'hidden')
      && !r.decls['text-overflow'] && !r.decls['-webkit-line-clamp']
      && r.selector !== '.r-main');
    const allowed = new Set([
      // a bar's track, whose fill is the bar: nothing is behind it to cut
      '.r-spec-bar-track', '.r-spec-bullet-whole',
      // the grey completion, one line under the input
      '.r-ghost',
    ]);
    expect(cuts.map((r) => r.selector).filter((s) => !allowed.has(s))).toEqual([]);
    expect(CSS).not.toMatch(/max-height:\s*560px/);
  });

  it('hides the scrollbar on everything that can scroll', () => {
    const scrolls = rules().filter((r) => ['auto', 'scroll'].includes(r.decls['overflow-y'] ?? '')
      || ['auto', 'scroll'].includes(r.decls.overflow ?? ''));
    expect(scrolls.length).toBeGreaterThan(0);
    for (const r of scrolls) {
      expect(r.decls['scrollbar-width'], `${r.selector} shows a scrollbar`).toBe('none');
      const webkit = rules().find((w) => w.selector === `${r.selector}::-webkit-scrollbar`);
      expect(webkit?.decls.display, `${r.selector} shows a webkit scrollbar`).toBe('none');
    }
    // And no rule anywhere styles a scrollbar into view.
    for (const r of rules().filter((x) => /::-webkit-scrollbar/.test(x.selector))) {
      expect(r.decls.display, r.selector).toBe('none');
    }
  });

  it('moves only the figures, by arrows that appear only when there is more', () => {
    expect(base('.r-figs')['overflow-y']).toBe('auto');
    expect(base('.r-arr[hidden]').display).toBe('none');
  });
});

describe('what went with the layout it served', () => {
  it('deleted drag.ts, and nothing imports it', () => {
    expect(existsSync(join(__dirname, 'drag.ts'))).toBe(false);
    for (const f of ['render.tsx', 'tiles.tsx', 'Room.tsx']) {
      expect(readFileSync(join(__dirname, f), 'utf8')).not.toMatch(/from '\.\/drag'/);
    }
    expect(CSS).not.toMatch(/\.r-grip|\.r-dragging|\.r-acts/);
  });

  it('leaves no set-aside list, no undo and no per-figure keep in the room', () => {
    const room = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');
    expect(room).not.toMatch(/set aside/);
    expect(room).not.toMatch(/↺ undo|setHistory/);
    const board = readFileSync(join(__dirname, 'board.ts'), 'utf8');
    expect(board).not.toMatch(/^\s*(closed|kept|at|size)\?:/m);
  });
});

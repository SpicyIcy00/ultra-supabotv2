// @vitest-environment jsdom
/**
 * COLOUR MEANS ONE THING, DRAWN — the Done-when of P2.l, over the real
 * renderer rather than over the source.
 *
 * `palette.test.ts` reads the files: what a mark may paint with, which rule
 * may wear a hue. `accentUse.test.ts` reads the directories: which file may
 * name a colour at all. Neither of them renders anything, and the thing the
 * owner reported is what came out on the screen:
 *
 *   > what do the colors mean now? does this make sense?
 *
 * asked of `51af583` on the live build, of a board whose lead tile was washed
 * amber because the read was about OPUS. So this draws boards and reads the
 * colours back off the DOM.
 *
 * WHAT COUNTS AS A COLOUR HERE. Three things reach a rendered element:
 * `rgb(var(--up))` and friends, which a mark paints with; a bare `r, g, b`
 * triple, which is how `directionRgb` hands the delta pill its sign; and a
 * custom property somebody set. Every identity triple in `identity.ts` is
 * built into the forbidden set BY VALUE — if a shop's hue is ever drawn again,
 * on a tile or inside a mark, it is named here with the shop it decodes.
 *
 * TWO BOARDS ARE DRAWN. A board of the seven shops, which is the card's own
 * sentence — *"a board of seven shops draws no hue that decodes a name the row
 * label already gives"* — and every block of the eight recorded runs, which is
 * the same replay `marks.dom.test.tsx` uses for the six.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { Board } from './render';
import { DOWN, FLAT, UP, hueFor, namedSubjects } from './identity';
import recorded from './__fixtures__/recorded-runs.json';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const on: TileActions = {
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(),
  retune: vi.fn(),
};

const META = {
  source_table: 'new_transactions',
  snapshot_timestamp: '2026-09-11T08:00:00Z',
  filters_applied: [],
  metric_label: 'Net sales',
  metric_unit: 'PHP',
  window: { name: 'last_week' },
};

/** The seven shops, each with a figure and a direction the tool declared. */
const SEVEN = [
  { store: 'OPUS', value: 555147, baseline: 425000, change_pct: 30.6, direction: 'up', unit: 'PHP' },
  { store: 'Rockwell', value: 203717, baseline: 179000, change_pct: 13.8, direction: 'up', unit: 'PHP' },
  { store: 'Magnolia', value: 121004, baseline: 133000, change_pct: -9.0, direction: 'down', unit: 'PHP' },
  { store: 'Greenhills', value: 278266, baseline: 274150, change_pct: 1.5, direction: 'up', unit: 'PHP' },
  { store: 'Fairview', value: 98450, baseline: 101000, change_pct: -2.5, direction: 'down', unit: 'PHP' },
  { store: 'North EDSA', value: 142900, baseline: 142900, change_pct: 0, direction: 'flat', unit: 'PHP' },
  { store: 'Shangri-La', value: 187300, baseline: 160000, change_pct: 17.1, direction: 'up', unit: 'PHP' },
];

/**
 * EVERY IDENTITY COLOUR THE ROOM KNOWS, by value, with the name it decodes.
 *
 * Built through `hueFor` rather than copied, so the day a shop is added to
 * `identity.ts` its hue is forbidden here without anybody remembering to say
 * so. The three directions are excluded by construction: they are a different
 * family and `directionRgb` is what a pill is allowed to wear.
 */
function identityColours(): Map<string, string> {
  const out = new Map<string, string>();
  for (const shop of namedSubjects()) out.set(hueFor(shop), shop);
  for (const kind of ['product', 'category', 'supplier', 'order', 'draft', 'delivery', 'stock']) {
    out.set(hueFor(null, null, kind), kind);
  }
  for (const direction of [UP, DOWN, FLAT]) out.delete(direction);
  return out;
}

/** Every inline style on every element, as the browser would apply it. */
function styles(container: HTMLElement): { where: string; style: string }[] {
  return [...container.querySelectorAll<HTMLElement>('[style]')].map((el) => ({
    where: `${el.tagName.toLowerCase()}.${el.className || '—'}`,
    style: (el.getAttribute('style') ?? '').replace(/\s+/g, ' '),
  }));
}

/** Where an identity colour was drawn, and which name it decoded. */
function identityDrawn(container: HTMLElement): string[] {
  const forbidden = identityColours();
  const found: string[] = [];
  for (const { where, style } of styles(container)) {
    for (const [triple, name] of forbidden) {
      if (style.includes(triple)) found.push(`${name} (${triple}) on ${where}`);
    }
    if (/--hue\s*:/.test(style)) found.push(`--hue set on ${where}`);
  }
  return found;
}

function boardOf(rows: Record<string, unknown>[], o: Partial<BoardObject>) {
  const turn = {
    role: 'george', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
    toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows, meta: META } }],
  } as unknown as AnswerTurn;
  const object = {
    key: 'k', kind: 'comparison', weight: 'lead', seq: 1, tool: 'get_sales',
    turn: 0, touched: 0, ...o,
  } as BoardObject;
  return render(
    <Board answers={[turn]} board={[object]} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

describe('a board of seven shops', () => {
  it('draws no hue that decodes a name the row label already gives', () => {
    const { container } = boardOf(SEVEN, {});
    expect(identityDrawn(container)).toEqual([]);
  });

  it('says which shop each row is in WORDS, which is what the hue was for', () => {
    const { container } = boardOf(SEVEN, {});
    const text = container.textContent ?? '';
    for (const row of SEVEN) expect(text, `${row.store} is not named`).toContain(row.store);
  });

  it('leaves the tile itself carrying nothing but its landing delay', () => {
    // The tile used to arrive with `--hue` (the object's identity) and `--i`
    // (how hard it moved). Both are gone; the one custom property left is the
    // stagger the board deals out, which says nothing about the figures.
    const { container } = boardOf(SEVEN, {});
    const tile = container.querySelector('.r-tile');
    expect(tile?.getAttribute('style')).toBe('--d: 0ms;');
    expect(tile?.className).not.toContain('r-tile--solid');
  });

  it('still says which way each shop went, because a tool measured that', () => {
    // The point of the card is not less colour, it is colour meaning ONE
    // thing. The three directions the tool declared are all still drawn.
    const { container } = boardOf(SEVEN, { kind: 'comparison' });
    const drawn = styles(container).map((s) => s.style).join(' ');
    // A mark reaches a direction through `paint()`, as the token; a delta pill
    // wears the same meaning as a triple off `directionRgb`. Either is the
    // tool's own word for which way this went, so either satisfies this.
    expect(drawn.includes('var(--up)') || drawn.includes(UP)).toBe(true);
    expect(drawn.includes('var(--down)') || drawn.includes(DOWN)).toBe(true);
  });
});

describe('every block in the eight recorded runs', () => {
  const runs = recorded.runs as {
    run: string; blocks: Record<string, unknown>[];
    calls: { seq: number; tool: string; result: { rows: Record<string, unknown>[]; meta: unknown } }[];
  }[];

  it('has the eight runs to replay', () => {
    expect(runs.length).toBeGreaterThanOrEqual(8);
  });

  for (const run of runs) {
    for (const block of run.blocks) {
      const kind = String(block.kind);
      const seq = Number(block.seq);
      it(`${run.run} · ${kind} (seq ${seq}) draws no fifth meaning`, () => {
        const call = run.calls.find((c) => c.seq === seq)!;
        const turn = {
          role: 'george', text: '', thinking: '', at: '2026-09-11T08:00:00Z',
          toolCalls: run.calls.map((c) => ({
            seq: c.seq, tool: c.tool, arguments: {}, result: c.result,
          })),
        } as unknown as AnswerTurn;
        const object = { ...block, tool: call.tool, turn: 0, touched: 0 } as unknown as BoardObject;
        const { container } = render(
          <Board answers={[turn]} board={[object]} local={{}} focused={null}
                 selection={[]} live={false} retuned={{}} on={on} />,
        );
        expect(identityDrawn(container), `${run.run}/${kind}`).toEqual([]);
      });
    }
  }
});

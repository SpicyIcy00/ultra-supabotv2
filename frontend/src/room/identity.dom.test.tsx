// @vitest-environment jsdom
/**
 * IDENTITY ON THE SWATCH, VERDICT ON THE MARK — P2S.2(e)'s done-when:
 * *"Rockwell is the same hue in a dumbbell swatch, a line, a bar … in one
 * thread"*. (The pie is P2S.3's shape; there is none to draw yet.)
 *
 * And the rules under it: a store's slot is its place in the SERVED retail
 * order, never a name in code; a product takes slots 5–8 by a stable hash; a
 * category or a warehouse takes none; nothing is guessed before the
 * definitions load.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { Board } from './render';
import { NO_IDENTITIES, PRODUCT_SLOTS, SLOTS, identitiesFrom, slotFor, storeColour, toned } from './identity';
import { IdentityContext } from './swatch';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const on: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn() };

/** The shape `/definitions/desk` serves `locations` in: retail in file order, then the warehouse. */
const LOCATIONS = [
  { id: 'a', display_name: 'Rockwell', kind: 'retail' },
  { id: 'b', display_name: 'Fairview', kind: 'retail' },
  { id: 'c', display_name: 'Greenhills', kind: 'retail' },
  { id: 'd', display_name: 'OPUS', kind: 'retail' },
  { id: 'w', display_name: 'AJI BARN', kind: 'warehouse' },
];
const IDS = identitiesFrom({ locations: LOCATIONS });

const META = {
  source_table: 'new_transactions', snapshot_timestamp: '2026-09-17T00:41:00Z',
  filters_applied: [], metric_label: 'Net sales', metric_unit: 'PHP', window: { name: 'last_month' },
};

describe('the slot', () => {
  it('is the store\'s place in the served retail order', () => {
    expect(slotFor(IDS, 'Rockwell', 'store')).toBe(1);
    expect(slotFor(IDS, 'greenhills', null)).toBe(3);
    expect(slotFor(IDS, 'OPUS', 'store')).toBe(4);
  });

  it('follows the order it is served in, not a list in code', () => {
    const moved = identitiesFrom({ locations: [LOCATIONS[3], ...LOCATIONS.slice(0, 3)] });
    expect(slotFor(moved, 'OPUS', 'store')).toBe(1);
    expect(slotFor(moved, 'Rockwell', 'store')).toBe(2);
  });

  it('gives nothing before the definitions load, and nothing to a warehouse or a category', () => {
    expect(slotFor(NO_IDENTITIES, 'Rockwell', 'store')).toBeNull();
    expect(slotFor(IDS, 'AJI BARN', 'store')).toBeNull();
    expect(slotFor(IDS, 'Chocolates', 'category')).toBeNull();
    expect(slotFor(IDS, 'Seikyo', 'supplier')).toBeNull();
  });

  it('folds past the eighth store rather than generating a ninth hue', () => {
    const many = identitiesFrom({
      locations: Array.from({ length: SLOTS + 1 }, (_, i) => ({ display_name: `Shop ${i}`, kind: 'retail' })),
    });
    expect(slotFor(many, `Shop ${SLOTS - 1}`, 'store')).toBe(SLOTS);
    expect(slotFor(many, `Shop ${SLOTS}`, 'store')).toBeNull();
  });

  it('gives a product one of slots 5–8, the same one every time', () => {
    for (const name of ['Aji Kiamoy Strips 100g', 'Fuan Haw Flakes', 'Kameda Kakinotane']) {
      const slot = slotFor(IDS, name, 'product');
      expect(PRODUCT_SLOTS).toContain(slot);
      expect(slotFor(IDS, name.toUpperCase(), 'product')).toBe(slot);
    }
  });
});

describe("his own colour, from Settings (the dogfood log, 2026-09-17)", () => {
  // What `/analytics/stores` serves: Settings' names (it says "Opus") and colours.
  const RECORDS = [
    { id: 'a', color: '#ef4444' },      // Rockwell, red
    { id: 'd', color: '#14b8a6' },      // "Opus" in Settings, teal
    { id: 'c', color: null },           // Greenhills, never set
  ];
  const OWN = identitiesFrom({ locations: LOCATIONS }, RECORDS);

  it('matches a colour to a store by id, not by the name Settings uses', () => {
    expect(OWN.colours?.['rockwell']).toBe('#ef4444');
    expect(OWN.colours?.['opus']).toBe('#14b8a6');
    expect(OWN.colours?.['greenhills']).toBeUndefined();
  });

  it('keeps his hue and tones it for each ground, into the validated band', () => {
    const own = storeColour(OWN, 'Rockwell', 'store')!;
    expect(own.dark).toMatch(/^#[0-9a-f]{6}$/);
    expect(own.light).toMatch(/^#[0-9a-f]{6}$/);
    expect(own.dark).not.toBe('#ef4444');
    // Still red: the red channel leads on both grounds.
    for (const hex of [own.dark, own.light]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(b);
    }
  });

  it('tones his seven exactly as ops/palette/stores.txt validated them', () => {
    const raw = ['#ef4444', '#8b5cf6', '#22c55e', '#3b82f6', '#f1c40f', '#14b8a6', '#ec4899'];
    expect(raw.map((h) => toned(h, 'dark')).join(','))
      .toBe('#d3655e,#866fcd,#48a962,#5286da,#af8f15,#1ba898,#d16996');
    expect(raw.map((h) => toned(h, 'light')).join(','))
      .toBe('#d15c56,#866dd3,#309e52,#4d84df,#a18308,#119b8c,#c95a8c');
  });

  it("draws the dot in his colour where he set one, and the palette slot where he did not", () => {
    const turn = {
      role: 'george', text: '', thinking: '', at: '2026-09-17T00:41:00Z',
      toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: {
        rows: [{ store: 'Rockwell', value: 1, unit: 'PHP' }, { store: 'Greenhills', value: 2, unit: 'PHP' }],
        meta: META } }],
    } as unknown as AnswerTurn;
    const o = { key: 'r', kind: 'ranked', seq: 1, tool: 'get_sales', weight: 'lead', turn: 0, touched: 0 } as unknown as BoardObject;
    const { container } = render(
      <IdentityContext.Provider value={OWN}>
        <Board answers={[turn]} board={[o]} local={{}} focused={null} selection={[]} live={false} retuned={{}} on={on} />
      </IdentityContext.Provider>,
    );
    const rockwell = container.querySelector('.r-sw[data-identity="Rockwell"]') as HTMLElement;
    const greenhills = container.querySelector('.r-sw[data-identity="Greenhills"]') as HTMLElement;
    expect(rockwell.dataset.colour).toBe('set');
    expect(rockwell.style.getPropertyValue('--sw-dark')).toBe(storeColour(OWN, 'Rockwell', 'store')!.dark);
    expect(greenhills.dataset.colour).toBe('slot');
    expect(greenhills.style.getPropertyValue('--sw-dark')).toBe('var(--c-3)');
  });
});

describe('Rockwell is one hue across the figures of one thread', () => {
  const byStore = [
    { store: 'OPUS', value: 555147, baseline: 425000, change_pct: 30.6, direction: 'up', unit: 'PHP' },
    { store: 'Rockwell', value: 203717, baseline: 239000, change_pct: -14.8, direction: 'down', unit: 'PHP' },
    { store: 'Greenhills', value: 278266, baseline: 274150, change_pct: 1.5, direction: 'up', unit: 'PHP' },
  ];
  const plain = byStore.map(({ store, value, unit }) => ({ store, value, unit }));
  const days = [
    { day: '2026-09-07', value: 21244 }, { day: '2026-09-08', value: 12258 }, { day: '2026-09-09', value: 24020 },
  ];
  const turn = {
    role: 'george', text: '', thinking: '', at: '2026-09-17T00:41:00Z',
    toolCalls: [
      { seq: 1, tool: 'get_sales', arguments: {}, result: { rows: byStore, meta: META } },
      { seq: 2, tool: 'get_sales', arguments: {}, result: { rows: plain, meta: META } },
      { seq: 3, tool: 'get_sales', arguments: { filters: { store: 'Rockwell' } }, result: { rows: days, meta: META } },
      { seq: 4, tool: 'get_sales', arguments: {}, result: { rows: plain, meta: META } },
    ],
  } as unknown as AnswerTurn;
  const objects = [
    { key: 'dumb', kind: 'dumbbell', seq: 1, emphasise: 'Rockwell' },
    { key: 'bars', kind: 'ranked', seq: 2 },
    { key: 'line', kind: 'line', seq: 3 },
    { key: 'rows', kind: 'table', seq: 4 },
  ].map((o) => ({ weight: 'supporting', tool: 'get_sales', turn: 0, touched: 0, ...o })) as unknown as BoardObject[];

  function draw() {
    return render(
      <IdentityContext.Provider value={IDS}>
        <Board answers={[turn]} board={objects} local={{}} focused={null}
               selection={[]} live={false} retuned={{}} on={on} />
      </IdentityContext.Provider>,
    );
  }

  it('wears the same slot on the dumbbell, the bar, the line\'s key and the table', () => {
    const { container } = draw();
    const worn = new Map<string, string>();
    for (const sw of container.querySelectorAll('.r-sw[data-identity="Rockwell"]')) {
      const figure = sw.closest('[data-figure]')?.getAttribute('data-figure') ?? '?';
      worn.set(figure, sw.getAttribute('data-slot') ?? '');
    }
    expect([...worn.keys()].sort()).toEqual(['bars', 'dumb', 'line', 'rows']);
    expect(new Set(worn.values())).toEqual(new Set(['1']));
  });

  it('keeps the verdict on the dumbbell: Rockwell fell, so its segment is down, not its hue', () => {
    const { container } = draw();
    const row = [...container.querySelectorAll('[data-figure="dumb"] .r-mk-row')]
      .find((r) => r.textContent?.includes('Rockwell'))!;
    expect(row.querySelector('.r-mk-seg')?.getAttribute('style')).toMatch(/rgb\(var\(--down\)\)/);
    expect(row.querySelector('.r-mk-seg')?.getAttribute('style')).not.toMatch(/--c-/);
    // The row he pointed at rings its swatch; the mark says a row was pointed at.
    expect(row.closest('.r-mk')?.getAttribute('data-emphasis')).toBe('yes');
  });

  it('draws no swatch at all before the definitions load', () => {
    const { container } = render(
      <Board answers={[turn]} board={objects} local={{}} focused={null}
             selection={[]} live={false} retuned={{}} on={on} />,
    );
    expect(container.querySelectorAll('.r-sw')).toHaveLength(0);
  });
});

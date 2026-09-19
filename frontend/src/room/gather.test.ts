/**
 * WHAT GATHERS UNDER WHAT.
 *
 * THE FALLBACK IS THE CONTRACT. Every board composed before `under` existed,
 * every default composition and every kept page names nothing — and must draw
 * exactly as it did: no families, every figure a point, every point spanning
 * the width. Where the columns then go is `beside.test.ts`; this file is only
 * about what belongs to what.
 */
import { describe, expect, it } from 'vitest';
import { CHILD_GAP, gather } from './gather';
import type { BoardObject } from './board';

function block(key: string, extra: Partial<BoardObject> = {}): BoardObject {
  return { key, kind: 'ranked', weight: 'supporting', turn: 0, touched: 0, ...extra } as BoardObject;
}

describe('a board that names nothing gathers nothing', () => {
  const flat = [block('a'), block('b'), block('c'), block('d'), block('e')];

  it('gathers no families, so every figure spans and the page is one flow', () => {
    const g = gather(flat);
    expect(g.families).toEqual([]);
    expect(g.order.map((o) => o.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

});

describe('a point and what belongs to it', () => {
  const board = [
    block('shops', { weight: 'lead' }),
    block('stock', { under: 'shops', relation: 'evidence' }),
    block('grew', { under: 'shops', relation: 'counter' }),
    block('cats', { relation: 'scale' }),
  ];

  it('draws the stem, then its evidence, then the next point', () => {
    expect(gather(board).order.map((o) => o.key)).toEqual(['shops', 'stock', 'grew', 'cats']);
  });

  it('names one family, and what is under it, in his order', () => {
    expect(gather(board).families).toEqual([{ stem: 'shops', under: ['stock', 'grew'] }]);
  });

  it('carries how each one sits there', () => {
    const g = gather(board);
    expect(g.parentOf).toEqual({ stock: 'shops', grew: 'shops' });
    expect(g.relationOf).toEqual({ stock: 'evidence', grew: 'counter' });
  });

  it('a relation with no `under` gathers nothing — it is its own point', () => {
    expect(gather(board).parentOf.cats).toBeUndefined();
  });





});

describe('what does not stand', () => {
  it('an `under` naming a block that is not on this board', () => {
    const g = gather([block('a'), block('b', { under: 'gone' })]);
    expect(g.families).toEqual([]);
    expect(g.parentOf).toEqual({});
  });

  it('a block under itself', () => {
    expect(gather([block('a', { under: 'a' })]).parentOf).toEqual({});
  });

  it('an empty `under`, which is how Bob detaches one', () => {
    expect(gather([block('a'), block('b', { under: '' })]).parentOf).toEqual({});
  });

  /**
   * ONE LEVEL. A tree of evidence is an outline, and an outline is a report.
   * It is also a nested grid, which the room does not have.
   */
  it('a second level: the grandchild stands on its own, the child still gathers', () => {
    const g = gather([block('a'), block('b', { under: 'a' }), block('c', { under: 'b' })]);
    expect(g.parentOf).toEqual({ b: 'a' });
    expect(g.families).toEqual([{ stem: 'a', under: ['b'] }]);
    expect(g.order.map((o) => o.key)).toEqual(['a', 'b', 'c']);
  });

  it('a cycle, where both parents are themselves children', () => {
    const g = gather([block('a', { under: 'b' }), block('b', { under: 'a' })]);
    expect(g.parentOf).toEqual({});
    expect(g.families).toEqual([]);
  });

  it('every object is drawn exactly once, whatever was said', () => {
    const board = [block('a'), block('b', { under: 'a' }), block('c', { under: 'b' }),
      block('d', { under: 'gone' }), block('e', { under: 'e' })];
    const keys = gather(board).order.map((o) => o.key);
    expect(keys.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

/**
 * THE GAP A GATHERED POINT LEAVES is used in two places — the row span in
 * render.tsx and nothing else now that families are not summed. It stays
 * exported so the two cannot drift.
 */
describe('the gap under a point', () => {
  it('is smaller than the gap between points', () => {
    expect(CHILD_GAP).toBeGreaterThan(0);
    expect(CHILD_GAP).toBeLessThan(34);
  });
});

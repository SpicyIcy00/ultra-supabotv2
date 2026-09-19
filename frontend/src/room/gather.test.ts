/**
 * WHAT GATHERS UNDER WHAT, and the one thing that must never happen: evidence
 * placed in a different column from the point it belongs to.
 *
 * THE FALLBACK IS THE CONTRACT. Every board composed before `under` existed,
 * every default composition and every kept page names nothing — and must place
 * exactly as it did. The first test here is that, stated as an equality against
 * `placeFigures` itself rather than against a copy of its answer.
 */
import { describe, expect, it } from 'vitest';
import { placeFigures } from './beside';
import { CHILD_GAP, gather, placeFamilies, runsOf } from './gather';
import type { BoardObject } from './board';

function block(key: string, extra: Partial<BoardObject> = {}): BoardObject {
  return { key, kind: 'ranked', weight: 'supporting', turn: 0, touched: 0, ...extra } as BoardObject;
}

const place = (h: readonly number[], c: number, s?: readonly boolean[]) => placeFigures(h, c, s);

describe('a board that names nothing places exactly as it did', () => {
  const flat = [block('a'), block('b'), block('c'), block('d'), block('e')];

  it('gathers no families, so the caller takes the old path', () => {
    const g = gather(flat);
    expect(g.families).toEqual([]);
    expect(g.order.map((o) => o.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('and placing the families anyway is the same answer as placing the figures', () => {
    const heights = [120, 40, 300, 80, 55];
    const g = gather(flat);
    expect(placeFamilies(g, heights, 2, [], place)).toEqual(placeFigures(heights, 2, []));
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

  it('places every member of a family in one column', () => {
    const g = gather(board);
    const cols = placeFamilies(g, [300, 90, 90, 200], 2, [], place);
    expect(cols[1]).toBe(cols[0]);
    expect(cols[2]).toBe(cols[0]);
  });

  /**
   * THE FIRST PAINT. Heights arrive from a ResizeObserver, so every figure is
   * 0 until it has been measured. A family must hold together then too, or it
   * is drawn split and reassembles a frame later — which is the remount the
   * one-grid rule exists to prevent.
   */
  it('holds together before anything has been measured', () => {
    const g = gather(board);
    const cols = placeFamilies(g, [0, 0, 0, 0], 2, [], place);
    expect(new Set([cols[0], cols[1], cols[2]]).size).toBe(1);
  });

  it('holds together as the measurements land one at a time', () => {
    const g = gather(board);
    for (const heights of [[300, 0, 0, 0], [300, 90, 0, 0], [300, 90, 90, 0], [300, 90, 90, 200]]) {
      const cols = placeFamilies(g, heights, 2, [], place);
      expect(new Set([cols[0], cols[1], cols[2]]).size, `heights ${heights}`).toBe(1);
    }
  });

  it('counts a family as one item as tall as its parts and the gaps between', () => {
    const g = gather(board);
    const runs = runsOf(g);
    expect(runs).toEqual([[0, 1, 2], [3]]);
    // The family is 300 + 14 + 90 + 14 + 90 = 508 against the lone 200, so on
    // one column of two the family and the loner cannot share it.
    const cols = placeFamilies(g, [300, 90, 90, 200], 2, [], place);
    expect(cols[3]).not.toBe(cols[0]);
    expect(CHILD_GAP).toBeGreaterThan(0);
  });

  it('a family needs the width when any one of its members does', () => {
    const g = gather(board);
    const spans = [false, false, true, false];
    // The wide member forces the whole family to span, so it reports column 0.
    expect(placeFamilies(g, [100, 50, 50, 100], 2, spans, place)[2]).toBe(0);
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

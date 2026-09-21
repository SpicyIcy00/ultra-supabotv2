/**
 * THE PAGE IS THE DEFAULT (P6.k, 2026-09-21).
 *
 * The owner, of a board of his own blocks drawn as the two-column packing:
 * *"did we reach our goal?"* No — that is the grid of tiles he has refused
 * from the start, and it was what every answer fell back to whenever Bob
 * left the layout alone, and what every reopened thread drew. So a board he
 * composed is laid out as a page whether or not he said how.
 */
import { describe, expect, it } from 'vitest';
import type { Arrangement } from '../types/bob';
import { pageOf, type Placeable } from './pageOf';

/** The children of a tree, as a list this can read. */
const kids = (t: Arrangement | null): Arrangement[] =>
  (t as { children?: Arrangement[] } | null)?.children ?? [];

const block = (key: string, o: Partial<Placeable> = {}): Placeable =>
  ({ key, kind: 'figure', claim: `${key} says something`, ...o });

describe('the page the room lays out when he did not', () => {
  it('is a stack in his order, and the plan closes it', () => {
    const tree = pageOf([block('a', { kind: 'line' }), block('b', { kind: 'dumbbell' }),
                         block('c', { kind: 'list' })]);
    expect(tree).toEqual({ layout: 'stack', children: [
      { block: 'a' }, { block: 'b' }, { block: 'c' }, { next: true },
    ] });
  });

  it('puts two of the same shape side by side — a number beside a number', () => {
    const tree = pageOf([block('total'), block('tills'), block('days', { kind: 'line' })]);
    expect(kids(tree)[0]).toEqual({ layout: 'row',
      children: [{ block: 'total' }, { block: 'tills' }] });
    // A chart keeps the width: half a column is where a week became 72px tall.
    expect(kids(tree)[1]).toEqual({ block: 'days' });
  });

  it('leaves the machine its own board, which is what the packing still draws', () => {
    expect(pageOf([block('m1', { default: true }), block('m2', { default: true }),
                   block('m3', { default: true })])).toBeNull();
  });

  it('does not make a page out of one or two points', () => {
    expect(pageOf([block('a'), block('b')])).toBeNull();
  });

  it('puts what he drew and never wrote up after the page, above the plan', () => {
    const tree = pageOf([
      block('read-0', { kind: 'table', claim: null }),
      block('a'), block('b', { kind: 'line' }), block('c', { kind: 'list' }),
    ]);
    const order = kids(tree).map((c) => (c as { block?: string }).block
      ?? ('next' in (c as object) ? 'next' : 'row'));
    expect(order).toEqual(['a', 'b', 'c', 'read-0', 'next']);
  });

  it('counts only what he wrote up when it decides there is a page at all', () => {
    expect(pageOf([block('a'), block('b'),
                   block('x', { claim: null }), block('y', { claim: null })])).toBeNull();
  });
});

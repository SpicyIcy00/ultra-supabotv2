/**
 * A PAGE'S KIND DECIDES HOW IT IS DRAWN — AND NOTHING ELSE (W4.1, 2026-09-23).
 *
 * The three things that must hold whatever the kind is, held here over the
 * pure half (`pageKind.ts`), because they are the whole of the decision:
 *
 *   the ORDER is the person's — grouping is a partition in place, so flattening
 *   the groups of ANY kind returns the list it was given, unchanged;
 *   a kind the room does not know, and a response with no kind at all, read
 *   `collection`, which is what a kept page has always drawn as;
 *   an analysis's SHAPE is read off the marks its own run returned, never off
 *   a title, a question or anything a model said about it.
 */
import { describe, expect, it } from 'vitest';
import type { CompositionBlock } from '../types/bob';
import type { Page, PageKind } from '../types/pins';
import {
  PAGE_KINDS, blockOrderFor, groupsFor, kindOf, kindOptions, shapeOf, wordsFor,
} from './pageKind';

const block = (kind: CompositionBlock['kind'], key: string): CompositionBlock => (
  { op: 'put', kind, key, weight: 'supporting', seq: 0, tool: 'get_sales' }
);

const PAGE: Page = {
  id: 'p-1', title: 'Estate Dashboard', purpose: null,
  created_at: '2026-09-23T00:00:00Z', updated_at: '2026-09-23T00:00:00Z', pins: 4,
};

describe('the page’s kind', () => {
  it('falls back to collection for a response that carries none', () => {
    expect(kindOf(PAGE)).toBe('collection');
    expect(kindOf(null)).toBe('collection');
    expect(kindOf(undefined)).toBe('collection');
  });

  it('falls back to collection for a name the room does not know', () => {
    expect(kindOf({ ...PAGE, kind: 'poster' as PageKind })).toBe('collection');
  });

  it('reads the four the contract names', () => {
    for (const kind of PAGE_KINDS) expect(kindOf({ ...PAGE, kind })).toBe(kind);
  });

  it('offers the kinds in the room’s own words, never the enum', () => {
    for (const option of kindOptions(PAGE)) {
      expect(option.label).not.toBe(option.value);
      expect(option.label.length).toBeGreaterThan(3);
    }
  });

  it('prefers the definitions’ words when the server serves them', () => {
    const served = { ...PAGE, kind: 'week' as PageKind,
                     kind_options: [{ value: 'week' as PageKind, label: 'The week, read down' }] };
    expect(wordsFor(served, 'week').label).toBe('The week, read down');
    expect(kindOptions(served)).toHaveLength(1);
  });
});

describe('what an analysis is, by what it drew', () => {
  it('reads one figure as a stat and two as a shape to read', () => {
    expect(shapeOf([block('figure', 'a')])).toBe('stat');
    expect(shapeOf([block('gauge', 'a')])).toBe('stat');
    expect(shapeOf([block('figure', 'a'), block('figure', 'b')])).toBe('chart');
  });

  it('reads a table and a list as rows, and the catalogue’s shapes as charts', () => {
    expect(shapeOf([block('table', 'a')])).toBe('rows');
    expect(shapeOf([block('list', 'a')])).toBe('rows');
    expect(shapeOf([block('ranked', 'a')])).toBe('chart');
    expect(shapeOf([block('line', 'a')])).toBe('chart');
    expect(shapeOf([block('heatmap', 'a')])).toBe('chart');
  });

  it('is `none` while nothing has come back, and `mixed` for two families', () => {
    expect(shapeOf([])).toBe('none');
    expect(shapeOf(undefined)).toBe('none');
    expect(shapeOf([block('figure', 'a'), block('table', 'b')])).toBe('mixed');
  });
});

describe('grouping never moves an analysis', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  const shapes = ['stat', 'stat', 'chart', 'stat', 'rows'] as const;
  const shapeAt = (_: string, i: number) => shapes[i];

  it('flattens back to the person’s order, in every kind', () => {
    for (const kind of PAGE_KINDS) {
      const flat = groupsFor(kind, items, shapeAt).flatMap((g) => g.items);
      expect(flat, kind).toEqual(items);
    }
  });

  it('puts only a dashboard’s consecutive stats on one line', () => {
    const rows = groupsFor('dashboard', items, shapeAt);
    expect(rows.map((g) => g.items)).toEqual([['a', 'b'], ['c'], ['d'], ['e']]);
    for (const kind of ['week', 'list', 'collection'] as PageKind[]) {
      expect(groupsFor(kind, items, shapeAt).every((g) => g.items.length === 1), kind).toBe(true);
    }
  });

  it('never joins two stats across an analysis that is not one', () => {
    const rows = groupsFor('dashboard', ['a', 'b', 'c'],
                           (_, i) => (['stat', 'chart', 'stat'] as const)[i]);
    expect(rows.map((g) => g.items)).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('the one thing a kind may reorder is inside one analysis', () => {
  const blocks = [block('table', 'rows'), block('dumbbell', 'moved'), block('list', 'todo')];

  it('puts a week’s comparisons before its lists, stably', () => {
    expect(blockOrderFor('week', blocks).map((b) => b.key)).toEqual(['moved', 'rows', 'todo']);
  });

  it('leaves every other kind’s blocks exactly as the run returned them', () => {
    for (const kind of ['dashboard', 'list', 'collection'] as PageKind[]) {
      expect(blockOrderFor(kind, blocks).map((b) => b.key), kind)
        .toEqual(['rows', 'moved', 'todo']);
    }
  });

  it('leaves an analysis that is all rows, or all shapes, alone', () => {
    const rows = [block('table', 'a'), block('list', 'b')];
    expect(blockOrderFor('week', rows).map((b) => b.key)).toEqual(['a', 'b']);
    const shapes = [block('line', 'a'), block('ranked', 'b')];
    expect(blockOrderFor('week', shapes).map((b) => b.key)).toEqual(['a', 'b']);
  });
});

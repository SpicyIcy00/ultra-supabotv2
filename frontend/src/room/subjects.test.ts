/**
 * A SUBJECT IS AN ID (P2.c) — held here, on the resolution and not on wording.
 *
 * The bug this card closes is one line long: the room sent
 * `{id: label, label}`, so "Rockwell" reached George as a word with two
 * meanings in this estate. The rows carried `store_id` the whole time, two
 * columns from the name that was sent instead.
 *
 * Every definition below is the SERVED one, shaped like `/definitions/desk`
 * serves it — which is the point: no list of columns lives on the client, so a
 * test that invented its own would be testing a thing that does not exist.
 */
import { describe, expect, it } from 'vitest';
import type { DeskDefinitions } from '../services/deskApi';
import {
  asSelection, comparisonReplay, identityColumn, maxSubjects, subjectInRow,
  subjectInRows, subjectOnBoard, toggleSubject, travelling, type Subject,
} from './subjects';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';

/** `surface.desk.selection`, as the endpoint serves it. */
const DEFS = {
  selection: {
    dimensions: ['store', 'product', 'category', 'supplier'],
    max_subjects: 12,
    identity: {
      store: 'store_id', product: 'product_id',
      category: 'category', supplier: 'supplier',
    },
    label_columns: {
      store: ['store', 'location'],
      product: ['product', 'name', 'sku'],
      category: ['category'],
      supplier: ['supplier', 'supplier_name'],
    },
    comparison: {
      spoken: ['compare these', 'compare them', 'these two', 'compare'],
      min_subjects: 2,
      replays_by_dimension: { store: 'store' },
    },
  },
} as unknown as DeskDefinitions;

/** A real row out of `verification/p1close-v2.json`, get_sales grouped by store. */
const SHOP = {
  store_id: '68c5bb269da1d500073690c2', store: 'OPUS',
  value: 467102.44, baseline: 555147.31, change_pct: -15.9,
  direction: 'down', unit: 'PHP',
};
const OTHER = {
  store_id: '6639efd54694700008d7ccc6', store: 'Rockwell',
  value: 576.04, baseline: 556.6, change_pct: 3.5, direction: 'up', unit: 'PHP',
};
/** And one grouped by product, from the same run. */
const PRODUCT = {
  product_id: '663c7869391c7c00079595a8', sku: 'SH1', product: 'Aji Mix',
  value: 32322.0, change_pct: -5.3, direction: 'down',
};

function turn(seq: number, rows: Record<string, unknown>[]): AnswerTurn {
  return {
    role: 'george', text: '', thinking: '', notices: [],
    toolCalls: [{ seq, tool: 'get_sales', arguments: {}, result: { rows, meta: {} } }],
    post: { answer_post_id: 'post-1' },
  } as unknown as AnswerTurn;
}

const object = (turnAt: number, seq: number): BoardObject =>
  ({ key: `read-${seq}`, kind: 'table', turn: turnAt, seq, touched: turnAt } as BoardObject);

describe('the id a row carried', () => {
  it('is read from the column the definitions declare, not from the name', () => {
    expect(identityColumn(DEFS, 'store')).toBe('store_id');
    const found = subjectInRow(SHOP, 'OPUS', 'store', DEFS);
    expect(found).toEqual({
      dimension: 'store', id: '68c5bb269da1d500073690c2',
      label: 'OPUS', from: 'rows',
    });
    // The bug, stated: the id is NOT the label.
    expect(found?.id).not.toBe(found?.label);
  });

  it('matches on the label columns only, never on any value in the row', () => {
    // A product named after a shop is a product. Scanning every value — which
    // is what `rowFor` does — would make this row answer to "OPUS" as a store.
    const named = { product_id: 'p-1', product: 'OPUS', sku: 'X1', value: 10 };
    expect(subjectInRow(named, 'OPUS', 'store', DEFS)).toBeNull();
    expect(subjectInRow(named, 'OPUS', 'product', DEFS))
      .toMatchObject({ id: 'p-1', dimension: 'product', from: 'rows' });
  });

  it('reads a product by any of the columns its label lives in', () => {
    expect(subjectInRow(PRODUCT, 'Aji Mix', 'product', DEFS))
      .toMatchObject({ id: '663c7869391c7c00079595a8', from: 'rows' });
    expect(subjectInRow(PRODUCT, 'SH1', 'product', DEFS))
      .toMatchObject({ id: '663c7869391c7c00079595a8', label: 'SH1', from: 'rows' });
  });

  it('says so when the identity IS the label, rather than pretending', () => {
    // A supplier has no master and no id: the exact name is the key every
    // purchasing read takes. The subject is still usable — it just knows
    // where its id came from.
    const row = { supplier: 'Seikyo', purchase_orders: 7 };
    expect(subjectInRow(row, 'Seikyo', 'supplier', DEFS))
      .toEqual({ dimension: 'supplier', id: 'Seikyo', label: 'Seikyo', from: 'rows' });
  });

  it('falls back to the label when no row carries the id column', () => {
    const row = { store: 'OPUS', value: 1 };
    expect(subjectInRow(row, 'OPUS', 'store', DEFS))
      .toEqual({ dimension: 'store', id: 'OPUS', label: 'OPUS', from: 'label' });
  });

  it('finds nothing in rows that are about something else', () => {
    expect(subjectInRows([OTHER], 'OPUS', 'store', DEFS)).toBeNull();
  });
});

describe('the id a tap resolves, over the whole board', () => {
  // Two turns, each with one read at seq 0 — `seq` restarts every turn, which
  // is why the board keys on `turn:seq` and not on seq alone.
  const answers = [turn(0, [{ store: 'OPUS', value: 1 }]), turn(0, [SHOP, OTHER])];
  const board = [object(0, 0), object(1, 0)];

  it('prefers a row that carries the id over one that only carries the name', () => {
    const found = subjectOnBoard({ answers, board, retuned: {}, defs: DEFS }, 'OPUS', 'store');
    expect(found).toEqual({
      dimension: 'store', id: '68c5bb269da1d500073690c2', label: 'OPUS', from: 'rows',
    });
  });

  it('still produces a subject for a label nothing on the board identifies', () => {
    const found = subjectOnBoard({ answers, board, retuned: {}, defs: DEFS }, 'Fairview', 'store');
    expect(found).toEqual({ dimension: 'store', id: 'Fairview', label: 'Fairview', from: 'label' });
  });

  it('reads the REPLAYED call where one replaced the stored read', () => {
    const retuned = {
      '1:0': { seq: 0, tool: 'get_sales', arguments: {},
               result: { rows: [{ store_id: 'moved-id', store: 'OPUS' }], meta: {} } },
    } as never;
    expect(subjectOnBoard({ answers, board, retuned, defs: DEFS }, 'OPUS', 'store').id)
      .toBe('moved-id');
  });
});

describe('what travels with the question', () => {
  const opus: Subject = { dimension: 'store', id: 's-opus', label: 'OPUS', from: 'rows' };
  const rock: Subject = { dimension: 'store', id: 's-rock', label: 'Rockwell', from: 'rows' };
  const mix: Subject = { dimension: 'product', id: 'p-mix', label: 'Aji Mix', from: 'mention' };

  it('sends ids and the labels the rows carried beside them', () => {
    expect(asSelection([opus, rock])).toEqual({
      dimension: 'store',
      subjects: [{ id: 's-opus', label: 'OPUS' }, { id: 's-rock', label: 'Rockwell' }],
    });
  });

  it('sends one dimension — the first picked', () => {
    expect(travelling([opus, mix])).toEqual([opus]);
    expect(asSelection([mix, opus])).toEqual({
      dimension: 'product', subjects: [{ id: 'p-mix', label: 'Aji Mix' }],
    });
  });

  it('sends nothing at all when nothing is picked', () => {
    expect(asSelection([])).toBeNull();
  });

  it('picks up and puts down by IDENTITY, not by name', () => {
    const twins: Subject = { dimension: 'product', id: 'p-two', label: 'Aji Mix', from: 'rows' };
    const held = toggleSubject([mix], twins, 12);
    expect(held).toHaveLength(2);
    expect(toggleSubject(held, mix, 12)).toEqual([twins]);
  });

  it('drops the oldest at the cap rather than refusing the newest tap', () => {
    let held: Subject[] = [];
    for (let n = 0; n < 5; n++) {
      held = toggleSubject(held, { dimension: 'store', id: `s-${n}`, label: `S${n}`, from: 'rows' }, 3);
    }
    expect(held.map((s) => s.id)).toEqual(['s-2', 's-3', 's-4']);
  });

  it('takes the cap from the definitions', () => {
    expect(maxSubjects(DEFS)).toBe(12);
    expect(maxSubjects(null)).toBe(12);
  });
});

describe('two subjects and a word are a replay', () => {
  const opus: Subject = { dimension: 'store', id: 's-opus', label: 'OPUS', from: 'rows' };
  const rock: Subject = { dimension: 'store', id: 's-rock', label: 'Rockwell', from: 'rows' };
  const mix: Subject = { dimension: 'product', id: 'p-mix', label: 'Aji Mix', from: 'rows' };

  it('scopes the stored read to the ids, never to the labels', () => {
    expect(comparisonReplay('compare these', [opus, rock], DEFS))
      .toEqual({ argument: 'store', value: ['s-opus', 's-rock'] });
  });

  it('answers to every word the definitions list, and to no other', () => {
    for (const said of ['compare these', 'Compare them?', 'THESE TWO', 'compare']) {
      expect(comparisonReplay(said, [opus, rock], DEFS)).not.toBeNull();
    }
    expect(comparisonReplay('compare these two shops please', [opus, rock], DEFS)).toBeNull();
    expect(comparisonReplay('why?', [opus, rock], DEFS)).toBeNull();
  });

  it('needs the minimum the definitions state', () => {
    expect(comparisonReplay('compare these', [opus], DEFS)).toBeNull();
  });

  it('refuses a dimension a replay has no argument for', () => {
    // A product is not a replay argument — `filters.sku` is not one of the
    // five scopes — so two products and "compare these" is George's question.
    expect(comparisonReplay('compare these', [mix, { ...mix, id: 'p-two' }], DEFS)).toBeNull();
  });

  it('is nothing at all without the definitions', () => {
    expect(comparisonReplay('compare these', [opus, rock], null)).toBeNull();
  });
});

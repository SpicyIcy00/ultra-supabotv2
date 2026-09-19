/**
 * WHICH COLUMNS A TABLE DRAWS, and which it must not.
 *
 * The owner, 2026-09-19, of the attention read drawn on his board: *"what does
 * this chart mean and is it a bug its showed up like this in multiple
 * answers?"* The screenshot showed VALUE, CHANGE PCT, RANK, SIZE and UNIT over
 * seventeen rows, of which two had a value and fifteen drew an em dash, the
 * rank column drawn in pesos, and nothing naming what any row was about.
 *
 * Three separate faults, all here:
 *
 *   1. the columns were read off `rows[0]`, so a read that returns rows of
 *      more than one shape advertised the first shape's fields for all of them;
 *   2. the tool's own machinery — `identity`, `section`, `floor`, `measure`,
 *      `source` — was eligible to be a column, and won the five-column cap
 *      against the one column that names the subject;
 *   3. the row's unit was applied to every numeric cell, so a rank was money.
 *
 * The rows below are the real shapes `get_attention` returns, read from the
 * live tool on 2026-09-19.
 */
import { describe, expect, it } from 'vitest';
import { fmt, tableShape, unitFor } from './data';

/** A shop whose sales moved against the same weekday. */
const SALES = {
  source: 'sales_vs_same_weekday',
  identity: 'sales_vs_same_weekday|Fairview|',
  measure: 'change', size: -13350, floor: 'brief.sales_vs_same_weekday',
  section: 'sales_vs_same_weekday', subject: 'Fairview',
  store_id: '668023c94721460006092609',
  value: 9630.5, baseline: 22980.5, change: -13350, change_pct: -58.1,
  direction: 'down', unit: 'PHP',
  threshold_applied: { kind: 'brief' }, receipts: { read_at: 'x' }, rank: 1,
};

/** A product that went out of stock. Almost nothing in common with the above. */
const STOCKOUT = {
  source: 'stock_crossed_out',
  identity: 'stock_crossed_out|Aji Kiamoy King Seedless|Magnolia',
  measure: 'was', size: 5, floor: 'brief.stock_crossed_out',
  section: 'stock_crossed_out', subject: 'Aji Kiamoy King Seedless',
  sku: 'SH1139', store: 'Magnolia', was: 5, now: 0,
  receipts: { read_at: 'x' }, rank: 3,
};

const ATTENTION = [
  SALES,
  { ...SALES, subject: 'Magnolia', value: 27620.08, change: 8753.01, change_pct: 46.4, rank: 2 },
  STOCKOUT,
  { ...STOCKOUT, subject: 'JS Water Dispenser Truck', sku: 'JS1002', rank: 4 },
  { ...STOCKOUT, subject: 'Bread Crispy(Nori)', sku: 'Pinyao24', store: 'Greenhills', size: 4, was: 4, rank: 5 },
];

/** An ordinary read: every row the same shape. */
const SALES_BY_STORE = [
  { store: 'Rockwell', value: 199949, change_pct: 4.2, unit: 'PHP' },
  { store: 'Magnolia', value: 88120, change_pct: -3.1, unit: 'PHP' },
  { store: 'Fairview', value: 41002, change_pct: 0.4, unit: 'PHP' },
];

describe('the columns a table draws', () => {
  it('names what each row is about', () => {
    const { columns } = tableShape(ATTENTION, null);
    expect(columns[0]).toBe('subject');
  });

  it('draws no column that most of its rows cannot fill', () => {
    const { columns } = tableShape(ATTENTION, null);
    // `value`, `change_pct` and `unit` belong to two of the five rows.
    for (const partial of ['value', 'change_pct', 'unit', 'was', 'now', 'sku', 'store']) {
      expect(columns, `${partial} is drawn and most rows have none`).not.toContain(partial);
    }
    // And every cell that IS drawn has something in it.
    for (const row of ATTENTION) {
      for (const c of columns) {
        expect(fmt(c, (row as Record<string, unknown>)[c], null),
          `${c} is empty on ${row.subject}`).not.toBe('—');
      }
    }
  });

  it('never draws the machinery the tool judged with', () => {
    const { columns, constant } = tableShape(ATTENTION, null);
    const drawn = [...columns, ...constant].join(' ');
    for (const internal of ['identity', 'section', 'floor', 'measure', 'source',
                            'threshold_applied']) {
      expect(drawn, `${internal} reached the answer`).not.toContain(internal);
    }
  });

  it('leaves an ordinary read alone', () => {
    const { columns } = tableShape(SALES_BY_STORE, null);
    expect(columns).toEqual(['store', 'value', 'change_pct']);
  });

  it('still drops a column with one value on every row into the caption', () => {
    const { constant, columns } = tableShape(SALES_BY_STORE, null);
    // `unit` is 'PHP' on all three, so it is said once rather than repeated.
    expect(columns).not.toContain('unit');
    expect(constant.join(' ')).toContain('PHP');
  });

  it('reads the columns off every row, not the first one', () => {
    // The stockout shape first: `sku` and `store` are now the ones row 1 lacks.
    const reversed = [...ATTENTION].reverse();
    const { columns } = tableShape(reversed, null);
    expect(columns[0]).toBe('subject');
    expect(columns).not.toContain('sku');
    expect(columns).not.toContain('value');
  });
});

describe('the unit a cell is drawn in', () => {
  it('is not applied to a position in a list', () => {
    expect(unitFor('rank', SALES, null)).toBeNull();
    expect(fmt('rank', 1, unitFor('rank', SALES, null))).toBe('1');
  });

  it('is applied to what the read measured', () => {
    expect(unitFor('value', SALES, null)).toBe('PHP');
    expect(fmt('value', 9630.5, unitFor('value', SALES, null))).toBe('₱9,631');
  });

  it('is not applied to a count of days or rows', () => {
    const row = { days_out_of_stock: 21, unit: 'PHP' };
    expect(unitFor('days_out_of_stock', row, null)).toBeNull();
    expect(fmt('days_out_of_stock', 21, unitFor('days_out_of_stock', row, null))).toBe('21');
  });

  it('leaves a percentage a percentage whatever the unit says', () => {
    expect(fmt('change_pct', -58.1, 'PHP')).toBe('-58.1%');
  });
});

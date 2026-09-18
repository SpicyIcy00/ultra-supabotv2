/**
 * FORMATTING READS THE UNIT; IT NEVER GUESSES IT.
 *
 * Two defects from the same twenty-line function, both reported by the owner
 * on 2026-09-13 and both fixed in P1.c:
 *
 *   A COUNT OF TRANSACTIONS DRAWN AS `₱1,187`. The peso sign came from a
 *   regular expression over the COLUMN NAME, and `value` was in it — so every
 *   compared row, whatever it measured, was money to the formatter. The fix
 *   is not a better regular expression: the rows and the read already carry
 *   the unit, so the unit decides.
 *
 *   `[object Object]` IN A TILE'S CAPTION — `ATTENTION · 16 ROWS ·
 *   [object Object] · · NO`, the empty field beside it being `String([])`.
 *   A brief row carries `receipts` and `threshold_applied`, both objects, and
 *   the last line of `fmt` was `String(v)`.
 *
 * `fmt` is imported by six modules and the object panel is untouched by the
 * board's redesign, so this is not work the next card throws away.
 */
import { describe, expect, it } from 'vitest';
import { fmt, unitOf } from './data';
import type { ToolMeta } from '../types/bob';

describe('a figure is drawn in the unit its read declared', () => {
  it('draws a count as a count, whatever the column is called', () => {
    expect(fmt('value', 1187, 'transactions')).toBe('1,187');
    expect(fmt('value', 1187, 'units')).toBe('1,187');
  });

  it('draws money as money', () => {
    expect(fmt('value', 203717, 'PHP')).toBe('₱203,717');
  });

  it('takes the unit off the row, or off the read when the row is silent', () => {
    expect(unitOf({ store: 'OPUS', value: 12, unit: 'transactions' })).toBe('transactions');
    expect(unitOf({ metric_unit: 'PHP' } as ToolMeta)).toBe('PHP');
    expect(unitOf({ store: 'OPUS', value: 12 })).toBeNull();
  });

  it('reads a percentage as one even beside a peso figure', () => {
    // The unit says what the VALUE is in; a change against it is still a
    // percentage. ₱13.8 was the bug this ordering prevents.
    expect(fmt('change_pct', 13.8, 'PHP')).toBe('+13.8%');
  });

  it('falls back to the column name only where the name itself says money', () => {
    expect(fmt('net_sales', 203717)).toBe('₱203,717');
    expect(fmt('unit_cost', 12.5)).toBe('₱12.5');
    // A generic magnitude word is not evidence of a currency — this is the
    // exact guess that drew transactions in pesos.
    expect(fmt('value', 1187)).toBe('1,187');
    expect(fmt('total', 1187)).toBe('1,187');
  });
});

describe('a value with no reading is drawn as one that has none', () => {
  it('never writes the words "object Object" into a caption', () => {
    expect(fmt('receipts', { source_table: 'new_transactions' })).toBe('—');
    expect(fmt('threshold_applied', { pct_threshold: 20 })).toBe('—');
  });

  it('draws an empty list as nothing, not as an empty field', () => {
    expect(fmt('filters_applied', [])).toBe('—');
  });

  it('still reads a list of plain values', () => {
    expect(fmt('sections', ['sales', 'stock'])).toBe('sales, stock');
  });

  it('leaves everything it always drew alone', () => {
    expect(fmt('store', 'OPUS')).toBe('OPUS');
    expect(fmt('day', '2026-09-14T00:00:00')).toBe('2026-09-14');
    expect(fmt('silent', false)).toBe('no');
    expect(fmt('value', null)).toBe('—');
  });
});

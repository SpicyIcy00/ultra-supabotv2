import { describe, expect, it } from 'vitest';
import {
  cssString,
  headerVars,
  MAX_COLUMNS_THAT_FIT,
  shouldStack,
  tableHeaders,
  textOf,
  type HastNode,
} from './proseTable';

const text = (value: string): HastNode => ({ type: 'text', value });
const el = (tagName: string, children: HastNode[]): HastNode => ({
  type: 'element', tagName, children,
});

/** A table node shaped as react-markdown hands one over, whitespace included. */
function table(headers: string[]): HastNode {
  return el('table', [
    text('\n'),
    el('thead', [
      text('\n'),
      el('tr', headers.flatMap((h) => [text('\n'), el('th', [text(h)])])),
    ]),
    text('\n'),
    el('tbody', [el('tr', headers.map(() => el('td', [text('x')])))]),
  ]);
}

describe('reading the header row', () => {
  it('takes the column headings in order', () => {
    expect(tableHeaders(table(['Store', 'Net sales']))).toEqual(['Store', 'Net sales']);
  });

  it('reads through emphasis in a heading', () => {
    const node = el('table', [
      el('thead', [el('tr', [el('th', [el('strong', [text('Net ')]), text('sales')])])]),
    ]);
    expect(tableHeaders(node)).toEqual(['Net sales']);
  });

  it('is empty rather than throwing for a table with no header', () => {
    expect(tableHeaders(el('table', [el('tbody', [])]))).toEqual([]);
    expect(tableHeaders(undefined)).toEqual([]);
  });

  it('collapses nothing it was not given', () => {
    expect(textOf(undefined)).toBe('');
    expect(textOf(text('  Store  ')).trim()).toBe('Store');
  });
});

describe('which representation a table gets', () => {
  it('keeps a table a table while it can still fit', () => {
    // The four-column case this exists for: rank, SKU, product, revenue.
    expect(shouldStack(2)).toBe(false);
    expect(shouldStack(MAX_COLUMNS_THAT_FIT)).toBe(false);
  });

  it('stacks once the columns cannot fit', () => {
    expect(shouldStack(MAX_COLUMNS_THAT_FIT + 1)).toBe(true);
    expect(shouldStack(9)).toBe(true);
  });
});

describe('labels for the stacked layout', () => {
  it('numbers the columns from one', () => {
    expect(headerVars(['Store', 'Net sales'])).toEqual({
      '--col-1': '"Store"',
      '--col-2': '"Net sales"',
    });
  });

  it('leaves an empty heading unlabelled rather than labelling it blank', () => {
    expect(headerVars(['', 'Net sales'])).toEqual({ '--col-2': '"Net sales"' });
  });

  it('escapes a heading that could break out of the declaration', () => {
    expect(cssString('a "quoted" name')).toBe('"a \\"quoted\\" name"');
    expect(cssString('back\\slash')).toBe('"back\\\\slash"');
  });
});

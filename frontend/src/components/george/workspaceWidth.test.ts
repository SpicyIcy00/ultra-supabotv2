/**
 * The column is sized by the content, and by nothing else.
 *
 * The property under test is that no question text reaches this decision. It
 * takes shapes and block structure; there is nowhere for a per-question rule
 * or a topic list to hide.
 */
import { describe, expect, it } from 'vitest';
import type { Shape } from './pinShape';
import type { ResultBlock, ShapedResult } from './resultShape';
import {
  widestWidth,
  widthForBlock,
  widthForShape,
  workspaceWidth,
  WIDE_GROUP_MEMBERS,
} from './workspaceWidth';

const shaped = (shape: Shape): ShapedResult => ({
  source: { seq: 1, tool: 'get_sales', rows: [], meta: {} },
  shape,
});

const NUMBER: Shape = { kind: 'number', value: 1, unit: 'PHP' };
const TABLE: Shape = { kind: 'table', columns: ['store', 'value'], rows: [] };
const CHART: Shape = { kind: 'chart', x: 'day', mark: 'line', rows: [] };
const COMPARISON: Shape = {
  kind: 'comparison',
  rows: [
    { subject: 'Rockwell', value: 1, changePct: -12.4, direction: 'down', row: {} },
  ],
};

describe('widthForShape', () => {
  it('gives a table and a chart the room', () => {
    expect(widthForShape(TABLE)).toBe('wide');
    expect(widthForShape(CHART)).toBe('wide');
  });

  it('keeps a figure and a comparison at a readable measure', () => {
    // These read DOWN a column. Stretching them to 1200px makes them worse.
    expect(widthForShape(NUMBER)).toBe('reading');
    expect(widthForShape(COMPARISON)).toBe('reading');
  });
});

describe('widthForBlock', () => {
  const group = (n: number): ResultBlock => ({
    kind: 'group',
    members: Array.from({ length: n }, () => shaped(NUMBER)),
  });

  it('widens once figures are read across rather than down', () => {
    expect(widthForBlock(group(WIDE_GROUP_MEMBERS))).toBe('wide');
  });

  it('leaves a pair at the reading measure', () => {
    expect(widthForBlock(group(WIDE_GROUP_MEMBERS - 1))).toBe('reading');
  });

  it('takes a single block’s width from its shape', () => {
    expect(widthForBlock({ kind: 'single', result: shaped(TABLE) })).toBe('wide');
    expect(widthForBlock({ kind: 'single', result: shaped(NUMBER) })).toBe('reading');
  });
});

describe('workspaceWidth', () => {
  it('is reading when there is nothing to draw', () => {
    expect(workspaceWidth([])).toBe('reading');
  });

  it('is the widest any block asks for — one column, one answer', () => {
    expect(
      workspaceWidth([
        { kind: 'single', result: shaped(NUMBER) },
        { kind: 'single', result: shaped(CHART) },
      ]),
    ).toBe('wide');
  });
});

describe('widestWidth', () => {
  it('does not narrow again once something in the thread needs the room', () => {
    // The column would jump under the reader's hands as they scrolled, and
    // the composer with it.
    expect(widestWidth(['wide', 'reading', 'reading'])).toBe('wide');
  });

  it('is reading for an empty thread', () => {
    expect(widestWidth([])).toBe('reading');
  });
});

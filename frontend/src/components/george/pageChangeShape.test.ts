import { describe, expect, it } from 'vitest';
import type { PageChangedFrame } from '../../types/george';
import { operationLine, pageChangeLines, saysDeleted } from './pageChangeShape';

function frame(over: Partial<PageChangedFrame> = {}): PageChangedFrame {
  return {
    page_id: 'p-1', title: 'Rockwell Weekly', purpose: null,
    updated_at: '2026-09-08T01:00:00+00:00', analysis_count: 3,
    analyses: [], operations: [], created: false, ...over,
  };
}

describe('a create', () => {
  it('is one line naming the page and how many analyses it holds', () => {
    const f = frame({ created: true, analysis_count: 3,
      operations: [{ op: 'create' }, { op: 'add', title: 'A' }, { op: 'add', title: 'B' }, { op: 'add', title: 'C' }] });
    expect(pageChangeLines(f)).toEqual(['Created page “Rockwell Weekly” with 3 analyses']);
  });

  it('says empty when it is', () => {
    expect(pageChangeLines(frame({ created: true, analysis_count: 0, operations: [{ op: 'create' }] })))
      .toEqual(['Created page “Rockwell Weekly”, empty']);
  });
});

describe('an edit', () => {
  it('lists each operation in order, in the agreed words', () => {
    const f = frame({ operations: [
      { op: 'rename', from: 'Rockwell', to: 'Rockwell Weekly' },
      { op: 'set_purpose', from: null, to: 'Watch it.' },
      { op: 'add', title: 'Category performance', source: 'new' },
      { op: 'place', title: 'ATP', from_position: 2, position: 0 },
      { op: 'place', title: 'Units', from_position: 0, position: 3 },
      { op: 'remove', title: 'Units', from_page: 'Rockwell Weekly', to: 'ungrouped' },
      { op: 'move_to_page', title: 'Trend', from_page: 'Rockwell Weekly', to_page: 'Aji Overview' },
      { op: 'move_to_page', title: 'Trend', from_page: 'Rockwell Weekly', to_page: null },
    ] });
    expect(pageChangeLines(f)).toEqual([
      'Renamed page “Rockwell” to “Rockwell Weekly”',
      'Set the purpose of “Rockwell Weekly”',
      'Added “Category performance” to “Rockwell Weekly”',
      'Moved “ATP” up',
      'Moved “Units” down',
      'Removed “Units” from “Rockwell Weekly” · kept in Ungrouped',
      'Moved “Trend” from “Rockwell Weekly” to “Aji Overview”',
      'Moved “Trend” from “Rockwell Weekly” to Ungrouped',
    ]);
  });

  it('never says deleted, whatever the operation', () => {
    const ops = ['rename', 'set_purpose', 'add', 'place', 'remove', 'move_to_page', 'create', 'mystery'];
    const lines = ops.map((op) => operationLine({ op, title: 'X', from: 'a', to: 'b' }, frame()));
    expect(saysDeleted(lines)).toBe(false);
  });

  it('names an unknown operation rather than hiding it', () => {
    expect(operationLine({ op: 'mystery' }, frame())).toBe('mystery on “Rockwell Weekly”');
  });

  it('has a line even when the frame carried no operations', () => {
    expect(pageChangeLines(frame())).toEqual(['Changed page “Rockwell Weekly”']);
  });
});

/**
 * The spine is derived from frames and says nothing a frame did not say.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../../types/george';
import { segmentLabel, spineSegments, spineSummary } from './spineShape';

const call = (seq: number, tool: string, extra: Partial<ToolCall> = {}): ToolCall => ({
  seq,
  tool,
  arguments: { metric: 'net_sales', compare_to: 'previous_period', filters: { store: 'Rockwell' } },
  ...extra,
});
const back = (seq: number, tool: string, error: string | null = null): ToolCall =>
  call(seq, tool, {
    result: { row_count: 1, source_table: 'x', truncated: false, duration_ms: 1, error, rows: [], rows_complete: true },
  });

describe('segments', () => {
  it('is one per call, in call order', () => {
    const s = spineSegments([call(1, 'get_sales'), call(2, 'get_stock')], undefined, false);
    expect(s.map((x) => x.seq)).toEqual([1, 2]);
  });

  it('is outlined until the result lands, then filled', () => {
    expect(spineSegments([call(1, 'get_sales')], undefined, false)[0].state).toBe('pending');
    expect(spineSegments([back(1, 'get_sales')], undefined, false)[0].state).toBe('done');
  });

  it('is hatched when the tool declined', () => {
    expect(spineSegments([back(1, 'get_sales', 'refused: window in progress')], undefined, false)[0].state).toBe('refused');
  });

  it('is dimmed when the call repeated an earlier one', () => {
    expect(spineSegments([call(2, 'get_sales', { duplicate_of: 1 })], undefined, false)[0].state).toBe('repeated');
  });

  it('treats a settled unit\'s resultless calls as done, never as in flight', () => {
    // A stored post's calls carry no results.
    expect(spineSegments([call(1, 'get_sales')], undefined, true)[0].state).toBe('done');
  });

  it('is not a segment for the label tool: recording what the reads were is not a read', () => {
    const s = spineSegments([back(1, 'get_sales'), back(2, 'record_findings')], undefined, false);
    expect(s.map((x) => x.seq)).toEqual([1]);
  });

  it('knows its rung once George has said what the read was', () => {
    const s = spineSegments(
      [back(1, 'get_sales'), back(2, 'get_sales')],
      [{ seq: 1, role: 'primary', of: null, tool: 'get_sales' }, { seq: 2, role: 'driver', of: 1, tool: 'get_sales' }],
      false,
    );
    expect(s.map((x) => x.rungLabel)).toEqual(['The figure', 'What moved it']);
  });
});

describe('what it says of itself', () => {
  it('counts what is back while live, and only counts', () => {
    const s = spineSegments([back(1, 'get_sales'), call(2, 'get_stock')], undefined, false);
    expect(spineSummary(s, true)).toBe('1 of 2 reads back');
    expect(spineSummary(s, false)).toBe('2 reads');
  });

  it('counts a refusal as back and names it', () => {
    const s = spineSegments([back(1, 'get_sales', 'no')], undefined, true);
    expect(spineSummary(s, false)).toBe('1 read, 1 declined');
  });

  it('names a segment in words and never by its identifier', () => {
    const s = spineSegments([back(1, 'get_sales'), call(2, 'get_stock')], [{ seq: 1, role: 'primary', of: null, tool: 'get_sales' }], false);
    expect(segmentLabel(s[0])).toBe('The figure: compared sales at Rockwell');
    expect(segmentLabel(s[1])).toBe('counting stock…');
    for (const seg of s) expect(segmentLabel(seg)).not.toMatch(/get_/);
  });
});

describe('the fill respects reduced motion', () => {
  // jsdom evaluates no stylesheets, so the rule is read from index.css: the
  // segment's transition must be answered inside the reduced-motion block,
  // exactly as markState.test.ts holds the mark's states.
  const css = readFileSync(join(__dirname, '..', '..', 'index.css'), 'utf8');

  it('has a transition, and no animation', () => {
    const rule = css.split('.george-spine-segment {')[1].split('}')[0];
    expect(rule).toMatch(/transition:/);
    expect(rule).not.toMatch(/animation/);
  });

  it('turns the transition off under prefers-reduced-motion', () => {
    const reduced = css.split('@media (prefers-reduced-motion: reduce)')[1];
    expect(reduced).toMatch(/\.george-spine-segment\s*\{\s*transition:\s*none;?\s*\}/);
  });
});

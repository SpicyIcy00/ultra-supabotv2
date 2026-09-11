import { describe, expect, it } from 'vitest';
import { receiptsDetail, receiptsLine, windowLabel } from './data';
import type { ToolMeta } from '../types/george';

// THE LINE SAYS WHAT AND WHEN. "new_transactions · 2026-09-07 → 2026-09-12"
// told the reader where the figures lived, not what they were; and the
// half-open end named a day the read never covered.
describe('the receipts line', () => {
  const meta = {
    source_table: 'new_transactions', metric_label: 'Net sales',
    group_by: ['store'], snapshot_timestamp: '2026-09-11T12:56:00Z',
    window: { kind: 'explicit', start: '2026-09-07', end: '2026-09-12', convention: 'half-open [start, end)' },
    filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  } as unknown as ToolMeta;

  it('says the measure, the cut, the days and the read time — not the table', () => {
    const line = receiptsLine(meta);
    expect(line).toContain('Net sales');
    expect(line).toContain('per shop');
    expect(line).toContain('7 Sep → 11 Sep 2026');
    expect(line).toMatch(/read Sep 11/);
    expect(line).not.toContain('new_transactions');
  });

  it('keeps the table and the filters in the detail, one hover away', () => {
    const detail = receiptsDetail(meta);
    expect(detail).toContain('from new_transactions');
    expect(detail).toContain('t.is_cancelled = false');
    expect(detail).not.toContain('metrics.yaml');
  });

  it('names a preset window by its name', () => {
    expect(windowLabel({ window: { kind: 'preset', name: 'last_30_days' } } as unknown as ToolMeta)).toBe('last 30 days');
  });
});

describe('a window bound to the hour', () => {
  // The week so far is Monday 00:00 to now, and "now" has an hour. The label
  // says so, and does not step the end back a day as it does for a date-only
  // half-open end, because 14:32 is not midnight.
  it('names the day and the hour the read ran to', () => {
    const meta = { window: { kind: 'preset', name: 'this_week', start: '2026-09-07 00:00:00',
                             end: '2026-09-12 14:32:10', convention: 'half-open [start, end), Manila timestamps' } } as unknown as ToolMeta;
    expect(windowLabel(meta)).toBe('this week so far, to 12 Sep 14:32');
  });
  it('still steps a date-only half-open end back to the last day covered', () => {
    const meta = { window: { kind: 'explicit', start: '2026-09-07', end: '2026-09-12', convention: 'half-open [start, end)' } } as unknown as ToolMeta;
    expect(windowLabel(meta)).toBe('7 Sep → 11 Sep 2026');
  });
});

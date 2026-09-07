import { describe, expect, it } from 'vitest';
import type { PageContextFrame, PageContextPin } from '../../types/george';
import {
  failedPins,
  hasCaveat,
  PAGE_READ_TOOL,
  pageContextLine,
  pageName,
  pinStatusLabel,
} from './pageContextShape';
import { UNGROUPED_NAME } from './pageShape';

function pin(over: Partial<PageContextPin> & { pin_id: string }): PageContextPin {
  return {
    title: over.pin_id, status: 'ok', reason: null, calls: [], snapshot_timestamp: null,
    notice_kinds: [], ...over,
  };
}

function ctx(over: Partial<PageContextFrame> = {}): PageContextFrame {
  return {
    page: 'AJI BARN Reorder', read_at: '2026-09-07T09:00:00+08:00', figures: true,
    pins_total: 7, pins_inspected: 5, pins_reproduced: 5,
    pins: [1, 2, 3, 4, 5].map((i) => pin({ pin_id: `p${i}` })),
    not_inspected: [{ pin_id: 'p6', title: 'Six' }, { pin_id: 'p7', title: 'Seven' }],
    unavailable: [], partial: false, truncated: true, rows_dropped: 0, notice_kinds: [],
    ...over,
  };
}

describe('the line above the disclosure', () => {
  it('says how much of the page was read and what was not inspected', () => {
    expect(pageContextLine(ctx())).toBe('Read 5 of 7 saved analyses · 2 not inspected');
  });

  it('is complete and quiet when the whole page came back', () => {
    expect(pageContextLine(ctx({ pins_total: 5, not_inspected: [], truncated: false }))).toBe(
      'Read 5 of 5 saved analyses',
    );
  });

  it('counts what could not be reproduced', () => {
    const c = ctx({
      pins: [
        pin({ pin_id: 'p1' }),
        pin({ pin_id: 'p2', status: 'refused' }),
        pin({ pin_id: 'p3', status: 'not_read', reason: 'deadline' }),
      ],
      pins_inspected: 3, pins_total: 3, not_inspected: [], partial: true,
    });
    expect(pageContextLine(c)).toBe('Read 3 of 3 saved analyses · 2 could not be reproduced');
    expect(failedPins(c).map((p) => p.pin_id)).toEqual(['p2', 'p3']);
  });

  it('does not count definitions-only pins as failures', () => {
    const c = ctx({
      figures: false, pins_total: 4, pins_inspected: 4, not_inspected: [], truncated: false,
      pins: [1, 2, 3, 4].map((i) =>
        pin({ pin_id: `p${i}`, status: 'not_read', reason: 'figures_not_requested' }),
      ),
    });
    expect(failedPins(c)).toEqual([]);
    expect(pageContextLine(c)).toBe(
      'Looked at what is pinned: 4 of 4 saved analyses, figures not read',
    );
  });

  it('reads singular for one', () => {
    expect(
      pageContextLine(ctx({ pins_total: 1, pins_inspected: 1, pins: [pin({ pin_id: 'p1' })],
        not_inspected: [], truncated: false })),
    ).toBe('Read 1 of 1 saved analysis');
  });

  it('names requested ids that were not on the page', () => {
    expect(pageContextLine(ctx({ unavailable: ['x', 'y'], partial: true }))).toBe(
      'Read 5 of 7 saved analyses · 2 not inspected · 2 ids not on this page',
    );
  });

  it('never prints a business figure', () => {
    const line = pageContextLine(ctx());
    expect(line).not.toMatch(/₱|PHP|units/);
  });
});

describe('each state keeps its own word', () => {
  it.each([
    [pin({ pin_id: 'a', status: 'ok' }), 'reproduced'],
    [pin({ pin_id: 'b', status: 'refused' }), 'George declined this one'],
    [pin({ pin_id: 'c', status: 'failed' }), 'failed to run'],
    [pin({ pin_id: 'd', status: 'unrunnable' }), 'can no longer run'],
    [pin({ pin_id: 'e', status: 'not_read', reason: 'deadline' }), 'not read — the time limit passed first'],
    [pin({ pin_id: 'f', status: 'not_read', reason: 'figures_not_requested' }), 'definitions only'],
  ])('%o', (p, label) => {
    expect(pinStatusLabel(p)).toBe(label);
  });

  it('gives no two states the same label', () => {
    const labels = [
      pin({ pin_id: 'a', status: 'ok' }),
      pin({ pin_id: 'b', status: 'refused' }),
      pin({ pin_id: 'c', status: 'failed' }),
      pin({ pin_id: 'd', status: 'unrunnable' }),
      pin({ pin_id: 'e', status: 'not_read', reason: 'deadline' }),
      pin({ pin_id: 'f', status: 'not_read', reason: 'figures_not_requested' }),
    ].map(pinStatusLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('shows an unknown state plainly rather than describing it wrongly', () => {
    expect(pinStatusLabel(pin({ pin_id: 'z', status: 'something_new' }))).toBe('something_new');
  });
});

describe('the page and the caveat', () => {
  it('names the ungrouped pins only in words, from null', () => {
    expect(pageName(ctx({ page: null }))).toBe(UNGROUPED_NAME);
    expect(pageName(ctx())).toBe('AJI BARN Reorder');
  });

  it('has a caveat when the read was partial or truncated', () => {
    expect(hasCaveat(ctx())).toBe(true);
    expect(hasCaveat(ctx({ truncated: false, partial: false }))).toBe(false);
    expect(hasCaveat(ctx({ truncated: false, partial: true }))).toBe(true);
  });

  it('names the tool whose rows are pins', () => {
    expect(PAGE_READ_TOOL).toBe('view_page');
  });
});

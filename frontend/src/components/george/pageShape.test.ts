import { describe, expect, it } from 'vitest';
import type { Pin } from '../../types/pins';
import {
  CONTENTS_SHOWN,
  freshness,
  PAGE_CONTEXT_MAX,
  pageContextFor,
  pagePath,
  pagesOf,
  UNGROUPED_NAME,
  UNGROUPED_PARAM,
} from './pageShape';

function pin(over: Partial<Pin> & { id: string; title: string }): Pin {
  return {
    question: null, page: null, conversation_id: null, tool_calls: [],
    created_at: '2026-09-01T00:00:00Z', last_run_at: null, last_ok_at: null,
    last_status: null, ...over,
  };
}

describe('grouping pins into pages', () => {
  it('describes a page by what is on it, not by how much', () => {
    const view = pagesOf([
      pin({ id: '1', title: 'PO value by status', page: 'AJI BARN Reorder' }),
      pin({ id: '2', title: 'Dead at retail', page: 'AJI BARN Reorder' }),
    ])[0];
    expect(view.name).toBe('AJI BARN Reorder');
    expect(view.contents).toEqual(['PO value by status', 'Dead at retail']);
    expect(view.more).toBe(0);
    expect(view.pins).toHaveLength(2);
  });

  it('quotes a few titles and counts the rest', () => {
    const pins = Array.from({ length: CONTENTS_SHOWN + 2 }, (_, i) =>
      pin({ id: String(i), title: `Question ${i}`, page: 'P' }),
    );
    const view = pagesOf(pins)[0];
    expect(view.contents).toHaveLength(CONTENTS_SHOWN);
    expect(view.more).toBe(2);
  });

  it('keeps the pins with no page as a real page', () => {
    const view = pagesOf([pin({ id: '1', title: 'Loose question' })])[0];
    expect(view.page).toBeNull();
    expect(view.name).toBe(UNGROUPED_NAME);
  });

  it('drops no pin, whatever page it claims', () => {
    const views = pagesOf([
      pin({ id: '1', title: 'a', page: 'One' }),
      pin({ id: '2', title: 'b' }),
      pin({ id: '3', title: 'c', page: 'Two' }),
    ]);
    expect(views.flatMap((v) => v.pins.map((p) => p.id)).sort()).toEqual(['1', '2', '3']);
  });

  it('is empty for no pins at all', () => {
    expect(pagesOf([])).toEqual([]);
  });
});

describe('freshness', () => {
  it('is the newest successful run across the page', () => {
    const view = pagesOf([
      pin({ id: '1', title: 'a', page: 'P', last_ok_at: '2026-09-01T00:00:00Z' }),
      pin({ id: '2', title: 'b', page: 'P', last_ok_at: '2026-09-05T00:00:00Z' }),
      pin({ id: '3', title: 'c', page: 'P', last_ok_at: null }),
    ])[0];
    expect(view.lastOk).toBe('2026-09-05T00:00:00Z');
  });

  it('is null when nothing on the page has ever come back', () => {
    expect(pagesOf([pin({ id: '1', title: 'a', page: 'P' })])[0].lastOk).toBeNull();
  });

  it('says never rather than going blank, which would read as up to date', () => {
    expect(freshness(null, () => 'x')).toBe('never read');
    expect(freshness('2026-09-05T00:00:00Z', () => '2 d ago')).toBe('last read 2 d ago');
  });
});

describe('order', () => {
  it('puts the page with the newest pin first', () => {
    const views = pagesOf([
      pin({ id: '1', title: 'old', page: 'Old', created_at: '2026-08-01T00:00:00Z' }),
      pin({ id: '2', title: 'new', page: 'New', created_at: '2026-09-06T00:00:00Z' }),
    ]);
    expect(views.map((v) => v.name)).toEqual(['New', 'Old']);
  });
});

describe('the page context handed to Ask', () => {
  it('carries the page’s identity', () => {
    expect(pageContextFor('AJI BARN Reorder')).toBe('Pages / AJI BARN Reorder');
    expect(pageContextFor(null)).toBe(`Pages / ${UNGROUPED_NAME}`);
  });

  it('claims nothing about the page’s contents having been read', () => {
    // The loop renders this as "[The user is on the … page.]". George cannot
    // read a page's pins, so the context must not say or imply that he has:
    // no figures, no titles, no word for what is on the page.
    const ctx = pageContextFor('AJI BARN Reorder');
    for (const claim of ['pin', 'result', 'figure', 'loaded', 'read', 'contains', 'shows']) {
      expect(ctx.toLowerCase()).not.toContain(claim);
    }
  });

  it('fits what the backend accepts, cut rather than refused', () => {
    const long = 'x'.repeat(PAGE_CONTEXT_MAX * 2);
    expect(pageContextFor(long)).toHaveLength(PAGE_CONTEXT_MAX);
    expect(pageContextFor(long).startsWith('Pages / ')).toBe(true);
  });
});

describe('where a page lives', () => {
  it('links a named page by its name and the ungrouped pins by their marker', () => {
    expect(pagePath('FFR Overview')).toBe('/pages?p=FFR%20Overview');
    expect(pagePath(null)).toBe(`/pages?p=${UNGROUPED_PARAM}`);
  });
});

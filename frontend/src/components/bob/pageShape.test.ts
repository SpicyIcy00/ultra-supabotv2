import { describe, expect, it } from 'vitest';
import type { Page, Pin } from '../../types/pins';
import {
  CONTENTS_SHOWN,
  freshness,
  LEGACY_UNGROUPED_PARAM,
  legacyPagePath,
  PAGE_CONTEXT_MAX,
  pageContextFor,
  pageIdFromSegment,
  pagePath,
  pageViews,
  UNGROUPED_NAME,
  UNGROUPED_SEGMENT,
} from './pageShape';

function pin(over: Partial<Pin> & { id: string; title: string }): Pin {
  return {
    question: null, page: null, page_id: null, position: 0, conversation_id: null,
    tool_calls: [], created_at: '2026-09-01T00:00:00Z', last_run_at: null,
    last_ok_at: null, last_status: null, ...over,
  };
}

function page(over: Partial<Page> & { id: string; title: string }): Page {
  return {
    purpose: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    pins: 0, ...over,
  };
}

const REORDER = page({ id: 'p-reorder', title: 'AJI BARN Reorder', purpose: 'Reorder before it runs out.' });

describe('the Pages list', () => {
  it('describes a page by what is on it, and by the purpose its owner wrote', () => {
    const [view] = pageViews([REORDER], [
      pin({ id: '1', title: 'PO value by status', page_id: 'p-reorder', position: 0 }),
      pin({ id: '2', title: 'Dead at retail', page_id: 'p-reorder', position: 1 }),
    ]);
    expect(view.pageId).toBe('p-reorder');
    expect(view.name).toBe('AJI BARN Reorder');
    expect(view.purpose).toBe('Reorder before it runs out.');
    expect(view.contents).toEqual(['PO value by status', 'Dead at retail']);
    expect(view.more).toBe(0);
    expect(view.pins).toHaveLength(2);
  });

  it('shows the page in its own order, not the order the pins arrived', () => {
    const [view] = pageViews([REORDER], [
      pin({ id: '2', title: 'second', page_id: 'p-reorder', position: 1 }),
      pin({ id: '1', title: 'first', page_id: 'p-reorder', position: 0 }),
    ]);
    expect(view.contents).toEqual(['first', 'second']);
  });

  it('quotes a few titles and counts the rest', () => {
    const pins = Array.from({ length: CONTENTS_SHOWN + 2 }, (_, i) =>
      pin({ id: String(i), title: `Question ${i}`, page_id: 'p-reorder', position: i }),
    );
    const [view] = pageViews([REORDER], pins);
    expect(view.contents).toHaveLength(CONTENTS_SHOWN);
    expect(view.more).toBe(2);
  });

  it('lists an EMPTY page as a page: it exists before anything is on it', () => {
    const [view] = pageViews([page({ id: 'p-new', title: 'Rockwell Weekly' })], []);
    expect(view.pageId).toBe('p-new');
    expect(view.pins).toEqual([]);
    expect(view.contents).toEqual([]);
    expect(view.lastOk).toBeNull();
  });

  it('keeps the pins with no page as Ungrouped, last, and never as a page id', () => {
    const views = pageViews([REORDER], [
      pin({ id: '1', title: 'Loose question' }),
      pin({ id: '2', title: 'On the page', page_id: 'p-reorder' }),
    ]);
    expect(views.map((v) => v.name)).toEqual(['AJI BARN Reorder', UNGROUPED_NAME]);
    expect(views[1].pageId).toBeNull();
    expect(views[1].purpose).toBeNull();
  });

  it('shows no Ungrouped entry when nothing is ungrouped', () => {
    const views = pageViews([REORDER], [pin({ id: '2', title: 'x', page_id: 'p-reorder' })]);
    expect(views.map((v) => v.name)).toEqual(['AJI BARN Reorder']);
  });

  it('drops no pin: one whose page is not in the list counts as ungrouped', () => {
    const views = pageViews([REORDER], [
      pin({ id: '1', title: 'a', page_id: 'p-reorder' }),
      pin({ id: '2', title: 'b' }),
      pin({ id: '3', title: 'c', page_id: 'p-gone' }),
    ]);
    expect(views.flatMap((v) => v.pins.map((p) => p.id)).sort()).toEqual(['1', '2', '3']);
  });

  it('keeps the order the server gave: most recently changed first', () => {
    const views = pageViews(
      [page({ id: 'new', title: 'New' }), page({ id: 'old', title: 'Old' })],
      [],
    );
    expect(views.map((v) => v.name)).toEqual(['New', 'Old']);
  });

  it('is empty for no pages and no pins at all', () => {
    expect(pageViews([], [])).toEqual([]);
  });
});

describe('freshness', () => {
  it('is the newest successful run across the page', () => {
    const [view] = pageViews([REORDER], [
      pin({ id: '1', title: 'a', page_id: 'p-reorder', last_ok_at: '2026-09-01T00:00:00Z' }),
      pin({ id: '2', title: 'b', page_id: 'p-reorder', last_ok_at: '2026-09-05T00:00:00Z' }),
      pin({ id: '3', title: 'c', page_id: 'p-reorder', last_ok_at: null }),
    ]);
    expect(view.lastOk).toBe('2026-09-05T00:00:00Z');
  });

  it('says never rather than going blank, which would read as up to date', () => {
    expect(freshness(null, () => 'x')).toBe('never read');
    expect(freshness('2026-09-05T00:00:00Z', () => '2 d ago')).toBe('last read 2 d ago');
  });
});

describe('the page context handed to Ask', () => {
  it('carries the page’s title, as words', () => {
    expect(pageContextFor('AJI BARN Reorder')).toBe('Pages / AJI BARN Reorder');
    expect(pageContextFor(null)).toBe(`Pages / ${UNGROUPED_NAME}`);
  });

  it('claims nothing about the page’s contents having been read', () => {
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
  it('links a page by its id and the ungrouped pins by their segment', () => {
    expect(pagePath('p-reorder')).toBe('/pages/p-reorder');
    expect(pagePath(null)).toBe(`/pages/${UNGROUPED_SEGMENT}`);
    expect(pageIdFromSegment('p-reorder')).toBe('p-reorder');
    expect(pageIdFromSegment(UNGROUPED_SEGMENT)).toBeNull();
  });

  it('never puts a title in the URL', () => {
    expect(pagePath('p-reorder')).not.toContain('Reorder');
  });

  it('resolves an old link by exact title, or says it cannot', () => {
    const pages = [REORDER, page({ id: 'p-fame', title: 'Fame' })];
    expect(legacyPagePath('Fame', pages)).toBe('/pages/p-fame');
    expect(legacyPagePath(LEGACY_UNGROUPED_PARAM, pages)).toBe(`/pages/${UNGROUPED_SEGMENT}`);
    // Exact: a case variant is not that page, and a renamed page is gone.
    expect(legacyPagePath('fame', pages)).toBeNull();
    expect(legacyPagePath('Beverages', pages)).toBeNull();
  });
});

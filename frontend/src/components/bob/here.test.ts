import { describe, expect, it } from 'vitest';
import {
  askFrom, chromeAt, hereForKeptPage, hereForPath, lineShownAt, placeholderFor,
  screenFrame, storeNames, whereOf, windowOf, MAX_SCREEN_SUBJECTS,
} from './here';

describe('a page named from its path', () => {
  it('names the BI pages and Bob’s screens', () => {
    expect(hereForPath('/warehouse')).toEqual({ key: 'warehouse', label: 'Warehouse' });
    expect(hereForPath('/dashboard')).toEqual({ key: 'dashboard', label: 'Dashboard' });
    expect(hereForPath('/storehub-imports')).toEqual({ key: 'storehub_imports', label: 'StoreHub exports' });
    expect(hereForPath('/inbox').label).toBe('Needs you');
  });

  it('names a NESTED path by its longest prefix (the RoomShell screenName bug)', () => {
    expect(hereForPath('/pages/p-1').label).toBe('Kept pages');
    expect(hereForPath('/admin/page-access').label).toBe('Admin');
    expect(hereForPath('/admin/page-access/extra').label).toBe('Admin');
    expect(hereForPath('/warehouse/')).toEqual({ key: 'warehouse', label: 'Warehouse' });
    expect(hereForPath('/nowhere').label).toBe('this screen');
  });
});

describe('where the conversation is', () => {
  it('is a kept page’s id, or a screen’s key — never its tab or window', () => {
    expect(whereOf(hereForKeptPage('p-1', 'Reorder'))).toBe('page:p-1');
    expect(whereOf(hereForKeptPage(null, null))).toBe('page:ungrouped');
    expect(whereOf({ key: 'warehouse', label: 'Warehouse', view: 'Barcode Generator' }))
      .toBe(whereOf({ key: 'warehouse', label: 'Warehouse', view: 'Replenishment Reports' }));
    expect(whereOf({ key: 'dashboard', label: 'Dashboard' })).not.toBe(whereOf({ key: 'vending', label: 'Dashboard' }));
  });

  it('a renamed kept page is the same page', () => {
    expect(whereOf(hereForKeptPage('p-1', 'Old'))).toBe(whereOf(hereForKeptPage('p-1', 'New')));
  });
});

describe('what a question carries', () => {
  it('from a kept page: its identity as the scope, its name as the words', () => {
    expect(askFrom(hereForKeptPage('p-1', 'AJI BARN Reorder'))).toEqual({
      where: 'page:p-1', pageContext: 'Pages / AJI BARN Reorder',
      pageScope: { page_id: 'p-1', title: 'AJI BARN Reorder' },
    });
    // Ungrouped is a null id, never the word as an identity.
    const u = askFrom(hereForKeptPage(null, null));
    expect(u.pageScope).toEqual({ page_id: null, title: null });
    expect(u.pageContext).toBe('Pages / Ungrouped');
    // Before its title has loaded, the id already binds.
    expect(askFrom(hereForKeptPage('p-2', undefined)).pageScope).toEqual({ page_id: 'p-2', title: null });
  });

  it('from any other screen: its account of itself, and no page scope', () => {
    const sent = askFrom({ key: 'warehouse', label: 'Warehouse', view: 'Replenishment Reports' });
    expect(sent).toEqual({ where: 'screen:warehouse', pageContext: 'Warehouse',
      screen: { key: 'warehouse', label: 'Warehouse', view: 'Replenishment Reports' } });
    expect('pageScope' in sent).toBe(false);
  });

  it('bounds what a screen names, as the server bounds it', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Store ${String.fromCharCode(65 + i)}`);
    expect(screenFrame({ key: 'dashboard', label: 'Dashboard', subjects: many }).subjects)
      .toHaveLength(MAX_SCREEN_SUBJECTS);
    expect(screenFrame({ key: 'dashboard', label: 'Dashboard', subjects: [' ', ''] }).subjects).toBeUndefined();
  });
});

describe('what a BI page shows', () => {
  it('names its stores by the name the tools read, skipping any it cannot name', () => {
    const stores = [{ id: '1', name: 'Rockwell' }, { id: '2', name: 'Greenhills' }];
    expect(storeNames(['2', '1', '9'], stores)).toEqual(['Greenhills', 'Rockwell']);
  });

  it('reads its window as Manila days, from Dates or from the strings a reload leaves', () => {
    // 2026-09-21 23:30 in Manila is 15:30 UTC — still the 21st there.
    expect(windowOf({ start: new Date('2026-09-15T00:00:00+08:00'), end: new Date('2026-09-21T23:30:00+08:00') }))
      .toEqual({ start: '2026-09-15', end: '2026-09-21' });
    expect(windowOf({ start: '2026-09-15T00:00:00+08:00', end: '2026-09-21T15:00:00Z' }))
      .toEqual({ start: '2026-09-15', end: '2026-09-21' });
    expect(windowOf(null)).toBeNull();
    expect(windowOf({ start: 'not a date', end: '2026-09-21' })).toBeNull();
  });
});

describe('where the line is drawn', () => {
  it('everywhere but the room, the print sheet and the legacy chat', () => {
    for (const p of ['/dashboard', '/analytics', '/warehouse', '/packing', '/vending', '/pages/x', '/inbox', '/settings']) {
      expect(lineShownAt(p), p).toBe(true);
    }
    for (const p of ['/bob', '/w/t1', '/packing/l1/print', '/ai-chat']) {
      expect(lineShownAt(p), p).toBe(false);
    }
  });

  it('knows which chrome it stands on', () => {
    expect(chromeAt('/pages/x')).toBe('room');
    expect(chromeAt('/warehouse')).toBe('legacy');
  });

  it('says where you are in the placeholder', () => {
    expect(placeholderFor({ key: 'warehouse', label: 'Warehouse', view: 'Barcode Generator' }))
      .toBe('ask about barcode generator');
    expect(placeholderFor(hereForKeptPage('p', 'Rockwell Weekly'))).toBe('ask about Rockwell Weekly');
  });
});

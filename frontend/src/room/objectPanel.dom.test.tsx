// @vitest-environment jsdom
/**
 * WHAT IS INSIDE A THING WHEN YOU OPEN IT — and the panel's FIRST tests.
 *
 * WHY THESE EXIST. The panel was mocked out of every suite in the room
 * (`vi.mock('./ObjectPanel')` appears in five files), so it has been rendered
 * by no test since it was built — and it quietly grew a second visual
 * vocabulary in the one place nobody looked. Its table ran `fmt` over every
 * cell, `change_pct` included, so `+1.5%` was plain text here while the same
 * figure on the board wore its direction's arrow and colour.
 *
 * The owner, on the live build: *"why do these have no color? there should be
 * color right?"* He was right, and about this surface specifically — the
 * calendar and the dots in his other screenshot are `Spec` marks in the room,
 * flat because those rows carry no direction, which is what P2.l decided.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const api = { openObject: vi.fn() };
vi.mock('../services/objectApi', () => ({ openObject: (...a: unknown[]) => api.openObject(...a) }));

import { ObjectPanel } from './ObjectPanel';

afterEach(() => { cleanup(); api.openObject.mockReset(); });

const META = {
  source_table: 'new_transactions',
  metric_label: 'Net sales',
  snapshot_timestamp: '2026-09-15T12:02:00Z',
  filters_applied: [],
};

function object(rows: Record<string, unknown>[]) {
  return {
    view: null,
    meta: {},
    sections: [{
      section: 'week', says: 'What it took last week, against the week before',
      state: 'available', rows, meta: META,
    }],
  };
}

function open(rows: Record<string, unknown>[]) {
  api.openObject.mockResolvedValue(object(rows));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ObjectPanel kind="shop" name="Rockwell" />
    </QueryClientProvider>,
  );
}

const UP = [{ store: 'Rockwell', value: 206800, change_pct: 1.5, baseline: 203717 }];
const DOWN = [{ store: 'Rockwell', value: 359, change_pct: -1.9, baseline: 366 }];

describe('a change in an opened object', () => {
  it('is drawn as a change, with the direction the tool measured', async () => {
    open(UP);
    const delta = await waitFor(() => {
      const el = document.querySelector('.r-delta');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    // The arrow, so direction survives being the same colour as a shop's name.
    expect(delta.textContent).toMatch(/▲/);
    expect(delta.textContent).toMatch(/1\.5/);
  });

  it('wears the direction as a colour, which is the whole report', async () => {
    open(DOWN);
    const delta = await waitFor(() => {
      const el = document.querySelector('.r-delta') as HTMLElement | null;
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(delta.textContent).toMatch(/▼/);
    // `--dir` is what `.r-delta` paints from. Its absence is the bug.
    expect(delta.style.getPropertyValue('--dir').trim()).not.toBe('');
  });

  it('draws a figure that is not a change exactly as it always did', async () => {
    open(UP);
    await waitFor(() => expect(screen.getByText(/206,800/)).toBeTruthy());
  });

  it('says a read that returned nothing came back with no rows', async () => {
    /** Five section states, five renderings — empty is never "nothing here". */
    api.openObject.mockResolvedValue({
      view: null, meta: {},
      sections: [{ section: 'week', says: 'Last week', state: 'empty', rows: [], meta: META }],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ObjectPanel kind="shop" name="Rockwell" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/came back with no rows/)).toBeTruthy());
    expect(document.querySelector('.r-delta')).toBeNull();
  });

  it('carries the read’s receipts under every section', async () => {
    open(UP);
    await waitFor(() => expect(document.querySelector('.r-src')?.textContent).toMatch(/read /));
  });
});

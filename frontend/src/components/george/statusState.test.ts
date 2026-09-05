/**
 * The band above the river, held to UI rule 8.
 *
 * A band is a few words in a thin strip, which makes it the easiest place in
 * the app to state something nobody checked. Three things can be unknown
 * independently and each has to say so.
 */
import { describe, expect, it } from 'vitest';
import { ago, freshnessView, storesView, type StatusQuery } from './statusState';

const STORES = [
  { name: 'Rockwell', flagged: false },
  { name: 'Greenhills', flagged: true },
  { name: 'Magnolia', flagged: true },
];
const SOURCES = [
  { table: 'new_transactions', read_at: '2026-09-05T06:00:00Z' },
  { table: 'inventory_snapshots', read_at: '2026-09-04T22:00:00Z' },
];
const ok = (over = {}): StatusQuery => ({
  status: 'success',
  data: { stores: STORES, stores_known: true, sources: SOURCES, as_of: '2026-09-05', ...over },
});

describe('stores — never a calm default', () => {
  it('is unknown while loading', () => {
    const v = storesView({ status: 'pending' });
    expect(v.kind).toBe('unknown');
    expect(v.label.toLowerCase()).not.toContain('nothing flagged');
  });

  it('is unknown when the lookup failed', () => {
    expect(storesView({ status: 'error' }).kind).toBe('unknown');
  });

  it('is UNKNOWN when no brief has been posted today, even though the list loaded', () => {
    // The store LIST is known; anything about the stores is not. Drawing them
    // as unflagged would say seven shops are fine on no evidence at all.
    const v = storesView(ok({ stores_known: false }));
    expect(v.kind).toBe('unknown');
    expect(v.stores).toHaveLength(3);
    expect(v.label).toContain('no brief yet today');
    expect(v.label.toLowerCase()).not.toContain('nothing flagged');
  });

  it('claims nothing flagged only from a brief that ran', () => {
    const v = storesView(ok({ stores: STORES.map((s) => ({ ...s, flagged: false })) }));
    expect(v.kind).toBe('known');
    expect(v.label).toContain('nothing flagged');
  });

  it('counts what is flagged', () => {
    const v = storesView(ok());
    expect(v.flagged).toBe(2);
    expect(v.label).toBe('3 stores · 2 flagged');
  });

  it('says flagged, never a word implying fault', () => {
    // A 41% rise flags exactly as a 41% drop does.
    const v = storesView(ok());
    for (const bad of ['problem', 'error', 'unhealthy', 'down', 'alert']) {
      expect(v.label.toLowerCase()).not.toContain(bad);
    }
  });
});

describe('freshness — the oldest source, not the newest', () => {
  it('is unknown while loading and on failure', () => {
    expect(freshnessView({ status: 'pending' }).kind).toBe('unknown');
    expect(freshnessView({ status: 'error' }).kind).toBe('unknown');
  });

  it('is unknown when nothing has been read', () => {
    const v = freshnessView(ok({ sources: [] }));
    expect(v.kind).toBe('unknown');
    expect(v.oldest).toBeNull();
  });

  it('reports the OLDEST, because one timestamp for several ages flatters', () => {
    // The age at which every figure on screen is AT LEAST as fresh.
    const v = freshnessView(ok());
    expect(v.oldest?.table).toBe('inventory_snapshots');
  });

  it('does not report the newest', () => {
    expect(freshnessView(ok()).oldest?.table).not.toBe('new_transactions');
  });
});

describe('ago', () => {
  it('degrades through the units', () => {
    const now = Date.now();
    expect(ago(new Date(now - 30_000).toISOString())).toBe('just now');
    expect(ago(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(ago(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago');
    expect(ago(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago');
  });

  it('says so rather than guessing at an unparseable time', () => {
    expect(ago('not a date')).toBe('at an unknown time');
  });
});

import { describe, expect, it } from 'vitest';
import { landingPathFor, PAGES, pathForPage } from '../../constants/pages';
import {
  isActive,
  OPERATIONS,
  operationsFor,
  phoneMore,
  phoneTabs,
  PRIMARY,
  primaryFor,
} from './shellNav';

describe('the two groups', () => {
  it('offers George’s five behind one key', () => {
    expect(PRIMARY.map((i) => i.label)).toEqual(['Today', 'Ask', 'Inbox', 'Pages', 'Workflows']);
    expect(new Set(PRIMARY.map((i) => i.page))).toEqual(new Set(['george']));
    expect(primaryFor(['george'])).toHaveLength(5);
    expect(primaryFor(['dashboard', 'packing'])).toEqual([]);
  });

  it('keeps every operational page reachable, filtered by access', () => {
    expect(OPERATIONS.map((i) => i.page)).toEqual(
      ['dashboard', 'analytics', 'ai_chat', 'warehouse', 'packing', 'settings', 'admin'],
    );
    expect(operationsFor(['packing']).map((i) => i.label)).toEqual(['Packing']);
    expect(operationsFor([])).toEqual([]);
  });

  it('shows nobody a link they cannot open', () => {
    for (const item of [...PRIMARY, ...OPERATIONS]) {
      expect(primaryFor([item.page]).concat(operationsFor([item.page])).length).toBeGreaterThan(0);
      expect(primaryFor(['nothing']).concat(operationsFor(['nothing']))).toEqual([]);
    }
  });
});

describe('the phone', () => {
  it('puts Today, Ask and Inbox in the bar and the rest behind More', () => {
    expect(phoneTabs(['george']).map((i) => i.label)).toEqual(['Today', 'Ask', 'Inbox']);
    expect(phoneMore(['george']).map((i) => i.label)).toEqual(['Pages', 'Workflows']);
  });
});

describe('active state', () => {
  it('matches a route and everything under it', () => {
    const ask = PRIMARY.find((i) => i.label === 'Ask')!;
    expect(isActive(ask, '/ask')).toBe(true);
    expect(isActive(ask, '/ask/abc')).toBe(true);
    expect(isActive(ask, '/askew')).toBe(false);
    const dash = OPERATIONS.find((i) => i.label === 'Dashboard')!;
    expect(isActive(dash, '/vending')).toBe(true);
  });
});

describe('landing', () => {
  it('sends a George user to George, and everyone else where they used to go', () => {
    expect(landingPathFor(['george', 'dashboard'])).toBe(pathForPage('george'));
    expect(landingPathFor(['dashboard', 'george'])).toBe(pathForPage('george'));
    expect(landingPathFor(['dashboard'])).toBe('/dashboard');
    expect(landingPathFor(['packing'])).toBe('/packing');
    expect(landingPathFor([])).toBe('/no-access');
  });

  it('never lands on "/" — that path is only ever a redirect', () => {
    for (const p of PAGES) expect(p.path).not.toBe('/');
  });
});

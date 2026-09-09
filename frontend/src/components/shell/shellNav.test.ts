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
  it('offers the desk and its three rooms behind one key', () => {
    // Today and Ask stopped being places on 2026-09-09: the desk at "/" is
    // the business at rest and its own line is where George is asked.
    expect(PRIMARY.map((i) => i.label)).toEqual(['Desk', 'Inbox', 'Pages', 'Workflows']);
    expect(new Set(PRIMARY.map((i) => i.page))).toEqual(new Set(['george']));
    expect(primaryFor(['george'])).toHaveLength(4);
    expect(primaryFor(['dashboard', 'packing'])).toEqual([]);
  });

  it('keeps every operational page reachable, filtered by access', () => {
    expect(OPERATIONS.map((i) => i.page)).toEqual(
      ['dashboard', 'analytics', 'warehouse', 'packing', 'settings', 'admin'],
    );
    expect(operationsFor(['packing']).map((i) => i.label)).toEqual(['Packing']);
    expect(operationsFor([])).toEqual([]);
  });

  it('does not offer the legacy chatbot inside George', () => {
    // The old NL->SQL chatbot generates freehand SQL from a schema prompt —
    // the pattern George's architecture rules forbid — and two answering
    // machines a word apart, one of which cannot show a receipt, is a trap.
    // The ROUTE is untouched: it is reachable from the legacy chrome, its
    // page key still grants it, and nothing in George reads it.
    expect(OPERATIONS.some((i) => i.path === '/ai-chat')).toBe(false);
    expect(operationsFor(['ai_chat'])).toEqual([]);
  });

  it('shows nobody a link they cannot open', () => {
    for (const item of [...PRIMARY, ...OPERATIONS]) {
      expect(primaryFor([item.page]).concat(operationsFor([item.page])).length).toBeGreaterThan(0);
      expect(primaryFor(['nothing']).concat(operationsFor(['nothing']))).toEqual([]);
    }
  });
});

describe('the phone', () => {
  it('puts the desk, Inbox and Pages in the bar and the rest behind More', () => {
    expect(phoneTabs(['george']).map((i) => i.label)).toEqual(['Desk', 'Inbox', 'Pages']);
    expect(phoneMore(['george']).map((i) => i.label)).toEqual(['Workflows']);
  });
});

describe('active state', () => {
  it('matches a route and everything under it', () => {
    const pages = PRIMARY.find((i) => i.label === 'Pages')!;
    expect(isActive(pages, '/pages')).toBe(true);
    expect(isActive(pages, '/pages/abc')).toBe(true);
    expect(isActive(pages, '/pagesetter')).toBe(false);
    const dash = OPERATIONS.find((i) => i.label === 'Dashboard')!;
    expect(isActive(dash, '/vending')).toBe(true);
  });

  it('marks the desk on "/" and on a piece of work, and nowhere else', () => {
    const desk = PRIMARY.find((i) => i.label === 'Desk')!;
    expect(isActive(desk, '/')).toBe(true);
    expect(isActive(desk, '/w/thread-1')).toBe(true);
    expect(isActive(desk, '/workflows')).toBe(false);
    expect(isActive(desk, '/pages')).toBe(false);
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

  it('gives "/" to George and to nobody else', () => {
    // The desk IS "/" since the Experience Reset: LandingRedirect renders it
    // rather than navigating, so a person with George is never sent anywhere.
    // Every other page keeps a path of its own, which is what stops the
    // redirect for a person WITHOUT George from looping.
    expect(pathForPage('george')).toBe('/');
    for (const p of PAGES) if (p.key !== 'george') expect(p.path).not.toBe('/');
  });
});

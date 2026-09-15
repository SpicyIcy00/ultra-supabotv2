/**
 * WHICH BUSINESS THE NEXT QUESTION IS ABOUT (P2.g) — the pure half.
 *
 * Everything here is driven from a SERVED shape: the parts, their words and
 * their places all come from `/definitions/desk`, which is metrics.yaml. What
 * this module decides is only which part is on and what travels — and the one
 * guarantee worth more than the rest is that the default travels as NOTHING,
 * so a switch nobody touched cannot change an answer that was already right.
 */
import { describe, expect, it } from 'vitest';

import { estateFor, partOn, pillsFor, scopeChip } from './estate';
import type { DeskDefinitions } from '../services/deskApi';

const SHOPS = ['Rockwell', 'Fairview', 'Greenhills', 'North Edsa',
               'Magnolia', 'OPUS', 'Shangri-La'];

const defs = {
  estate: {
    label: 'estate',
    default: 'all',
    parts: [
      { key: 'all', label: 'All', says: null,
        places: [...SHOPS, 'AJI BARN', 'AJI CMG'] },
      // ONE BUSINESS, ONE PILL. The shops and both warehouses, because a
      // warehouse is a place inside a business and a place is the selection's
      // job — `@AJI BARN` binds one, a tap on a row binds one.
      { key: 'aji_ichiban', label: 'Aji Ichiban', says: 'shops and warehouses',
        places: [...SHOPS, 'AJI BARN', 'AJI CMG'] },
      // THE OTHER BUSINESS, and the only part with no places: vending's are
      // machines, which live in Weimi and not in the definitions.
      { key: 'vending', label: 'vending', says: 'the machines · own domain',
        places: [] },
    ],
  },
} as unknown as DeskDefinitions;

describe('the estate switch', () => {
  it('is on the definitions own default before anybody presses anything', () => {
    expect(partOn(defs, null)?.key).toBe('all');
    expect(pillsFor(defs, null).find((p) => p.on)?.key).toBe('all');
  });

  it('travels as nothing on the default, which is what every question meant', () => {
    expect(estateFor(defs, null)).toBeUndefined();
    expect(estateFor(defs, 'all')).toBeUndefined();
    expect(scopeChip(defs, 'all')).toBeNull();
  });

  it('travels as the part key once a business is picked', () => {
    expect(estateFor(defs, 'aji_ichiban')).toBe('aji_ichiban');
    expect(scopeChip(defs, 'vending')).toEqual({ key: 'vending', label: 'vending' });
  });

  it('draws one pill per business, in the served words', () => {
    const pills = pillsFor(defs, 'aji_ichiban');
    expect(pills.map((p) => p.label)).toEqual(['All', 'Aji Ichiban', 'vending']);
    expect(pills.find((p) => p.key === 'aji_ichiban')?.on).toBe(true);
    expect(pills.filter((p) => p.on)).toHaveLength(1);
  });

  it('never puts a count in front of a business name', () => {
    // A pill drew "7 shops" until the warehouses were folded in and the row
    // became businesses. "9 Aji Ichiban" is not a thing, so the count went
    // with the pill it was for rather than being kept against a maybe.
    expect(pillsFor(defs, null).map((p) => p.label).join(' ')).not.toMatch(/\d/);
  });

  it('drops a picked part this build no longer declares rather than lighting it', () => {
    // Only across a deploy that removed a part. A pill lit for something the
    // server will refuse is worse than the switch appearing to reset.
    expect(partOn(defs, 'ffr')?.key).toBe('all');
    expect(estateFor(defs, 'ffr')).toBeUndefined();
    expect(pillsFor(defs, 'ffr').filter((p) => p.on).map((p) => p.key)).toEqual(['all']);
  });

  it('is nothing at all until the definitions arrive', () => {
    expect(pillsFor(null, 'vending')).toEqual([]);
    expect(partOn(undefined, 'vending')).toBeNull();
    expect(estateFor(null, 'vending')).toBeUndefined();
    expect(scopeChip(undefined, 'vending')).toBeNull();
  });
});

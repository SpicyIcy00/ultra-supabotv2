/**
 * WHICH BUSINESS THE NEXT QUESTION IS ABOUT (P2.g) — the pure half.
 *
 * Everything here is driven from a SERVED shape: the parts, their words and
 * their places all come from `/definitions/desk`, which is metrics.yaml. What
 * this module decides is only which part is on and what travels — and the one
 * guarantee worth more than the rest is that THE PILL AND THE SCOPE AGREE: if
 * the switch says Aji Ichiban, the question was scoped to Aji Ichiban.
 *
 * That used to be guaranteed a different way: the default travelled as
 * nothing, and the default was `all`. The owner moved the default to Aji
 * Ichiban on 2026-09-19 ("default room should be aji ichiban not all"), and
 * "the default" and "the part that narrows nothing" stopped being the same
 * part. Reading the default would now draw his shops' pill over answers that
 * had counted the vending business.
 */
import { describe, expect, it } from 'vitest';

import { estateFor, partOn, pillsFor, scopeChip } from './estate';
import type { DeskDefinitions } from '../services/deskApi';

const SHOPS = ['Rockwell', 'Fairview', 'Greenhills', 'North Edsa',
               'Magnolia', 'OPUS', 'Shangri-La'];

const defs = {
  estate: {
    label: 'estate',
    default: 'aji_ichiban',
    parts: [
      // THE ONE PART THAT NARROWS NOTHING, and it says so itself rather than
      // being inferred from happening to be the default.
      { key: 'all', label: 'All', says: null, everything: true,
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
    expect(partOn(defs, null)?.key).toBe('aji_ichiban');
    expect(pillsFor(defs, null).find((p) => p.on)?.key).toBe('aji_ichiban');
  });

  it('travels as nothing only on the part that narrows nothing', () => {
    expect(estateFor(defs, 'all')).toBeUndefined();
    expect(scopeChip(defs, 'all')).toBeNull();
  });

  it('sends the default as a real scope, because the default now narrows', () => {
    // The whole point of the change. Untouched, the board is on Aji Ichiban
    // and the question carries Aji Ichiban — not silently everything.
    expect(estateFor(defs, null)).toBe('aji_ichiban');
    expect(scopeChip(defs, null)).toEqual({ key: 'aji_ichiban', label: 'Aji Ichiban' });
  });

  it('never lets the pill say one thing and the scope another', () => {
    for (const picked of [null, 'all', 'aji_ichiban', 'vending', 'ffr']) {
      const on = pillsFor(defs, picked).find((p) => p.on);
      const travels = estateFor(defs, picked);
      const part = partOn(defs, picked);
      expect(on?.key).toBe(part?.key);
      // Either the scope IS the lit pill, or the lit pill is the whole estate.
      expect(travels ?? (part?.everything ? part.key : null)).toBe(part?.key);
    }
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
    expect(partOn(defs, 'ffr')?.key).toBe('aji_ichiban');
    expect(estateFor(defs, 'ffr')).toBe('aji_ichiban');
    expect(pillsFor(defs, 'ffr').filter((p) => p.on).map((p) => p.key)).toEqual(['aji_ichiban']);
  });

  it('is nothing at all until the definitions arrive', () => {
    expect(pillsFor(null, 'vending')).toEqual([]);
    expect(partOn(undefined, 'vending')).toBeNull();
    expect(estateFor(null, 'vending')).toBeUndefined();
    expect(scopeChip(undefined, 'vending')).toBeNull();
  });
});

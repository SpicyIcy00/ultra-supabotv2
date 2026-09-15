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
      { key: 'all', label: 'All', says: null, count_places: false,
        places: [...SHOPS, 'AJI BARN', 'AJI CMG'] },
      { key: 'shops', label: 'shops', says: 'retail', count_places: true,
        places: SHOPS },
      { key: 'barn', label: 'AJI BARN', says: 'warehouse', count_places: false,
        places: ['AJI BARN'] },
      { key: 'vending', label: 'AJI CMG', says: 'vending · own domain',
        count_places: false, places: ['AJI CMG'] },
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
    expect(estateFor(defs, 'barn')).toBe('barn');
    expect(scopeChip(defs, 'vending')).toEqual({ key: 'vending', label: 'AJI CMG' });
  });

  it('draws how many places only where the definitions say to', () => {
    const pills = pillsFor(defs, 'shops');
    expect(pills.map((p) => p.label)).toEqual(['All', '7 shops', 'AJI BARN', 'AJI CMG']);
    expect(pills.find((p) => p.key === 'shops')?.on).toBe(true);
    expect(pills.filter((p) => p.on)).toHaveLength(1);
  });

  it('counts the places it was served and never a shop it knows about', () => {
    const fewer = {
      estate: {
        ...defs.estate,
        parts: defs.estate.parts.map((p) => (
          p.key === 'shops' ? { ...p, places: SHOPS.slice(0, 3) } : p)),
      },
    } as unknown as DeskDefinitions;
    expect(pillsFor(fewer, null).map((p) => p.label))
      .toContain('3 shops');
  });

  it('drops a picked part this build no longer declares rather than lighting it', () => {
    // Only across a deploy that removed a part. A pill lit for something the
    // server will refuse is worse than the switch appearing to reset.
    expect(partOn(defs, 'ffr')?.key).toBe('all');
    expect(estateFor(defs, 'ffr')).toBeUndefined();
    expect(pillsFor(defs, 'ffr').filter((p) => p.on).map((p) => p.key)).toEqual(['all']);
  });

  it('is nothing at all until the definitions arrive', () => {
    expect(pillsFor(null, 'barn')).toEqual([]);
    expect(partOn(undefined, 'barn')).toBeNull();
    expect(estateFor(null, 'barn')).toBeUndefined();
    expect(scopeChip(undefined, 'barn')).toBeNull();
  });
});

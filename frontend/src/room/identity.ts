/**
 * WHAT COLOUR A THING IS.
 *
 * Colour is IDENTITY here, not performance — the owner's call, made after
 * seeing both. Rockwell is violet every time you ever see it, so you find it
 * on a board of ten objects without reading a word. That only works if the
 * mapping is stable and chosen, which is why the seven shops are named by hand
 * below rather than hashed: a hash gives you whatever hue it lands on, puts two
 * shops next to each other on the wheel, and cannot be corrected.
 *
 * THREE THINGS CARRY THREE DIFFERENT MEANINGS, and they never collide:
 *
 *   hue        WHICH thing this is          — from here, fixed forever
 *   strength   HOW HARD it moved            — from |change|, see data.ts
 *   the pill   WHICH WAY it moved           — semantic green/red, with a sign
 *
 * So a shop that fell 20% is its own violet, blooming hard, with a red −20.0%
 * on it. Nothing about the hue says "bad", which is the whole reason identity
 * and direction can share a screen.
 *
 * ONE COLLISION IS UNAVOIDABLE and is handled rather than ignored: Greenhills
 * is green and "up" is green. The delta pill is therefore always filled, always
 * carries its sign, and sits in the same place on every tile — so direction is
 * read from shape and position, not from hue alone. It also means the palette
 * never needs to avoid green, which would be a strange thing to ask of a
 * business with a shop called Greenhills.
 */
import type { Dimension } from './data';

/** A hue as an `r, g, b` triple, so alpha can be applied at the point of use. */
export type Rgb = string;

/**
 * The seven shops, spread around the wheel so no two are confusable at a
 * glance, and tuned to sit together on a light ground. Keyed on the name the
 * tools return (metrics.yaml `stores`), matched case-insensitively.
 *
 * ADDING A SHOP IS ADDING A LINE HERE. Deliberately not derived: opening a
 * shop is a rare, considered event, and a colour somebody chose beats one a
 * hash produced.
 */
const SHOPS: Record<string, Rgb> = {
  'rockwell': '99, 87, 232',      // indigo
  'fairview': '46, 127, 232',     // blue
  'north edsa': '14, 160, 190',   // cyan
  'greenhills': '18, 165, 120',   // green
  'opus': '222, 138, 11',         // amber
  'magnolia': '224, 68, 102',     // rose
  'shangri-la': '180, 70, 184',   // plum
  // Not trading, but they exist and a question can still name them.
  'aji barn': '120, 113, 108',    // warehouse — deliberately neutral
  'aji cmg': '133, 122, 90',      // vending
};

/**
 * Everything that is not a shop takes its KIND's colour. There are hundreds of
 * products and nobody is going to learn a hue for each; what is worth reading
 * at a glance is "this is a product, that is a supplier".
 */
const KINDS: Record<string, Rgb> = {
  product: '64, 116, 176',        // steel blue
  category: '116, 142, 72',       // sage
  supplier: '186, 118, 40',       // ochre
  order: '108, 108, 132',         // slate
  draft: '186, 118, 40',          // a draft belongs to its supplier
  delivery: '146, 96, 166',       // mauve
  stock: '58, 140, 148',          // marine
};

/** When there is nothing to go on. Never guessed from the text. */
export const NEUTRAL: Rgb = '124, 133, 150';

/** George's own voice. Never a measurement, never an object's identity. */
export const GEORGE: Rgb = '196, 128, 44';

/**
 * The hue for one object.
 *
 * A named shop wins over its kind, because a shop is a thing you know by name
 * and a product is a thing you know by type. Everything else falls back to its
 * kind and then to neutral — the board never invents a colour for something it
 * cannot identify.
 */
export function hueFor(subject?: string | null, dimension?: Dimension | null,
                       kind?: string | null): Rgb {
  const name = subject?.trim().toLowerCase();
  if (name && SHOPS[name]) return SHOPS[name];
  if (dimension && KINDS[dimension]) return KINDS[dimension];
  if (kind && KINDS[kind]) return KINDS[kind];
  return NEUTRAL;
}

/** Every shop that has a colour, for a legend or a test. */
export function namedSubjects(): string[] {
  return Object.keys(SHOPS);
}

/* -------------------------------------------------------------------------
 * DIRECTION — semantic, and separate from every hue above.
 * ---------------------------------------------------------------------- */

export const UP: Rgb = '14, 145, 100';
export const DOWN: Rgb = '206, 43, 66';
export const FLAT: Rgb = '113, 122, 140';

export function directionRgb(direction: 'up' | 'down' | 'flat' | null): Rgb {
  if (direction === 'up') return UP;
  if (direction === 'down') return DOWN;
  return FLAT;
}

/**
 * WHAT COLOUR A THING IS — and, since P2.l, where that is allowed to show.
 *
 * THE COMPLAINT, 2026-09-15, of the live build: *"what do the colors mean now?
 * does this make sense?"*. It did not. Colour meant four things at once — the
 * tile's wash was IDENTITY (the seven shops below), its brightness was
 * MAGNITUDE with no direction, and the dots, bars and pills were DIRECTION —
 * and three of the seven shop hues sat on top of the three semantic colours:
 * OPUS amber like George's mark and the approvals accent, Magnolia rose like
 * `--down`, Greenhills green like `--up`.
 *
 * That is the owner's seven-shops-seven-hues report from P1.e, one layer out.
 * P1.e took identity out of the MARKS and deliberately left it on the tile
 * SHELL; on the dark theme the shell is the loudest thing on the screen, so
 * the same complaint came back at the layer that card exempted. P2.l applies
 * P1.e's own move out one layer: THE SHELL CARRIES NO IDENTITY. What a tile is
 * about is read from its title — every block has one — and from its row
 * labels, which said the shop's name all along.
 *
 * SO COLOUR ON THE BOARD MEANS ONE THING, AND ONLY WHERE A TOOL MEASURED IT:
 *
 *   --up / --down / --flat   WHICH WAY a figure moved, inside a mark
 *   --george                 his voice, the one identity the room keeps
 *   the reserved colour      "needs you" — approvals, and nothing else, which
 *                            is why it is not written out here: naming it in a
 *                            docstring is what `accentUse.test.ts` scans for.
 *
 * WHERE A HUE SURVIVES. One place: an OPENED object, where identity is the
 * point and nothing else is competing — one thing on screen, named in its own
 * heading, with its hue on the panel's own rule (`.r-obj`). `hueFor` has
 * exactly one caller (`marks.tsx`, wrapping `ObjectPanel`), and
 * `accentUse.test.ts` fails on a second.
 *
 * THE MAGNITUDE CHANNEL IS GONE, AND THE EVIDENCE IS THAT IT WAS ALREADY
 * DEAD. `Shell` took a `change` and turned it into a brightness; the tiles
 * that passed one were deleted by P1.e on 2026-09-14, so every tile on the
 * board has burnt at `--i: 0` ever since and nobody noticed. A channel whose
 * absence no one can see is not a channel — and a wash that says "this moved
 * a lot" without saying which way is the one meaning here nobody asked for.
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

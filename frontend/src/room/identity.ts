/**
 * WHAT COLOUR A THING IS — and, since P2S.2(e), exactly where that may show.
 *
 * TWO CHANNELS, ONE MEANING EACH. The owner, 2026-09-16, of the design's
 * dumbbells: *"the line if its up or down should be green or red meaning good
 * or bad not the same color as the stores"* — and then, after the research,
 * identity colour, drawing-in and hover: *"ok implement that"*. So:
 *
 *   THE SWATCH IS THE STORE.   A small dot before a name, in a row, a band, a
 *                              cell or a key. The same hue for the same store
 *                              in every figure on the screen.
 *   THE MARK IS THE VERDICT.   A segment, a dot, a bar or a line carries the
 *                              direction a tool measured (`--up` / `--down` /
 *                              `--flat`), on every row, and never a hue.
 *
 * THIS REVISITS P2.l DELIBERATELY. P2.l took identity off the tile's shell
 * because colour there meant four things at once: a wash, a brightness, a
 * direction, and three shop hues sitting on the three semantic colours. The
 * rule it wrote — colour means one thing per channel — is kept; what changes
 * is that identity gets a channel of its own, eight pixels wide, beside a name
 * that says the same thing in words. `accentUse.test.ts` and `palette.test.ts`
 * hold the swatch to that one place.
 *
 * NO STORE IS NAMED HERE, AND NONE IS COUNTED (CLAUDE.md: the store list lives
 * in `definitions/metrics.yaml` and nowhere else). A store's slot is its place
 * in `stores.active_retail`, which reaches the room as the served `locations`
 * of `/definitions/desk`, in the file's order. Until those are loaded there is
 * no swatch at all — a colour is never guessed from a name.
 *
 * THE PALETTE is the dataviz skill's validated categorical eight, stepped per
 * theme (`--c-1` … `--c-8` in room.css) and re-validated against the room's
 * own two grounds: `ops/palette/REPORT.md`. Products take slots 5–8 by a
 * stable hash of their name — there are thousands, nobody learns a hue for
 * each, and the same product must still be the same hue twice.
 */
import type { Dimension } from './data';

/** How many categorical slots the palette has. A ninth is never generated. */
export const SLOTS = 8;
/** The slots a product may take — the palette's back half, by hash. */
export const PRODUCT_SLOTS: readonly number[] = [5, 6, 7, 8];

/** The identities the room knows, read from the definitions. */
export interface Identities {
  /** Store display names, lower-cased, in `stores.active_retail` order. */
  stores: string[];
}

export const NO_IDENTITIES: Identities = { stores: [] };

/** From the served desk definitions: the RETAIL locations, in their order. */
export function identitiesFrom(defs: {
  locations?: { display_name: string; kind: string }[];
} | null | undefined): Identities {
  const stores = (defs?.locations ?? [])
    .filter((l) => l.kind === 'retail' && typeof l.display_name === 'string')
    .map((l) => l.display_name.trim().toLowerCase());
  return { stores };
}

/** FNV-1a — stable across sessions and browsers, which a hue has to be. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * THE SLOT FOR ONE NAMED THING, or null for none.
 *
 * A store is its place in `active_retail` (1-based), when a row says it is a
 * store or does not say what it is. Past the eighth store there is no slot:
 * the palette folds, it does not generate. A product is slot 5–8 by hash.
 * Everything else — a category, a supplier, a warehouse — has no swatch,
 * because its name is not a thing anybody tracks by colour.
 */
export function slotFor(ids: Identities, name: string | null | undefined,
                        dimension?: Dimension | null): number | null {
  const want = (name ?? '').trim().toLowerCase();
  if (!want) return null;
  if (!dimension || dimension === 'store') {
    const at = ids.stores.indexOf(want);
    if (at >= 0) return at < SLOTS ? at + 1 : null;
    if (dimension === 'store') return null;
  }
  if (dimension === 'product') return PRODUCT_SLOTS[hash(want) % PRODUCT_SLOTS.length];
  return null;
}

/** The CSS colour of a slot, as the stylesheet declares it per theme. */
export function slotColour(slot: number): string {
  return `var(--c-${slot})`;
}

/**
 * THE RULE AN OPENED OBJECT WEARS — the same hue its swatch has, so opening
 * Rockwell's panel is Rockwell's colour. With no slot it is the quiet ink.
 */
export function hueFor(ids: Identities, subject?: string | null,
                       dimension?: Dimension | null): string {
  const slot = slotFor(ids, subject, dimension);
  return slot ? slotColour(slot) : 'var(--ink-4)';
}

/* -------------------------------------------------------------------------
 * DIRECTION — the verdict, semantic, and separate from every hue above.
 * ---------------------------------------------------------------------- */

export const UP = '14, 145, 100';
export const DOWN = '206, 43, 66';
export const FLAT = '113, 122, 140';

export function directionRgb(direction: 'up' | 'down' | 'flat' | null): string {
  if (direction === 'up') return UP;
  if (direction === 'down') return DOWN;
  return FLAT;
}

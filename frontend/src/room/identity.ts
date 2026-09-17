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
 * A STORE'S COLOUR IS THE ONE HE SET (the dogfood log, 2026-09-17: *"color
 * mapping should be more like these colors but in our theme style"*). Supabot
 * already has one per store — `stores.color`, chosen on the Settings page,
 * served by `/analytics/stores`, drawn by every BI chart. George uses it,
 * matched by id to the served `locations`, TONED for the room: hue kept,
 * lightness and chroma brought into the band each ground needs (`toned`). A
 * store with no colour set falls back to its palette slot.
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
  /** The colour each store was given in Settings, by lower-cased display name. */
  colours?: Record<string, string>;
}

export const NO_IDENTITIES: Identities = { stores: [] };

/**
 * From the served desk definitions (the RETAIL locations, in their order) and,
 * where loaded, the stores Settings coloured — matched by ID, never by name,
 * because Settings calls OPUS "Opus".
 */
export function identitiesFrom(defs: {
  locations?: { id?: string; display_name: string; kind: string }[];
} | null | undefined, records?: { id: string; color: string | null }[] | null): Identities {
  const retail = (defs?.locations ?? [])
    .filter((l) => l.kind === 'retail' && typeof l.display_name === 'string');
  const stores = retail.map((l) => l.display_name.trim().toLowerCase());
  const colours: Record<string, string> = {};
  for (const l of retail) {
    const hex = records?.find((r) => r.id === l.id)?.color?.trim();
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) colours[l.display_name.trim().toLowerCase()] = hex.toLowerCase();
  }
  return { stores, colours };
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

/* -------------------------------------------------------------------------
 * TONING HIS COLOUR FOR THE ROOM — a geometry on a colour, never a figure.
 *
 * OKLCH: the hue he chose is kept; lightness and chroma are clamped into the
 * band a mark needs on each ground (the dataviz validator's bands, checked in
 * ops/palette/REPORT.md), then chroma is eased down until the colour is inside
 * sRGB. So his red stays red and his yellow stays yellow, at the room's
 * weight rather than a spreadsheet's.
 * ---------------------------------------------------------------------- */

/** [lightness low, high, chroma low, high] per ground. */
export const TONE_BANDS = {
  dark: [0.60, 0.66, 0.10, 0.14],
  light: [0.52, 0.62, 0.10, 0.15],
  /** An opened object's 2px rule, which sits on either ground. */
  rule: [0.57, 0.62, 0.10, 0.14],
} as const;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchOf(hex: string): { L: number; C: number; H: number } {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: Math.atan2(B, A) };
}

function rgbOf(L: number, C: number, H: number): number[] {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function toned(hex: string, ground: keyof typeof TONE_BANDS): string {
  const [lo, hi, cLo, cHi] = TONE_BANDS[ground];
  const c = oklchOf(hex);
  const L = Math.min(hi, Math.max(lo, c.L));
  let C = Math.min(cHi, Math.max(cLo, c.C));
  let rgb = rgbOf(L, C, c.H);
  while (rgb.some((v) => v < 0 || v > 1) && C > 0.01) {
    C -= 0.005;
    rgb = rgbOf(L, C, c.H);
  }
  return `#${rgb.map((v) => Math.round(gam(Math.min(1, Math.max(0, v))) * 255)
    .toString(16).padStart(2, '0')).join('')}`;
}

/** His colour for a store, toned for both grounds — or null where none was set. */
export function storeColour(ids: Identities, name: string | null | undefined,
                            dimension?: Dimension | null): { dark: string; light: string } | null {
  if (dimension && dimension !== 'store') return null;
  const hex = ids.colours?.[(name ?? '').trim().toLowerCase()];
  return hex ? { dark: toned(hex, 'dark'), light: toned(hex, 'light') } : null;
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
  const own = (!dimension || dimension === 'store')
    ? ids.colours?.[(subject ?? '').trim().toLowerCase()] : undefined;
  if (own) return toned(own, 'rule');
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

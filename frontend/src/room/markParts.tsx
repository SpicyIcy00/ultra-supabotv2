/**
 * WHAT EVERY MARK SHARES — the colours a mark may paint with, how a touch
 * says a figure, the beat rows arrive on, and a row's tappable name with its
 * swatch. Moved out of marks.tsx by P2S.3 so the eleven new shapes
 * (shapes.tsx) draw a name, a lit row and a touch exactly as the six do.
 */
import { type CSSProperties } from 'react';
import type { ActionOffer, ToolMeta } from '../types/george';
import { pct, type Change, type Dimension } from './data';
import type { DataColour } from './catalogue';
import { Offer, type TileProps } from './tiles';
import { onRow } from './actions';
import { Swatch } from './swatch';
export type Row = Record<string, unknown>;
/** The read's own `meta` — every subtitle and source line comes off it. */
export type Meta = ToolMeta | null;

/** `rgb(var(--up))` and friends — the only colours a mark may paint with. */
export function paint(c: DataColour): string {
  return `rgb(var(--${c}))`;
}

/**
 * A DATA COLOUR AT A STRENGTH (P2S.3) — the parts of one whole told apart by
 * steps of one ink, a cell's brightness its value against the read's largest.
 * Still one of the four: the strength is geometry, the colour is what a value
 * said (a direction, or none, or the row he pointed at).
 */
export function wash(c: DataColour, strength: number): string {
  return `rgba(var(--${c}), ${Math.max(0, Math.min(1, strength)).toFixed(3)})`;
}

/**
 * How brightly a cooled row sits.
 *
 * 0.5 until 2026-09-15, when he looked at a board with no tile wash on it and
 * said *"all stores still matter not full focus on one"*. Half opacity on top
 * of a grey name and a flat bar was three dimmings stacked, and six shops that
 * moved read as six shops that did not. The row he named is still the loudest
 * thing in the mark — it is fully lit, bold, and in the primary ink — but the
 * others are now quieter rather than faint, and they keep their own colour.
 *
 * 1 SINCE 2026-09-18 — nothing is lowered to light something else (the owner:
 * *"just use other methods to emphasize things … just dont desaturate or lower
 * other things to emphsize something else"*). The row he points at is lit by
 * what it GAINS — bold, its swatch ringed, a band of his own colour behind it
 * (`[data-lit="yes"]` in room.css) — and every other row stays as it is.
 */
export const COOL = 1;

/**
 * WHAT A TOUCH SAYS (P2S.2(f)) — the exact figure, in the tool's own values,
 * formatted and never recomputed. The read time is added by the tip from the
 * figure's own `data-read`, so every mark says when as well as what.
 */
export function told(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((x): x is string => typeof x === 'string' && x.trim() !== '').join(' · ');
}

/** The change a row declares, as a signed percentage — or nothing. */
export function moved(change: Change | null): string | null {
  return change && change.pct !== null && change.pct !== undefined ? pct(change.pct) : null;
}

/** Each row arrives a beat after the one above it (the design's 90ms). */
export function beat(n: number): CSSProperties {
  return { '--d': `${n * 90}ms` } as CSSProperties;
}

/* ------------------------------------------------------------------ offers */

/**
 * WHAT GEORGE OFFERED TO DO ABOUT THIS ROW, drawn on it.
 *
 * `room/actions.placement` already decided this object may carry these; all
 * that is left is which row. Nothing is drawn where he offered nothing, which
 * is most rows of most reads — an offer on every row would be a menu, and the
 * point of putting it here is that he chose one.
 */
export function RowOffers({ offers, seq, subject, onTake }: {
  offers: ActionOffer[] | undefined;
  seq: number | undefined;
  subject: string | null;
  onTake: Take;
}) {
  const mine = onRow(offers ?? [], seq, subject);
  if (!mine.length) return null;
  return (
    <span className="r-mk-offers">
      {mine.map((a) => <Offer key={`${a.act}:${a.target}`} offer={a} onTake={onTake} />)}
    </span>
  );
}

/** What happens when one is tapped. Owned by the block, not by the mark. */
export type Take = (offer: ActionOffer) => void;

/** What every row mark needs to draw an offer, and nothing else. */
export interface Offering {
  offers?: ActionOffer[];
  seq?: number;
  onTake?: Take;
  /**
   * A TAP ON A ROW'S NAME PUTS IT IN THE SELECTION (the log, 2026-09-15).
   *
   * It was missing. `subjects.ts` resolved the id, the composer drew the
   * chip, `subjectOnBoard` was tested — and no mark ever called `pick`, so
   * the only way an id could reach George was by typing `@`. The owner, on
   * the live build: *"i cant click any store cause theres no tap."* He was
   * describing the code exactly.
   */
  onPick?(subject: string): void;
  /** The subjects already picked, so a row can say it is one of them. */
  picked?: string[];
}

export const NO_TAKE: Take = () => {};

/** Whether a block pointed at particular rows — the only time a swatch is ringed. */
export function emphasised(o: TileProps['o']): boolean {
  const e = o.emphasise;
  return Array.isArray(e) ? e.some((x) => String(x).trim()) : Boolean(String(e ?? '').trim());
}

/**
 * A ROW'S NAME, TAPPABLE WHERE THE ROW HAS ONE.
 *
 * THE `stopPropagation` IS THE OTHER HALF OF THE BUG. The tile is
 * `role="button"` with an `onClick` over the whole of it, so a click on a row
 * reached the tile's open handler and nothing else — which is why the report
 * is *"tapping doesnt work it just moves or expands the widget"* rather than
 * "nothing happens". Both halves had to go or the tap would have opened the
 * object and selected the row at once.
 *
 * A row with no subject of its own is drawn as it always was: a plain label
 * is honest about there being nothing to pick.
 */
export function RowName({ name, pickable, onPick, picked, className, dimension }: {
  name: string;
  pickable: boolean;
  onPick?(subject: string): void;
  picked?: boolean;
  className: string;
  /**
   * WHAT KIND OF THING THE NAME IS, for its swatch (P2S.2(e)). The swatch is
   * the store; the mark beside it is the verdict.
   */
  dimension?: Dimension | null;
}) {
  // THE SWATCH SITS OUTSIDE THE TEXT THAT CLAMPS (the log, 2026-09-17: "these
  // things keep getting slightly cut we cant accept that"). A two-line clamp
  // needs `overflow: hidden`, and a dot inside that box lost its left edge and
  // its ring. The dot is a sibling now; only the words are clamped.
  const swatch = <Swatch name={name} dimension={dimension} />;
  const words = <span className="r-mk-name-text">{name}</span>;
  if (!pickable || !onPick) return <span className={className}>{swatch}{words}</span>;
  return (
    <button
      type="button"
      className={`${className} r-mk-name--tap`}
      aria-pressed={picked ?? false}
      onClick={(e) => { e.stopPropagation(); onPick(name); }}
    >
      {swatch}{words}
    </button>
  );
}


/**
 * THE BESIDE ROOM, IN NUMBERS (P2S.1(b)(c)).
 *
 * `ops/ideal/george-ahead-of-me.html` is the design — the owner, 2026-09-17:
 * *"everything ive been leading you to this final artifact is it"*. Its beside
 * room is built by four small functions (`buildBeside`, `place`, `wire`,
 * `arrows`) and a canvas mark (`draw`). This file is those functions, ported
 * and made pure, so each rule he asked for is a thing a test can hold instead
 * of a thing a browser happens to do:
 *
 *   his row 4   "the middle console should always stay centered … when sidebar
 *               opens it shrinks the whole thing, that should not happen"
 *                                                → `composition`
 *   rows 6, 7   "if theres open space … it should fill it", "left to right
 *               then down"                       → `columnsFor`, `placeFigures`
 *   row 9       "just up and down arrows"        → `arrowsFor`
 *   row 10, 12  "leading lines from stage", "coming from alive"
 *                                                → `wireEnds`
 *   row 13      "dont narrate it"                → `revealAt`
 *   rows 14, 24 "alive is too small … bigger", "its probably like the zone
 *               size"                            → `markGeometry`
 *
 * Nothing here computes a business figure. Every number is a pixel or a
 * millisecond.
 */

import type { ToolCall } from '../types/george';
import { placeFigures as figuresPlaced } from './figures';

/**
 * HIS SENTENCES, BY THE CHART THEY ARE ABOUT (the owner, 2026-09-17: *"more text
 * of what george thinks should be integrated on the charts so when you see the
 * visual and you here his thought you can get a good picture"*).
 *
 * A sentence that cites figures from a read belongs beside that read's chart —
 * the read most of its figures came from, by the same matcher the superscripts
 * use. A sentence citing none stays with the rest of his words. The claim's own
 * sentence is not moved: it is the headline. Not a character is rewritten; the
 * sentences are the answer's own slices, in order.
 */
export function thoughtsOf(text: string | null | undefined, claimSpan: string | null | undefined,
                           calls: ToolCall[]): { bySeq: Map<number, string[]>; unbound: string } {
  const parts = claimAndStanding(text, claimSpan);
  const bySeq = new Map<number, string[]>();
  const unbound: string[] = [];
  for (const slice of [parts.before, parts.after]) {
    for (const sentence of slice.trim() ? slice.trim().split(/(?<=[.!?])\s+/) : []) {
      const count = new Map<number, number>();
      for (const piece of figuresPlaced(sentence, calls)) {
        if (piece.seq !== undefined) count.set(piece.seq, (count.get(piece.seq) ?? 0) + 1);
      }
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) bySeq.set(best[0], [...(bySeq.get(best[0]) ?? []), sentence]);
      else unbound.push(sentence);
    }
  }
  return { bySeq, unbound: unbound.join(' ') };
}

/* ------------------------------------------------------------ the frame */

/** The artifact's own dimensions (`.bs-view`, `.side`), mirrored in room.css. */
export const HIM_W = 580;
export const FIGS_W = 940;
export const COMP_GAP = 40;
export const COMP_MAX = HIM_W + COMP_GAP + FIGS_W; // 1560
export const SIDE_W = 232;
/** The artifact's inline padding on the composition, 16px each side. */
export const COMP_PAD = 16;
/** At or under this width the three stack and the page scrolls. */
export const PHONE = 900;

export interface Composition {
  /** Where the room begins: the sidebar's edge when it is open, else 0. */
  roomLeft: number;
  /** The composition's own left edge and width, in window pixels. */
  left: number;
  width: number;
  /** The two columns. */
  him: number;
  figures: number;
  /** The composition's centre, and the room's. The rule is that they agree. */
  centre: number;
  roomCentre: number;
}

/**
 * WHERE THE COMPOSITION SITS, AND HOW WIDE IT IS.
 *
 * THE WIDTH NEVER DEPENDS ON THE SIDEBAR. The artifact moved the room's left
 * edge when the sidebar opened, so at 1440px the columns shrank by the
 * sidebar's width — which is the exact report: *"when sidebar opens it shrinks
 * the whole thing, that should not happen"*. Here the width is decided as
 * though the sidebar were always there, so opening it SLIDES the composition
 * to the centre of what is left and never narrows it.
 *
 * The cost, said plainly: under 1,824px (1,560 + 232 + 32) the composition is
 * narrower than the design's 1,560 even with the sidebar closed, by the
 * sidebar's width. Above it, both columns are exactly 580 and 940.
 *
 * The columns keep the design's proportion (29:47) when there is less room,
 * rather than the artifact's `minmax(0, …)` tracks, which shrink both columns
 * by the same pixels and so squeeze the narrower one twice as hard.
 */
export function composition(viewport: number, sideOpen: boolean): Composition {
  const roomLeft = sideOpen ? SIDE_W : 0;
  const width = Math.max(0, Math.min(COMP_MAX, viewport - SIDE_W - 2 * COMP_PAD));
  const inner = Math.max(0, width - COMP_GAP);
  const him = inner * (HIM_W / (HIM_W + FIGS_W));
  const left = roomLeft + (viewport - roomLeft - width) / 2;
  return {
    roomLeft,
    left,
    width,
    him,
    figures: inner - him,
    centre: left + width / 2,
    roomCentre: roomLeft + (viewport - roomLeft) / 2,
  };
}

/* ---------------------------------------------------------- the figures */

/**
 * HOW MANY COLUMNS THE FIGURES TAKE — two on a desk, one on a phone, and one
 * only when the answer is a single figure that needs the width.
 *
 * THREE COLUMNS WENT ON 2026-09-17. The design's `place()` gave five or more
 * figures three columns of ~290px, and the owner, looking at nine: *"some
 * charts are still getting cut"* — product names ellipsed to "P4 kiamoy s…",
 * "Tong Garden …" — and *"all charts dont need to be the same size or small"*.
 * Two columns is the most the figures area holds without cutting what a row
 * names; the chart the answer rests on spans both (`placeFigures`' `spans`).
 */
export function columnsFor(count: number, viewport: number, onlyOneNeedsWidth = false): 1 | 2 {
  if (viewport <= PHONE) return 1;
  // A CHART TAKES THE SIZE IT NEEDS (the owner, 2026-09-17: "some charts are
  // too big that dont need to be it should know like how much size it needs
  // not waste it"). One ranked list of eight categories across 940px is bars
  // twice as long as they need to be; it sits in a column like any other.
  if (count <= 1) return onlyOneNeedsWidth ? 1 : 2;
  return 2;
}

/**
 * WHETHER A FIGURE NEEDS THE WHOLE AREA — from what it draws, never a guess:
 * a line over many points reads its shape only when it is long, a table with
 * many columns cuts them in half a width, and a composed shape lays itself
 * out. Everything else — a figure, a ranking, a comparison, contributors —
 * says all it says in one column.
 */
export function needsWidth(mark: string | null, points: number, columns: number): boolean {
  if (mark === 'spec') return true;
  if (mark === 'line') return points > 8;
  if (mark === 'table') return columns > 4;
  return false;
}

/** The artifact's gap between two figures in one column (`.bs-col` gap). */
export const FIGURE_GAP = 34;

/**
 * WHICH COLUMN EACH FIGURE GOES IN, in order.
 *
 * Each figure goes to the column that is shortest RIGHT NOW, ties to the one
 * holding fewest figures, ties again to the leftmost — the artifact's
 * `offsetHeight*1000 + children.length`. So a short figure never leaves a hole
 * beside a tall one, and with equal heights the order reads left to right,
 * then down (his row 7).
 */
export function placeFigures(heights: readonly number[], columns: number,
                             spans: readonly boolean[] = []): number[] {
  const cols = Math.max(1, columns);
  const height = new Array<number>(cols).fill(0);
  const count = new Array<number>(cols).fill(0);
  return heights.map((h, n) => {
    // A FIGURE THAT SPANS — the one the answer rests on — goes under the
    // tallest column and raises every column to its foot. It reports column 0.
    if (spans[n] && cols > 1) {
      const top = Math.max(...height.map((x, c) => x + (count[c] > 0 ? FIGURE_GAP : 0)));
      for (let c = 0; c < cols; c += 1) { height[c] = top + Math.max(0, h); count[c] += 1; }
      return 0;
    }
    let best = 0;
    for (let c = 1; c < cols; c += 1) {
      const a = height[c] * 1000 + count[c];
      const b = height[best] * 1000 + count[best];
      if (a < b) best = c;
    }
    height[best] += (count[best] > 0 ? FIGURE_GAP : 0) + Math.max(0, h);
    count[best] += 1;
    return best;
  });
}

/**
 * WHEN EACH FIGURE ARRIVES, in milliseconds after the answer lands.
 *
 * The artifact's own: the first at 200ms, then one every 260ms, each drawing
 * itself. Not narrated sentence by sentence — his row 13 — and all at once
 * when the person has asked for less motion.
 */
export const REVEAL_FIRST = 200;
export const REVEAL_EVERY = 260;

export function revealAt(index: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : REVEAL_FIRST + index * REVEAL_EVERY;
}

/** The arrows: up hidden within 2px of the top, down within 2px of the bottom. */
export function arrowsFor(scrollTop: number, clientHeight: number, scrollHeight: number):
  { up: boolean; down: boolean } {
  return {
    up: scrollTop > 2,
    down: scrollTop + clientHeight < scrollHeight - 2,
  };
}

/** How far one arrow press moves the figures: 80% of the area's height. */
export function arrowStep(clientHeight: number): number {
  return clientHeight * 0.8;
}

/* -------------------------------------------------------------- the wires */

export interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface Wire { x1: number; y1: number; x2: number; y2: number; to: string; last: boolean }

/**
 * THE LEADING LINES — the artifact's `wire()`.
 *
 * From the mark's centre to the claim's top-right corner (6px in, 2px down),
 * and to each figure's top-left (+18, +8) — only while that figure is inside
 * the figures area, clamped to the area's top edge when it is partly scrolled
 * out. All coordinates are relative to `frame`, the element the SVG covers.
 * The last figure's line is drawn a little heavier, as the artifact draws it.
 */
export function wireEnds(p: {
  frame: Box;
  mark: Box | null;
  claim: Box | null;
  area: Box | null;
  figures: { key: string; box: Box }[];
}): Wire[] {
  if (!p.mark) return [];
  const x1 = p.mark.left - p.frame.left + p.mark.width / 2;
  const y1 = p.mark.top - p.frame.top + p.mark.height / 2;
  const out: Wire[] = [];
  if (p.claim) {
    out.push({ x1, y1, x2: p.claim.right - p.frame.left - 6, y2: p.claim.top - p.frame.top + 2,
               to: 'claim', last: false });
  }
  p.figures.forEach(({ key, box }, i) => {
    if (p.area && (box.bottom < p.area.top || box.top > p.area.bottom)) return;
    const top = p.area ? Math.max(box.top, p.area.top) : box.top;
    out.push({ x1, y1, x2: box.left - p.frame.left + 18, y2: top - p.frame.top + 8,
               to: key, last: i === p.figures.length - 1 });
  });
  return out;
}

/* --------------------------------------------------------------- the mark */

/**
 * THE MARK'S CANVAS AND ITS BODY — the artifact's `draw()` at rest.
 *
 * A 680×420 canvas drawn at 122% of its 580 column, so the glow runs past the
 * column while the BODY spans most of it (his rows 14 and 24). The body is an
 * irregular form, not an oval (row 15): a base radius stretched to the wide
 * canvas, its edge moved by three slow sines. At rest `t = 0`; P2S.2(d) makes
 * `t` move.
 */
export const MARK_W = 680;
export const MARK_H = 420;
/** The canvas's CSS width as a share of its column (`.bs-him canvas`). */
export const MARK_SPAN = 1.22;
const BASE_R = 84;
const REACH = 103 * 1.36 * 1.23;

export function markEdge(theta: number, t = 0): number {
  return 1 + 0.17 * Math.sin(3 * theta + t * 0.55)
           + 0.10 * Math.sin(5 * theta - t * 0.42 + 1.3)
           + 0.06 * Math.sin(8 * theta + t * 0.8 + 2.1);
}

export function markGeometry(t = 0): {
  ex: number; ey: number; radius: number;
  /** The body's drawn width, in canvas pixels. */
  bodyWidth: number;
  /** The body's drawn width as a share of the COLUMN the canvas sits in. */
  bodyShareOfColumn: number;
} {
  const ex = (MARK_W / 2) / REACH;
  const ey = (MARK_H / 2) / REACH;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k <= 720; k += 1) {
    const th = (k / 720) * Math.PI * 2;
    const x = Math.cos(th) * BASE_R * ex * markEdge(th, t);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  const bodyWidth = hi - lo;
  return { ex, ey, radius: BASE_R, bodyWidth, bodyShareOfColumn: (bodyWidth / MARK_W) * MARK_SPAN };
}

/* -------------------------------------------------------------- the words */

/**
 * THE CLAIM AND THE STANDING TEXT, out of one answer.
 *
 * The design sets the claim as a sentence of its own, large, in serif, and the
 * rest of what he said under it. The loop gives a claim SPAN (`reading.claim`,
 * the few words that are the point); the claim drawn here is the SENTENCE that
 * span sits in, so it reads as a sentence and not as a fragment. Where no span
 * was given, or it is not in the text, the first sentence is the claim. Not
 * one character of either is changed: the standing text is what came before
 * the claim's sentence and what came after it, in that order.
 */
export interface ClaimParts {
  /** The claim's sentence, trimmed for display. */
  claim: string;
  /** Everything else he said, trimmed and joined, for display. */
  standing: string;
  /** The exact slices: `before + claimRaw + after` is the answer, character for character. */
  before: string;
  claimRaw: string;
  after: string;
}

export function claimAndStanding(text: string | null | undefined, span?: string | null): ClaimParts {
  const said = (text ?? '').trim();
  if (!said) return { claim: '', standing: '', before: '', claimRaw: '', after: '' };
  const ends: number[] = [];
  const re = /[.!?](?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(said))) ends.push(m.index + 1);
  if (!ends.length || ends[ends.length - 1] !== said.length) ends.push(said.length);

  let sentence = 0;
  const want = (span ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (want) {
    const flat = said.replace(/\s+/g, ' ').toLowerCase();
    const at = flat.indexOf(want);
    if (at >= 0) {
      // Map the flattened index back onto the original by counting.
      let seen = 0;
      let orig = 0;
      let space = false;
      for (; orig < said.length && seen < at + want.length; orig += 1) {
        if (/\s/.test(said[orig])) { if (!space) { seen += 1; space = true; } continue; }
        space = false;
        seen += 1;
      }
      const found = ends.findIndex((e) => e >= orig);
      sentence = found < 0 ? ends.length - 1 : found;
    }
  }
  const start = sentence === 0 ? 0 : ends[sentence - 1];
  const end = ends[sentence];
  const before = said.slice(0, start);
  const claimRaw = said.slice(start, end);
  const after = said.slice(end);
  const standing = [before.trim(), after.trim()].filter(Boolean).join(' ');
  return { claim: claimRaw.trim(), standing, before, claimRaw, after };
}

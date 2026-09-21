/**
 * THE BESIDE ROOM, IN NUMBERS (P2S.1(b)(c)).
 *
 * `ops/ideal/bob-ahead-of-me.html` is the design — the owner, 2026-09-17:
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

import type { ToolCall } from '../types/bob';
import { placeFigures as figuresPlaced } from './figures';

/**
 * HIS SENTENCES, BY THE CHART THEY ARE ABOUT (the owner, 2026-09-17: *"more text
 * of what bob thinks should be integrated on the charts so when you see the
 * visual and you here his thought you can get a good picture"*).
 *
 * A sentence that cites figures from a read belongs beside that read's chart —
 * the read most of its figures came from, by the same matcher the superscripts
 * use. The claim's own sentence is not moved: it is the headline. Not a
 * character is rewritten; the sentences are the answer's own slices, in order.
 *
 * AND WHAT IS LEFT UNDER HIM IS ONLY WHAT THE SCREEN DOES NOT ALREADY SAY (the
 * owner, 2026-09-18: *"if its stating whats already stated or shown in the page
 * (meaning charts section) then dont make it say that"*). Read against every
 * recorded answer, the rest was the whole body of the answer: every chart he
 * draws carries its own thought, so no sentence was placed and all of them fell
 * through to the words under the headline, restating the charts, and closing on
 * his `next` word for word. So a sentence is not drawn under him when
 *
 *   - it cites a read that is drawn as a figure — on a chart with no thought it
 *     is that chart's thought; on one with its own, the chart already says it;
 *   - it restates something already on screen (`restated`): the headline, what
 *     he'd do next, a question he suggests, a chart's title or thought;
 *   - it carries on from a sentence that went ("So…", "That…", "And it…"), or it
 *     introduces one ("…:", a short bullet heading) — alone it is an orphan.
 *
 * A sentence citing a read that is NOT drawn stays under him: nothing else on
 * screen says it. `shown` absent is the old reading — every read drawn.
 */
export interface Shown {
  /** The reads this turn draws as figures, by seq. Absent: every read is. */
  drawn?: ReadonlySet<number>;
  /** His other words already on screen: the headline, next, asks, each chart's title and thought. */
  said?: readonly (string | null | undefined)[];
}

type Verdict = { went: 'kept' } | { went: 'shown' } | { went: 'placed'; seq: number };

export function thoughtsOf(text: string | null | undefined, claimSpan: string | null | undefined,
                           calls: ToolCall[],
                           /** THE READS WHOSE CHART ALREADY CARRIES HIS THOUGHT. */
                           thoughtful: ReadonlySet<number> = new Set(),
                           shown: Shown = {}):
  { bySeq: Map<number, string[]>; unbound: string } {
  const { plain, bold } = unmark((text ?? '').trim());
  const parts = claimAndStanding(plain, claimSpan);
  const screen = [parts.claimRaw, ...(shown.said ?? [])]
    .map((x) => (x ?? '').trim()).filter(Boolean);
  const afterAt = parts.before.length + parts.claimRaw.length;
  const sentences = ([[parts.before, 0], [parts.after, afterAt]] as const)
    .flatMap(([slice, from]) => sentencesOf(slice, from));

  const verdicts: Verdict[] = [];
  sentences.forEach(({ said }, i) => {
    const count = new Map<number, number>();
    for (const piece of figuresPlaced(said, calls)) {
      if (piece.seq !== undefined) count.set(piece.seq, (count.get(piece.seq) ?? 0) + 1);
    }
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const previous = verdicts[i - 1];
    if (best !== undefined && (!shown.drawn || shown.drawn.has(best))) {
      verdicts.push(thoughtful.has(best) ? { went: 'shown' } : { went: 'placed', seq: best });
    } else if (restated(said, screen)) {
      verdicts.push({ went: 'shown' });
    } else if (previous && previous.went !== 'kept' && CARRIES_ON.test(bare(said))) {
      verdicts.push(previous);
    } else {
      verdicts.push({ went: 'kept' });
    }
  });
  // A LEAD-IN OR A HEADING GOES WHERE WHAT IT LEADS INTO GOES — onto its chart,
  // under him, or nowhere — read from the end so a run of them follows the
  // sentence at its foot. Alone it is an orphan ("Three.", the log 2026-09-18).
  for (let i = sentences.length - 2; i >= 0; i -= 1) {
    const { at, said } = sentences[i];
    const next = sentences[i + 1];
    const ownLine = plain.slice(at + said.length, next.at).includes('\n');
    const allBold = bold.some(([a, b]) => a <= at && at + said.length <= b);
    const heading = ownLine && (said.split(/\s+/).length <= 3 || (allBold && said.split(/\s+/).length <= 8));
    if (verdicts[i].went === 'kept' && (leadsIn(said) || heading)) verdicts[i] = verdicts[i + 1];
  }

  const bySeq = new Map<number, string[]>();
  let unbound = '';
  let keptTo = -1;
  sentences.forEach(({ at, said }, i) => {
    const v = verdicts[i];
    const sentence = remark(said, at, bold);
    if (v.went === 'placed') bySeq.set(v.seq, [...(bySeq.get(v.seq) ?? []), sentence]);
    else if (v.went === 'kept') {
      // HIS LINES STAY LINES: a kept sentence that began a new line in what he
      // wrote (a list item, a paragraph) starts one here, drawn by `pre-line`.
      const joint = keptTo < 0 ? '' : (plain.slice(keptTo, at).includes('\n') ? '\n' : ' ');
      unbound += joint + sentence.replace(BULLET, '');
      keptTo = at + said.length;
    }
  });
  return { bySeq, unbound };
}

/** A sentence that only makes sense after the one before it. */
const CARRIES_ON = /^(so|that|that's|this|these|those|it|it's|they|their|and|but|which|all|each|both|neither|none|nobody|underneath)\b/i;
/** A list marker he typed, which is drawn as nothing, like his `**`. */
const BULLET = /^[-*•]\s+/;
const bare = (said: string) => said.replace(BULLET, '').replace(/^\*\*/, '').replace(/^["'“‘(]+/, '');
/** "Here is how it broke down:", or a bullet's own short heading. */
function leadsIn(said: string): boolean {
  if (/:\s*$/.test(said)) return true;
  return BULLET.test(said) && said.split(/\s+/).length <= 9;
}

/**
 * WHETHER A SENTENCE SAYS AGAIN WHAT ANOTHER ALREADY SAYS: most of its words —
 * three or more letters, the glue words out, numbers kept — are in one of them.
 * Measured on the recorded answers (`verification/p2s7-gate*.json`): a repeat of
 * `next` or of a chart's thought scores 0.6 to 1.0, a sentence carrying
 * something new 0.5 or under.
 */
/**
 * HIS PROSE, FOR THE LEFT COLUMN (2026-09-20) — the whole of it but the
 * headline's own sentence and a paragraph that is only what he would do next,
 * both of which are drawn on their own.
 *
 * The owner, of the room that drew his paragraphs down the right with a chart
 * under each: *"now its more of a thread. not a page … we dont want to read
 * that much."* His prose leaves the right side; this is what the left holds
 * instead, and `voice.body` is what keeps it short enough to be a conclusion.
 */
export function bodyOf(text: string | null | undefined, claimSpan: string | null | undefined,
                       next: string | null | undefined): string {
  const { plain } = unmark((text ?? '').trim());
  if (!plain) return '';
  const parts = claimAndStanding(plain, claimSpan);
  return [parts.before, parts.after]
    .flatMap((slice) => slice.split(/\n\s*\n/))
    .map((para) => para.trim())
    .filter((para) => para && !(next && restated(para, [next])))
    .join('\n\n');
}

export function restated(sentence: string, others: readonly string[],
                         at: number = RESTATED_AT): boolean {
  const mine = wordsOf(sentence);
  if (!mine.size) return false;
  return others.some((other) => {
    const theirs = wordsOf(other);
    let shared = 0;
    for (const w of mine) if (theirs.has(w)) shared += 1;
    return shared / mine.size >= at;
  });
}
const RESTATED_AT = 0.6;
/**
 * A CAPTION IS HELD TO A LOWER BAR (P14, 2026-09-21). His live page headed a
 * section "Three shops fall; the rest are fine" and captioned the chart under
 * it "Three shops fall, three hold, Rockwell gains" — half the words shared,
 * under the 0.6 a sentence of prose needs, and the reader sees the heading
 * twice. A caption has one job the heading has not already done.
 */
export const CAPTION_RESTATED_AT = 0.45;
/**
 * AND SO IS THE HEADLINE AGAINST THE PAGE'S LEDE (P15.b's first half,
 * 2026-09-21). Two places own the answer: the left column's headline and the
 * page's opening sentence. Where they say the same thing the reader is told
 * twice, which is the owner's complaint and the card's own Done-when —
 * "nothing on screen repeats the headline".
 *
 * MEASURED ON THE TWO LIVE TURNS OF 2026-09-21, which is why it is this bar and
 * not the 0.6 a sentence of prose needs. DeepSeek's headline "Fewer
 * transactions, not smaller baskets — and Greenhills is the shop that fell
 * hardest" against its lede "…and the fall is fewer transactions, not smaller
 * baskets" shares about 0.57 — the same finding in nearly the same words, and
 * under 0.6 it would have drawn twice. Opus's headline "Greenhills is losing
 * transactions, not basket — the reverse of what I had" against its lede about
 * the estate's week shares far less and STAYS DRAWN: that is a second thing
 * said, not the same thing repeated.
 */
export const HEADLINE_RESTATED_AT = 0.45;
const GLUE = new Set(('the and for that this with was were are but not its his her our you your from '
  + 'than then they them into have has had just only also what which when where who how why all any '
  + 'one two out off per same about over more less most very there here been being will would could '
  + 'should can may might shall').split(' '));
function wordsOf(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}₱%.,'-]+/gu) ?? [])
    .map((w) => w.replace(/^[.,'-]+|[.,'-]+$/g, ''))
    .filter((w) => w.length >= 3 && !GLUE.has(w)));
}

/**
 * HIS CAVEAT, LESS WHAT IS ALREADY SAID — by the answer (`unsaid` catches the
 * exact repeats; this, the same point in other words) or by anything else on
 * screen. The caveat's own words, in order; only a repeat is not drawn twice.
 * Against the answer it reads runs of up to three sentences, because he often
 * says in three what the caveat says in one.
 */
export function caveatUnshown(caveat: string | null | undefined, said: readonly (string | null | undefined)[],
                              answer = ''): string {
  const lines = answer.trim() ? sentencesOf(answer.trim(), 0).map((x) => x.said) : [];
  const runs = lines.flatMap((_, i) => [1, 2, 3].map((n) => lines.slice(i, i + n).join(' ')));
  const others = [...said, ...runs].map((x) => (x ?? '').trim()).filter(Boolean);
  const whole = (caveat ?? '').trim();
  if (!whole) return '';
  return whole.split(/(?<=[.!?])\s+/)
    .filter((x) => x.trim() && !restated(x, others))
    .map((x) => x.trim())
    .join(' ');
}

/**
 * A slice's sentences, trimmed, each with where it starts in the whole text. A
 * line break ends one too: a list item or a heading line ("Where it sits:") is
 * its own piece, never glued to the line under it.
 */
export function sentencesOf(slice: string, from: number): { at: number; said: string }[] {
  const out: { at: number; said: string }[] = [];
  const push = (start: number, end: number) => {
    const raw = slice.slice(start, end);
    const said = raw.trim();
    if (said) out.push({ at: from + start + (raw.length - raw.trimStart().length), said });
  };
  const re = /(?<=[.!?])\s+|\s*\n\s*/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice))) { push(start, m.index); start = m.index + m[0].length; }
  push(start, slice.length);
  return out;
}

/** His emphasis back on one sentence: every bold range, cut to its edges. */
export function remark(said: string, at: number, bold: readonly [number, number][]): string {
  const cuts: [number, number][] = [];
  for (const [a, b] of bold) {
    const s = Math.max(a, at) - at;
    const e = Math.min(b, at + said.length) - at;
    if (s < e) cuts.push([s, e]);
  }
  let out = said;
  for (const [s, e] of cuts.sort((x, y) => y[0] - x[0])) {
    out = `${out.slice(0, s)}**${out.slice(s, e)}**${out.slice(e)}`;
  }
  return out;
}

/**
 * `**x**` pairs out of the text, and where they were. An odd marker with no
 * partner is left in place: it is not emphasis, and removing it would be
 * changing what he wrote.
 */
export function unmark(raw: string): { plain: string; bold: [number, number][] } {
  // `*x*` is his emphasis too (the log, 2026-09-18: "biggest *number*"): drawn
  // in weight like `**x**`, never printed. Only a pair hugging a word counts, so
  // "3 * 4" and a lone "*" stay as he wrote them.
  const text = raw.replace(/(?<![*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g, '**$1**');
  const bold: [number, number][] = [];
  let plain = '';
  let open = -1;
  let i = 0;
  const pairs = (text.match(/\*\*/g) ?? []).length;
  const usable = pairs - (pairs % 2);
  let used = 0;
  while (i < text.length) {
    if (text.startsWith('**', i) && used < usable) {
      used += 1;
      if (open < 0) { open = plain.length; } else { bold.push([open, plain.length]); open = -1; }
      i += 2;
      continue;
    }
    plain += text[i];
    i += 1;
  }
  // Trimming the plain text moves every index by what was cut off the front.
  const lead = plain.length - plain.trimStart().length;
  return { plain: plain.trim(), bold: bold.map(([a, b]) => [a - lead, b - lead] as [number, number]) };
}

/* ------------------------------------------------------------ the frame */

/** The artifact's own dimensions (`.bs-view`, `.side`), mirrored in room.css. */
/**
 * HIS COLUMN IS BOUNDED AND THE PAGE TAKES THE REST (P10, 2026-09-21).
 *
 * It was 580:940 of whatever there was — the beside design's own two columns.
 * At 1440 that gave the page 703px, and a page of 703 with a figure floated
 * into it leaves 36 characters a line, which is not a measure anyone reads
 * prose at: every figure ended up at the full width and the page read as
 * bands. The owner: *"it still feels like its trying to fill in columns not
 * the one big page"*, then *"ok do both"*.
 *
 * These are the artifact's own numbers (ops/ideal/the-page-bob-writes.html
 * `.room` and `.page`): his side stops growing at 360, the gap is 64, the page
 * takes the rest and stops at 900.
 */
export const HIM_W = 360;
export const COMP_GAP = 64;
export const PAGE_W = 900;
export const COMP_MAX = HIM_W + COMP_GAP + PAGE_W; // 1324
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
  // THE ROOM IS WHAT IS THERE (P10). The width used to be decided as though
  // the sidebar were always present, so that opening it moved the composition
  // without resizing it — and the cost was 232px of every screen held for
  // something not on it. It is reclaimed while the sidebar is closed; opening
  // it now narrows the room, which is the trade the owner took.
  const width = Math.max(0, Math.min(COMP_MAX, viewport - roomLeft - 2 * COMP_PAD));
  const inner = Math.max(0, width - COMP_GAP);
  const him = Math.min(HIM_W, inner * 0.36);
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
  // TWO COLUMNS THAT ARE NOT A GRID OF WIDGETS (P3.l). This said 2 until the
  // morning of 2026-09-19, then 1 for an hour, and is 2 again — with the rule
  // above it changed, which is what actually mattered. A FIGURE NOW SPANS BOTH
  // UNLESS IT IS GATHERED UNDER ANOTHER (render.tsx), so a board that relates
  // nothing runs down one flow — the page the owner asked for — while a point
  // with evidence under it keeps that evidence BESIDE ITSELF, two up, the way
  // the design does it. The columns exist for the gathering and nothing else.
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
export function needsWidth(mark: string | null, points: number, columns: number,
                           names: readonly string[] = []): boolean {
  if (mark === 'spec') return true;
  if (mark === 'line' || mark === 'area') return points > 8;
  // A TABLE NEEDS THE WIDTH ITS COLUMNS NEED, NOT A COUNT OF THEM.
  //
  // This was `columns > 4`, and the owner found what that misses: a stockout
  // read with FOUR columns — store, days out of stock, current stockout run,
  // longest stockout run — sixty characters of heading, drawn in half the
  // area, cut off and scrolling sideways while the other half stood empty.
  // "why is there a scroller on this chart when theres clearly space on the
  // right". Four short columns fit; four long ones never did.
  if (mark === 'table') return columns > 4 || tableChars(names) > HALF_WIDTH_CHARS;
  // P2S.3, seen in the vocab frames: upright bars share the width between
  // their names, so past four a name broke mid-word ("OPU S"); a grid of many
  // cells shrinks its cells below a readable size in half the area.
  if (mark === 'bar') return points > 4;
  if (mark === 'heatmap') return points > 48;
  return false;
}

/**
 * How wide a table is, in characters, counting what each column must show.
 *
 * A column is at least its heading and never narrower than the figures under
 * it, which `.r-rows td` keeps on one line; the two either side of it cost the
 * cell padding. Approximate on purpose — it decides a layout, never a figure.
 */
export function tableChars(names: readonly string[]): number {
  return names.reduce((n, c) => n + Math.max(c.replace(/_/g, ' ').length, MIN_COLUMN_CHARS)
    + COLUMN_PADDING_CHARS, 0);
}

/**
 * The characters that fit across ONE of the two figure columns.
 *
 * Measured from the composition rather than chosen: the figures area is 47 of
 * 76 parts of a composition capped at `--comp-max`, split into two columns
 * with `--comp-gap` between, and `.r-rows` is 12.5px — about 0.55em a
 * character in this face. That is roughly 60; 56 is used so a table sitting
 * exactly on the line takes the width rather than the scrollbar.
 */
const HALF_WIDTH_CHARS = 56;
const MIN_COLUMN_CHARS = 6;
const COLUMN_PADDING_CHARS = 2;

/** The artifact's gap between two figures in one column (`.bs-col` gap). */
// 34 → 22 (P6.b, 2026-09-20). With the prose off the right side and every
// block a step, 34 between steps plus 34 inside each read as a tile's air;
// the target page's steps sit closer than that. The room's rhythm, in
// one place — the laid-out margins in room.css carry the same number.
export const FIGURE_GAP = 22;

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

/* `arrowsFor` and `arrowStep` went with the figures' own scroller (P10). */

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

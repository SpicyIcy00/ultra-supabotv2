/**
 * THE PAGE IS HIS ANSWER — one thought, then exactly the evidence for it.
 *
 * The owner, across one day, of the live right-hand side: *"it still just feels
 * like here's this and here's this, not at all like the answers and charts
 * visuals and text are well thought out and put in an order to make you
 * understand better — that's the point of the page"*; of what he wanted it to
 * feel like: *"Bob … actively working through the business with me, not
 * generating a report"*; and, when I ported the design's layout instead of
 * thinking: *"not just copy what the artifact did, think for yourself."*
 *
 * TWO THINGS WERE WRONG, AND THE FIRST HID THE SECOND.
 *
 * The room SHREDDED his answer. A sentence that cited a chart was moved under
 * that chart or dropped because "the chart already says it"; what was left sat
 * on the left with its context gone — *"The other four were up."* (the other
 * four what?) — and the charts ran in his compose order, not the order he
 * reasoned in. Making his PARAGRAPH the unit fixed that, and showed the second
 * thing: a six-line slab of prose, then three seven-row charts repeating it.
 * Twenty-one rows on screen to say that OPUS fell most and Greenhills' basket
 * shrank while its tills got busier. An essay with an appendix is still a
 * report.
 *
 * What working THROUGH something feels like is a person at a whiteboard: one
 * thought, then exactly the evidence for that thought, then the next. So:
 *
 *   THE UNIT IS THE BEAT. His sentences, in his order, grouped by which reads
 *   they cite. A sentence that cites nothing carries on from the one before; a
 *   sentence that brings up a new read starts a new beat.
 *
 *   EVIDENCE SHOWS WHAT THE BEAT NAMES. When a beat names one or two subjects,
 *   the figures under it draw those rows and fold the rest; when it names three
 *   or more, or none, the figure stays whole — an overview is about everyone,
 *   and *"all stores still matter"* (the owner, 2026-09-15).
 *
 * NOTHING HERE WRITES A WORD, COMPUTES A FIGURE OR JUDGES IMPORTANCE. Every
 * character drawn is a slice of his answer with his emphasis put back; which
 * read a beat cites is the superscripts' own matcher (`figures.ts`); which rows
 * it names is whether a row's own label appears in his sentence.
 */
import type { ToolCall } from '../types/bob';
import { figuresIn, placeFigures as figuresPlaced, readBehind } from './figures';
import { claimAndStanding, remark, restated, sentencesOf, unmark } from './beside';
import { rowsOf, subjectOf } from './data';

/** One beat of the page: a thought of his, and what it rests on. */
export interface Section {
  /** His words for this beat, emphasis intact, as `Marked` draws them. */
  para: string;
  /** The same words with the emphasis out — what the matchers read. */
  plain: string;
  /** The reads it cites, in the order it cites them, each once. */
  seqs: number[];
  /** True when this beat opens one of his paragraphs — it gets the room a paragraph does. */
  opens: boolean;
}

/** Which reads a stretch of his prose cites, in order of first mention. */
function citedIn(text: string, calls: ToolCall[]): number[] {
  const seqs: number[] = [];
  for (const piece of figuresPlaced(text, calls)) {
    if (piece.seq !== undefined && !seqs.includes(piece.seq)) seqs.push(piece.seq);
  }
  return seqs;
}

/**
 * His answer as beats.
 *
 * TWO THINGS ARE LEFT OUT, because they are drawn beside the page already and a
 * thing said twice is a thing people learn to skip: the SENTENCE the headline
 * is, and a paragraph that is only what he would do next. Everything else he
 * said is here, whole and in order — including what cites nothing, because a
 * conclusion and a caveat are part of the path too.
 *
 * A NEW BEAT STARTS where a sentence brings up a read the beat has not cited.
 * One that cites nothing, or only what the beat already rests on, carries on —
 * *"The other four were up."* belongs to the sentence it follows, and *"OPUS I
 * would leave alone … Greenhills is the real one …"* are one thought over the
 * same two reads. A paragraph break always starts a beat: that one is his.
 */
export function pageOf(text: string | null | undefined, claimSpan: string | null | undefined,
                       next: string | null | undefined, calls: ToolCall[]): Section[] {
  const { plain, bold } = unmark((text ?? '').trim());
  if (!plain) return [];
  const parts = claimAndStanding(plain, claimSpan);
  const claimAt = parts.before.length;
  const claimEnd = claimAt + parts.claimRaw.length;

  const ranges: [number, number][] = [];
  const gap = /\n[ \t]*\n\s*/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = gap.exec(plain))) { ranges.push([start, m.index]); start = m.index + m[0].length; }
  ranges.push([start, plain.length]);

  const out: Section[] = [];
  for (const [a, b] of ranges) {
    // The headline's own sentence comes out of whichever paragraph holds it.
    const slices: [number, number][] = [];
    if (claimEnd <= a || claimAt >= b) slices.push([a, b]);
    else {
      if (claimAt > a) slices.push([a, claimAt]);
      if (claimEnd < b) slices.push([claimEnd, b]);
    }
    const sentences = slices.flatMap(([s, e]) => sentencesOf(plain.slice(s, e), s));
    if (!sentences.length) continue;
    const whole = sentences.map((x) => x.said).join(' ');
    if (next && restated(whole, [next])) continue;

    type Open = { from: number; to: number; seqs: number[] };
    const push = (open: Open, opens: boolean) => {
      const raw = plain.slice(open.from, open.to);
      out.push({ para: remark(raw, open.from, bold), plain: raw, seqs: open.seqs, opens });
    };
    let beat: Open | null = null;
    let pushed = false;
    for (const { at, said } of sentences) {
      const cites = citedIn(said, calls);
      if (beat !== null) {
        const current: Open = beat;
        const fresh = cites.some((q) => !current.seqs.includes(q));
        if (fresh && current.seqs.length) { push(current, !pushed); pushed = true; beat = null; }
      }
      if (beat === null) beat = { from: at, to: at + said.length, seqs: [] };
      beat.to = at + said.length;
      for (const q of cites) if (!beat.seqs.includes(q)) beat.seqs.push(q);
    }
    if (beat !== null) push(beat, !pushed);
  }
  return out;
}

/** How many of a beat's figures one read holds. */
export function heldBy(section: Section, call: ToolCall | null | undefined): number {
  if (!call || !call.result || call.result.error) return 0;
  return figuresIn(section.plain).filter((f) => readBehind(f, [call]) !== null).length;
}

/**
 * Which beat a read's figure belongs with.
 *
 * THE ONE THAT CITES IT MOST, the earliest on a tie, and none (`-1`) when no
 * beat holds a figure of it — that one is drawn after the prose, because it is
 * evidence he gathered and did not talk about rather than a step of the
 * argument.
 *
 * NOT "the first read that holds the number", which is how a superscript picks
 * its read and is right for a superscript: two reads often hold the same number
 * — the attention read holds Fairview's day as well as the read he drew it from
 * — and first-holder would send his own figure to the foot of the page while a
 * machine-drawn table took its place. And not "any beat that holds one",
 * either: a products read that happens to hold `5.4` would be pulled up into
 * the shops beat by Greenhills' −5.4%. The beat that is ABOUT a read cites it
 * several times; a coincidence cites it once.
 */
export function sectionFor(sections: readonly Section[], call: ToolCall | null | undefined): number {
  let best = -1;
  let most = 0;
  sections.forEach((section, i) => {
    const n = heldBy(section, call);
    if (n > most) { most = n; best = i; }
  });
  return best;
}

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const saysWord = (text: string, word: string) => new RegExp(
  `(?<![\\p{L}\\p{N}])${escaped(word)}(?![\\p{L}\\p{N}])`, 'iu').test(text);

/**
 * WHICH ROWS OF A READ A BEAT NAMES — by the rows' own labels, in his words.
 *
 * A row is named when its label is in the sentence ("OPUS", "North Edsa"), or
 * when a word of its label that NO OTHER ROW of the read shares is — he writes
 * "bayberry" for *aji champoy honey bayberry*, and never "aji", which every
 * line carries and which therefore names none of them. Five letters or more,
 * so a stray "mix" or "per" names nothing.
 *
 * It is a lookup, not a judgement: the label is the row's, the sentence is his,
 * and a name that is not there is not found.
 */
export function namedIn(section: Section, call: ToolCall | null | undefined): string[] {
  const labels = [...new Set(rowsOf(call ?? null).map((r) => subjectOf(r))
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0))];
  const words = (label: string) => label.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 5);
  const owners = new Map<string, number>();
  for (const label of labels) for (const w of new Set(words(label))) owners.set(w, (owners.get(w) ?? 0) + 1);
  return labels.filter((label) => saysWord(section.plain, label)
    || words(label).some((w) => owners.get(w) === 1 && saysWord(section.plain, w)));
}

/**
 * The rows a figure under this beat should draw, or `null` for all of them.
 *
 * ONE OR TWO NAMES FOCUS IT; three or more, or none, leave it whole. A thought
 * about OPUS and Greenhills is served by their two rows and buried by seven; a
 * thought about "three shops, and the other four were up" IS about all seven,
 * and the owner's rule for an overview stands: *"all stores still matter"*.
 * And never to hide a single row — folding one line away saves nothing and
 * costs a tap.
 */
export function focusFor(section: Section, call: ToolCall | null | undefined): string[] | null {
  const named = namedIn(section, call);
  const rows = rowsOf(call ?? null).length;
  if (named.length < 1 || named.length > 2) return null;
  return rows - named.length >= 2 ? named : null;
}

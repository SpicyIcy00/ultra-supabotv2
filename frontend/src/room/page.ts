/**
 * THE PAGE IS HIS ANSWER, and the figures are what it cites.
 *
 * The owner, six times over one day, of the live right-hand side: *"it still
 * just feels like here's this and here's this, not at all like the answers and
 * charts visuals and text are well thought out and put in an order to make you
 * understand better — that's the point of the page"*, and of the design he had
 * approved: *"you had it done well in the artifact but this doesn't feel like a
 * page with a well thought out path."*
 *
 * Five rounds changed the ARRANGEMENT of the figures. The path was never in the
 * figures. It was in what he wrote, which — read on its own — already is one:
 *
 *     Shops, on the closed week: OPUS …, Greenhills …. The other four were up.
 *     OPUS I would still leave alone — … Greenhills is the real one: …
 *
 *     Products: bayberry … Same conclusion as yesterday — empty shelves.
 *
 *     And one thing the week hides: Fairview … one day is still one day.
 *
 *     Caveats: two windows above — …
 *
 * and the room SHREDDED it. A sentence that cited a chart was moved under that
 * chart, or dropped because "the chart already says it"; what was left over
 * stayed on the left with its context gone — *"The other four were up."* (the
 * other four what?) — and the charts were ordered by his compose call, which
 * that turn ran shops → Greenhills → Fairview → products while his prose ran
 * shops → products → Fairview. Two reading paths, one of them scraps.
 *
 * So the unit of the page stops being the figure. It is the PARAGRAPH, in his
 * order, followed by the figures it cites. His paragraphs also do the gathering
 * for free: figures cited in one paragraph belong together, whether or not he
 * remembered to say `under`.
 *
 * NOTHING HERE WRITES A WORD OR COMPUTES A FIGURE. Every character drawn is a
 * slice of his own answer with his own emphasis put back; which figure a
 * paragraph cites is the same matcher the superscripts use (`figures.ts`), so
 * the page and the superscripts cannot disagree about where a number came from.
 */
import type { ToolCall } from '../types/bob';
import { figuresIn, placeFigures as figuresPlaced, readBehind } from './figures';
import { claimAndStanding, remark, restated, unmark } from './beside';

export interface Section {
  /** His paragraph, emphasis intact, as `Marked` draws it. */
  para: string;
  /** The same words with the emphasis out — what the figure matcher reads. */
  plain: string;
  /** The reads it cites, in the order it cites them, each once. */
  seqs: number[];
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
 * His answer as the page's sections.
 *
 * TWO THINGS ARE LEFT OUT, because they are already drawn beside the page and a
 * thing said twice is a thing people learn to skip: the SENTENCE the headline
 * is (it is the headline), and a paragraph that is only what he would do next
 * (it is under him, with its own rule). Everything else he said is here, whole
 * and in order — including the paragraphs that cite nothing, because a
 * conclusion and a caveat are part of the path too.
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
    const drawn: string[] = [];
    const bare: string[] = [];
    for (const [s, e] of slices) {
      const raw = plain.slice(s, e);
      const said = raw.trim();
      if (!said) continue;
      bare.push(said);
      drawn.push(remark(said, s + (raw.length - raw.trimStart().length), bold));
    }
    if (!bare.length) continue;
    const words = bare.join(' ');
    if (next && restated(words, [next])) continue;
    out.push({ para: drawn.join(' '), plain: words, seqs: citedIn(words, calls) });
  }
  return out;
}

/** How many of a paragraph's figures one read holds. */
export function heldBy(section: Section, call: ToolCall | null | undefined): number {
  if (!call || !call.result || call.result.error) return 0;
  return figuresIn(section.plain).filter((f) => readBehind(f, [call]) !== null).length;
}

/**
 * Which paragraph a read's figure belongs with.
 *
 * THE ONE THAT CITES IT MOST, the earliest on a tie, and none (`-1`) when no
 * paragraph holds a figure of it — that one is drawn after the prose, because
 * it is evidence he gathered and did not talk about rather than a step of the
 * argument.
 *
 * NOT "the first read that holds the number", which is how a superscript picks
 * its read and is right for a superscript: two reads often hold the same number
 * — the attention read holds Fairview's day as well as the read he drew it from
 * — and first-holder would send his own figure to the foot of the page while a
 * machine-drawn table took its place. And not "any paragraph that holds one",
 * either: a products read that happens to hold `5.4` would be pulled up into
 * the shops paragraph by Greenhills' −5.4%. The paragraph that is ABOUT a read
 * cites it several times; a coincidence cites it once.
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

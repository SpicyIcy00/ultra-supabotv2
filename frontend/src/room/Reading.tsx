/**
 * THE READING — what George says, above everything he drew.
 *
 * It is a REGION, not an object, and that is the first half of this file.
 * Until 2026-09-14 his prose reached the screen as a `text` block he composed
 * like any other: one of fourteen widgets, in a box, competing for a column.
 * Two things followed from that, and the owner found both in one sitting.
 *
 *   HE COULD FORGET IT. A turn that composed figures and no text block drew
 *   four widgets and said nothing — the answer was in the turn, the board had
 *   nowhere to put it, and the person saw shapes and silence.
 *
 *   BOXED, IT WAS WRONG EVEN WHEN HE REMEMBERED. *"putting the text in a
 *   widget it just doesnt work."* A tile is something you look at; a reading
 *   is something you read, and it is ABOUT the tiles.
 *
 * So `text` left the vocabulary and the turn's own words are drawn here,
 * always (P1.c).
 *
 * AND IT HAS THREE SLOTS (P1.f). One region doing one job was still one
 * paragraph doing three: the point, what qualifies the point, and what to do
 * about it. The caveat was a clause mid-sentence that the eye slides past;
 * the next step was wherever the sentence happened to end, when it was there
 * at all. They are read at different moments and belong in different places:
 *
 *   CAVEAT   whole, at the top, above every figure it qualifies (UI rule 4),
 *            beside the notices, which have always been drawn here. It never
 *            wears the accent — prominence from position, never hue (rule 5).
 *   CLAIM    his answer, with the few words that ARE the point lit where he
 *            said them. `splitClaim` finds them; where he did not say them
 *            the reading draws whole and nothing is lit.
 *   NEXT     one sentence, drawn LAST — under the board, not here, because
 *            it comes after the evidence. `ReadingNext` below.
 *
 * NOTHING HERE IS A CLAIM ABOUT STATE. No prose is drawn as no prose — never
 * as "no answer" or a placeholder standing in for one. A turn that said
 * nothing is a defect, and it is recorded as one by the loop
 * (`answer_without_prose`), not narrated to the person by the screen.
 */
import type { GeorgeNotice, ReadingFrame, ToolCall } from '../types/george';
import { Caveats } from './tiles';
import { splitClaim } from './claim';
import { placeFigures } from './figures';
import { claimAndStanding, unmark } from './beside';

/**
 * EVERY FIGURE IN WHAT HE SAID, MARKED OR VISIBLY UNMARKED (P1.k, P2.b).
 *
 * Hex lets you click a number and land on the logic behind it. Here the logic
 * is a read: the numeral is matched against the numbers the turn's calls
 * actually returned — by the same rule the server matches them (figures.ts) —
 * and where one holds it, the span becomes a link to that read's receipts,
 * with a small marker after it saying WHICH read. Two figures out of the same
 * read wear the same number, and so does that read's line in the work trail,
 * so the evidence a figure came out of can be seen without tapping anything.
 *
 * A NUMERAL NO READ HOLDS IS DRAWN QUIETLY — the caveat's own ink, no
 * underline, no marker. That is not a verdict on his arithmetic (CLAUDE.md
 * rule 9 leaves checking prose numerals to the evals, and George works out
 * differences and remainders himself all the time). It is the one thing the
 * surface does know: there is nothing here to open. Before P2.b the two kinds
 * looked identical, so the screen said a number was openable by saying
 * nothing, and a person had to tap to find out.
 *
 * WITH NO CALLS, NOTHING IS MARKED EITHER WAY. A restored turn whose calls the
 * record did not keep has read nothing HERE, and drawing its every figure as
 * unplaced would report an absence of evidence that is an absence of RECORD
 * (UI rule 8).
 */
export function Figures({ text, calls, onFigure }: {
  text: string;
  calls: ToolCall[];
  onFigure?: (seq: number) => void;
}) {
  if (!onFigure || !calls.length) return <>{text}</>;
  return (
    <>
      {placeFigures(text, calls).map((piece, n) => {
        if (piece.unplaced) {
          return <span key={n} className="r-figure-bare">{piece.text}</span>;
        }
        if (piece.seq === undefined) return <span key={n}>{piece.text}</span>;
        // THE SPACE STAYS OUTSIDE THE BUTTON (the log, 2026-09-17: "it:54",
        // "₱14,816,19.9%"). A button drops the white space at its own edges,
        // so a space the figure's match carried vanished from his sentence.
        const lead = /^\s*/.exec(piece.text)?.[0] ?? '';
        const trail = /\s*$/.exec(piece.text)?.[0] ?? '';
        return (
          <span key={n}>
            {lead}
            <button type="button" className="r-figure"
                    onClick={() => onFigure(piece.seq as number)}>
              {piece.text.trim()}
            </button>
            {trail}
            {/* THE MARKER, OUTSIDE THE DOOR. The figure is what you tap; this
                says which read it came out of. It is a count off the turn's
                own calls, so it wears the receipt face, not his. */}
            {piece.index !== undefined && (
              <sup className="r-figure-n">{piece.index}</sup>
            )}
          </span>
        );
      })}
    </>
  );
}

/** The claim's span, lit where he said it, with its figures marked inside. */
function Lit({ text, calls, onFigure }: {
  text: string;
  calls: ToolCall[];
  onFigure?: (seq: number) => void;
}) {
  return (
    <em className="r-claim">
      <Figures text={text} calls={calls} onFigure={onFigure} />
    </em>
  );
}

/** A slice of the answer, starting at `from`, with his bold ranges set in weight. */
function Weighted({ text, from, bold, calls, onFigure }: {
  text: string; from: number; bold: [number, number][];
  calls: ToolCall[]; onFigure?: (seq: number) => void;
}) {
  const cuts = new Set<number>([0, text.length]);
  for (const [a, b] of bold) {
    for (const at of [a - from, b - from]) if (at > 0 && at < text.length) cuts.add(at);
  }
  const edges = [...cuts].sort((x, y) => x - y);
  return (
    <>
      {edges.slice(0, -1).map((start, n) => {
        const end = edges[n + 1];
        const piece = text.slice(start, end);
        const strong = bold.some(([a, b]) => a - from <= start && end <= b - from);
        const drawn = <Figures text={piece} calls={calls} onFigure={onFigure} />;
        return strong ? <b key={start}>{drawn}</b> : <span key={start}>{drawn}</span>;
      })}
    </>
  );
}

/**
 * ONE OF HIS SENTENCES, WITH HIS EMPHASIS DRAWN — for a sentence cut out of the
 * answer (`beside.thoughtsOf`), which carries its markers closed at its own
 * edges. Never the asterisks (the log, 2026-09-18: `**Three.`).
 */
export function Marked({ text, calls, onFigure }: {
  text: string; calls: ToolCall[]; onFigure?: (seq: number) => void;
}) {
  const { plain, bold } = unmark(text);
  return <Weighted text={plain} from={0} bold={bold} calls={calls} onFigure={onFigure} />;
}

/**
 * THE CAVEAT'S SENTENCES HE DID NOT ALSO SAY (the dogfood log, 2026-09-17).
 *
 * The caveat slot and the answer are written separately, and he often puts the
 * same sentence in both — *"Shangri-La, Monday to this afternoon against the
 * same stretch of last week — a bit over half the week"* was drawn above the
 * claim and again under it. A sentence already in what he said is left where
 * he said it; the rest of the caveat is drawn above the claim as before. Not a
 * character of either is rewritten, only a repeat is not drawn twice.
 */
export function unsaid(caveat: string | null | undefined, said: string): string {
  const flat = (x: string) => x.replace(/\s+/g, ' ').trim().toLowerCase();
  const text = flat(said);
  const whole = (caveat ?? '').trim();
  if (!whole) return '';
  // Split only where a sentence ends and a space follows, so "12.3%" and
  // "₱1.70m" stay whole.
  const sentences = whole.split(/(?<=[.!?])\s+/);
  return sentences
    .filter((x) => x.trim() && !text.includes(flat(x)))
    .map((x) => x.trim())
    .join(' ');
}

export function Reading({ text, notices, reading, calls, onFigure, part = 'all', standing, caveat: shownCaveat }: {
  /** The turn's own words. Streaming, so it fills as he speaks. */
  text: string | null | undefined;
  /** The turn's caveats, already filtered to the ones no object carries. */
  notices?: GeorgeNotice[];
  /** The three slots, as the loop validated them. */
  reading?: ReadingFrame;
  /** The turn's calls, so a figure in the claim can find the read behind it. */
  calls?: ToolCall[];
  /** Where a tapped figure goes. Absent leaves the claim plain. */
  onFigure?: (seq: number) => void;
  /**
   * WHICH PART, for the `speak` layout (2026-09-17): the headline with the
   * notices above it, or the rest — his caveat and whatever he said that no
   * chart took. `all` is the beside room's one column.
   */
  part?: 'all' | 'claim' | 'rest';
  /** The standing text to draw in place of before/after — the sentences no chart took. */
  standing?: string;
  /**
   * For the rest: the caveat less what the screen already says
   * (`beside.caveatUnshown`). Absent, the caveat less the answer's own repeats.
   */
  caveat?: string;
}) {
  // HIS EMPHASIS IS DRAWN, NOT PRINTED. He writes `**the point**`; the frame
  // check (ops/frames.py, P2S.1) showed the asterisks in the claim. The markers
  // come out and the ranges they held are set in weight — every other
  // character is his, untouched.
  const { plain, bold } = unmark((text ?? '').trim());
  const said = plain;
  const caveat = part === 'rest' && shownCaveat !== undefined ? shownCaveat : unsaid(reading?.caveat, said);
  if (!said && !notices?.length && !caveat) return null;
  // THE CLAIM, AND WHAT STANDS UNDER IT (P2S.1(c)). The design sets the point
  // as a sentence of its own, large, in serif, and the rest of what he said
  // beneath it; `claimAndStanding` takes the sentence his claim span sits in
  // and hands back EXACT slices, so not one character he said is changed —
  // `data-part` before + claim + after is the answer (markers.dom.test.tsx).
  const parts = claimAndStanding(said, reading?.claim);
  const lit = splitClaim(parts.claimRaw, reading?.claim);
  const pieces = { calls: calls ?? [], onFigure };
  const before = parts.before.trim() ? parts.before : '';
  const after = parts.after.trim() ? parts.after : '';
  if (part === 'rest') {
    const rest = (standing ?? '').trim();
    if (!caveat && !rest) return null;
    return (
      <section className="r-reading r-reading--rest" data-reading="rest">
        {caveat && <p className="r-caveat r-turn-caveat">{caveat}</p>}
        {rest && <p className="r-say r-say--standing"><Marked text={rest} {...pieces} /></p>}
      </section>
    );
  }
  return (
    <section className="r-reading" data-reading={said ? 'said' : 'caveats'}>
      {/* THE TURN'S CAVEAT, ONE LINE DIRECTLY ABOVE THE CLAIM (UI rule 4). His
          own words for what qualifies the figures first, the machine's notices
          under them — both above the sentence they qualify, never the accent. */}
      {part === 'all' && caveat && <p className="r-caveat r-turn-caveat">{caveat}</p>}
      {notices && notices.length > 0 && (
        <div className="r-reading-caveats"><Caveats notices={notices} /></div>
      )}
      {parts.claimRaw && (
        <h2 className="r-say r-say--claim" data-part="claim">
          {lit ? (
            <>
              <Figures text={lit.before} {...pieces} />
              <Lit text={lit.hit} {...pieces} />
              <Figures text={lit.after} {...pieces} />
            </>
          ) : <Figures text={parts.claimRaw} {...pieces} />}
        </h2>
      )}
      {/* THE STANDING TEXT. Every figure in it is scanned against the reads,
          so a number carries the superscript of the read it came out of — the
          same number the figure on the right wears as READ n (P2.b). */}
      {part === 'all' && (before || after) && (
        <p className="r-say r-say--standing">
          {before && (
            <span data-part="before">
              <Weighted text={before} from={0} bold={bold} {...pieces} />
            </span>
          )}
          {after && (
            <span data-part="after">
              <Weighted text={after} from={parts.before.length + parts.claimRaw.length} bold={bold} {...pieces} />
            </span>
          )}
        </p>
      )}
    </section>
  );
}

/**
 * WHAT HE SAID BEFORE THE ANSWER, WHILE HE WORKS (the log, 2026-09-17).
 *
 * The stream keeps interim prose — "Rockwell is down; let me look at the
 * drivers" — as `narration` when the answer resets, and since P2S.1 nothing drew
 * it, so a minute of work under the mark was silent. It is his voice, so it is
 * drawn here, in his serif, quieter than an answer, under the work line; and it
 * is gone once the answer itself arrives.
 */
export function Narration({ said, live, answering }: {
  said: string | null | undefined;
  live: boolean;
  answering: boolean;
}) {
  const text = (said ?? '').trim();
  if (!live || answering || !text) return null;
  return <p className="r-say r-say--standing r-doing-said">{text}</p>;
}

/**
 * THE QUESTIONS HE SUGGESTS ASKING NEXT, under the headline (the owner,
 * 2026-09-17: "under the blob is the main headline and question suggestions").
 * His words; tapping one asks it, which is an ordinary turn. None drawn while
 * he is still working, and none where he suggested none.
 */
export function ReadingAsks({ reading, busy, onAsk }: {
  reading?: ReadingFrame;
  busy: boolean;
  onAsk(question: string): void;
}) {
  const asks = (reading?.asks ?? []).map((a) => a.trim()).filter(Boolean);
  if (busy || !asks.length) return null;
  return (
    <div className="r-asks" aria-label="questions to ask next">
      {asks.map((q) => (
        <button key={q} type="button" className="r-ask" onClick={() => onAsk(q)}>{q}</button>
      ))}
    </div>
  );
}

/**
 * ONE SENTENCE, ALWAYS LAST — under the evidence, because that is where it is
 * read: you look at the figures, and then at what to do about them.
 *
 * It carries no digits, which is enforced where it is validated, so it can
 * never be the place a figure arrives without receipts. It is also where the
 * `recommendation` widget went (P1.f): a tile saying "Order Aji Mix" competed
 * with the reading for the thing it was recommending, and every answer has
 * this line while few answers had that tile.
 */
export function ReadingNext({ reading }: { reading?: ReadingFrame }) {
  const next = reading?.next?.trim();
  if (!next) return null;
  // THE DESIGN'S `.bs-next`: a mono label, his sentence in serif, and a rule
  // on the side facing the figures.
  return (
    <div className="r-next">
      <b className="r-next-label">what I&rsquo;d do next</b>
      {next}
    </div>
  );
}

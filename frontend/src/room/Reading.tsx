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
function Figures({ text, calls, onFigure }: {
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
        return (
          <span key={n}>
            <button type="button" className="r-figure"
                    onClick={() => onFigure(piece.seq as number)}>
              {piece.text}
            </button>
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

export function Reading({ text, notices, reading, calls, onFigure }: {
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
}) {
  const said = (text ?? '').trim();
  const caveat = reading?.caveat?.trim();
  if (!said && !notices?.length && !caveat) return null;
  const lit = splitClaim(said, reading?.claim);
  return (
    <section className="r-reading" data-reading={said ? 'said' : 'caveats'}>
      {caveat && (
        // HIS OWN WORDS FOR WHAT QUALIFIES THE FIGURES, whole and first. The
        // notice below it is the machine's statement of the same thing; this
        // is the one a person reads, and rule 4 puts both above the number.
        <p className="r-caveat">{caveat}</p>
      )}
      {notices && notices.length > 0 && (
        <div className="r-reading-caveats"><Caveats notices={notices} /></div>
      )}
      {/* Full measure, no border, no tile. It is the page speaking, not a
          thing on the page. */}
      {said && (
        <p className="r-say r-say--reading">
          {lit ? (
            // THE FIGURES ARE SCANNED ACROSS THE WHOLE ANSWER, not only inside
            // the lit span (P2.b). A claim slot is the few words that ARE the
            // point; the figures that qualify them are usually in the sentence
            // after it, and until today every one of those was drawn as plain
            // prose — so whether a figure could be opened depended on where in
            // his paragraph he happened to put it.
            <>
              <Figures text={lit.before} calls={calls ?? []} onFigure={onFigure} />
              <Lit text={lit.hit} calls={calls ?? []} onFigure={onFigure} />
              <Figures text={lit.after} calls={calls ?? []} onFigure={onFigure} />
            </>
          ) : <Figures text={said} calls={calls ?? []} onFigure={onFigure} />}
        </p>
      )}
    </section>
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
  return (
    <p className="r-next">
      <span className="r-next-label">what I'd do next</span>
      {next}
    </p>
  );
}

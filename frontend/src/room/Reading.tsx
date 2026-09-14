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
import type { GeorgeNotice, ReadingFrame } from '../types/george';
import { Caveats } from './tiles';
import { splitClaim } from './claim';

export function Reading({ text, notices, reading }: {
  /** The turn's own words. Streaming, so it fills as he speaks. */
  text: string | null | undefined;
  /** The turn's caveats, already filtered to the ones no object carries. */
  notices?: GeorgeNotice[];
  /** The three slots, as the loop validated them. */
  reading?: ReadingFrame;
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
          {lit ? (<>{lit.before}<em className="r-claim">{lit.hit}</em>{lit.after}</>) : said}
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

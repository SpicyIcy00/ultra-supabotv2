/**
 * THE READING — what George says, above everything he drew.
 *
 * It is a REGION, not an object, and that is the whole of this file. Until
 * 2026-09-14 his prose reached the screen as a `text` block he composed like
 * any other: one of fourteen widgets, in a box, competing for a column. Two
 * things followed from that, and the owner found both in one sitting.
 *
 *   HE COULD FORGET IT. A turn that composed figures and no text block drew
 *   four widgets and said nothing — the answer was in the turn, the board had
 *   nowhere to put it, and the person saw shapes and silence.
 *
 *   BOXED, IT WAS WRONG EVEN WHEN HE REMEMBERED. *"putting the text in a
 *   widget it just doesnt work."* A tile is something you look at; a reading
 *   is something you read, and it is ABOUT the tiles. The renderer had a
 *   special case dragging it back beside whatever led, with a comment saying
 *   that otherwise "the sentence explaining it ends up three columns away
 *   from the thing it explains" — a hack that existed because prose is not a
 *   peer of a tile.
 *
 * So the fix was a SUBTRACTION: `text` left the vocabulary (metrics.yaml
 * composition.widgets), and the turn's own words are drawn here, always. He
 * cannot forget it, because he no longer composes it; it cannot be evicted,
 * because it is not an object competing for space or subject to expiry; and
 * it cannot be boxed, because this is a region of the page.
 *
 * THE CAVEATS SIT ABOVE IT, where they already belonged (UI rule 4): what
 * qualifies an answer comes before the answer, and before every figure the
 * answer is about.
 *
 * NOTHING HERE IS A CLAIM ABOUT STATE. No prose is drawn as no prose — never
 * as "no answer" or a placeholder standing in for one. A turn that said
 * nothing is a defect, and it is recorded as one by the loop
 * (`answer_without_prose`), not narrated to the person by the screen.
 */
import type { GeorgeNotice } from '../types/george';
import { Caveats } from './tiles';

export function Reading({ text, notices }: {
  /** The turn's own words. Streaming, so it fills as he speaks. */
  text: string | null | undefined;
  /** The turn's caveats, already filtered to the ones no object carries. */
  notices?: GeorgeNotice[];
}) {
  const said = (text ?? '').trim();
  if (!said && !notices?.length) return null;
  return (
    <section className="r-reading" data-reading={said ? 'said' : 'caveats'}>
      {notices && notices.length > 0 && (
        <div className="r-reading-caveats"><Caveats notices={notices} /></div>
      )}
      {/* Full measure, no border, no tile. It is the page speaking, not a
          thing on the page. */}
      {said && <p className="r-say r-say--reading">{said}</p>}
    </section>
  );
}
